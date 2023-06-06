const db = require('../models')
const config = require('config')
const generalHelper = require('../helpers/general')
const CasperHelper = require('../helpers/casper')
const { sha256 } = require("ethereum-cryptography/sha256");
const logger = require("../helpers/logger");
const { CLAccountHash, DeployUtil, CLByteArray } = require("casper-js-sdk");
const BigNumber = require("bignumber.js")
const NFTSign = require('./createUnsignedNFTDeploy')
const { Contract } = require('casper-web3');
/**
 * It scans for transactions that have not been created on the CasperLabs blockchain yet, and creates
 * them
 */
async function startSignForToken() {
    while (true) {
        try {
            let casperConfig = CasperHelper.getConfigInfo()
            let casperChainId = casperConfig.networkId
            let mpcPubkey = CasperHelper.getMPCPubkey()
            let selectedGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(1)
            //scan for tx without casperDeployCreated
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
                    tx.casperDeployCreated = true
                    tx.casperCreatedFailedReason = "Invalid Account Hash"
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
                let minBridge = token.minBridge ? token.minBridge : '0'
                minBridge = new BigNumber(minBridge).multipliedBy('999').dividedBy('1000').toFixed(0)
                if (new BigNumber(tx.amount).comparedTo(minBridge) < 0) {
                    logger.info(
                        "Amount swap token %s too small, swap amount %s, minAmount %s",
                        tx.originToken, tx.amount, minBridge
                    );
                    continue
                }

                //mintid = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
                let mintid = `${tx.requestHash}-${tx.fromChainId}-${tx.toChainId}-${tx.index}-${tx.originToken}-${tx.originChainId}`

                let recipientAccountHashByte = Uint8Array.from(
                    Buffer.from(toAddress.slice(13), 'hex'),
                )
                let deploy
                let ttl = 300000
                let deployJson
                let custodialContractHash
                if (tx.originChainId == casperChainId) {
                    const custodianContractPackageHash = casperConfig.pairedTokensToEthereum.custodianContractPackageHash
                    custodialContractHash = await Contract.getActiveContractHash(custodianContractPackageHash, casperConfig.chainName)
                    const contractInstance = await Contract.createInstanceWithRemoteABI(custodialContractHash, selectedGoodRPC, casperConfig.chainName)
                    logger.info('creating deploy for casper issued erc20')
                    deploy = await contractInstance.contractCalls.unlockErc20.makeUnsignedDeploy({
                        publicKey: mpcPubkey,
                        args: {
                            targetKey: new CLAccountHash(recipientAccountHashByte),
                            erc20ContractPackageHash: new CLByteArray(Uint8Array.from(Buffer.from(token.contractPackageHash, 'hex'))),
                            unlockId: mintid,
                            amount: tx.amount
                        },
                        paymentAmount: 10000000000,
                        ttl: ttl
                    })
                    deployJson = JSON.stringify(Contract.deployToJson(deploy));
                } else {
                    // await erc20.setContractHash(token.contractHash)
                    const contractInstance = await Contract.createInstanceWithRemoteABI(token.contractHash, selectedGoodRPC, casperConfig.chainName)
                    const swapFee = await contractInstance.getter.swapFee()
                    deploy = await contractInstance.contractCalls.mint.makeUnsignedDeploy({
                        publicKey: mpcPubkey,
                        args: {
                            recipient: new CLAccountHash(recipientAccountHashByte),
                            amount: tx.amount,
                            mintid: mintid,
                            swapFee: swapFee
                        },
                        paymentAmount: '6000000000',
                        ttl
                    })
                    logger.info('deploy %s', deploy)
                    deployJson = JSON.stringify(Contract.deployToJson(deploy));
                }
                let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
                let deployHash = Buffer.from(deploy.hash).toString('hex')
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
                        mintid: mintid
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
                            destinationContractHash: tx.originChainId == casperChainId ? custodialContractHash : token.contractHash,
                            timestamp: Math.floor(deploy.header.timestamp / 1000),
                            ttl: Math.floor(deploy.header.ttl / 1000),
                            deadline: Math.floor((deploy.header.timestamp + deploy.header.ttl) / 1000),
                            isProcessed: false,
                            deployJsonString: deployJson,
                            amount: tx.amount,
                            mintid: mintid,
                            claimed: false,
                            renewalCount: 0
                        },
                    },
                    { upsert: true, new: true }
                );

                tx.casperDeployCreated = true
                await tx.save()
            }

            //scan for RequestToCasper not confirmed yet: refresh
            {
                logger.info('Start scanning for unconfirmed requests but ttl over')
                let currentTime = generalHelper.now()
                let reqs = await db.RequestToCasper.find(
                    {
                        $and: [
                            { $or: [{ txExecuted: false }, { txExecuted: null }] },
                            { deadline: { $lt: currentTime } },
                        ]
                    }
                )
                for (const req of reqs) {
                    //verify format of  account address must be account hash
                    let toAddress = req.toWallet
                    logger.info(
                        "RENEWAL: Origin token %s",
                        req.originToken
                    );
                    let token = CasperHelper.getCasperTokenInfoFromOriginToken(req.originToken, req.originChainId)
                    if (!token) {
                        continue
                    }

                    let recipientAccountHashByte = Uint8Array.from(
                        Buffer.from(toAddress.slice(13), 'hex'),
                    )
                    //mintid = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
                    let mintid = req.mintid

                    //TODO: check whether mintid executed => this is to avoid failed transactions as mintid cant be executed more than one time
                    let ttl = 300000
                    let deploy
                    let deployJson
                    let custodialContractHash
                    if (req.originChainId == casperChainId) {
                        const custodianContractPackageHash = casperConfig.pairedTokensToEthereum.custodianContractPackageHash
                        custodialContractHash = await Contract.getActiveContractHash(custodianContractPackageHash, casperConfig.chainName)
                        const contractInstance = await Contract.createInstanceWithRemoteABI(custodialContractHash, selectedGoodRPC, casperConfig.chainName)
                        deploy = await contractInstance.contractCalls.unlockErc20.makeUnsignedDeploy({
                            publicKey: mpcPubkey,
                            args: {
                                targetKey: new CLAccountHash(recipientAccountHashByte),
                                erc20ContractPackageHash: new CLByteArray(Uint8Array.from(Buffer.from(token.contractPackageHash, 'hex'))),
                                unlockId: mintid,
                                amount: req.amount
                            },
                            paymentAmount: 10000000000,
                            ttl: ttl
                        })
                        deployJson = JSON.stringify(Contract.deployToJson(deploy));
                    } else {
                        const contractInstance = await Contract.createInstanceWithRemoteABI(token.contractHash, selectedGoodRPC, casperConfig.chainName)
                        deploy = await contractInstance.contractCalls.mint.makeUnsignedDeploy({
                            publicKey: mpcPubkey,
                            args: {
                                recipient: new CLAccountHash(recipientAccountHashByte),
                                amount: req.amount,
                                mintid: mintid,
                                swapFee: '0'
                            },
                            paymentAmount: '6000000000',
                            ttl
                        })

                        deployJson = JSON.stringify(Contract.deployToJson(deploy));
                    }
                    let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
                    let deployHash = Buffer.from(deploy.hash).toString('hex')
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
                            mintid: mintid
                        },
                        {
                            $set: {
                                requestHash: req.requestHash,
                                index: req.index,
                                deployHash: deployHash,
                                deployHashToSign: hashToSign,
                                toWallet: req.toWallet,
                                fromChainId: req.fromChainId,
                                toChainId: req.toChainId,
                                originChainId: req.originChainId,
                                originToken: req.originToken.toLowerCase(),
                                destinationContractHash: req.originChainId == casperChainId ? custodialContractHash : token.contractHash,
                                timestamp: Math.floor(deploy.header.timestamp / 1000),
                                ttl: Math.floor(deploy.header.ttl / 1000),
                                deadline: Math.floor((deploy.header.timestamp + deploy.header.ttl) / 1000),
                                isProcessed: false,
                                deployJsonString: deployJson,
                                amount: req.amount,
                                mintid: mintid,
                                claimed: false,
                                renewalCount: req.renewalCount + 1
                            },
                        },
                        { upsert: true, new: true }
                    );
                }
            }

            logger.info('sleep 10 seconds before create an other tx')
            await generalHelper.sleep(10000)
        } catch (e) {
            logger.error('Error %s', e)
            await generalHelper.sleep(10000)
        }
    }
}

async function main() {
    startSignForToken();
    if (config.nftBridgeEnabled) {
        NFTSign.start();
    }
}

main()