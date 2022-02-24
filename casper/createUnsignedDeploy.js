const db = require('../models')
const crypto = require('crypto')
const generalHelper = require('../helpers/general')
const CasperHelper = require('../helpers/casper')
const { ERC20Client } = require("casper-erc20-js-client");
const { sha256 } = require("ethereum-cryptography/sha256");
const logger = require("../helpers/logger");
const { CLAccountHash, DeployUtil } = require("casper-js-sdk");

async function main() {
    let casperConfig = CasperHelper.getConfigInfo()
    let casperChainId = casperConfig.networkId
    let mpcPubkey = CasperHelper.getMPCPubkey()
    const erc20 = new ERC20Client(
        casperConfig.rpc,
        casperConfig.chainName,
        casperConfig.eventStream
    );
    while (true) {
        let pendingTxes = await db.Transaction.find(
            {
                $and: [
                    { $or: [{ casperDeployCreated: false }, { casperDeployCreated: null }] },
                    { toChainId: casperChainId },
                ]
            }
        )
        for (const tx of pendingTxes) {
            //verify format of  account address must be account hash
            let toAddress = tx.account
            let splits = toAddress.split("-")
            var re = /[0-9A-Fa-f]{6}/g;
            if (splits.length != 3 || splits[0] != "account" || splits[1] != "hash" || !re.test(splits[2])) {
                continue
            }
            logger.info(
                "Origin token %s",
                tx.originToken
            );
            let token = CasperHelper.getCasperTokenInfoFromOriginToken(tx.originToken, tx.originChainId)
            if (!token) {
                continue
            }
            await erc20.setContractHash(token.contractHash)
            let recipientAccountHashByte = Uint8Array.from(
                Buffer.from(toAddress.slice(13), 'hex'),
            )
            //mintid = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
            let mintid = `${tx.requestHash}-${tx.fromChainId}-${tx.toChainId}-${tx.index}-${tx.originToken}-${tx.originChainId}`
            let deploy = await erc20.createUnsignedMint(
                mpcPubkey,
                new CLAccountHash(recipientAccountHashByte),
                tx.amount,
                mintid,
                "1500000000"
            );
            let deployJson = JSON.stringify(DeployUtil.deployToJson(deploy));
            let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
            let deployHash = deploy.hash.toString('hex')
            logger.info(
                "new transactions to casper %s",
                sha256(Buffer.from(deploy.hash)).toString("hex")
            );

            //create requestToCasper object
            // requestHash: { type: String, index: true },
            // index: { type: Number, index: true },
            // deployHash: { type: String, index: true },
            // deployHashToSign: { type: String, index: true },
            // toWallet: { type: String, index: true },
            // fromChainId: { type: Number, index: true },
            // toChainId: { type: Number, index: true },
            // originChainId: { type: Number, index: true },
            // originToken: { type: String, index: true },
            // destinationContractHash: { type: String, index: true },
            // timestamp: Number,
            // isProcessed: { type: Boolean, index: true },  //already submit to the MPC
            // deployJsonString: String,

            await db.RequestToCasper.updateOne(
                {
                    index: tx.index,
                    requestHash: tx.requestHash,
                    fromChainId: tx.fromChainId,
                    toChainId: tx.toChainId,
                    originChainId: tx.originChainId,
                    originToken: tx.originToken,
                },
                {
                    $set: {
                        requestHash: tx.requestHash,
                        index: tx.index,
                        deployHash: deployHash,
                        deployHashToSign: hashToSign,
                        toWallet: tx.account,
                        fromChainId: tx.fromChainId,
                        toChainId: tx.toChainId,
                        originChainId: tx.originChainId,
                        originToken: tx.originToken.toLowerCase(),
                        destinationContractHash: token.contractHash,
                        timestamp: generalHelper.now(),
                        isProcessed: false,
                        deployJsonString: deployJson,
                        amount: tx.amount
                    },
                },
                { upsert: true, new: true }
            );

            tx.casperDeployCreated = true
            await tx.save()
        }

        console.log('sleep 10 seconds before create an other tx')
        await generalHelper.sleep(10000)
    }

}

main()