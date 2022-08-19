const BigNumber = require("bignumber.js");
const CasperHelper = require("../helpers/casper");
const tokenHelper = require("../helpers/token");
const logger = require("../helpers/logger");
const db = require("../models");
const { ERC20Client } = require("casper-erc20-js-client");
let findArg = CasperHelper.findArg;

BigNumber.config({ EXPONENTIAL_AT: [-100, 100] });

const HOOK = {
  processMintEvent: async function (
    networkId,
    blockNumber,
    lastBlock,
    eventData
  ) {
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
          mintid: eventData.claimId,
        },
        {
          $set: {
            txExecuted: true,
          },
        },
        { upsert: true, new: true }
      );
    } catch (e) {
      logger.error("error while saving process minting %s %s", eventData, e);
    }
  },

  processRequestEvent: async function (blockNumber, lastBlock, eventData) {
    logger.info("New event at block %s", blockNumber);

    let originChainId = eventData.originChainId;
    let tokenAddress = eventData.token.toLowerCase();
    let token = await tokenHelper.getToken(tokenAddress, originChainId);

    let amount = eventData.amount;

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
      logger.error("error while saving process request %s %s", eventData, e);
    }
  },
  process: async (block, deploy, storedContractByHash) => {
    let casperConfig = CasperHelper.getConfigInfo();
    let networkId = casperConfig.networkId;
    let contractHashes = casperConfig.tokens.map((e) => e.contractHash);
    let h = deploy.hash
    if (contractHashes.includes(storedContractByHash.hash)) {
      let tokenData = casperConfig.tokens.find(
        (e) => e.contractHash == storedContractByHash.hash
      );
      let args = storedContractByHash.args;
      if (storedContractByHash.entry_point == "mint") {
        let mintid = findArg(args, "mintid");

        //mintid = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
        let mintidStr = mintid[1].parsed;
        let mintidSplits = mintidStr.split("-");
        let transactionHash = h;
        let fromChainId = parseInt(mintidSplits[1]);
        let toChainId = parseInt(mintidSplits[2]);
        let index = parseInt(mintidSplits[3]);

        let blockNumber = block.block.header.height;
        let claimId = mintidStr;
        let eventData = {
          fromChainId: fromChainId,
          toChainId: toChainId,
          transactionHash: CasperHelper.toNormalTxHash(transactionHash),
          index: index,
          blockNumber: blockNumber,
          claimId: claimId,
          originToken: tokenData.originContractAddress.toLowerCase(),
          originChainId: tokenData.originChainId,
        };
        logger.info("Casper Network Minting: %s", eventData);

        await HOOK.processMintEvent(
          networkId,
          block.block.header.height,
          lastBlockHeight,
          eventData
        );
      } else if (storedContractByHash.entry_point == "transfer") {
        console.log("transfer");
      } else if (storedContractByHash.entry_point == "request_bridge_back") {
        let txCreator = "";
        if (deploy.approvals.length > 0) {
          txCreator = deploy.approvals[0].signer;
          txCreator = CasperHelper.fromCasperPubkeyToAccountHash(txCreator);
        }
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

        //reading index from id
        const erc20 = new ERC20Client(
          CasperHelper.getRandomCasperRPCLink(),
          casperConfig.chainName,
          casperConfig.eventStream
        );

        await erc20.setContractHash(tokenData.contractHash);

        id = await erc20.readRequestIndex(id);
        if (parseInt(id) == 0) {
          throw "RPC error";
        }
        //amount after fee
        amount = new BigNumber(amount).minus(fee).toString();

        let timestamp = Date.parse(block.block.header.timestamp);
        let eventData = {
          token: tokenData.originContractAddress.toLowerCase(),
          index: parseInt(id),
          fromChainId: parseInt(casperConfig.networkId),
          toChainId: parseInt(toChainId),
          originChainId: tokenData.originChainId,
          originToken: tokenData.originContractAddress.toLowerCase(),
          transactionHash: CasperHelper.toNormalTxHash(h),
          blockNumber: block.block.header.height,
          toAddr: receiver_address,
          amount: amount,
          index: parseInt(id),
          requestTime: Math.floor(timestamp / 1000),
          txCreator: txCreator,
        };

        logger.info("Casper Network Request: %s, %s", eventData);

        await HOOK.processRequestEvent(
          block.block.header.height,
          lastBlockHeight,
          eventData
        );
      }
    }
  },
};

module.exports = HOOK;
