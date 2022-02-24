const CasperServiceByJsonRPC = require("casper-js-sdk").CasperServiceByJsonRPC;

const BigNumber = require("bignumber.js");

const configInfo = require("config");
const CasperHelper = require("../helpers/casper");
const tokenHelper = require("../helpers/token");

const logger = require("../helpers/logger");
const db = require("../models");

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

async function processMintEvent(networkId, blockNumber, lastBlock, eventData) {
  logger.info("New event at block %s", blockNumber);

  if (lastBlock - blockNumber < 15) {
    return;
  }

  let setting = await db.Setting.findOne({ networkId: networkId });
  if (!setting) {
    await db.Setting.updateOne(
      { networkId: networkId },
      { $set: { lastBlockClaim: blockNumber } },
      {
        upsert: true,
        new: true,
      }
    );
  } else {
    if (blockNumber > setting.lastBlockClaim) {
      setting.lastBlockClaim = blockNumber;
      await setting.save();
    }
  }

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
}

async function processRequestEvent(
  networkId,
  blockNumber,
  lastBlock,
  eventData
) {
  logger.info("New event at block %s", blockNumber);

  if (lastBlock - blockNumber < 15) {
    return;
  }

  let setting = await db.Setting.findOne({ networkId: networkId });
  if (!setting) {
    await db.Setting.updateOne(
      { networkId: networkId },
      { $set: { lastBlockRequest: blockNumber } },
      {
        upsert: true,
        new: true,
      }
    );
  } else {
    if (blockNumber > setting.lastBlockRequest) {
      setting.lastBlockRequest = blockNumber;
      await setting.save();
    }
  }
  let originChainId = eventData.originChainId;
  let tokenAddress = eventData.token.toLowerCase();
  let token = await tokenHelper.getToken(tokenAddress, originChainId);

  let amount = eventData.amount;
  let amountNumber = new BigNumber(amount).div(10 ** token.decimals).toNumber();

  let web3 = await Web3Utils.getWeb3(networkId);
  let block = await web3.eth.getBlock(eventData.blockNumber);

  // event RequestBridge(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index);
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
        amount: amount,
        // amountNumber: amountNumber, // TODO: get token from chain detail
        index: eventData.index,
        requestTime: block.timestamp,
      },
    },
    { upsert: true, new: true }
  );
}

function findArg(args, argName) {
  return args.find((e) => e[0] == argName);
}

const getPastEvent = async () => {
  let casperConfig = CasperHelper.getConfigInfo();
  let networkId = casperConfig.networkId;
  const client = new CasperServiceByJsonRPC(casperConfig.rpc);
  let fromBlock = parseInt(casperConfig.fromBlock);
  let contractHashes = casperConfig.tokens.map((e) => e.contractHash);
  let currentBlock = await client.getLatestBlockInfo();
  let currentBlockHeight = parseInt(
    currentBlock.block.header.height.toString()
  );
  while (currentBlockHeight - fromBlock > 15) {
    //reading info
    let block = await client.getBlockInfoByHeight(fromBlock);

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
            let StoredContractByHash = session.StoredContractByHash;
            if (contractHashes.includes(StoredContractByHash.hash)) {
              let tokenData = casperConfig.tokens.find(
                (e) => e.contractHash == StoredContractByHash.hash
              );
              let args = StoredContractByHash.args;
              if (StoredContractByHash.entry_point == "mint") {
                let recipient = findArg(args, "recipient");
                let amount = findArg(args, "amount");
                let mintid = findArg(args, "mintid");
                let fee = findArg(args, "swap_fee");

                {
                  //{
                  //   index: eventData._index,
                  //   fromChainId: eventData._fromChainId,
                  //   toChainId: eventData._toChainId,
                  // },
                  // {
                  //   $set: {
                  //     claimHash: eventData.transactionHash,
                  //     claimBlock: eventData.blockNumber,
                  //     claimed: true,
                  //     claimId: eventData._claimId,
                  //   },
                  // },
                }
                //mintid = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
                let mintidStr = mintid[1].parsed;
                let mintidSplits = mintidStr.split("-");
                let transactionHash = h;
                let fromChainId = parseInt(mintidSplits[1]);
                let toChainId = parseInt(mintidSplits[2]);
                let index = parseInt(mintidSplits[3]);
                let originContractAddress = mintidSplits[4];
                let originChainId = parseInt(mintidSplits[5]);

                let blockNumber = block.block.header.height;
                let claimId = mintidStr;
                let eventData = {
                  fromChainId: fromChainId,
                  toChainId: toChainId,
                  transactionHash: transactionHash,
                  index: index,
                  blockNumber: blockNumber,
                  claimId: claimId,
                  originToken: tokenData.originContractAddress.toLowerCase(),
                  originChainId: tokenData.originChainId,
                };
                logger.info("Casper Network Minting: %s", eventData);

                await processMintEvent(
                  networkId,
                  block.block.header.height,
                  currentBlock.block.header.height,
                  eventData
                );
              } else if (StoredContractByHash.entry_point == "transfer") {
                console.log("transfer");
              } else if (
                StoredContractByHash.entry_point == "request_bridge_back"
              ) {
                let amount = findArg(args, "amount");
                amount = amount[1].parsed;
                let toChainId = findArg(args, "to_chainid");
                toChainId = toChainId[1].parsed;
                let fee = findArg(args, "fee");
                fee = fee[1].parsed;
                let receiver_address = findArg(args, "receiver_address");
                receiver_address = receiver_address[1].parsed;
                let id = findArg(args, "id");
                id = id[1].parsed;
                //amount after fee
                amount = new BigNumber(amount).minus(fee).toString();

                // await db.Transaction.updateOne(
                //   {
                //     index: eventData.index,
                //     fromChainId: eventData.fromChainId,
                //     toChainId: eventData.toChainId,
                //     originChainId: eventData.originChainId,
                //     originToken: eventData.originToken,
                //   },
                //   {
                //     $set: {
                //       requestHash: eventData.transactionHash,
                //       requestBlock: eventData.blockNumber,
                //       account: eventData.toAddr.toLowerCase(),
                //       originToken: token.hash,
                //       originSymbol: token.symbol,
                //       fromChainId: eventData.fromChainId,
                //       originChainId: eventData.originChainId,
                //       toChainId: eventData.toChainId,
                //       amount: amount,
                //       // amountNumber: amountNumber, // TODO: get token from chain detail
                //       index: eventData.index,
                //       requestTime: block.timestamp,
                //     },
                //   },
                //   { upsert: true, new: true }
                // );
                let eventData = {
                  token: tokenData.originContractAddress.toLowerCase(),
                  index: parseInt(id),
                  fromChainId: parseInt(casperConfig.networkId),
                  toChainId: parseInt(toChainId),
                  originChainId: casperConfig.originChainId,
                  originToken: casperConfig.originContractAddress.toLowerCase(),
                  transactionHash: h,
                  blockNumber: block.block.header.height,
                  toAddr: receiver_address,
                  amount: amount,
                  index: parseInt(id),
                  requestTime: block.block.header.timestamp,
                };
                logger.info("Casper Network Request: %s", eventData);

                await processRequestEvent(
                  casperConfig.networkId,
                  block.block.header.height,
                  currentBlock.block.header.height,
                  eventData
                );
              }
            }
          }
        }
      }
    }
    fromBlock++;
  }
};

let watch = async () => {
  setInterval(async () => {
    await getPastEvent();
  }, 10000);
};

watch();