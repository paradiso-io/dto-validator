const events = require('events')
const config = require('config')

const logger = require('./helpers/logger')
const Web3Utils = require('./helpers/web3')
const NFT721Bridge = require('./contracts/NFT721Bridge.json')
const ERC721 = require('./contracts/ERC721.json')
const db = require('./models')
const CasperHelper = require('./helpers/casper')
const CasperConfig = CasperHelper.getConfigInfo()
const nftConfig = CasperHelper.getNFTConfig()
const PreSignNFT = require("./helpers/preSignNFT")
let { DTOWrappedNFT, NFTBridge } = require("casper-nft-utils")
const sha256 = require("js-sha256")
const CWeb3 = require("casper-web3")

function decodeOriginToken(tokenHex, originChainId) {
  let web3 = Web3Utils.getSimpleWeb3()
  if (originChainId != CasperConfig.networkId) {
    if (tokenHex.length > 42) {
      return tokenHex.replace('0x000000000000000000000000', '0x')
    }
  } else {
    try {
      let decoded = web3.eth.abi.decodeParameters(
        [{ type: "string", name: "contractHash" }],
        tokenHex
      );
      return decoded.contractHash
    } catch (e) {
      logger.error(e.toString())
    }
  }
  return null
}

// fix warning max listener
events.EventEmitter.defaultMaxListeners = 1000;
process.setMaxListeners(1000)
let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))

async function processEvent(event, networkId) {
  logger.info('New event at block %s, %s', event.event, event.blockNumber)

  let web3 = await Web3Utils.getWeb3(networkId)

  let originChainId = event.returnValues._originChainId;
  let tokenAddress = event.returnValues._token.toLowerCase()
  tokenAddress = decodeOriginToken(tokenAddress, originChainId)
  if (!tokenAddress) {
    logger.error("cannot decode contract hash tx %s, from chain %s", event.transactionHash, event.returnValues._fromChainId);
    return
  } else {
    logger.info("tokenAddress %s, %s", tokenAddress, originChainId)
  }

  let web3ForOriginChainId, tokenContract, tokenSymbol, tokenName
  let tokenIds = web3.eth.abi.decodeParameter(
    'uint256[]',
    event.returnValues._tokenIds,
  )
  let tokenIdsString = tokenIds
  let tokenMetadatas = []
  logger.info("config.blockchain[event.returnValues._originChainId]: %s", config.blockchain[event.returnValues._originChainId])

  logger.info("config.blockchain[event.returnValues._originChainId].notEVM: %s", config.blockchain[event.returnValues._originChainId].notEVM)

  if (config.blockchain[event.returnValues._originChainId].notEVM) {

    // For originChainID = Casper
    let tokenDataConfig = nftConfig.tokens.find(
      (e) => e.originContractAddress.toLowerCase() == tokenAddress
    );

    if (!tokenDataConfig || !tokenDataConfig.originSymbol || !tokenDataConfig.originName) {
      logger.error('Failed to read token metadata, please try again later')
      return
    }

    let randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(1)

    let nftContract = null
    tokenSymbol = tokenDataConfig.originSymbol
    tokenName = tokenDataConfig.originName


    for (var i = 0; i < tokenIds.length; i++) {
      let tokenId = tokenIds[i]
      let trial = 10
      while (trial > 0) {
        try {
          //read metadata
          const nftContractHashActive = await CWeb3.Contract.getActiveContractHash(tokenAddress, CasperConfig.chainName)
          nftContract = await DTOWrappedNFT.createInstance(nftContractHashActive, randomGoodRPC, CasperConfig.chainName)
          let metadata = await nftContract.getTokenMetadata(tokenId)
          logger.info("metadata: %s", metadata)
          tokenMetadatas.push(metadata)
          break
        } catch (e) {
          trial--
          logger.error(e.toString())
          randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(1)
        }
      }
    }

  } else {

    web3ForOriginChainId = await Web3Utils.getWeb3(event.returnValues._originChainId)
    tokenContract = await new web3ForOriginChainId.eth.Contract(ERC721, tokenAddress)
    tokenSymbol = await tokenContract.methods.symbol().call()
    tokenName = await tokenContract.methods.name().call()

    for (var i = 0; i < tokenIds.length; i++) {
      let uri = await tokenContract.methods.tokenURI(tokenIds[i]).call()
      let metadata = {
        name: tokenName,
        token_uri: uri,
        checksum: sha256(uri) // "940bffb3f2bba35f84313aa26da09ece3ad47045c6a1292c2bbd2df4ab1a55fb"
      }
      metadata = JSON.stringify(metadata)
      tokenMetadatas.push(metadata)
    }

  }
  logger.info('metadata %s, tokenName %s', tokenMetadatas, tokenName)

  let identifierMode = null
  // get identifierMode
  if (originChainId == CasperConfig.networkId) {
    let randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(1)
    const nftContractHashActive = await CWeb3.Contract.getActiveContractHash(tokenAddress, CasperConfig.chainName)
    nftContract = await DTOWrappedNFT.createInstance(nftContractHashActive, randomGoodRPC, CasperConfig.chainName)
    identifierMode = await nftContract.identifierMode()
    logger.info("identifierMode: %s", identifierMode)
  }

  let block = await web3.eth.getBlock(event.blockNumber)

  // event RequestBridge(address indexed _token, bytes indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index)
  let toAddrBytes = event.returnValues._toAddr;
  let decoded;
  try {
    decoded = web3.eth.abi.decodeParameters(
      [{ type: "string", name: "decodedAddress" }],
      toAddrBytes
    );
  } catch (e) {
    logger.error("cannot decode recipient address tx %s, from chain %s", event.transactionHash, event.returnValues._fromChainId);
    return;
  }
  let decodedAddress = decoded.decodedAddress;
  let casperChainId = CasperConfig.networkId;

  if (parseInt(event.returnValues._toChainId) == casperChainId) {
    logger.info('bridging to casper network %s', decodedAddress)
    if (decodedAddress.length == 64) {
      decodedAddress = 'account-hash-' + decodedAddress
    }
  }

  //reading transaction creator
  let transactionHash = event.transactionHash
  let onChainTx = await web3.eth.getTransaction(transactionHash)
  if (!onChainTx) return;
  let txCreator = onChainTx.from.toLowerCase()
  await db.Nft721Transaction.updateOne(
    {
      index: event.returnValues._index,
      fromChainId: event.returnValues._fromChainId,
      toChainId: event.returnValues._toChainId,
    },
    {
      $set: {
        requestHash: event.transactionHash,
        requestBlock: event.blockNumber,
        account: decodedAddress.toLowerCase(),
        txCreator: txCreator,
        originToken: tokenAddress,
        originSymbol: tokenSymbol,
        originName: tokenName,
        fromChainId: event.returnValues._fromChainId,
        originChainId: event.returnValues._originChainId,
        toChainId: event.returnValues._toChainId,
        tokenIds: tokenIdsString,
        index: event.returnValues._index,
        requestTime: block.timestamp,
        tokenMetadatas: tokenMetadatas,
        identifierMode: identifierMode,
      },
    },
    { upsert: true, new: true }
  )
}

async function processClaimEvent(event, networkId) {
  logger.info('New claim event at block %s', event.blockNumber)

  // event ClaimToken(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index, bytes32 _claimId)

  let web3 = await Web3Utils.getWeb3(networkId)
  let tokenIds = web3.eth.abi.decodeParameter(
    'uint256[]',
    event.returnValues._tokenIds,
  )
  let tokenIdsString = tokenIds

  let originToken = event.returnValues._token.toLowerCase()
  let originChainId = parseInt(event.returnValues._originChainId)

  originToken = decodeOriginToken(originToken, originChainId)
  if (!originToken) {
    logger.error("cannot decode contract hash tx %s, from chain %s", event.transactionHash, event.returnValues._fromChainId);
  }

  await db.Nft721Transaction.updateOne({
    index: event.returnValues._index,
    fromChainId: event.returnValues._fromChainId,
    toChainId: event.returnValues._toChainId,
    originChainId: originChainId,
    originToken: originToken
  },
    {
      $set: {
        claimHash: event.transactionHash,
        claimBlock: event.blockNumber,
        claimed: true,
        claimId: event.returnValues._claimId,
        tokenIds: tokenIdsString
      }
    }, { upsert: true, new: true })
}

async function updateBlock(networkId, lastBlock) {
  logger.info('updating last block for network %s, lastBlock %s', networkId, lastBlock)
  if (lastBlock) {
    let setting = await db.Setting.findOne({ networkId: networkId })
    if (!setting) {
      await db.Setting.updateOne(
        { networkId: networkId },
        {
          $set:
            { lastNft721BlockRequest: lastBlock }
        },
        {
          upsert: true,
          new: true,
        }
      )
    } else {
      let lastNft721BlockRequest = setting.lastNft721BlockRequest ? setting.lastNft721BlockRequest : 0
      if (lastBlock > lastNft721BlockRequest) {
        setting.lastNft721BlockRequest = lastBlock;
        await setting.save()
      }
    }
  }
}

async function getPastEventForBatch(networkId, bridgeAddress, step, from, to) {
  let lastBlock = to
  let lastCrawl = from
  logger.info(`Network ${networkId} start batch from ${from} to ${to}`)
  while (lastBlock - lastCrawl > 0) {
    try {
      let toBlock;
      if (lastBlock - lastCrawl > step) {
        toBlock = lastCrawl + step;
      } else {
        toBlock = lastBlock;
      }
      let both = await Web3Utils.getWeb3AndRPC(networkId)
      let web3 = both.web3
      let currentBlockForRPC = await web3.eth.getBlockNumber()
      if (parseInt(currentBlockForRPC) < parseInt(toBlock)) {
        logger.warn('invalid RPC %s, try again', both.rpc)
        continue
      }
      const contract = new web3.eth.Contract(NFT721Bridge, bridgeAddress)
      logger.info(
        'Network %s: Get Past Event from block %s to %s, lastblock %s',
        networkId,
        lastCrawl + 1,
        toBlock,
        lastBlock
      )
      let allEvents = await contract.getPastEvents('allEvents', {
        fromBlock: lastCrawl + 1,
        toBlock: toBlock,
      })
      if (allEvents.length > 0) {
        logger.info(
          `network ${networkId}: there are ${allEvents.length} events from ${lastCrawl + 1
          } to ${toBlock}`
        )
      }
      {
        let evts = allEvents.filter(e => e.event == "RequestMultiNFT721Bridge")

        for (let i = 0; i < evts.length; i++) {
          let event = evts[i];
          await processEvent(
            event,
            networkId
          );
        }
      }
      {
        //claim events
        let evts = allEvents.filter(e => e.event == "ClaimMultiNFT721")

        for (let i = 0; i < evts.length; i++) {
          let event = evts[i];
          await processClaimEvent(
            event,
            networkId
          );
        }
      }
      await sleep(1000)

      lastCrawl = toBlock;
    } catch (e) {
      logger.warn('Error network %s, waiting 5 seconds: %s', networkId, e)
      await sleep(5000)
    }
  }
}

async function getPastEvent(networkId, bridgeAddress, step) {
  try {
    let web3 = await Web3Utils.getWeb3(networkId)
    const confirmations = config.get('blockchain')[networkId].confirmations;
    let lastBlock = await web3.eth.getBlockNumber()
    let setting = await db.Setting.findOne({ networkId: networkId })
    let lastCrawl = config.contracts[networkId].firstBlockNft721;
    if (lastCrawl === null) {
      lastCrawl = 20184263;
    }
    if (setting && setting.lastNft721BlockRequest) {
      lastCrawl = setting.lastNft721BlockRequest;
    }
    lastCrawl = parseInt(lastCrawl)
    lastBlock = parseInt(lastBlock) - confirmations

    let blockPerBatch = 30000
    let numBatch = Math.floor((lastBlock - lastCrawl) / blockPerBatch) + 1
    let tasks = []
    for (let i = 0; i < numBatch; i++) {
      let from = lastCrawl + i * blockPerBatch
      let to = lastCrawl + (i + 1) * blockPerBatch
      if (to > lastBlock) {
        to = lastBlock
      }
      tasks.push(getPastEventForBatch(networkId, bridgeAddress, step, from, to))
    }

    await Promise.all(tasks)

    logger.info(
      `network ${networkId}: done for blocks from ${lastCrawl
      } to ${lastBlock}`
    )

    await updateBlock(networkId, lastBlock)
  } catch (e) {
    logger.warn(e)
  }
}

async function watch(networkId, bridgeAddress) {
  if (config.blockchain[networkId].notEVM) return;
  let step = 1000;
  await getPastEvent(networkId, bridgeAddress, step)

  setInterval(async () => {
    await getPastEvent(networkId, bridgeAddress, step)
  }, 10000)
}

function main() {
  if (config.proxy) {
    let contracts = config.contracts;
    let crawlChainIds = config.crawlChainIds['nft721' + config.caspernetwork]
    let networks = Object.keys(contracts)
    networks.forEach((networkId) => {
      if (crawlChainIds.includes(parseInt(networkId))) {
        let contractAddress = contracts[networkId].nft721;
        if (contractAddress !== '') {
          watch(networkId, contractAddress)
        }
      }
    })
    PreSignNFT.doIt()
    setInterval(async () => {
      await PreSignNFT.doIt()
    }, 120 * 1000);
  } else {
    logger.info("validators dont crawl every single block as previous version, exit the function now")
  }
}

module.exports = {
  getPastEventForBatch,
  main
}
