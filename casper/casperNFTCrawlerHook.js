let CasperHelper = require("../helpers/casper");
let { DTOWrappedNFT, NFTBridge } = require("casper-nft-utils")
let findArgParsed = CasperHelper.findArgParsed;
const logger = require("../helpers/logger");
const CWeb3 = require('casper-web3')
const { DTOBridgeEvent, DTOWrappedCep78Event } = require('../helpers/casperEventsIndexing')

let db = require('../models');
const { CLPublicKey, CLListBytesParser, CLListType, CLType, CLStringType, CLU8BytesParser, CLStringBytesParser, CLKeyBytesParser, CLU256BytesParser } = require("casper-js-sdk");
let casperConfig = CasperHelper.getConfigInfo()
const HOOK = {
  updateMintOrUnlock: async (updateData) => {
    {
      console.log("!!!! START UPDATE MINT OR UNLOCK !!!!")
      console.log('updateData', updateData.deployHash)
      console.log("updateData.isCasperApproveToClaim : ", updateData.isCasperApproveToClaim)
      console.log("updateData.isCasperApproveToClaim : ", updateData.isCasperClaimed)

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
            tokenMetadatas: updateData.tokenMetadatas,
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
  updateApproveToClaim: async (updateData) => {
    {
      logger.info("!!!! START UPDATE MINT OR UNLOCK !!!!")
      logger.info('deployHash = %s ', updateData.deployHash)

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
            // claimHash: CasperHelper.toNormalTxHash(updateData.deployHash),
            // claimBlock: parseInt(updateData.height),
            // claimed: true, // Should change
            claimId: updateData.claimId,
            tokenIds: updateData.tokenIds,
            tokenMetadatas: updateData.tokenMetadatas,
            isCasperApproveToClaim: updateData.isCasperApproveToClaim ? updateData.isCasperApproveToClaim : false,
            isCasperClaimed: updateData.isCasperClaimed ? updateData.isCasperClaimed : false,

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
  updateClaimOnCasper: async (updateData) => {
    {
      console.log("updateData.isCasperApproveToClaim : ", updateData.isCasperClaimed)
      console.log("toChainId", parseInt(updateData.casperChainId))
      console.log("account:", updateData.account.toLowerCase())
      // event ClaimToken(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index, bytes32 _claimId);
      await db.Nft721Transaction.updateOne(
        {
          toChainId: parseInt(updateData.casperChainId),
          account: updateData.account.toLowerCase(),
        },
        {
          $set: {
            claimHash: CasperHelper.toNormalTxHash(updateData.deployHash),
            claimBlock: parseInt(updateData.height),
            claimed: true, // Should change
            isCasperApproveToClaim: false,
            isCasperClaimed: updateData.isCasperClaimed,

          },
        },
        { upsert: true, new: true }
      );
      console.log("User Claim !!! : ", updateData.account, updateData.deployHash)
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
  process: async (block, deploy, selectedRPC, signer) => {
    console.log("===== Signer ", signer)
    let trial = 20
    let randomGoodRPC = selectedRPC
    let height = parseInt(block.block.header.height)
    while (trial > 0) {
      try {
        let nftConfig = CasperHelper.getNFTConfig();
        let casperConfig = CasperHelper.getConfigInfo()
        let tokenData = nftConfig.tokens.find(
          (e) => e.contractPackageHash == storedContractByHash.hash
        );

        let args = storedContractByHash.args;
        let entryPoint = storedContractByHash.entry_point;
        console.log(" !!!! entryPointL ", entryPoint)
        if (tokenData && tokenData.originChainId != casperConfig.networkId) {
          console.log("tokenData: ", tokenData)
          console.log('storedContractByHash', storedContractByHash)
          let nftContractHash = storedContractByHash.hash
          if (entryPoint == "approve_to_claim") {
            try {
              randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height, randomGoodRPC)
              console.log("Before Create Instance")

              let nftContract = await DTOWrappedNFT.createInstance(nftContractHash, randomGoodRPC, casperConfig.chainName)
              console.log("After Create Instance")

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

              await HOOK.updateApproveToClaim(
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
                  tokenMetadatas: metadatas,
                  isCasperApproveToClaim: true,
                }
              )
              console.log("SC UPDATE APPROVE TO CLAIM")

            } catch (e) {
              console.log("Error with entrypoint approve_to_claim")
              console.log(e)

            }
          } else if (entryPoint == "claim") {
            try {
              console.log("THIS IS CLAIM : ", storedContractByHash)
              let thisPublicKey = CLPublicKey.fromHex(signer)
              let thisAccountHash = thisPublicKey.toAccountHashStr()
              console.log("thisAccountHash : ", thisAccountHash)
              console.log(casperConfig.networkId)
              console.log("")
              let casperChainId = casperConfig.networkId  // This is casper network id
              await HOOK.updateClaimOnCasper(
                {
                  casperChainId,
                  deployHash: deploy.hash,
                  height: block.block.header.height,
                  isCasperClaimed: true,
                  account: thisAccountHash,
                }
              )
              console.log("SC UPDATE CLAIM")
            } catch (e) {
              console.log("Error entry point claim")
              console.log(e)
            }


          }
          else if (storedContractByHash.entry_point == "request_bridge_back") {
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
        }
        break
      } catch (e) {
        trial--
        if (trial == 0) {
          console.log("Error Any !!!!")
          throw e

        }
        randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height)
        console.warn('randomGoodRPC', randomGoodRPC)
        console.log("deploy.hash: ", deploy.hash)
        console.error(e)
      }
    }
  },
  // this function is used for parsing all events related to bridge CEP78 NFTs natively issued on Casper
  processNFTBridgeEvent: async (block, deploy, selectedRPC) => {
    let trial = 20
    let randomGoodRPC = selectedRPC
    let height = parseInt(block.block.header.height)
    const casperConfig = CasperHelper.getConfigInfo()
    const nftConfig = CasperHelper.getNFTConfig()
    while (trial > 0) {
      try {
        const result = {}
        if (deploy.execution_results) {
          result.execution_result = deploy.execution_results[0];
        } else {
          break
        }
        const nftBridgePackageHash = CasperHelper.getNftBridgePkgAddress()
        const parsedEventData = CWeb3.Contract.parseEvents(DTOBridgeEvent, result, CasperHelper.getNftBridgePkgAddress()) 
        if (parsedEventData && parsedEventData.data) {
          for (const e of parsedEventData.data) {
            const d = e.data
            if (['request_bridge_nft'].includes(d.event_type)) {
              // reading request data from bridge contract
              const nftBridgeActiveContractHash = await CWeb3.Contract.getActiveContractHash(nftBridgePackageHash, casperConfig.chainName)
              const bridgeContactInstance = await CWeb3.Contract.createInstanceWithRemoteABI(nftBridgeActiveContractHash, randomGoodRPC, casperConfig.chainName)
              const rawRequestData = await bridgeContactInstance.getter.requestIds(d.request_index, true)
              
              // desearlize it
              let ret = new CLKeyBytesParser().fromBytesWithRemainder(rawRequestData)
              let nftPackageHash = ret.result.val.value()
              nftPackageHash = Buffer.from(nftPackageHash.data).toString('hex')
              const tokenData = nftConfig.tokens.find(
                (e) => e.contractPackageHash == nftPackageHash
              )

              if (!tokenData) {
                logger.warn("unsupported origin CEP78 NFT contract package hash %s", nftPackageHash)
                return
              }

              ret = new CLU8BytesParser().fromBytesWithRemainder(ret.remainder)
              let identifierMode = parseInt(ret.result.val.value().toString())

              ret = new CLU256BytesParser().fromBytesWithRemainder(ret.remainder)
              let toChainId = parseInt(ret.result.val.value().toString())

              ret = new CLU256BytesParser().fromBytesWithRemainder(ret.remainder)
              let requestIndex = parseInt(ret.result.val.value().toString())

              ret = new CLKeyBytesParser().fromBytesWithRemainder(ret.remainder)
              let from = ret.result.val.value()
              from = from.data ? Buffer.from(from.data).toString('hex') : ""

              if (deploy.deploy.approvals.length > 0) {
                from = deploy.deploy.approvals[0].signer;
                from = CasperHelper.fromCasperPubkeyToAccountHash(from);
              }

              ret = new CLStringBytesParser().fromBytesWithRemainder(ret.remainder)
              let to = ret.result.val.value()

              ret = new CLListBytesParser().fromBytesWithRemainder(ret.remainder, new CLListType(new CLStringType()))
              const tokenIds = ret.result.val.value().map(e => e.data)
              if (tokenData) {      
                let nftSymbolFromConfigFile = tokenData.originSymbol
                let nftNameFromConfigFile = tokenData.originName
                const nftContractHashActive = await CWeb3.Contract.getActiveContractHash(nftPackageHash, casperConfig.chainName)
      
                const nftContract = await DTOWrappedNFT.createInstance(nftContractHashActive, randomGoodRPC, casperConfig.chainName)
                let nftSymbol = await nftContract.collectionSymbol()
                let nftName = await nftContract.collectionName()
                if (nftSymbolFromConfigFile != nftSymbol || nftNameFromConfigFile != nftName) {
                  throw "WRONG CONFIG nftSymbol OR nftName !!!!!";
                }
                let tokenMetadatas = []
      
                for (var i = 0; i < tokenIds.length; i++) {
                  let tokenId = tokenIds[i]
                  while (true) {
                    try {
                      //read metadata
                      let metadata = await nftContract.getTokenMetadata(tokenId)
                      tokenMetadatas.push(metadata)
                      break
                    } catch (e) {
                      randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height)
                      nftContract.nodeAddress = randomGoodRPC
                      logger.error(e.toString())
                    }
                  }
                }
      
                let requestBridgeData =
                {
                  index: requestIndex,
                  fromChainId: casperConfig.networkId,
                  toChainId: toChainId,
                  originChainId: casperConfig.networkId,
                  originToken: nftBridgePackageHash,
                  deployHash: CasperHelper.toNormalTxHash(deploy.deploy.hash),  
                  height: height,
                  receiverAddress: to,
                  txCreator: from,
                  originSymbol: nftSymbol,
                  originName: nftName,
                  tokenIds: tokenIds,
                  identifierMode: identifierMode,
                  tokenMetadatas: tokenMetadatas
                }
      
                requestBridgeData.timestamp = Date.parse(block.block.header.timestamp);
                await HOOK.updateRequestBridge(
                  requestBridgeData
                )

                logger.info("Sucessful saved request to DB")
              } else {
                logger.info("not supported NFT")
                return
              }
            } else if (['approve_unlock_nft'].includes(d.event_type)) {      
              let eventUnlockId = d.unlock_id
      
              if (!eventUnlockId) {
                return
              }
              logger.info("FIND UNLOCK TX TO UPDATE : %s", eventUnlockId)
              let splits = eventUnlockId.split("-")
              if (splits.length != 6) {
                return
              }
              let [txHash, fromChainId, toChainId, index, originContractAddress, originChainId] = splits
              if (originChainId != casperConfig.networkId) {
                logger.warn("NOT ORIGIN NFT FROM CASPER RETURN !!!!")
                return
      
              }
          
              await HOOK.updateApproveToClaim(
                {
                  index,
                  fromChainId,
                  toChainId,
                  originChainId,
                  originContractAddress,
                  txHash,
                  deployHash: CasperHelper.toNormalTxHash(deploy.deploy.hash),
                  height: height,
                  claimId: eventUnlockId,
                  isCasperApproveToClaim: true,
                }
              )
      
              logger.info("Sucessful saved request to DB")
      
            } else if (['claim_unlock_nft'].includes(d.event_type)) {    
              const unlockIdsRawHex = d.unlock_ids  
              const unlockIdsRaw = Uint8Array.from(Buffer.from(unlockIdsRawHex, "hex"))
              const ret = new CLListBytesParser().fromBytesWithRemainder(unlockIdsRaw, new CLListType(new CLStringType()))
              const parsedUnlockIds = ret.result.val.value().map(e => e.data)
      
              logger.info("Unlock ids parsed %s", parsedUnlockIds)
      
              // Unlock_id = requestHash- from ChainId - toChainId - index - nftPkHash - originChainId
              for (var i = 0; i < parsedUnlockIds.length; i++) {
                let thisUnlockId = parsedUnlockIds[i]
                let thisUnlockIdSplits = thisUnlockId.split("-");
                let requestHash = thisUnlockIdSplits[0];
                let fromChainId = parseInt(thisUnlockIdSplits[1]);
                let toChainId = parseInt(thisUnlockIdSplits[2]);
                let index = parseInt(thisUnlockIdSplits[3]);
                let originContractAddress = thisUnlockIdSplits[4];
                let originChainId = parseInt(thisUnlockIdSplits[5]);
                await db.Nft721Transaction.updateOne(
                  {
                    // originChainId: casperConfig.networkId,
                    index: index,
                    requestHash: requestHash,
                    fromChainId: fromChainId,
                    toChainId: toChainId,
                    originChainId: originChainId,
                    originToken: originContractAddress
                  },
                  {
                    $set: {
                      claimHash: CasperHelper.toNormalTxHash(deploy.deploy.hash),
                      claimBlock: parseInt(height),
                      claimed: true,
                      isCasperApproveToClaim: false,
                    },
                  },
                  { upsert: true, new: true }
                );
              }
              logger.info("Sucessful saved request to DB")
            }
      
          }
        }
        break
      } catch (e) {
        trial--
        if (trial == 0) {
          throw e
        }
        randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height)
        logger.error(e.toString())
      }
    }

  }
};

module.exports = HOOK;
