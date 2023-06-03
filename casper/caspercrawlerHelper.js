const CasperServiceByJsonRPC = require("casper-js-sdk").CasperServiceByJsonRPC;

const BigNumber = require("bignumber.js");

const CasperHelper = require("../helpers/casper");
const generalHelper = require("../helpers/general");
const logger = require("../helpers/logger");
const db = require("../models");
const TokenHook = require('./casperTokenCrawlerHook')
const NFTHook = require('./casperNFTCrawlerHook')
const CasperERC20Hook = require('./casperERC20LockWithdrawalCrawlerHook')
const { DTOBridgeEvent, DTOWrappedCep78Event, EventsCep47Parser } = require('../helpers/casperEventsIndexing')
const { Contract } = require("casper-web3")
const config = require('config')
BigNumber.config({ EXPONENTIAL_AT: [-100, 100] });

function toToken(n, decimals) {
  return new BigNumber(n.toString())
    .dividedBy(new BigNumber(10).pow(new BigNumber(decimals.toString())))
    .toString();
}

function toContractUnit(n, decimals) {
  return new BigNumber(n.toString())
    .multipliedBy(new BigNumber(10).pow(new BigNumber(decimals.toString())))
    .toFixed(0);
}

/**
 * It updates the transaction record in the database with the claim hash and claim block number
 * @param networkId - The network ID of the network you're listening to.
 * @param blockNumber - The block number of the event
 * @param lastBlock - The last block number that was processed.
 * @param eventData - The data from the event.
 */
async function processMintEvent(networkId, blockNumber, lastBlock, eventData) {
  logger.info("New event at block %s", blockNumber);
  try {
    // event ClaimToken(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index, bytes32 _claimId);
    await db.Transaction.updateOne(
      {
        index: eventData.index,
        fromChainId: eventData.fromChainId,
        toChainId: eventData.toChainId,
        originChainId: eventData.originChainId,
        originToken: eventData.originToken,
      },
      {
        $set: {
          claimHash: eventData.transactionHash,
          claimBlock: eventData.blockNumber,
          claimed: true,
          claimId: eventData.claimId,
        },
      },
      { upsert: true, new: true }
    );
    logger.info("Mintid %s", eventData);
    await db.RequestToCasper.updateOne(
      {
        mintid: eventData.claimId
      },
      {
        $set: {
          txExecuted: true
        },
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    logger.error("error while saving process minting %s %s", eventData, e)
  }
}

/**
 * It saves the request event data to the database
 * @param blockNumber - the block number of the event
 * @param lastBlock - the last block number that was processed
 * @param eventData - the data of the event
 */
async function processRequestEvent(
  blockNumber,
  lastBlock,
  eventData
) {
  logger.info("New event at block %s", blockNumber);

  let originChainId = eventData.originChainId;
  let tokenAddress = eventData.token.toLowerCase();
  let token = await tokenHelper.getToken(tokenAddress, originChainId);

  let amount = eventData.amount;
  let amountNumber = new BigNumber(amount).div(10 ** token.decimals).toNumber();

  // event RequestBridge(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index);
  try {
    await db.Transaction.updateOne(
      {
        index: eventData.index,
        fromChainId: eventData.fromChainId,
        toChainId: eventData.toChainId,
        originChainId: eventData.originChainId,
        originToken: eventData.originToken,
      },
      {
        $set: {
          requestHash: eventData.transactionHash,
          requestBlock: eventData.blockNumber,
          account: eventData.toAddr.toLowerCase(),
          originToken: token.hash,
          originSymbol: token.symbol,
          fromChainId: eventData.fromChainId,
          originChainId: eventData.originChainId,
          toChainId: eventData.toChainId,
          txCreator: eventData.txCreator,
          amount: amount,
          // amountNumber: amountNumber, // TODO: get token from chain detail
          index: eventData.index,
          requestTime: eventData.requestTime,
        },
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    logger.error("error while saving process request %s %s", eventData, e)
  }
}

/**
 * It takes an array of arrays and a string, and returns the first array in the array of arrays that
 * has the string as its first element
 * @param args - The arguments passed to the command.
 * @param argName - The name of the argument you want to find.
 * @returns The first element of the array that matches the argument name.
 */
function findArg(args, argName) {
  return args.find((e) => e[0] == argName);
}

/**
 * It reads the block by block, and for each block, it reads the deploy hashes one by one, and for each
 * deploy hash, it reads the deploy details, and for each deploy detail, it checks if the deploy is a
 * minting or a request, and if it is, it processes the minting or request event
 * @param from - the block height to start crawling from
 * @param to - the block height to crawl to
 * @param lastBlockHeight - the last block height that has been processed
 */
async function crawl(from, to, lastBlockHeight, rpc) {
  let fromBlock = from;
  let toBlock = to;
  let selectedRPC = await CasperHelper.getRandomGoodCasperRPCLink(to, rpc)
  let client = new CasperServiceByJsonRPC(
    selectedRPC
  );
  while (fromBlock < toBlock) {
    try {
      let block = await client.getBlockInfoByHeight(fromBlock);
      logger.info("readding block %s", block.block.header.height);
      let deploy_hashes = block.block.body.deploy_hashes;

      //reading deploy hashes one by one
      for (const h of deploy_hashes) {
        {
          let deployResult = await client.getDeployInfo(h);
          let deploy = deployResult.deploy;
          if (deployResult.execution_results) {
            // First part for old EVENT PARSER WAY
            {
              let result = deployResult.execution_results[0];
              if (result.result.Success) {
                //analyzing deploy details
                let session = deploy.session;
                let approvals = deploy.approvals[0]
                if (session && session.StoredContractByHash) {
                  await TokenHook.process(block, deploy, session.StoredContractByHash, selectedRPC)
                }

                // parse all events related to nft bridge to/from casper
                await NFTHook.processNFTWrapped(block, deployResult, selectedRPC)
                await NFTHook.processNFTBridgeEvent(block, deployResult, selectedRPC)
                // parse all events related to erc20 tokens issued on casper bridging to/from casper
                await CasperERC20Hook.process(block, deployResult, selectedRPC)
              }
            }
          }
        }
      }
      fromBlock++;
    } catch (e) {
      logger.error("Error: %s [%s-%s] %s", e.toString(), from, to, fromBlock);
      await generalHelper.sleep(100);
      selectedRPC = await CasperHelper.getRandomGoodCasperRPCLink(to)
      client = new CasperServiceByJsonRPC(
        selectedRPC
      );
    }
  }
}

/**
 * It gets the latest block number from the Casper node and then crawls the events from the last block
 * number in the database to the latest block number.
 */
const getPastEvent = async () => {
  let casperConfig = CasperHelper.getConfigInfo();
  let networkId = casperConfig.networkId;
  let selectedRPC = await CasperHelper.getRandomGoodCasperRPCLink(0)
  let client = new CasperServiceByJsonRPC(
    selectedRPC
  );
  let fromBlock = parseInt(casperConfig.fromBlock);
  let setting = await db.Setting.findOne({ networkId: networkId });
  if (setting && setting.lastBlockRequest) {
    fromBlock = setting.lastBlockRequest > fromBlock ? setting.lastBlockRequest : fromBlock;
  }
  logger.info('fromBlock %s', fromBlock)
  let currentBlock = null
  trial = 20
  while (trial > 0) {
    try {
      currentBlock = await client.getLatestBlockInfo();
      break
    } catch (e) {
      selectedRPC = await CasperHelper.getRandomGoodCasperRPCLink(0)
      client = new CasperServiceByJsonRPC(
        selectedRPC
      );
    }
    trial--
    if (trial == 0) {
      return
    }
  }

  let currentBlockHeight = parseInt(
    currentBlock.block.header.height.toString()
  );

  // DELAY 2 BLOCKS WITH THE CHAIN
  currentBlockHeight -= 2;

  // let blockPerBatch = 100;
  // let numBatch =
  //   Math.floor((currentBlockHeight - fromBlock) / blockPerBatch) + 1;
  // let tasks = [];
  for (var i = 0; i < currentBlockHeight - fromBlock; i++) {
    let from = fromBlock + i;
    let to = fromBlock + i + 1;
    if (to > currentBlockHeight) {
      to = currentBlockHeight;
    }
    logger.info("crawling block: %s", from)
    await crawl(from, to, to)
    logger.info("finished crawl: %s, with RPC = %s", from, selectedRPC)

    let blockNumber = from;
    setting = await db.Setting.findOne({ networkId: networkId });
    if (!setting) {
      await db.Setting.updateOne(
        { networkId: networkId },
        { $set: { lastBlockClaim: blockNumber, lastBlockRequest: blockNumber } },
        {
          upsert: true,
          new: true,
        }
      );
    } else {
      if (blockNumber > setting.lastBlockRequest) {
        setting.lastBlockRequest = blockNumber;
        setting.lastBlockClaim = blockNumber;
        await setting.save();
        logger.info("finished save setting: %s", blockNumber)
      }
    }
  }

};

/**
 * It will get the past event and sleep for 10 seconds.
 */
let watch = async () => {
  if (config.proxy) {
    while (true) {
      await getPastEvent();
      logger.info('waiting')
      await generalHelper.sleep(10 * 1000);
    }
  } else {
    logger.info("validators dont crawl every single block as previous version, exit the function now")
  }
};

const getBlockHeightFromDeployHash = async (deployHash) => {
  let selectedRPC = await CasperHelper.getRandomGoodCasperRPCLink(1, null)
  let client = new CasperServiceByJsonRPC(
    selectedRPC
  );

  const deploy = await client.getDeployInfo(deployHash)
  const blockHash = deploy.execution_results[0].block_hash
  const block = await client.getBlockInfo(blockHash)
  return { height: block.block.header.height, selectedRPC }
}

const fetchTransactionFromCasperIfNot = async (deployHash) => {
  const casperConfig = CasperHelper.getConfigInfo();
  const transaction = await db.Transaction.findOne({ requestHash: CasperHelper.toNormalTxHash(deployHash), fromChainId: casperConfig.networkId })
  if (transaction) {
    logger.info('transaction already crawled, moved on without re-indexing')
    return
  }
  deployHash = CasperHelper.toCasperDeployHash(deployHash)
  const { height: blockHeight, selectedRPC } = await getBlockHeightFromDeployHash(deployHash)
  logger.info('blockHeight = %s, deploy = %s', blockHeight, deployHash)
  await crawl(blockHeight, blockHeight + 1, blockHeight + 1, selectedRPC)
  logger.info('done crawl casper')
}
const fetchNFTTransactionFromCasperIfNot = async (deployHash) => {
  const casperConfig = CasperHelper.getConfigInfo();
  const transaction = await db.Nft721Transaction.findOne({ requestHash: CasperHelper.toNormalTxHash(deployHash), fromChainId: casperConfig.networkId })
  if (transaction) {
    logger.info('transaction already crawled, moved on without re-indexing')
    return
  }
  deployHash = CasperHelper.toCasperDeployHash(deployHash)
  const { height: blockHeight, selectedRPC } = await getBlockHeightFromDeployHash(deployHash)
  logger.info('blockHeight = %s, deploy = %s', blockHeight, deployHash)
  await crawl(blockHeight, blockHeight + 1, blockHeight + 1, selectedRPC)
  logger.info('done crawl casper')
}

module.exports = {
  watch,
  fetchTransactionFromCasperIfNot,
  fetchNFTTransactionFromCasperIfNot
}