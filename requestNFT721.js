const events = require('events')
const config = require('config')

const logger = require('./helpers/logger')
const Web3Utils = require('./helpers/web3')
const NFT721Bridge = require('./contracts/NFT721Bridge.json')
const ERC721 = require('./contracts/ERC721.json')
const db = require('./models')
const CasperHelper = require('./helpers/casper')
const CasperConfig = CasperHelper.getConfigInfo()

// fix warning max listener
events.EventEmitter.defaultMaxListeners = 1000;
process.setMaxListeners(1000)
let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))

async function processEvent(event, networkId) {
  logger.info('New event at block %s, %s', event.event, event.blockNumber)

  let web3 = await Web3Utils.getWeb3(networkId)

  let originChainId = event.returnValues._originChainId;
  let tokenAddress = event.returnValues._token.toLowerCase()
  if (originChainId !== 96945816564243 && originChainId !== 131614895977472) {
    if (tokenAddress.length > 42) {
      tokenAddress = tokenAddress.replace('0x000000000000000000000000', '0x')
    }
  }
  let web3ForOriginChainId, tokenContract, tokenSymbol, tokenName
  let tokenIds = web3.eth.abi.decodeParameter(
    'uint256[]',
    event.returnValues._tokenIds,
  )
  let tokenIdsString = tokenIds
  let tokenMetadatas = []

  if (!config.blockchain[event.returnValues._originChainId].notEVM) {
    web3ForOriginChainId = await Web3Utils.getWeb3(event.returnValues._originChainId)
    tokenContract = await new web3ForOriginChainId.eth.Contract(ERC721, tokenAddress)
    tokenSymbol = await tokenContract.methods.symbol().call()
    tokenName = await tokenContract.methods.name().call()


    for (var i = 0; i < tokenIds.length; i++) {
      let uri = await tokenContract.methods.tokenURI(tokenIds[i]).call()
      let metadata = {
        name: tokenName,
        token_uri: uri,
        checksum: "940bffb3f2bba35f84313aa26da09ece3ad47045c6a1292c2bbd2df4ab1a55fb"
      }
      metadata = JSON.stringify(metadata)
      tokenMetadatas.push(metadata)
    }
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
        fromChainId: event.returnValues._fromChainId,
        originChainId: event.returnValues._originChainId,
        toChainId: event.returnValues._toChainId,
        tokenIds: tokenIdsString,
        index: event.returnValues._index,
        requestTime: block.timestamp,
        tokenMetadatas: tokenMetadatas
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
  let tokenIdsString = tokenIds.join(',')

  let originToken = event.returnValues._token.toLowerCase()
  let originChainId = parseInt(event.returnValues._originChainId)
  if (originChainId !== 96945816564243 && originChainId !== 131614895977472) {
    if (originToken.length > 42) {
      originToken = originToken.replace('0x000000000000000000000000', '0x')
    }
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
  if (lastBlock) {
    let setting = await db.Setting.findOne({ networkId: networkId })
    if (!setting) {
      await db.Setting.updateOne(
        { networkId: networkId },
        { $set: { lastNft721BlockRequest: lastBlock } },
        {
          upsert: true,
          new: true,
        }
      )
    } else {
      if (lastBlock > setting.lastNft721BlockRequest) {
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

      for (let i = 0; i < allEvents.length; i++) {
        let event = allEvents[i]
        if (event.event === 'ClaimMultiNFT721') {
          await processClaimEvent(
            event,
            networkId
          )
        } else if (event.event === 'RequestMultiNFT721Bridge') {
          await processEvent(
            event,
            networkId
          )
        }
      }


      // console.log('sleep 2 seconds and wait to continue')
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
      lastCrawl = 9394711;
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
    console.log(e)
    //await sleep(10000)
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
}

main()
