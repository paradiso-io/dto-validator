let CasperHelper = require("../helpers/casper");
let { DTOWrappedNFT, NFTBridge } = require("casper-nft-utils")
let findArgParsed = CasperHelper.findArgParsed;
const logger = require("../helpers/logger");

let db = require('../models')
const HOOK = {
  updateMintOrUnlock: async (updateData) => {
    {
      console.log( "!!!! START UPDATE MINT OR UNLOCK !!!!")
      console.log('updateData', updateData.deployHash)
      // event ClaimToken(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index, bytes32 _claimId);
      await db.Nft721Transaction.updateOne(
        {
          index: parseInt(updateData.index),
          fromChainId: parseInt(updateData.fromChainId),
          toChainId: parseInt(updateData.toChainId),
          originChainId: parseInt(updateData.originChainId),
          originToken: updateData.originContractAddress.toLowerCase(),
          requestHash: updateData.txHash.toLowerCase(),
        },
        {
          $set: {
            claimHash: CasperHelper.toNormalTxHash(updateData.deployHash),
            claimBlock: parseInt(updateData.height),
            claimed: true,
            claimId: updateData.claimId,
            tokenIds: updateData.tokenIds,
            tokenMetadatas: updateData.tokenMetadatas
          },
        },
        { upsert: true, new: true }
      );
      logger.info("claimId %s", updateData.claimId);
      console.log("START UPDATE REQUESTOCASPER claimId: ", updateData.claimId)
      await db.Nft721RequestToCasper.updateOne(
        {
          mintid: updateData.claimId
        },
        {
          $set: {
            txExecuted: true
          },
        },
        { upsert: true, new: true }
      );
      console.log("FINISH UPDATE REQUESTTOCASPER claimId: ", updateData.claimId)
    }
  },
  updateRequestBridge: async (updateData) => {
    await db.Nft721Transaction.updateOne(
      {
        index: parseInt(updateData.index),
        fromChainId: parseInt(updateData.fromChainId),
        toChainId: parseInt(updateData.toChainId),
        originChainId: parseInt(updateData.originChainId),
        originToken: updateData.originToken.toLowerCase(),
        requestHash: CasperHelper.toNormalTxHash(updateData.deployHash),
      },
      {
        $set: {
          requestBlock: parseInt(updateData.height),
          account: updateData.receiverAddress.toLowerCase(),
          txCreator: updateData.txCreator,
          originSymbol: updateData.originSymbol,
          originName: updateData.originName,
          tokenIds: updateData.tokenIds,
          requestTime: Math.floor(updateData.timestamp / 1000),
          identifierMode: updateData.identifierMode,
          tokenMetadatas: updateData.tokenMetadatas
        },
      },
      { upsert: true, new: true }
    )
  },
  process: async (block, deploy, storedContractByHash, selectedRPC) => {
    let trial = 20
    let randomGoodRPC = selectedRPC
    let height = parseInt(block.block.header.height)
    while (trial > 0) {
      try {
        let nftConfig = CasperHelper.getNFTConfig();
        let casperConfig = CasperHelper.getConfigInfo()
        let tokenData = nftConfig.tokens.find(
          (e) => e.contractHash == storedContractByHash.hash
        );
        
        let args = storedContractByHash.args;
        let entryPoint = storedContractByHash.entry_point;
        console.log(" !!!! entryPointL ", entryPoint)
        if (tokenData && tokenData.originChainId != casperConfig.networkId) {
          console.log("tokenData: ", tokenData)
          console.log('storedContractByHash', storedContractByHash)
          let nftContractHash = storedContractByHash.hash
          if (entryPoint == "mint") {
            randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height, randomGoodRPC)
            let nftContract = await DTOWrappedNFT.createInstance(nftContractHash, randomGoodRPC, casperConfig.chainName)
            let identifierMode = await nftContract.identifierMode()
            console.log("identifierMode: ", identifierMode)
            let tokenIds = CasperHelper.getTokenIdsFromArgs(identifierMode, args)
            console.log("tokenIds: ", tokenIds)
            let metadatas = findArgParsed(args, "token_meta_datas")
            console.log("metadatas: ", metadatas)
            let recipient = findArgParsed(args, "token_owner");
            console.log("recipient: ", recipient)
            if (recipient.Account) {
              recipient = recipient.Account
            }
            let mintid = findArgParsed(args, "mint_id");
            console.log("mintid: ", mintid)
            let claimId = mintid
            // mintid = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>

            let mintidSplits = mintid.split("-");
            let txHash = mintidSplits[0];
            let fromChainId = parseInt(mintidSplits[1]);
            let toChainId = parseInt(mintidSplits[2]);
            let index = parseInt(mintidSplits[3]);
            let originContractAddress = mintidSplits[4];
            let originChainId = parseInt(mintidSplits[5]);

            logger.info("Casper Network NFT Minting: %s %s", deploy.hash, claimId);
            console.log("block.block.header.height: ", block.block.header.height)

            await HOOK.updateMintOrUnlock(
              {
                index,
                fromChainId,
                toChainId,
                originChainId,
                originContractAddress,
                txHash,
                deployHash: deploy.hash,
                height: block.block.header.height,
                claimId,
                tokenIds,
                tokenMetadatas: metadatas
              }
            )
          } else if (storedContractByHash.entry_point == "request_bridge_back") {
            let request = await CasperHelper.parseRequestNFTFromCasper(deploy, height)

            request.timestamp = Date.parse(block.block.header.timestamp);
            await HOOK.updateRequestBridge(
              request
            )
          }
        } else if (nftConfig.nftbridge == storedContractByHash.hash) {
          console.log("OK !!! nftConfig.nftbridge == storedContractByHash.hash", storedContractByHash.hash)
          console.log("Now check unlock_nft EntryPoint !!!")
          console.log("storedContractByHash.entryPoint", storedContractByHash.entryPoint)
          console.log("entryPoint", entryPoint)
          
          if (entryPoint == "unlock_nft") {
            console.log("storedContractByHash.entryPoint", storedContractByHash.entryPoint)
            console.log("OK !!! entryPoint= unlock_nft")
            randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height, randomGoodRPC)
            //unlock_id = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
            let claimId = findArgParsed(args, "unlock_id");
            if (!claimId) {
              return
            }
            console.log("FIND NEW CLAIMID TO UPDATE !!!!: ", claimId)
            let splits = claimId.split("-")
            if (splits.length != 6) {
              return
            }
            console.log("splits: ", splits)
            let [txHash, fromChainId, toChainId, index, originContractAddress, originChainId] = splits
            console.log("GET SPLITS txHash: ", txHash)
            console.log(" !!!!! originChainId: ", originChainId)
            console.log(" !!!!!!!  nftConfig.networkId: ", casperConfig.networkId)
            if (originChainId != casperConfig.networkId) {
              console.log("NOT ORIGIN NFT FROM CASPER RETURN !!!!")
              return

            }
            // if (originContractAddress.length != 64 || toChainId != originChainId || parseInt(originChainId) != nftConfig.networkId) {
            //   console.log("SITUATION 1 RETURN")
            //   return
            // }

            if (originChainId != toChainId) {
              console.log("SITUATION 2 RETURN")
              return
            }

            let fromChainIdFromArgs = findArgParsed(args, "from_chainid")
            console.log("fromChainIdFromArgs: ", fromChainIdFromArgs)
            let nftContractHash = findArgParsed(args, "nft_contract_hash")
            console.log("!!!! nftContractHash: ", nftContractHash)
            if (nftContractHash.Hash) {
              nftContractHash = nftContractHash.Hash.slice(5)
            }
            let recipient = findArgParsed(args, "target_key")
            console.log("recipient", recipient)
            if (!fromChainId || !nftContractHash || fromChainIdFromArgs != fromChainId || originContractAddress != nftContractHash) {
              return
            }

            let identifierMode = findArgParsed(args, "identifier_mode")
            console.log("identifierMode: ", identifierMode)
            if (identifierMode == undefined) {
              console.log("NO IDENTIFIER-MODE RETURN !!!! ")
              return
            }
            let tokenIds = CasperHelper.getTokenIdsFromArgs(identifierMode, args)
            if (recipient.Account) {
              recipient = recipient.Account
            }

            logger.info("New event at block %s", block.block.header.height);
            console.log("HOOK START TO UPDATE DATE !!!!", claimId)
            console.log("PARAM updated !!!: ",index,
              fromChainId,
              toChainId,
              originChainId,
              originContractAddress,
              txHash,
              deploy.hash,
              block.block.header.height,
              claimId,
              tokenIds)
            console.log(" !!!! !!!!!!!!!!!!!!!!!!!!!!   1!!!!!!!!!")

            await HOOK.updateMintOrUnlock(
              {
                index,
                fromChainId,
                toChainId,
                originChainId,
                originContractAddress,
                txHash,
                deployHash: deploy.hash,
                height: block.block.header.height,
                claimId,
                tokenIds
              }
            )
          } else if (entryPoint == "request_bridge_nft") {
            let request = await CasperHelper.parseRequestNFTFromCasper(deploy, height)
            if (!request) {
              return
            }

            request.timestamp = Date.parse(block.block.header.timestamp);
            await HOOK.updateRequestBridge(
              request
            )
            console.log("Sucessful saved request to DB")
          }
        }
        break
      } catch (e) {
        trial--
        if (trial == 0) {
          throw e
        }
        randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height)
        console.warn('randomGoodRPC', randomGoodRPC)
        console.log("deploy.hash: ", deploy.hash)
        console.error(e)
      }
    }
  },
};

module.exports = HOOK;
