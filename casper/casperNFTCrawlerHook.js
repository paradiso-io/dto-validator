let CasperHelper = require("../helpers/casper");
const logger = require("../helpers/logger")(module);
const CWeb3 = require('casper-web3')
const { DTOBridgeEvent, DTOWrappedCep78Event } = require('../helpers/casperEventsIndexing')
const GeneralHelper = require('../helpers/general')
const Web3Utils = require('../helpers/web3')
const config = require('config')
const ERC721 = require('../contracts/ERC721.json')
let db = require('../models');
const { CLListBytesParser, CLListType, CLStringType, CLU8BytesParser, CLStringBytesParser, CLKeyBytesParser, CLU256BytesParser, CasperServiceByJsonRPC } = require("casper-js-sdk");

const NFTMetadataKind = {
  CEP78: 0,
  NFT721: 1,
  Raw: 2,
  CustomValidated: 3,
};

const HOOK = {
  updateMintOrUnlock: async (updateData) => {
    {
      logger.info("!!!! START UPDATE MINT OR UNLOCK !!!!")
      logger.info('updateData for deploy %s', updateData.deployHash)

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
      logger.info("START UPDATE REQUESTOCASPER claimId %s", updateData.claimId);
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
      logger.info("FINISH UPDATE REQUESTTOCASPER claimId: %s", updateData.claimId)
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
            claimId: updateData.claimId,
            isCasperApproveToClaim: updateData.isCasperApproveToClaim ? updateData.isCasperApproveToClaim : false
          },
        },
        { upsert: true, new: true }
      );
      logger.info("START UPDATE REQUESTOCASPER claimId %s", updateData.claimId);
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
      logger.info("FINISH UPDATE REQUESTTOCASPER claimId: %s", updateData.claimId)
    }
  },
  updateClaimOnCasper: async (updateData) => {
    {
      logger.info("updateClaimOnCasper toChainId = %s, account = %s ", updateData.casperChainId, updateData.account.toLowerCase())
      await db.Nft721Transaction.updateOne(
        {
          toChainId: parseInt(updateData.casperChainId),
          account: updateData.account.toLowerCase(),
        },
        {
          $set: {
            claimHash: CasperHelper.toNormalTxHash(updateData.deployHash),
            claimBlock: parseInt(updateData.height),
            claimed: true,
            isCasperClaimed: updateData.isCasperClaimed
          },
        },
        { upsert: true, new: true }
      );
      logger.info("User Claim !!! user = %s, deploy = %s", updateData.account, updateData.deployHash)
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
  parseRequestFromTransaction: async (deploy, blockNumber, requestIndex) => {
    let randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(blockNumber, null)
    const client = new CasperServiceByJsonRPC(
      randomGoodRPC
    );

    const block = await client.getBlockInfoByHeight(blockNumber)
    let requests = await HOOK.processNFTWrapped(block, deploy, randomGoodRPC)
    let requestWithIndex = requests.find(e => e.index == parseInt(requestIndex))
    if (requestWithIndex) {
      return requestWithIndex
    } else {
      requests = await HOOK.processNFTBridgeEvent(block, deploy, randomGoodRPC)
      requestWithIndex = requests.find(e => e.index == parseInt(requestIndex))
      return requestWithIndex
    }
  },
  processNFTWrapped: async (block, deploy, selectedRPC) => {
    let trial = 20
    let randomGoodRPC = selectedRPC
    let height = parseInt(block.block.header.height)
    const casperConfig = CasperHelper.getConfigInfo()
    const nftConfig = CasperHelper.getNFTConfig()
    const requestList = []
    while (trial > 0) {
      try {
        const result = {}
        if (deploy.execution_results) {
          result.execution_result = deploy.execution_results[0];
        } else {
          break
        }

        const supportedNFTs = nftConfig.tokens
        for (const configuredNFT of supportedNFTs) {
          if (configuredNFT.contractPackageHash) {
            const nftPackageHash = configuredNFT.contractPackageHash
            const parsedEventData = CWeb3.Contract.parseEvents(DTOWrappedCep78Event, result, "contract-package-wasm" + configuredNFT.contractPackageHash)
            if (parsedEventData && parsedEventData.data) {
              for (const e of parsedEventData.data) {
                const d = e.data
                if (['request_bridge_back'].includes(d.event_type)) {
                  // reading request data from bridge contract
                  const nftActiveContractHash = await CWeb3.Contract.getActiveContractHash(nftPackageHash, casperConfig.chainName)
                  const nftContactInstance = await CWeb3.Contract.createInstanceWithRemoteABI(nftActiveContractHash, randomGoodRPC, casperConfig.chainName)
                  const rawRequestData = await nftContactInstance.getter.requestIds(d.request_index, true)
                  logger.info('rawRequestData = %s', Buffer.from(rawRequestData).toString('hex'))
                  let requestIndex = parseInt(d.request_index)
                  // desearlize it
                  const parsedResults = CWeb3.Contract.decodeData(rawRequestData, [{ List : "String" }, 'U256', 'Key', 'String'])
                  logger.info('parsedResults %s', parsedResults[1])
                  const tokenIds = parsedResults[0].map(e => e.data)
                  let toChainId = parseInt(parsedResults[1].toString())
                  let from = parsedResults[2]
                  from = from.data ? Buffer.from(from.data).toString('hex') : ""
                  if (deploy.deploy.approvals.length > 0) {
                    from = deploy.deploy.approvals[0].signer;
                    from = CasperHelper.fromCasperPubkeyToAccountHash(from);
                  }

                  let to = parsedResults[3]
                  const tokenData = configuredNFT
                  let nftSymbolFromConfigFile = tokenData.originSymbol
                  let nftNameFromConfigFile = tokenData.originName
                  logger.info('tokenData %s, tokenIds %s', tokenData, tokenIds)
                  let tokenMetadatas = []
                  if (!config.blockchain[tokenData.originChainId] || config.blockchain[tokenData.originChainId].notEVM) {
                    logger.warn("unsupported origin chain id not an EVM chain")
                  }

                  for (var i = 0; i < tokenIds.length; i++) {
                    let tokenUri = await GeneralHelper.tryCallWithTrial(async () => {
                      let web3Origin = await Web3Utils.getWeb3(tokenData.originChainId)
                      let originTokenContract = await new web3Origin.eth.Contract(ERC721, tokenData.originContractAddress)
                      let tokenUri = await originTokenContract.methods.tokenURI(tokenIds[i]).call()
                      return tokenUri
                    })
                    tokenMetadatas.push(tokenUri)
                  }

                  let requestBridgeData =
                  {
                    index: requestIndex,
                    fromChainId: casperConfig.networkId,
                    toChainId: toChainId,
                    originChainId: tokenData.originChainId,
                    originToken: tokenData.originContractAddress,
                    deployHash: CasperHelper.toNormalTxHash(deploy.deploy.hash),
                    height: height,
                    receiverAddress: to,
                    txCreator: from,
                    originSymbol: nftSymbolFromConfigFile,
                    originName: nftNameFromConfigFile,
                    tokenIds: tokenIds,
                    identifierMode: 0,
                    tokenMetadatas: tokenMetadatas
                  }

                  requestBridgeData.timestamp = Date.parse(block.block.header.timestamp);
                  await HOOK.updateRequestBridge(
                    requestBridgeData
                  )

                  requestList.push(requestBridgeData)

                  logger.info("Sucessful saved request to DB")
                } else if (['approve_to_claim'].includes(d.event_type)) {
                  let eventMintId = d.mint_id

                  if (!eventMintId) {
                    continue
                  }
                  logger.info("FIND Mint ID TX TO UPDATE : %s", eventMintId)
                  let splits = eventMintId.split("-")
                  if (splits.length != 6) {
                    continue
                  }
                  let [txHash, fromChainId, toChainId, index, originContractAddress, originChainId] = splits
                  if (originChainId == casperConfig.networkId) {
                    logger.warn("Original Chain must not be the casper chain")
                    continue
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
                      claimId: eventMintId,
                      isCasperApproveToClaim: true,
                    }
                  )

                  logger.info("Sucessful saved request to DB")

                } else if (['claim'].includes(d.event_type)) {
                  const mintIdsRawHex = d.mint_ids
                  const mintIdsRaw = Uint8Array.from(Buffer.from(mintIdsRawHex, "hex"))
                  const parsedResults = CWeb3.Contract.decodeData(mintIdsRaw, [{ List : 'String' }])
                  const parsedMintIds = parsedResults[0].map(e => e.data)

                  logger.info("Unlock ids parsed %s", parsedMintIds)

                  // Unlock_id = requestHash- from ChainId - toChainId - index - nftPkHash - originChainId
                  for (var i = 0; i < parsedMintIds.length; i++) {
                    let thisMintId = parsedMintIds[i]
                    let thisMintIdSplits = thisMintId.split("-");
                    let requestHash = thisMintIdSplits[0];
                    let fromChainId = parseInt(thisMintIdSplits[1]);
                    let toChainId = parseInt(thisMintIdSplits[2]);
                    let index = parseInt(thisMintIdSplits[3]);
                    let originContractAddress = thisMintIdSplits[4];
                    let originChainId = parseInt(thisMintIdSplits[5]);
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
                          claimed: true
                        },
                      },
                      { upsert: true, new: true }
                    );
                  }
                  logger.info("Sucessful saved request to DB")
                }
              }
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

    return requestList
  },
  // this function is used for parsing all events related to bridge CEP78 NFTs natively issued on Casper
  processNFTBridgeEvent: async (block, deploy, selectedRPC) => {
    let trial = 20
    let randomGoodRPC = selectedRPC
    let height = parseInt(block.block.header.height)
    const casperConfig = CasperHelper.getConfigInfo()
    const nftConfig = CasperHelper.getNFTConfig()
    const requestList = []
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
                continue
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
                const nftContract = await CWeb3.Contract.createInstanceWithRemoteABI(nftContractHashActive, randomGoodRPC, casperConfig.chainName)
                let nftSymbol = await nftContract.getter.collectionSymbol()
                let nftName = await nftContract.getter.collectionName()
                if (nftSymbolFromConfigFile != nftSymbol || nftNameFromConfigFile != nftName) {
                  throw "WRONG CONFIG nftSymbol OR nftName !!!!!";
                }
                let tokenMetadatas = []

                for (var i = 0; i < tokenIds.length; i++) {
                  let tokenId = tokenIds[i]
                  while (true) {
                    try {
                      //read metadata
                      let metadata = await HOOK.getCep78TokenMetadata(nftContract, tokenId)
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
                  originToken: nftPackageHash,
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
                requestList.push(requestBridgeData)
                logger.info("Sucessful saved request to DB")
              } else {
                logger.info("not supported NFT")
                continue
              }
            } else if (['approve_unlock_nft'].includes(d.event_type)) {
              let eventUnlockId = d.unlock_id

              if (!eventUnlockId) {
                continue
              }
              logger.info("FIND UNLOCK TX TO UPDATE : %s", eventUnlockId)
              let splits = eventUnlockId.split("-")
              if (splits.length != 6) {
                continue
              }
              let [txHash, fromChainId, toChainId, index, originContractAddress, originChainId] = splits
              if (originChainId != casperConfig.networkId) {
                logger.warn("NOT ORIGIN NFT FROM CASPER RETURN !!!!")
                continue
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
                      claimed: true
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
    return requestList
  },
  getCep78TokenMetadata: async (nftContractInstance, tokenId) => {
    try {
      const itemKey = tokenId.toString();
      let nftMetadataKind = await nftContractInstance.getter.nftMetadataKind();
      nftMetadataKind = parseInt(nftMetadataKind.toString());
      let result = null;
      if (nftMetadataKind == NFTMetadataKind.CEP78) {
        result = await nftContractInstance.getter.metadataCep78(itemKey)
      } else if (nftMetadataKind == NFTMetadataKind.CustomValidated) {
        result = await nftContractInstance.getter.metadataCustomValidated(itemKey)
      } else if (nftMetadataKind == NFTMetadataKind.NFT721) {
        result = await nftContractInstance.getter.metadataNft721(itemKey)
      } else if (nftMetadataKind == NFTMetadataKind.Raw) {
        result = await nftContractInstance.getter.metadataRaw(itemKey)
      }
      return result;
    } catch (e) {
      throw e;
    }
  }
};

module.exports = HOOK;
