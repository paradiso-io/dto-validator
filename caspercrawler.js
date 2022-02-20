const CasperServiceByJsonRPC = require("casper-js-sdk").CasperServiceByJsonRPC;

const BigNumber = require("bignumber.js");

const configInfo = require("config");
const tokenHelper = require("./helpers/token");

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
      index: eventData._index,
      fromChainId: eventData._fromChainId,
      toChainId: eventData._toChainId,
    },
    {
      $set: {
        claimHash: eventData.transactionHash,
        claimBlock: eventData.blockNumber,
        claimed: true,
        claimId: eventData._claimId,
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
  let originChainId = eventData._originChainId;
  let tokenAddress = eventData._token.toLowerCase();
  let token = await tokenHelper.getToken(tokenAddress, originChainId);

  let amount = eventData._amount;
  let amountNumber = new BigNumber(amount).div(10 ** token.decimals).toNumber();

  let web3 = await Web3Utils.getWeb3(networkId);
  let block = await web3.eth.getBlock(eventData.blockNumber);

  // event RequestBridge(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index);
  await db.Transaction.updateOne(
    {
      index: eventData._index,
      fromChainId: eventData._fromChainId,
      toChainId: eventData._toChainId,
    },
    {
      $set: {
        requestHash: eventData.transactionHash,
        requestBlock: eventData.blockNumber,
        account: eventData._toAddr.toLowerCase(),
        originToken: token.hash,
        originSymbol: token.symbol,
        fromChainId: eventData._fromChainId,
        originChainId: eventData._originChainId,
        toChainId: eventData._toChainId,
        amount: amount,
        // amountNumber: amountNumber, // TODO: get token from chain detail
        index: eventData._index,
        requestTime: block.timestamp,
      },
    },
    { upsert: true, new: true }
  );
}

function findArg(args, argName) {
  return args.find((e) => e[0] == argName);
}

const test = async () => {
  const client = new CasperServiceByJsonRPC(
    configInfo[configInfo.caspernetwork].rpc
  );
  let fromBlock = parseInt(configInfo[configInfo.caspernetwork].fromBlock);
  let contractHashes = configInfo[configInfo.caspernetwork].tokens.map(
    (e) => e.contractHash
  );
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
              let args = StoredContractByHash.args;
              if (StoredContractByHash.entry_point == "mint") {
                let recipient = findArg(args, "recipient");
                let amount = findArg(args, "amount");
                let mintid = findArg(args, "mintid");
                let fee = findArg(args, "swap_fee");

                console.log("recipient", recipient[1].parsed["Account"]);
                console.log("amount", amount[1].parsed);
                console.log("mintid", mintid[1].parsed);
                console.log("fee", fee[1].parsed);

                //saving to db
              } else if (StoredContractByHash.entry_point == "transfer") {
                console.log("transfer");
              } else if (
                StoredContractByHash.entry_point == "request_bridge_back"
              ) {
                console.log("request_bridge_back");
                let amount = findArg(args, "amount");
                let toChainId = findArg(args, "to_chainid");
                let fee = findArg(args, "fee");
                let receiver_address = findArg(args, "receiver_address");
                let id = findArg(args, "id");
              }
            }
          }
        }
      }
    }
    fromBlock++;
  }
};

test();
