let CasperHelper = require("../helpers/casper");
let { DTOWrappedNFT, NFTBridge } = require("casper-nft-utils")
let findArgParsed = CasperHelper.findArgParsed;
const logger = require("../helpers/logger");

let BigNumber = require('bignumber.js')
let db = require('../models')
const HOOK = {
  updateMintOrUnlock: async (updateData) => {
    {
      console.log('updateData', updateData)
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
  getTokenIdsFromArgs: (identifierMode, args) => {
    let tokenIds
    if (identifierMode == 0) {
      tokenIds = findArgParsed(args, "token_ids")
      tokenIds = tokenIds.map(e => e.toString())
    } else {
      tokenIds = findArgParsed(args, "token_hashes")
      console.log('token_hashes', tokenIds)
      tokenIds = tokenIds.map(e => e.toString())
    }
    return tokenIds
  },
  getTokenHashesFromArgs: (args) => {
    let tokenIds = findArgParsed(args, "token_hashes")
    return tokenIds
  },
  process: async (block, deploy, storedContractByHash) => {
    while (true) {
      try {
        let nftConfig = CasperHelper.getNFTConfig();
        let casperConfig = CasperHelper.getConfigInfo()
        let tokenData = nftConfig.tokens.find(
          (e) => e.contractHash == storedContractByHash.hash
        );
        let args = storedContractByHash.args;
        let entryPoint = storedContractByHash.entry_point;
        if (tokenData) {
          console.log('storedContractByHash', storedContractByHash)
          let nftContractHash = storedContractByHash.hash
          if (entryPoint == "mint") {
            let nftContract = await DTOWrappedNFT.createInstance(nftContractHash, CasperHelper.getRandomCasperRPCLink(), casperConfig.chainName)
            let identifierMode = await nftContract.identifierMode()
            let tokenIds = HOOK.getTokenIdsFromArgs(identifierMode, args)
            let metadatas = findArgParsed(args, "token_meta_datas")
            let recipient = findArgParsed(args, "token_owner");
            if (recipient.Account) {
              recipient = recipient.Account
            }
            let mintid = findArgParsed(args, "mint_id");
            let claimId = mintid
            // mintid = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>

            let mintidSplits = mintid.split("-");
            let txHash = mintidSplits[0];
            let fromChainId = parseInt(mintidSplits[1]);
            let toChainId = parseInt(mintidSplits[2]);
            let index = parseInt(mintidSplits[3]);
            let originContractAddress = mintidSplits[4];
            let originChainId = parseInt(mintidSplits[5]);

            logger.info("Casper Network Minting: %s %s", deploy.hash, claimId);

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
            let txCreator = "";
            if (deploy.approvals.length > 0) {
              txCreator = deploy.approvals[0].signer;
              txCreator = CasperHelper.fromCasperPubkeyToAccountHash(txCreator);
            }

            let nftContract = await DTOWrappedNFT.createInstance(nftContractHash, CasperHelper.getRandomCasperRPCLink(), casperConfig.chainName)
            let identifierMode = await nftContract.identifierMode()
            let tokenIds = HOOK.getTokenIdsFromArgs(identifierMode, args)
            let tokenHashes = []
            if (identifierMode == 1) {
              tokenHashes = HOOK.getTokenHashesFromArgs(args)
            }
            let tokenMetadatas = []
            for (var i = 0; i < tokenIds.length; i++) {
              let tokenId = identifierMode == 0 ? tokenIds[i] : tokenHashes[i]
              while (true) {
                try {
                  //read metadata
                  let metadata = await nftContract.getTokenMetadata(tokenId)
                  tokenMetadatas.push(metadata)
                  break
                } catch (e) {
                  nftContract.nodeAddress = CasperHelper.getRandomCasperRPCLink()
                  console.error(e.toString())
                }
              }
            }

            let toChainId = findArgParsed(args, "to_chainid");
            let receiverAddress = findArgParsed(args, "receiver_address");
            let requestId = findArgParsed(args, "request_id");
            let index = await nftContract.getIndexFromRequestId(requestId)

            if (parseInt(index) == 0) {
              throw "RPC error";
            }
            let timestamp = Date.parse(block.block.header.timestamp);

            logger.info("Casper Network Request: %s", deploy.hash);
            if (!tokenData.originChainId) {
              throw "Missconfigued for token " + tokenData.originContractAddress
            }
            if (!tokenData.originSymbol) {
              throw "Missconfigued for token symbol " + tokenData.originContractAddress
            }
            if (!tokenData.originName) {
              throw "Missconfigued for token name " + tokenData.originContractAddress
            }
            await HOOK.updateRequestBridge(
              {
                index,
                fromChainId: casperConfig.networkId,
                toChainId,
                originChainId: tokenData.originChainId,
                originToken: tokenData.originContractAddress,
                deployHash: deploy.hash,
                height: block.block.header.height,
                receiverAddress: receiverAddress,
                txCreator,
                originSymbol: tokenData.originSymbol,
                originName: tokenData.originName,
                tokenIds,
                timestamp,
                identifierMode,
                tokenMetadatas
              }
            )
          }
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
            let(txHash, fromChainId, toChainId, index, originContractAddress, originChainId) = splits
            if (originContractAddress.length != 64 || toChainId != originChainId || parseInt(originChainId) != nftConfig.networkId) {
              return
            }

            if (originChainId != toChainId) {
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

            let identifierMode = findArgParsed(args, "identifier_mode")
            if (!identifierMode) {
              return
            }
            let tokenIds = HOOK.getTokenIdsFromArgs(identifierMode, args)
            if (recipient.Account) {
              recipient = recipient.Account
            }

            logger.info("New event at block %s", block.block.header.height);

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
            const nftBridge = new NFTBridge(nftConfig.nftbridge, CasperHelper.getRandomCasperRPCLink(), casperConfig.chainName)
            await nftBridge.init()

            let requestData = await nftBridge.getIndexFromRequestId(requestId)
            console.log('requestData', requestData)
            requestData = JSON.parse(requestData)

            let tokenIds = requestData.token_ids
            let identifierMode = requestData.identifier_mode
            if (identifierMode != 0) {
              tokenIds = requestData.token_hashes
            }

            let index = requestData.request_index
            if (parseInt(index) == 0) {
              throw "RPC error";
            }
            let timestamp = Date.parse(block.block.header.timestamp);

            let nftSymbol = _tokenData.originSymbol
            let nftName = _tokenData.originName
            let nftContract = {}
            if (!nftSymbol || !nftName) {
              nftContract = await DTOWrappedNFT.createInstance(nftContractHash, CasperHelper.getRandomCasperRPCLink(), casperConfig.chainName)
              await nftContract.init()
              nftSymbol = await nftContract.collectionSymbol()
              nftName = await nftContract.collectionName()
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
                  nftContract.nodeAddress = CasperHelper.getRandomCasperRPCLink()
                  console.error(e.toString())
                }
              }
            }

            logger.info("Casper Network Request: %s", deploy.hash);

            await HOOK.updateRequestBridge(
              {
                index,
                fromChainId,
                toChainId,
                originChainId: casperConfig.networkId,
                originToken: nftContractHash,
                deployHash: deploy.hash,
                height: block.block.header.height,
                receiverAddress: receiverAddress,
                txCreator,
                originSymbol: nftSymbol,
                originName: nftName,
                tokenIds,
                timestamp,
                identifierMode,
                tokenMetadatas
              }
            )
          }
        }
        break
      } catch (e) {
        console.error(e)
      }
    }
  },
};

module.exports = HOOK;
