const db = require('../models')
const generalHelper = require('../helpers/general')
const CasperHelper = require('../helpers/casper')
const { sha256 } = require("ethereum-cryptography/sha256");
const logger = require("../helpers/logger");
const { Contract } = require('casper-web3');
const {
    DeployUtil,
    RuntimeArgs,
    CLString,
    CLByteArray,
    CLKey,
    CLAccountHash,
    CLValueBuilder,
    makeDeploy,
    DeployParams,
    ExecutableDeployItem,
} = require("casper-js-sdk");

const {
    helpers,
} = require("casper-js-client-helper");
const { createRecipientAddress } = helpers;
async function start() {
    let defaultTtl = 300000

    while (true) {
        try {
            let casperConfig = CasperHelper.getConfigInfo()
            let casperNFTConfig = CasperHelper.getNFTConfig()
            let casperChainId = casperConfig.networkId
            let mpcPubkey = CasperHelper.getMPCPubkey()
            let selectedGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(1)


            //scan for tx without casperDeployCreated
            let pendingTxes = await db.Nft721Transaction.find(
                {
                    $and: [
                        { $or: [{ casperDeployCreated: false }, { casperDeployCreated: null }] },
                        { toChainId: casperChainId },
                    ]
                }
            )
            for (const tx of pendingTxes) {
                if (tx.originChainId == casperChainId) { // nft bridge from Casper to EVM => now bridge back => unlock 
                    //verify format of  account address must be account hash
                    let toAddress = tx.account // NFT account owner 
                    logger.info("NEW REQUEST UNSIGNED TO UNLOCK toAddress = %s", toAddress)
                    let splits = toAddress.split("-")
                    var re = /[0-9A-Fa-f]{6}/g;
                    if (splits.length != 3 || splits[0] != "account" || splits[1] != "hash" || !re.test(splits[2])) {
                        tx.casperDeployCreated = true
                        tx.casperCreatedFailedReason = "Invalid Account Hash"
                        continue
                    }

                    let token = CasperHelper.getCasperNFTTokenInfoFromOriginToken(tx.originToken, tx.originChainId)
                    if (!token) {
                        logger.warn("token %s on chain %s not supported", tx.originToken, tx.originChainId)
                        continue
                    }

                    // To address account => target_key
                    let ownerAccountHashByte = Uint8Array.from(
                        Buffer.from(toAddress.slice(13), 'hex'),
                    )
                    // umlock_id 
                    //unlock_id = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
                    let mintid = `${tx.requestHash.toLowerCase()}-${tx.fromChainId}-${tx.toChainId}-${tx.index}-${tx.originToken.toLowerCase()}-${tx.originChainId}`
                    let unlockId = mintid


                    // identifierMode
                    let identifierMode = new CLValueBuilder.u8((tx.identifierMode))

                    let tokenIds = null
                    if (identifierMode == 1) {
                        tokenIds = tx.tokenIds.map((e) => e.toString())
                    }
                    else {
                        tokenIds = tx.tokenIds.map((e) => parseInt(e))
                    }

                    // 
                    const contracthashbytearray = new CLByteArray(Uint8Array.from(Buffer.from(token.contractPackageHash, 'hex')));
                    const nftPackageHash = new CLKey(contracthashbytearray);


                    logger.info("Start create deploy for UNLOCK_NFT")
                    let deploy
                    const contractInstance = await Contract.createInstanceWithRemoteABI(casperNFTConfig.nftbridge, selectedGoodRPC, casperConfig.chainName)
                    deploy = await contractInstance.contractCalls.approveUnlockNft.makeUnsignedDeploy({
                        publicKey: mpcPubkey,
                        args: {
                            targetKey: new CLAccountHash(ownerAccountHashByte),
                            unlockId: unlockId,
                            tokenIds: tokenIds,
                            fromChainid: tx.fromChainId,
                            identifierMode: tx.identifierMode,
                            nftPackageHash: contracthashbytearray,
                        },
                        paymentAmount: 10000000000,
                        ttl: defaultTtl
                    })
                    let deployJson = JSON.stringify(Contract.deployToJson(deploy));
                    // deploy = JSON.parse(deployJson).deploy
                    // deployJson = JSON.stringify(deploy)
                    let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
                    let deployHash = Buffer.from(deploy.hash).toString('hex')

                    logger.info(
                        "new transactions to casper %s",
                        sha256(Buffer.from(deploy.hash)).toString("hex")
                    );

                    await db.Nft721RequestToCasper.updateOne(
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
                                timestamp: Math.floor(new Date(deploy.header.timestamp).valueOf() / 1000),  //Math.floor(deploy.header.timestamp / 1000),
                                ttl: Math.floor(defaultTtl / 1000),
                                deadline: Math.floor((new Date(deploy.header.timestamp).valueOf() + defaultTtl) / 1000),
                                isProcessed: false,
                                deployJsonString: deployJson,
                                amount: tx.amount,
                                mintid: mintid,
                                claimed: false,
                                renewalCount: 0,
                                tokenMetadatas: tx.tokenMetadatas,
                                isNFT: true,
                                tokenIds: tx.tokenIds,
                                identifierMode: tx.identifierMode,
                                isUnlock: true,
                                unlockId: unlockId
                            },
                        },
                        { upsert: true, new: true }
                    );

                    tx.casperDeployCreated = true
                    await tx.save()
                    logger.info("Unlock success. Save to DB success")
                } else {
                    //verify format of  account address must be account hash
                    //verify format of  account address must be account hash
                    let toAddress = tx.account // NFT account owner 
                    let splits = toAddress.split("-")
                    var re = /[0-9A-Fa-f]{6}/g;
                    if (splits.length != 3 || splits[0] != "account" || splits[1] != "hash" || !re.test(splits[2])) {
                        tx.casperDeployCreated = true
                        tx.casperCreatedFailedReason = "Invalid Account Hash"
                        continue
                    }

                    let token = CasperHelper.getCasperNFTTokenInfoFromOriginToken(tx.originToken, tx.originChainId)
                    if (!token) {
                        logger.warn("token %s on chain %s not supported", tx.originToken, tx.originChainId)
                        continue
                    }

                    // To address account
                    let ownerAccountHashByte = Uint8Array.from(
                        Buffer.from(toAddress.slice(13), 'hex'),
                    )

                    const ownerKey = createRecipientAddress(new CLAccountHash(ownerAccountHashByte))

                    let mintid = `${tx.requestHash.toLowerCase()}-${tx.fromChainId}-${tx.toChainId}-${tx.index}-${tx.originToken.toLowerCase()}-${tx.originChainId}`

                    // token metadata
                    let tokenIds = tx.tokenIds.map((e) => parseInt(e))
                    let deploy
                    const tokenContractHash = await Contract.getActiveContractHash(token.contractPackageHash, casperConfig.chainName)
                    const contractInstance = await Contract.createInstanceWithRemoteABI(tokenContractHash, selectedGoodRPC, casperConfig.chainName)
                    deploy = await contractInstance.contractCalls.approveToClaim.makeUnsignedDeploy({
                        publicKey: mpcPubkey,
                        args: {
                            tokenOwner: new CLAccountHash(ownerAccountHashByte),
                            mintId: mintid,
                            tokenIds: tokenIds,
                            tokenMetaDatas: tx.tokenMetadatas,
                        },
                        paymentAmount: 10000000000,
                        ttl: defaultTtl
                    })

                    let deployJson = JSON.stringify(Contract.deployToJson(deploy));
                    let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
                    let deployHash = Buffer.from(deploy.hash).toString('hex')
                    logger.info(
                        "new transactions to casper %s",
                        sha256(Buffer.from(deploy.hash)).toString("hex")
                    );

                    await db.Nft721RequestToCasper.updateOne(
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
                                timestamp: Math.floor(new Date(deploy.header.timestamp).valueOf() / 1000),  //Math.floor(deploy.header.timestamp / 1000),
                                ttl: Math.floor(defaultTtl / 1000),
                                deadline: Math.floor((new Date(deploy.header.timestamp).valueOf() + defaultTtl) / 1000),
                                isProcessed: false,
                                deployJsonString: deployJson,
                                amount: tx.amount,
                                mintid: mintid,
                                claimed: false,
                                renewalCount: 0,
                                tokenMetadatas: tx.tokenMetadatas,
                                isNFT: true,
                                tokenIds: tx.tokenIds,
                                identifierMode: tx.identifierMode,
                            },
                        },
                        { upsert: true, new: true }
                    );

                    tx.casperDeployCreated = true
                    await tx.save()
                }
                logger.info('sleep 60 seconds before create an other tx')
                await generalHelper.sleep(60000)
            }

            //scan for RequestToCasper not confirmed yet: refresh
            {
                logger.info('Start scanning for unconfirmed requests but ttl over')
                let currentTime = generalHelper.now()
                let reqs = await db.Nft721RequestToCasper.find(
                    {
                        $and: [
                            { $or: [{ txExecuted: false }, { txExecuted: null }] },
                            { deadline: { $lt: currentTime } },
                        ]
                    }
                )
                for (const req of reqs) {
                    if (req.originChainId == casperChainId) { // nft bridge from Casper to EVM => now bridge back => unlock
                        logger.info(
                            "RENEWAL for UNLOCK_NFT: Origin MINTID %s",
                            req.mintid
                        );
                        let toAddress = req.toWallet // NFT account owner
                        let ownerAccountHashByte = Uint8Array.from(
                            Buffer.from(toAddress.slice(13), 'hex'),
                        )

                        // umlock_id 
                        //unlock_id = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>

                        let token = CasperHelper.getCasperNFTTokenInfoFromOriginToken(req.originToken, req.originChainId)
                        if (!token) {
                            logger.warn("token %s on chain %s not supported", req.originToken, req.originChainId)
                            continue
                        }

                        let mintid = `${req.requestHash.toLowerCase()}-${req.fromChainId}-${req.toChainId}-${req.index}-${req.originToken.toLowerCase()}-${req.originChainId}`

                        let unlockId = mintid

                        // identifierMode
                        let identifierMode = new CLValueBuilder.u8((req.identifierMode))
                        let tokenIds = null
                        if (identifierMode == 1) {
                            tokenIds = req.tokenIds.map((e) => e.toString())
                        }
                        else {
                            tokenIds = req.tokenIds.map((e) => parseInt(e))
                        }

                        // 
                        const contracthashbytearray = new CLByteArray(Uint8Array.from(Buffer.from(token.contractPackageHash, 'hex')));


                        let ttl = 300000

                        logger.info("Start create deploy for UNLOCK_NFT")

                        let token_owner1 = req.toWallet

                        let splits = token_owner1.split("-")
                        var re = /[0-9A-Fa-f]{6}/g;
                        if (splits.length != 3 || splits[0] != "account" || splits[1] != "hash" || !re.test(splits[2])) {
                            tx.casperDeployCreated = true
                            tx.casperCreatedFailedReason = "Invalid Account Hash"
                            continue
                        }

                        let recipientAccountHashByte = Uint8Array.from(
                            Buffer.from(token_owner1.slice(13), 'hex'),
                        )
                        const accounthash2 = new CLAccountHash(
                            recipientAccountHashByte
                        );
                        ttl = 300000

                        logger.info("Start RENEWAL deploy for UNLOCK_NFT")
                        let deploy

                        // ARG: token_ids - token_hashes - from_chainid - identifier_mode - nft_contract_hash - target_key - unlock_id

                        const contractInstance = await Contract.createInstanceWithRemoteABI(casperNFTConfig.nftbridge, selectedGoodRPC, casperConfig.chainName)
                        deploy = await contractInstance.contractCalls.approveUnlockNft.makeUnsignedDeploy({
                            publicKey: mpcPubkey,
                            args: {
                                targetKey: new CLAccountHash(recipientAccountHashByte),
                                unlockId: unlockId,
                                tokenIds: tokenIds,
                                fromChainid: req.fromChainId,
                                identifierMode: req.identifierMode,
                                nftPackageHash: contracthashbytearray,
                            },
                            paymentAmount: 10000000000,
                            ttl: ttl
                        })
                        let deployJson = JSON.stringify(Contract.deployToJson(deploy));

                        let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
                        let deployHash = Buffer.from(deploy.hash).toString('hex')
                        logger.info(
                            "new transactions to casper %s",
                            sha256(Buffer.from(deploy.hash)).toString("hex")
                        );

                        await db.Nft721RequestToCasper.updateOne(
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
                                    timestamp: Math.floor(new Date(deploy.header.timestamp) / 1000),  //Math.floor(deploy.header.timestamp / 1000),
                                    ttl: Math.floor(defaultTtl / 1000),
                                    deadline: Math.floor((new Date(deploy.header.timestamp).valueOf() + defaultTtl) / 1000),
                                    isProcessed: false,
                                    deployJsonString: deployJson,
                                    amount: req.amount,
                                    mintid: mintid,
                                    token_metadata: req.token_metadata,
                                    claimed: false,
                                    renewalCount: req.renewalCount + 1,
                                    isNFT: true,
                                    tokenIds: req.tokenIds,
                                    identifierMode: req.identifierMode,
                                    isUnlock: true,
                                    unlockId: unlockId
                                },
                            },
                            { upsert: true, new: true }
                        );
                    } else {
                        //verify format of  account address must be account hash
                        logger.info(
                            "RENEWAL: Origin MINTID %s",
                            req.mintid
                        );
                        let dto_mint_id = req.mintid

                        let tokenIds1 = req.tokenIds.map((e) => parseInt(e))



                        let token_owner1 = req.toWallet

                        let splits = token_owner1.split("-")
                        var re = /[0-9A-Fa-f]{6}/g;
                        if (splits.length != 3 || splits[0] != "account" || splits[1] != "hash" || !re.test(splits[2])) {
                            tx.casperDeployCreated = true
                            tx.casperCreatedFailedReason = "Invalid Account Hash"
                            continue
                        }

                        let recipientAccountHashByte = Uint8Array.from(
                            Buffer.from(token_owner1.slice(13), 'hex'),
                        )
                        let token = CasperHelper.getCasperNFTTokenInfoFromOriginToken(req.originToken, req.originChainId)
                        if (!token) {
                            logger.warn("token %s on chain %s not supported", req.originToken, req.originChainId)
                            continue
                        }

                        let deploy
                        const tokenContractHash = await Contract.getActiveContractHash(token.contractPackageHash, casperConfig.chainName)
                        const contractInstance = await Contract.createInstanceWithRemoteABI(tokenContractHash, selectedGoodRPC, casperConfig.chainName)
                        deploy = await contractInstance.contractCalls.approveToClaim.makeUnsignedDeploy({
                            publicKey: mpcPubkey,
                            args: {
                                tokenOwner: new CLAccountHash(recipientAccountHashByte),
                                mintId: req.mintid,
                                tokenIds: tokenIds1,
                                tokenMetaDatas: req.tokenMetadatas,
                            },
                            paymentAmount: 10000000000,
                            ttl: defaultTtl
                        })

                        let deployJson = JSON.stringify(Contract.deployToJson(deploy));

                        let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
                        let deployHash = Buffer.from(deploy.hash).toString('hex')
                        logger.info(
                            "new transactions to casper %s",
                            sha256(Buffer.from(deploy.hash)).toString("hex")
                        );

                        await db.Nft721RequestToCasper.updateOne(
                            {
                                mintid: dto_mint_id
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
                                    timestamp: Math.floor(new Date(deploy.header.timestamp).valueOf() / 1000),  //Math.floor(deploy.header.timestamp / 1000),
                                    ttl: Math.floor(defaultTtl / 1000),
                                    deadline: Math.floor((new Date(deploy.header.timestamp).valueOf() + defaultTtl) / 1000),
                                    isProcessed: false,
                                    deployJsonString: deployJson,
                                    amount: req.amount,
                                    mintid: dto_mint_id,
                                    token_metadata: req.token_metadata,
                                    claimed: false,
                                    renewalCount: req.renewalCount + 1,
                                    isNFT: true,
                                    tokenIds: req.tokenIds,
                                    identifierMode: req.identifierMode,
                                },
                            },
                            { upsert: true, new: true }
                        );

                    }
                    logger.info('sleep 60 seconds before create an other tx')
                    await generalHelper.sleep(60000)
                }
            }

            logger.info('sleep 60 seconds before create an other tx')
            await generalHelper.sleep(60000)
        } catch (e) {
            logger.error(e)
        }
    }
}

module.exports = {
    start
}