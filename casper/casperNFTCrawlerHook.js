let CasperHelper = require("../helpers/casper");
let { DTOWrappedNFT, NFTBridge } = require("casper-nft-utils")
let findArgParsed = CasperHelper.findArgParsed;
const logger = require("../helpers/logger");

let db = require('../models');
const { CLPublicKey, CLListBytesParser, CLListType, CLType, CLStringType } = require("casper-js-sdk");
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
  process: async (block, deploy, storedContractByHash, selectedRPC, signer) => {
    console.log("===== Signer ", signer)
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

          //  REMOVE THIS PART BECAUSE WE CRAWL "REQUEST_BRIDGE_NFT" AND "UNLOCK_NFT" IN THE DIFFERENT WAY

          // if (entryPoint == "unlock_nft") {
          //   console.log("storedContractByHash.entryPoint", storedContractByHash.entryPoint)
          //   console.log("OK !!! entryPoint= unlock_nft")
          //   randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height, randomGoodRPC)
          //   //unlock_id = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
          //   let claimId = findArgParsed(args, "unlock_id");
          //   if (!claimId) {
          //     return
          //   }
          //   console.log("FIND NEW CLAIMID TO UPDATE !!!!: ", claimId)
          //   let splits = claimId.split("-")
          //   if (splits.length != 6) {
          //     return
          //   }
          //   console.log("splits: ", splits)
          //   let [txHash, fromChainId, toChainId, index, originContractAddress, originChainId] = splits
          //   console.log("GET SPLITS txHash: ", txHash)
          //   console.log(" !!!!! originChainId: ", originChainId)
          //   console.log(" !!!!!!!  nftConfig.networkId: ", casperConfig.networkId)
          //   if (originChainId != casperConfig.networkId) {
          //     console.log("NOT ORIGIN NFT FROM CASPER RETURN !!!!")
          //     return

          //   }
          //   // if (originContractAddress.length != 64 || toChainId != originChainId || parseInt(originChainId) != nftConfig.networkId) {
          //   //   console.log("SITUATION 1 RETURN")
          //   //   return
          //   // }

          //   if (originChainId != toChainId) {
          //     console.log("SITUATION 2 RETURN")
          //     return
          //   }

          //   let fromChainIdFromArgs = findArgParsed(args, "from_chainid")
          //   console.log("fromChainIdFromArgs: ", fromChainIdFromArgs)
          //   let nftContractHash = findArgParsed(args, "nft_contract_hash")
          //   console.log("!!!! nftContractHash: ", nftContractHash)
          //   if (nftContractHash.Hash) {
          //     nftContractHash = nftContractHash.Hash.slice(5)
          //   }
          //   let recipient = findArgParsed(args, "target_key")
          //   console.log("recipient", recipient)
          //   if (!fromChainId || !nftContractHash || fromChainIdFromArgs != fromChainId || originContractAddress != nftContractHash) {
          //     return
          //   }

          //   let identifierMode = findArgParsed(args, "identifier_mode")
          //   console.log("identifierMode: ", identifierMode)
          //   if (identifierMode == undefined) {
          //     console.log("NO IDENTIFIER-MODE RETURN !!!! ")
          //     return
          //   }
          //   let tokenIds = CasperHelper.getTokenIdsFromArgs(identifierMode, args)
          //   if (recipient.Account) {
          //     recipient = recipient.Account
          //   }

          //   logger.info("New event at block %s", block.block.header.height);
          //   console.log("HOOK START TO UPDATE DATE !!!!", claimId)
          //   console.log("PARAM updated !!!: ", index,
          //     fromChainId,
          //     toChainId,
          //     originChainId,
          //     originContractAddress,
          //     txHash,
          //     deploy.hash,
          //     block.block.header.height,
          //     claimId,
          //     tokenIds)
          //   console.log(" !!!! !!!!!!!!!!!!!!!!!!!!!!   1!!!!!!!!!")

          //   await HOOK.updateMintOrUnlock(
          //     {
          //       index,
          //       fromChainId,
          //       toChainId,
          //       originChainId,
          //       originContractAddress,
          //       txHash,
          //       deployHash: deploy.hash,
          //       height: block.block.header.height,
          //       claimId,
          //       tokenIds
          //     }
          //   )
          // }
          // } else if (entryPoint == "request_bridge_nft") {
          //   let request = await CasperHelper.parseRequestNFTFromCasper(deploy, height)
          //   if (!request) {
          //     return
          //   }

          //   request.timestamp = Date.parse(block.block.header.timestamp);
          //   await HOOK.updateRequestBridge(
          //     request
          //   )
          //   console.log("Sucessful saved request to DB")
          // }
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
  processNFTBridgeEvent: async (h, block, parsed) => {
    let height = block.block.header.height

    logger.info('storing events into db')
    for (const e of parsed.data) {
      const d = e.data
      console.log("deploys : ", d)
      const thisNftContract = CasperHelper.getHashFromKeyString(d.nft_contract)
      let nftConfig = CasperHelper.getNFTConfig();
      console.log("thisNftContract ", thisNftContract)
      let tokenData = nftConfig.tokens.find(
        (e) => e.contractHash == thisNftContract
      )
      console.log("token ", tokenData)
      if (tokenData) {
        if (['request_bridge_nft'].includes(d.event_type)) {
          // d now is event data

          let eventRequestId = d.request_id
          console.log("d.request_id ", d.request_id)
          // get request_id from Bridge contract
          // To-do : need to verify data from contract and event data
          let requestDataFromBridgeContract = await CasperHelper.getBridgeRequestData(height, d.request_id)
          console.log("here 2")
          let array = new CLListBytesParser().fromBytesWithRemainder(Uint8Array.from(Buffer.from(d.token_ids, "hex")), new CLListType(new CLStringType()))
          let parsedTokenIds = []
          for (var i = 0; i < array.result.val.data.length; i++) {
            parsedTokenIds.push(array.result.val.data[i].data.toString())
          }


          console.log("compare ", requestDataFromBridgeContract.token_ids, parsedTokenIds)
          console.log(requestDataFromBridgeContract.token_ids == parsedTokenIds)

          // Compare 2 array of token_ids

          let compared = true

          if (requestDataFromBridgeContract.token_ids.length == parsedTokenIds.length
            && requestDataFromBridgeContract.token_ids.every(function (u, i) {
              return u === parsedTokenIds[i];
            })
          ) {
            compared = false;
          } else {
            compared = true;
          }
          console.log("compared", compared)

          if (requestDataFromBridgeContract.request_id != d.request_id
            || requestDataFromBridgeContract.request_index != d.request_index
            || requestDataFromBridgeContract.nft_contract.slice(5) != CasperHelper.getHashFromKeyString(d.nft_contract)
            || requestDataFromBridgeContract.from.Account != d.from
            || requestDataFromBridgeContract.to != d.to
            || compared // compare 2 array of token_ids
            || requestDataFromBridgeContract.to_chainid != d.to_chainid) {
            throw ("conflict data from EVENT and CONTRACT")

          }
          let nftSymbolFromConfigFile = tokenData.originSymbol
          let nftNameFromConfigFile = tokenData.originName
          let nftContractHash = requestDataFromBridgeContract.nft_contract
          console.log(nftContractHash)
          let nftContract = {}
          //if (!nftSymbol || !nftName) { // Do not confi
          console.log("Before create instance")
          let randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height)

          nftContract = await DTOWrappedNFT.createInstance(nftContractHash, randomGoodRPC, casperConfig.chainName)
          // await nftContract.init()
          console.log("After create instance")
          let nftSymbol = await nftContract.collectionSymbol()
          console.log(" ============")
          console.log("nftSymbol: ", nftSymbol, nftSymbolFromConfigFile)
          let nftName = await nftContract.collectionName()
          console.log("nftName: ", nftName, nftNameFromConfigFile)
          if (nftSymbolFromConfigFile != nftSymbol || nftNameFromConfigFile != nftName) {
            throw "WRONG CONFIG nftSymbol OR nftName !!!!!";
          }
          let tokenIds = requestDataFromBridgeContract.token_ids
          let tokenMetadatas = []

          for (var i = 0; i < tokenIds.length; i++) {
            let tokenId = tokenIds[i]
            while (true) {
              try {
                //read metadata
                let metadata = await nftContract.getTokenMetadata(tokenId)
                console.log("metadata: ", metadata)
                tokenMetadatas.push(metadata)
                break
              } catch (e) {
                nftContract.nodeAddress = randomGoodRPC
                console.error(e.toString())
              }
            }
          }




          let requestBridgeData =
          {
            index: requestDataFromBridgeContract.request_index,
            fromChainId: casperConfig.networkId,
            toChainId: requestDataFromBridgeContract.to_chainid,
            originChainId: casperConfig.networkId,
            originToken: CasperHelper.getHashFromKeyString(d.nft_contract),
            deployHash: h, // deploy hash 
            height: height,
            receiverAddress: d.to,
            txCreator: CasperHelper.getHashFromKeyString(d.from),
            originSymbol: nftSymbol,
            originName: nftName,
            tokenIds: tokenIds,
            identifierMode: requestDataFromBridgeContract.identifier_mode,
            tokenMetadatas: tokenMetadatas
          }

          // let request = await CasperHelper.parseRequestNFTFromCasper(deploy, height)
          // if (!request) {
          //   return
          // }

          requestBridgeData.timestamp = Date.parse(block.block.header.timestamp);
          await HOOK.updateRequestBridge(
            requestBridgeData
          )
          console.log("Sucessful saved request to DB")

        }

        if (['unlock_nft'].includes(d.event_type)) {
          // d now is event data

          let event_unlockId = d.unlock_id
          console.log("d.unlock_id ", d.unlock_id)

          if (!event_unlockId) {
            return
          }
          console.log("FIND UNLOCK TX TO UPDATE : ", event_unlockId)
          let splits = event_unlockId.split("-")
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

          // Parsed token_ids array
          console.log("d.token_ids", d.token_ids)
          let array = new CLListBytesParser().fromBytesWithRemainder(Uint8Array.from(Buffer.from(d.token_ids, "hex")), new CLListType(new CLStringType()))
          let parsedTokenIds = []
          for (var i = 0; i < array.result.val.data.length; i++) {
            parsedTokenIds.push(array.result.val.data[i].data.toString())
          }

          console.log("parsedTokenIds", parsedTokenIds)




          await HOOK.updateMintOrUnlock(
            {
              index,
              fromChainId,
              toChainId,
              originChainId,
              originContractAddress,
              txHash,
              deployHash: h,
              height: height,
              claimId: event_unlockId,
              tokenIds: parsedTokenIds
            }
          )


          console.log("Sucessful saved request to DB")

        }
      }
      else {
        logger.info("not supported NFT")
        return
      }

    }

  },
};

module.exports = HOOK;
