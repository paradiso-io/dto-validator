const events = require("events");
const BigNumber = require("bignumber.js");
const config = require("config");

const logger = require("./helpers/logger");
const Web3Utils = require("./helpers/web3");
const tokenHelper = require("./helpers/token");
const GenericBridge = require("./contracts/GenericBridge");
const db = require("./models");
const CasperHelper = require("./helpers/casper");
const CasperConfig = CasperHelper.getConfigInfo();
BigNumber.config({ EXPONENTIAL_AT: [-100, 100] });
const baseUnit = 10 ** 18;

// fix warning max listener
events.EventEmitter.defaultMaxListeners = 1000;
process.setMaxListeners(1000);
let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

async function processEvent(
  event,
  networkId) {
  logger.info("New event at block %s", event.blockNumber);

  let originChainId = event.returnValues._originChainId;
  let tokenAddress = event.returnValues._token.toLowerCase();
  let token = await tokenHelper.getToken(tokenAddress, originChainId);

  let amount = event.returnValues._amount;
  let amountNumber = new BigNumber(amount).div(10 ** token.decimals).toNumber();

  let web3 = await Web3Utils.getWeb3(networkId);
  let block = await web3.eth.getBlock(event.blockNumber);

  // event RequestBridge(address indexed _token, bytes indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index);
  let toAddrBytes = event.returnValues._toAddr;
  let decoded;
  try {
    decoded = web3.eth.abi.decodeParameters(
      [{ type: "string", name: "decodedAddress" }],
      toAddrBytes
    );
  } catch (e) {
    logger.error("cannot decode recipient address");
    return;
  }
  let decodedAddress = decoded.decodedAddress;
  let casperChainId = CasperConfig.networkId;
  if (parseInt(event.returnValues._toChainId) == casperChainId) {
    logger.info("bridging to casper network %s", decodedAddress);
    if (decodedAddress.length == 64) {
      decodedAddress = "account-hash-" + decodedAddress
    }
  }

  //reading transaction creator
  let transactionHash = event.transactionHash
  let onChainTx = await web3.eth.getTransaction(transactionHash)
  if (!onChainTx) return;
  let txCreator = onChainTx.from.toLowerCase()
  await db.Transaction.updateOne(
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
        originToken: token.hash,
        originSymbol: token.symbol,
        fromChainId: event.returnValues._fromChainId,
        originChainId: event.returnValues._originChainId,
        toChainId: event.returnValues._toChainId,
        amount: amount,
        // amountNumber: amountNumber, // TODO: get token from chain detail
        index: event.returnValues._index,
        requestTime: block.timestamp,
      },
    },
    { upsert: true, new: true }
  );
}

async function processClaimEvent(event, networkId) {
  logger.info('New claim event at block %s', event.blockNumber)

  // event ClaimToken(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index, bytes32 _claimId);
  let requestTx = db.Transaction.findOne({
    index: event.returnValues._index,
    fromChainId: event.returnValues._fromChainId,
    toChainId: event.returnValues._toChainId,
    originChainId: event.returnValues._originChainId,
    originToken: event.returnValues._token.toLowerCase()
  })
  if (!requestTx) {
    logger.warn("Dont find request tx for claim event %s", event)
  } else {
    await db.Transaction.updateOne({
      index: event.returnValues._index,
      fromChainId: event.returnValues._fromChainId,
      toChainId: event.returnValues._toChainId,
      originChainId: event.returnValues._originChainId,
      originToken: event.returnValues._token.toLowerCase()
    },
      {
        $set: {
          claimHash: event.transactionHash,
          claimBlock: event.blockNumber,
          claimed: true,
          claimId: event.returnValues._claimId
        }
      }, { upsert: true, new: true })
  }
}

async function updateBlock(networkId, lastBlock) {
  if (lastBlock) {
    let setting = await db.Setting.findOne({ networkId: networkId });
    if (!setting) {
      await db.Setting.updateOne(
        { networkId: networkId },
        { $set: { lastBlockRequest: lastBlock } },
        {
          upsert: true,
          new: true,
        }
      );
    } else {
      if (lastBlock > setting.lastBlockRequest) {
        setting.lastBlockRequest = lastBlock;
        await setting.save();
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
      let web3 = await Web3Utils.getWeb3(networkId);
      const contract = new web3.eth.Contract(GenericBridge, bridgeAddress);
      logger.info(
        "Network %s: Get Past Event from block %s to %s, lastblock %s",
        networkId,
        lastCrawl + 1,
        toBlock,
        lastBlock
      );
      let allEvents = await contract.getPastEvents("allEvents", {
        fromBlock: lastCrawl + 1,
        toBlock: toBlock,
      });
      if (allEvents.length > 0) {
        logger.info(
          `network ${networkId}: there are ${allEvents.length} events from ${lastCrawl + 1
          } to ${toBlock}`
        );
      }
      {
        //request events
        let evts = allEvents.filter(e => e.event == "RequestBridge")

        for (let i = 0; i < evts.length; i++) {
          let event = evts[i];
          await processEvent(
            event,
            networkId
          );
        }
      }

      {
        //request events
        let evts = allEvents.filter(e => e.event == "ClaimToken")

        for (let i = 0; i < evts.length; i++) {
          let event = evts[i];
          await processClaimEvent(
            event,
            networkId
          );
        }
      }

      // console.log('sleep 2 seconds and wait to continue')
      await sleep(1000);

      lastCrawl = toBlock;
    } catch (e) {
      logger.warn("Error network %s, waiting 5 seconds: %s", networkId, e)
      await sleep(5000)
    }
  }
}

async function getPastEvent(networkId, bridgeAddress, step) {
  try {
    let web3 = await Web3Utils.getWeb3(networkId);
    const confirmations = config.get("blockchain")[networkId].confirmations;
    let lastBlock = await web3.eth.getBlockNumber();
    let setting = await db.Setting.findOne({ networkId: networkId });
    let lastCrawl = config.contracts[networkId].firstBlockCrawl;
    if (lastCrawl === null) {
      lastCrawl = 9394711;
    }
    if (setting && setting.lastBlockRequest) {
      lastCrawl = setting.lastBlockRequest;
    }
    lastCrawl = parseInt(lastCrawl);
    lastBlock = parseInt(lastBlock) - confirmations

    let blockPerBatch = 30000
    let numBatch = Math.floor((lastBlock - lastCrawl) / blockPerBatch) + 1
    let tasks = []
    for (var i = 0; i < numBatch; i++) {
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
    );

    await updateBlock(networkId, lastBlock)
  } catch (e) {
    console.log(e);
    //await sleep(10000);
  }
}

async function watch(networkId, bridgeAddress) {
  console.log("network", networkId, config.blockchain[networkId].notEVM);
  if (config.blockchain[networkId].notEVM) return;
  let step = 1000;
  await getPastEvent(networkId, bridgeAddress, step);

  setInterval(async () => {
    await getPastEvent(networkId, bridgeAddress, step);
  }, 10000);
}

function main() {
  let contracts = config.contracts;
  let crawlChainIds = config.crawlChainIds ? config.crawlChainIds : []
  let networks = Object.keys(contracts);
  networks.forEach((networkId) => {
    if (crawlChainIds.includes(networkId)) {
      let contractAddress = contracts[networkId].bridge;
      if (contractAddress !== "") {
        watch(networkId, contractAddress);
      }
    }
  });
}

main();
