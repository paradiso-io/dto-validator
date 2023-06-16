const events = require("events");
const config = require("config");

const logger = require("./helpers/logger")(module);
const Web3Utils = require("./helpers/web3");
const generalHelper = require("./helpers/general");
const GenericBridge = require("./contracts/GenericBridge.json");
const db = require("./models");

// fix warning max listener
events.EventEmitter.defaultMaxListeners = 1000;
process.setMaxListeners(1000);
let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

async function readFee(token, toChainId, bridgeContractAddress) {
  if (token.networkId == toChainId) return
  let retry = 10
  while (retry > 0) {
    logger.info('Reading fee for token %s to chain %s, retry %s', token, toChainId, 10 - retry)
    try {
      let web3 = await Web3Utils.getWeb3(toChainId);
      const contract = new web3.eth.Contract(GenericBridge, bridgeContractAddress);
      let fees = await contract.methods.getFeeInfo(token.hash).call()
      await db.Fee.updateOne(
        {
          token: token.hash.toLowerCase(),
          networkId: token.networkId,
          toChainId: `${toChainId}`
        },
        {
          $set: {
            token: token.hash.toLowerCase(),
            networkId: token.networkId,
            toChainId: `${toChainId}`,
            lastUpdatedAt: generalHelper.now(),
            feeAmount: `${fees.feeAmount}`,
            feePercent: `${fees.feePercent}`
          },
        },
        { upsert: true, new: true }
      );
      break
    } catch (e) {
      console.error(e)
      await sleep(10 * 1000)
    }
    retry--
  }
}

async function main() {
  while (true) {
    console.log('reading fees')
    let contracts = config.contracts;
    let networks = Object.keys(contracts);
    let tokenList = await db.Token.find()
    networks.forEach((networkId) => {
      if (config.blockchain[networkId].notEVM) return;
      tokenList.forEach(token => {
        let contractAddress = contracts[networkId].bridge;
        if (contractAddress && contractAddress !== "") {
          readFee(token, networkId, contractAddress)
        }
      })
    });
    await sleep(43200 * 1000)
  }
}

main();
