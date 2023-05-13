const BigNumber = require("bignumber.js");
const CasperHelper = require("../helpers/casper");
const logger = require("../helpers/logger");
const db = require("../models");
const { CLU256BytesParser, CLKeyBytesParser, CLStringBytesParser } = require("casper-js-sdk");
const CWeb3 = require('casper-web3')
const blake = require("blakejs");
BigNumber.config({ EXPONENTIAL_AT: [-100, 100] });


const EventList = {
  request_bridge_erc20: ["contract_package_hash", "event_type", "erc20_contract", "request_index"],
  unlock_erc20: ["contract_package_hash", "event_type", "erc20_contract", "amount", "from", "to", "unlock_id"]
}

const parseEvents = (
  {
    contractPackageHash, // contract package hash of the custodial bridge contract on casper side
  },
  value // deploy
) => {
  return CWeb3.Contract.parseEvents(EventList, value, contractPackageHash)
};


const HOOK = {
  processMintEvent: async function (
    networkId,
    blockNumber,
    eventData
  ) {
    logger.info("New event at block %s", blockNumber);
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
  },

  processRequestEvent: async function (blockNumber, eventData) {
    logger.info("New event at block %s", blockNumber);

    let amount = eventData.amount;

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
          originToken: eventData.hash,
          originSymbol: eventData.symbol,
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

  },
  process: async (block, deploy, storedContractByHash, selectedRPC) => {
    let trial = 20
    let randomGoodRPC = selectedRPC
    let height = parseInt(block.block.header.height)
    while (trial > 0) {
      try {
        logger.info("checking deploy %s", deploy.deploy.hash)
        let casperConfig = CasperHelper.getConfigInfo();
        const pairedTokensToEthereum = casperConfig.pairedTokensToEthereum
        const originContractPackageHashes = pairedTokensToEthereum.pairs.map(e => e.contractPackageHash)
        // parse events
        const result = {}
        if (deploy.execution_results) {
          result.execution_result = deploy.execution_results[0];
        } else {
          break
        }
        const parsedEventData = parseEvents({ contractPackageHash: pairedTokensToEthereum.custodianContractPackageHash }, result)
        for (const parsedEvent of parsedEventData.data) {
          // let args = storedContractByHash.args;
          if (parsedEvent.name == "unlock_erc20") {
            console.log('got here')
            // unlockId = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
            const mintidStr = parsedEvent.data['unlock_id']
            const mintidSplits = mintidStr.split("-");
            const transactionHash = CasperHelper.toNormalTxHash(deploy.deploy.hash);
            const fromChainId = parseInt(mintidSplits[1]);
            const toChainId = parseInt(mintidSplits[2]);
            const index = parseInt(mintidSplits[3]);

            const blockNumber = block.block.header.height;
            const claimId = mintidStr;
            const unlockIdBytes = Buffer.from(mintidStr, 'utf8')
            const unlockIdKey = Buffer.from(blake.blake2b(Uint8Array.from(unlockIdBytes), undefined, 32)).toString('hex')
            const activeCustodianContractHash = await CWeb3.Contract.getActiveContractHash(pairedTokensToEthereum.custodianContractPackageHash, casperConfig.chainName)
            const contract = await CWeb3.Contract.createInstanceWithRemoteABI(activeCustodianContractHash, randomGoodRPC, casperConfig.chainName)
            const unlock = await contract.getter.unlockIds(unlockIdKey, true)
            console.log('unlockIdKey', unlockIdKey, mintidStr, unlock)
            if (!unlock) {
              logger.warn('the event not happen in the custodian contract')
              return
            }

            let eventData = {
              fromChainId: fromChainId,
              toChainId: toChainId,
              transactionHash: transactionHash,
              index: index,
              blockNumber: blockNumber,
              claimId: claimId,
              originToken: mintidSplits[4].toLowerCase(),
              originChainId: parseInt(mintidSplits[5])
            };
            logger.info("Casper Network Minting: %s", eventData);

            await HOOK.processMintEvent(
              casperConfig.networkId,
              block.block.header.height,
              eventData
            );
          } else if (parsedEvent.name == "request_bridge_erc20") {
            let txCreator = "";
            if (deploy.deploy.approvals.length > 0) {
              txCreator = deploy.deploy.approvals[0].signer;
              txCreator = CasperHelper.fromCasperPubkeyToAccountHash(txCreator);
            }

            // parse event
            const requestIndex = parsedEvent.data['request_index']
            const activeCustodianContractHash = await CWeb3.Contract.getActiveContractHash(pairedTokensToEthereum.custodianContractPackageHash, casperConfig.chainName)
            const contract = await CWeb3.Contract.createInstanceWithRemoteABI(activeCustodianContractHash, randomGoodRPC, casperConfig.chainName)
            const requestBridgeRawData = await contract.getter.requestIds(requestIndex, true)

            // parse raw
            let ret = new CLKeyBytesParser().fromBytesWithRemainder(requestBridgeRawData)
            let erc20ContractPackageHash = ret.result.val.value()
            erc20ContractPackageHash = Buffer.from(erc20ContractPackageHash.data).toString('hex')
            if (!originContractPackageHashes.includes(erc20ContractPackageHash)) {
              logger.warn("unsupported origin ERC20 contract package hash %s", erc20ContractPackageHash)
              return
            }

            const pair = pairedTokensToEthereum.pairs.find(e => e.contractPackageHash == erc20ContractPackageHash)

            ret = new CLU256BytesParser().fromBytesWithRemainder(ret.remainder)
            let requestIndexParsed = ret.result.val.value().toString()

            if (requestIndexParsed != requestIndex) {
              logger.warn("conflicting request index")
              return
            }

            ret = new CLU256BytesParser().fromBytesWithRemainder(ret.remainder)
            let amount = ret.result.val.value().toString()

            ret = new CLStringBytesParser().fromBytesWithRemainder(ret.remainder)
            let receiverAddress = ret.result.val.value().toString()

            ret = new CLKeyBytesParser().fromBytesWithRemainder(ret.remainder)

            let timestamp = Date.parse(block.block.header.timestamp);
            let eventData = {
              token: erc20ContractPackageHash.toLowerCase(),
              hash: erc20ContractPackageHash.toLowerCase(),
              symbol: pair.symbol,
              index: parseInt(requestIndex),
              fromChainId: parseInt(casperConfig.networkId),
              toChainId: parseInt(pair.evmChainId),
              originChainId: casperConfig.networkId,
              originToken: erc20ContractPackageHash.toLowerCase(),
              transactionHash: CasperHelper.toNormalTxHash(deploy.deploy.hash),
              blockNumber: block.block.header.height,
              toAddr: receiverAddress,
              amount: amount,
              requestTime: Math.floor(timestamp / 1000),
              txCreator: txCreator,
            };

            logger.info("Casper Network Request: %s, %s", eventData);

            await HOOK.processRequestEvent(
              block.block.header.height,
              eventData
            );
          }
        }

        break
      } catch (e) {
        trial--
        if (trial == 0) {
          throw e
        }
        randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height)
        console.error(e)
      }
    }
  }
};

module.exports = HOOK;
