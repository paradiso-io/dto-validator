const CasperServiceByJsonRPC = require("casper-js-sdk").CasperServiceByJsonRPC;

const BigNumber = require("bignumber.js");

const CasperHelper = require("../helpers/casper");
const generalHelper = require("../helpers/general");
const logger = require("../helpers/logger");
const db = require("../models");
const TokenHook = require('./casperTokenCrawlerHook')
const NFTHook = require('./casperNFTCrawlerHook')

BigNumber.config({ EXPONENTIAL_AT: [-100, 100] });

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
              await TokenHook.process(block, deploy, session.StoredContractByHash, selectedRPC)
              await NFTHook.process(block, deploy, session.StoredContractByHash, selectedRPC)
            }
          }
        }
      }
      fromBlock++;
    } catch (e) {
      logger.error("Error: %s [%s-%s] %s", e.toString(), from, to, fromBlock);
      await generalHelper.sleep(5 * 1000);
      selectedRPC = await CasperHelper.getRandomGoodCasperRPCLink(to)
      client = new CasperServiceByJsonRPC(
        selectedRPC
      );
    }
  }
}

const getPastEvent = async () => {
  let casperConfig = CasperHelper.getConfigInfo();
  let networkId = casperConfig.networkId;
  let selectedRPC = await CasperHelper.getRandomGoodCasperRPCLink(0)
  let client = new CasperServiceByJsonRPC(
    selectedRPC
  );
  let fromBlock = parseInt(casperConfig.fromBlock);
  console.log('fromBlock 11', fromBlock)
  let setting = await db.Setting.findOne({ networkId: networkId });
  if (setting && setting.lastBlockRequest) {
    fromBlock = setting.lastBlockRequest > fromBlock ? setting.lastBlockRequest : fromBlock;
  }

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

  currentBlockHeight -= 5;
  console.log(fromBlock, currentBlockHeight);

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
    // tasks.push(crawl(from, to, currentBlockHeight, selectedRPC));
    // console.log("Craw : ", from, to, currentBlockHeight, selectedRPC)
    console.log("crawl: ", from)
    await crawl(from, to, to)
    console.log("finished crawl: ", from, selectedRPC)

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
        console.log("finished save setting: ", blockNumber)
      }
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
