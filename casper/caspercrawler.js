const CasperServiceByJsonRPC = require("casper-js-sdk").CasperServiceByJsonRPC;

const BigNumber = require("bignumber.js");

const CasperHelper = require("../helpers/casper");
const generalHelper = require("../helpers/general");
const logger = require("../helpers/logger");
const db = require("../models");
const TokenHook = require('./casperTokenCrawlerHook')
const NFTHook = require('./casperNFTCrawlerHook')

BigNumber.config({ EXPONENTIAL_AT: [-100, 100] });

async function crawl(from, to, lastBlockHeight) {
  console.log('crawl', from, to)
  let fromBlock = from;
  let toBlock = to;
  let client = new CasperServiceByJsonRPC(
    CasperHelper.getRandomCasperRPCLink()
  );
  while (fromBlock < toBlock) {
    try {
      let block = await client.getBlockInfoByHeight(fromBlock);
      console.log("readding block", block.block.header.height);
      let deploy_hashes = block.block.body.deploy_hashes;

      //reading deploy hashes one by one
      for (const h of deploy_hashes) {
        let deployResult = await client.getDeployInfo(h);
        let deploy = deployResult.deploy;
        if (deployResult.execution_results) {
          let result = deployResult.execution_results[0];
          if (result.result.Success) {
            //analyzing deploy details
            let session = deploy.session;
            if (session && session.StoredContractByHash) {
              await TokenHook.process(block, deploy, session.StoredContractByHash)
              await NFTHook.process(block, deploy, session.StoredContractByHash)
            }
          }
        }
      }
      fromBlock++;
    } catch (e) {
      logger.error("Error: %s [%s-%s] %s", e.toString(), from, to, fromBlock);
      await generalHelper.sleep(5 * 1000);
      client = new CasperServiceByJsonRPC(
        CasperHelper.getRandomCasperRPCLink()
      );
    }
  }
}

const getPastEvent = async () => {
  let casperConfig = CasperHelper.getConfigInfo();
  let networkId = casperConfig.networkId;
  let client = new CasperServiceByJsonRPC(
    CasperHelper.getRandomCasperRPCLink()
  );
  let fromBlock = parseInt(casperConfig.fromBlock);
  console.log('fromBlock 11', fromBlock)
  let setting = await db.Setting.findOne({ networkId: networkId });
  if (setting && setting.lastBlockRequest) {
    fromBlock = setting.lastBlockRequest;
  }
  1, 023, 564
  let currentBlock = null
  trial = 20
  while (trial > 0) {
    try {
      currentBlock = await client.getLatestBlockInfo();
      break
    } catch (e) {
      client = new CasperServiceByJsonRPC(
        CasperHelper.getRandomCasperRPCLink()
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

  currentBlockHeight -= 5;
  console.log(fromBlock, currentBlockHeight);

  let blockPerBatch = 100;
  let numBatch =
    Math.floor((currentBlockHeight - fromBlock) / blockPerBatch) + 1;
  let tasks = [];
  for (var i = 0; i < numBatch; i++) {
    let from = fromBlock + i * blockPerBatch;
    let to = fromBlock + (i + 1) * blockPerBatch;
    if (to > currentBlockHeight) {
      to = currentBlockHeight;
    }
    tasks.push(crawl(from, to, currentBlockHeight));
  }
  await Promise.all(tasks);

  let blockNumber = currentBlockHeight;
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
    }
  }
};

let watch = async () => {
  while (true) {
    await getPastEvent();
    console.log('waiting')
    await generalHelper.sleep(10 * 1000);
  }
};

watch();
