let CasperHelper = require("../helpers/casper");
let DotOracleCasperContractBridge = require("dotoracle-casper-contracts").NFTBridge
let CEP78 = require("casper-cep78js")
let findArgParsed = CasperHelper.findArgParsed;
const logger = require("../helpers/logger");

let BigNumber = require('bignumber.js')
let db = require('../models')
const HOOK = {
    getTokenIdsFromArgs: (args) => {
        let identifierMode = findArgParsed(args, "identifier_mode")
        if (!identifierMode) {
            return
        }
        let tokenIds
        if (identifierMode == 0) {
            tokenIds = findArgParsed(args, "token_ids")
            tokenIds = tokenIds.map(e => e.toString())
            tokenIds = tokenIds.join(",")
        } else {
            tokenIds = findArgParsed(args, "token_hashes")
            tokenIds = tokenIds.map(e => new BigNumber(e).toString())
            tokenIds = tokenIds.join(",")
        }
        return tokenIds
    },
    process: async (block, deploy, storedContractByHash) => {
      while(true) {
        try {
          let nftConfig = CasperHelper.getNFTConfig();
          let casperConfig = CasperHelper.getConfigInfo()
          let tokenData = nftConfig.tokens.find(
            (e) => e.contractHash == storedContractByHash.hash
          );
          let args = storedContractByHash.args;
          let entryPoint = storedContractByHash.entry_point;
          console.log('storedContractByHash', storedContractByHash)
          if (tokenData) {
            // let args = storedContractByHash.args;
            // if (storedContractByHash.entry_point == "mint") {
            //   let recipient = findArg(args, "recipient");
            //   let amount = findArg(args, "amount");
            //   let mintid = findArg(args, "mintid");
            //   let fee = findArg(args, "swap_fee");

            //   {
            //     //{
            //     //   index: eventData._index,
            //     //   fromChainId: eventData._fromChainId,
            //     //   toChainId: eventData._toChainId,
            //     // },
            //     // {
            //     //   $set: {
            //     //     claimHash: eventData.transactionHash,
            //     //     claimBlock: eventData.blockNumber,
            //     //     claimed: true,
            //     //     claimId: eventData._claimId,
            //     //   },
            //     // },
            //   }
            //   //mintid = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
            //   let mintidStr = mintid[1].parsed;
            //   let mintidSplits = mintidStr.split("-");
            //   let transactionHash = h;
            //   let fromChainId = parseInt(mintidSplits[1]);
            //   let toChainId = parseInt(mintidSplits[2]);
            //   let index = parseInt(mintidSplits[3]);
            //   let originContractAddress = mintidSplits[4];
            //   let originChainId = parseInt(mintidSplits[5]);

            //   let blockNumber = block.block.header.height;
            //   let claimId = mintidStr;
            //   let eventData = {
            //     fromChainId: fromChainId,
            //     toChainId: toChainId,
            //     transactionHash: CasperHelper.toNormalTxHash(transactionHash),
            //     index: index,
            //     blockNumber: blockNumber,
            //     claimId: claimId,
            //     originToken: tokenData.originContractAddress.toLowerCase(),
            //     originChainId: tokenData.originChainId,
            //   };
            //   logger.info("Casper Network Minting: %s", eventData);

            //   await processMintEvent(
            //     networkId,
            //     block.block.header.height,
            //     lastBlockHeight,
            //     eventData
            //   );
            // } else if (storedContractByHash.entry_point == "transfer") {
            //   console.log("transfer");
            // } else if (storedContractByHash.entry_point == "request_bridge_back") {
            //   let txCreator = "";
            //   if (deploy.approvals.length > 0) {
            //     txCreator = deploy.approvals[0].signer;
            //     txCreator = CasperHelper.fromCasperPubkeyToAccountHash(txCreator);
            //   }
            //   let amount = findArg(args, "amount");
            //   amount = amount[1].parsed;
            //   let toChainId = findArg(args, "to_chainid");
            //   toChainId = toChainId[1].parsed;
            //   let fee = findArg(args, "fee");
            //   fee = fee[1].parsed;
            //   let receiver_address = findArg(args, "receiver_address");
            //   receiver_address = receiver_address[1].parsed;
            //   let id = findArg(args, "id");
            //   id = id[1].parsed;

            //   //reading index from id
            //   const erc20 = new ERC20Client(
            //     CasperHelper.getRandomCasperRPCLink(),
            //     casperConfig.chainName,
            //     casperConfig.eventStream
            //   );

            //   await erc20.setContractHash(tokenData.contractHash);

            //   id = await erc20.readRequestIndex(id);
            //   if (parseInt(id) == 0) {
            //     throw "RPC error";
            //   }
            //   //amount after fee
            //   amount = new BigNumber(amount).minus(fee).toString();

            //   // await db.Transaction.updateOne(
            //   //   {
            //   //     index: eventData.index,
            //   //     fromChainId: eventData.fromChainId,
            //   //     toChainId: eventData.toChainId,
            //   //     originChainId: eventData.originChainId,
            //   //     originToken: eventData.originToken,
            //   //   },
            //   //   {
            //   //     $set: {
            //   //       requestHash: eventData.transactionHash,
            //   //       requestBlock: eventData.blockNumber,
            //   //       account: eventData.toAddr.toLowerCase(),
            //   //       originToken: token.hash,
            //   //       originSymbol: token.symbol,
            //   //       fromChainId: eventData.fromChainId,
            //   //       originChainId: eventData.originChainId,
            //   //       toChainId: eventData.toChainId,
            //   //       amount: amount,
            //   //       // amountNumber: amountNumber, // TODO: get token from chain detail
            //   //       index: eventData.index,
            //   //       requestTime: block.timestamp,
            //   //     },
            //   //   },
            //   //   { upsert: true, new: true }
            //   // );
            //   let timestamp = Date.parse(block.block.header.timestamp);
            //   let eventData = {
            //     token: tokenData.originContractAddress.toLowerCase(),
            //     index: parseInt(id),
            //     fromChainId: parseInt(casperConfig.networkId),
            //     toChainId: parseInt(toChainId),
            //     originChainId: tokenData.originChainId,
            //     originToken: tokenData.originContractAddress.toLowerCase(),
            //     transactionHash: CasperHelper.toNormalTxHash(h),
            //     blockNumber: block.block.header.height,
            //     toAddr: receiver_address,
            //     amount: amount,
            //     index: parseInt(id),
            //     requestTime: Math.floor(timestamp / 1000),
            //     txCreator: txCreator,
            //   };

            //   logger.info("Casper Network Request: %s, %s", eventData);

            //   await processRequestEvent(
            //     block.block.header.height,
            //     lastBlockHeight,
            //     eventData
            //   );
            // }
          } else if (nftConfig.nftbridge == storedContractByHash.hash) {
            if (entryPoint == "unlock_nft") {
              //unlock_id = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
              let claimId = findArgParsed(args, "unlock_id");
              if (!claimId) {
                  return
              }
              let splits = claimId.split("-")
              if (splits.length != 6) {
                  return
              }
              let (txHash, fromChainId, toChainId, index, originContractAddress, originChainId) = splits
              if (originContractAddress.length != 64 || toChainId != originChainId || parseInt(originChainId) != nftConfig.networkId) {
                  return
              }

              let fromChainIdFromArgs = findArgParsed(args, "from_chainid")
              let nftContractHash = findArgParsed(args, "nft_contract_hash")
              if (nftContractHash.Hash) {
                  nftContractHash = nftContractHash.Hash.slice(5)
              }
              let recipient = findArgParsed(args, "target_key")
              if (!fromChainId || !nftContractHash || fromChainIdFromArgs != fromChainId || originContractAddress != nftContractHash) {
                  return
              }
              
              let tokenIds = HOOK.getTokenIdsFromArgs(args)
              if (recipient.Account) {
                  recipient = recipient.Account
              }

              logger.info("New event at block %s", block.block.header.height);
              try {
                  // event ClaimToken(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index, bytes32 _claimId);
                  await db.Nft721Transaction.updateOne(
                  {
                      index: parseInt(index),
                      fromChainId: parseInt(fromChainId),
                      toChainId: parseInt(toChainId),
                      originChainId: parseInt(originChainId),
                      originToken: originContractAddress,
                      requestHash: txHash,
                  },
                  {
                      $set: {
                          claimHash: CasperHelper.toNormalTxHash(deploy.JsonDeployHash),
                          claimBlock: parseInt(block.block.header.height),
                          claimed: true,
                          claimId: claimId,
                          tokenIds: tokenIds

                      },
                  },
                  { upsert: true, new: true }
                  );
                  logger.info("claimId %s", claimId);
                  await db.Nft721RequestToCasper.updateOne(
                  {
                      claimId: claimId
                  },
                  {
                      $set: {
                          txExecuted: true
                      },
                  },
                  { upsert: true, new: true }
                  );
              } catch (e) {
                  logger.error("error while saving process minting %s", e)
              }
              
            } else if (entryPoint == "request_bridge_nft") {
              let txCreator = "";
              if (deploy.approvals.length > 0) {
                txCreator = deploy.approvals[0].signer;
                txCreator = CasperHelper.fromCasperPubkeyToAccountHash(txCreator);
              }
              let toChainId = findArgParsed(args, "to_chainid");
              let receiverAddress = findArgParsed(args, "receiver_address");
              let nftContractHash = findArgParsed(args, "nft_contract_hash")
              if (nftContractHash.Hash) {
                  nftContractHash = nftContractHash.Hash.slice(5)
              }
              nftContractHash = nftContractHash.toLowerCase()
              let _tokenData = nftConfig.tokens.find(
                (e) => e.contractHash.toLowerCase() == nftContractHash
              );
              if (!_tokenData) {
                //unsupported token
                return;
              }
              let requestId = findArgParsed(args, "request_id");
              console.log('requestId', requestId)
              const nftBridge = new DotOracleCasperContractBridge(nftConfig.nftbridge, CasperHelper.getRandomCasperRPCLink(), casperConfig.chainName)
              await nftBridge.init()

              let requestData = await nftBridge.getIndexFromRequestId(requestId)
              console.log('requestData', requestData)
              requestData = JSON.parse(requestData)

              let tokenIds = requestData.token_ids
              let identifierMode = requestData.identifier_mode
              if (identifierMode != 0) {
                tokenIds = requestData.token_hashes
              }
              tokenIds = tokenIds.join(",")

              let index = requestData.request_index
              if (parseInt(index) == 0) {
                throw "RPC error";
              }
              let timestamp = Date.parse(block.block.header.timestamp);

              let nftSymbol = _tokenData.casperCollectionSymbol 
              if (!nftSymbol) {
                let nftContract = new CEP78(nftContractHash, CasperHelper.getRandomCasperRPCLink(), casperConfig.chainName)
                await nftContract.init()
                await nftContract.collectionSymbol()
              }

              logger.info("Casper Network Request: %s", deploy.hash);

              await db.Nft721Transaction.updateOne(
                {
                  index: parseInt(index),
                  fromChainId: parseInt(casperConfig.networkId),
                  toChainId: parseInt(toChainId),
                  originChainId: parseInt(casperConfig.networkId),
                  originToken: nftContractHash,
                  requestHash: CasperHelper.toNormalTxHash(deploy.hash)
                },
                {
                  $set: {
                    requestHash: CasperHelper.toNormalTxHash(deploy.hash),
                    requestBlock: parseInt(block.block.header.height),
                    account: receiverAddress.toLowerCase(),
                    txCreator: txCreator,
                    originToken: nftContractHash,
                    originSymbol: nftSymbol,
                    tokenIds: tokenIds,
                    requestTime: Math.floor(timestamp / 1000),
                    identifierMode: identifierMode
                  },
                },
                { upsert: true, new: true }
              )
            }
          }
          break
        } catch(e) {
          console.error(e.toString())
        }
      }
    },
};

module.exports = HOOK;
