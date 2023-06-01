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
                    console.log("NEW REQUEST UNSIGNED TO UNLOCK ")
                    let toAddress = tx.account // NFT account owner 
                    console.log("toAddress: ", toAddress)
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

                    const ownerKey = createRecipientAddress(new CLAccountHash(ownerAccountHashByte))
                    //console.log("token_owner_to_casper:  ", ownerKey)

                    // umlock_id 
                    //unlock_id = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
                    console.log("tx.index: ", tx.index)
                    let mintid = `${tx.requestHash.toLowerCase()}-${tx.fromChainId}-${tx.toChainId}-${tx.index}-${tx.originToken.toLowerCase()}-${tx.originChainId}`

                    console.log("mintId: ", mintid)
                    let unlockId = mintid


                    // identifierMode
                    console.log("tx.identifierMode: ", tx.identifierMode)
                    let identifierMode = new CLValueBuilder.u8((tx.identifierMode))
                    console.log("identifierMode: ", identifierMode)
                    // toChainId
                    // fromChainId
                    let fromChainId = new CLValueBuilder.u256(tx.fromChainId)


                    // token metadata
                    let tokenmetadatas = tx.tokenMetadatas.map((e) => CLValueBuilder.string(e))
                    // token_ids
                    let tokenIds = null
                    let token_ids = null
                    if (identifierMode == 1) {
                        tokenIds = tx.tokenIds.map((e) => e.toString())
                        // token_ids = CLValueBuilder.list(tokenIds)
                    }
                    else {
                        tokenIds = tx.tokenIds.map((e) => parseInt(e))
                        // token_ids = CLValueBuilder.list(tokenIds)
                    }

                    // 
                    const contracthashbytearray = new CLByteArray(Uint8Array.from(Buffer.from(token.contractPackageHash, 'hex')));
                    const nftPackageHash = new CLKey(contracthashbytearray);


                    console.log("Start create deploy for UNLOCK_NFT")
                    // ARG: token_ids - token_hashes - from_chainid - identifier_mode - nft_contract_hash - target_key - unlock_id

                    const contractInstance = await Contract.createInstanceWithRemoteABI(casperNFTConfig.nftbridge, selectedGoodRPC, casperConfig.chainName)
                    let deploy = await contractInstance.contractCalls.approveUnlockNft.makeUnsignedDeploy({
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
                    deploy = JSON.parse(deployJson).deploy
                    let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
                    let deployHash = Buffer.from(deploy.hash).toString('hex')
                    console.log("deployHash2: ", deployHash)

                    logger.info(
                        "new transactions to casper %s",
                        sha256(Buffer.from(deploy.hash)).toString("hex")
                    );
                    console.log(new Date(deploy.header.timestamp).valueOf())
                    console.log(Date.now())

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
                                //destinationContractHash: token.contractHash,
                                timestamp: Math.floor(new Date(deploy.header.timestamp) / 1000),  //Math.floor(deploy.header.timestamp / 1000),
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
                    console.log("Unlock success. Save to DB success")
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
                    console.log("token_owner_to_casper:  ", ownerKey)

                    let mintid = `${tx.requestHash.toLowerCase()}-${tx.fromChainId}-${tx.toChainId}-${tx.index}-${tx.originToken.toLowerCase()}-${tx.originChainId}`
                    let minidToCasper = new CLString(mintid)

                    // token metadata
                    let tokenmetadatas = tx.tokenMetadatas.map((e) => CLValueBuilder.string(e))
                    let token_metadatas = CLValueBuilder.list(tokenmetadatas)
                    let tokenIds = tx.tokenIds.map((e) => CLValueBuilder.string(e.toString()))
                    let token_ids = CLValueBuilder.list(tokenIds)


                    console.log("before deploy")

                    let deploy = DeployUtil.makeDeploy(
                        new DeployUtil.DeployParams(
                            mpcPubkey,
                            casperConfig.chainName,
                            1,
                            defaultTtl,
                        ),
                        DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                            Uint8Array.from(Buffer.from(token.contractHash, "hex")),
                            "approve_to_claim",
                            RuntimeArgs.fromMap({
                                // "nft_contract_hash": contracthash,
                                "token_owner": ownerKey,
                                "mint_id": minidToCasper,
                                "token_hashes": token_ids,
                                "token_meta_datas": token_metadatas
                            })
                        ),
                        DeployUtil.standardPayment(10000000000)
                    );


                    //deploy = client.signDeploy(deploy, pairKeyView);
                    console.log("DEPLOY: ", deploy)

                    console.log("after deploy")


                    let deployJson = JSON.stringify(DeployUtil.deployToJson(deploy));
                    let hashToSign = sha256(Buffer.from(deploy.hash)).toString("hex")
                    let deployHash = Buffer.from(deploy.hash).toString('hex')
                    //console.log("deployHash2: ", deployHash)

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
                                //destinationContractHash: token.contractHash,
                                timestamp: Math.floor(deploy.header.timestamp / 1000),
                                ttl: Math.floor(deploy.header.ttl / 1000),
                                deadline: Math.floor((deploy.header.timestamp + deploy.header.ttl) / 1000),
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
                console.log('sleep 60 seconds before create an other tx')
                await generalHelper.sleep(60000)
            }

            //scan for RequestToCasper not confirmed yet: refresh
            {
                console.log('Start scanning for unconfirmed requests but ttl over')
                let currentTime = generalHelper.now()
                let reqs = await db.Nft721RequestToCasper.find(
                    {
                        $and: [
                            { $or: [{ txExecuted: false }, { txExecuted: null }] },
                            { deadline: { $lt: currentTime } },
                        ]
                    }
                )
                //console.log(reqs)
                for (const req of reqs) {
                    if (req.originChainId == casperChainId) { // nft bridge from Casper to EVM => now bridge back => unlock
                        //verify format of  account address must be account hash
                        logger.info(
                            "RENEWAL for UNLOCK_NFT: Origin MINTID %s",
                            req.mintid
                        );
                        let toAddress = req.toWallet // NFT account owner
                        console.log("toAddress: ", toAddress)
                        // To address account => target_key
                        let ownerAccountHashByte = Uint8Array.from(
                            Buffer.from(toAddress.slice(13), 'hex'),
                        )

                        const ownerKey = createRecipientAddress(new CLAccountHash(ownerAccountHashByte)) // Unlock To_address 

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
                        console.log("req.identifierMode: ", req.identifierMode)
                        let identifierMode = new CLValueBuilder.u8((req.identifierMode))
                        console.log("identifierMode: ", identifierMode)
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

                        console.log("Start create deploy for UNLOCK_NFT")

                        let token_owner1 = req.toWallet

                        let splits = token_owner1.split("-")
                        var re = /[0-9A-Fa-f]{6}/g;
                        if (splits.length != 3 || splits[0] != "account" || splits[1] != "hash" || !re.test(splits[2])) {
                            tx.casperDeployCreated = true
                            tx.casperCreatedFailedReason = "Invalid Account Hash"
                            continue
                        }

                        console.log("token_owner:  ", splits[2])
                        let recipientAccountHashByte = Uint8Array.from(
                            Buffer.from(token_owner1.slice(13), 'hex'),
                        )
                        const accounthash2 = new CLAccountHash(
                            recipientAccountHashByte
                        );
                        //TODO: check whether mintid executed => this is to avoid failed transactions as mintid cant be executed more than one time
                        ttl = 300000

                        console.log("Start RENEWAL deploy for UNLOCK_NFT")

                        // ARG: token_ids - token_hashes - from_chainid - identifier_mode - nft_contract_hash - target_key - unlock_id

                        const contractInstance = await Contract.createInstanceWithRemoteABI(casperNFTConfig.nftbridge, selectedGoodRPC, casperConfig.chainName)
                        let deploy = await contractInstance.contractCalls.approveUnlockNft.makeUnsignedDeploy({
                            publicKey: mpcPubkey,
                            args: {
                                targetKey: new CLAccountHash(recipientAccountHashByte),
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
                        deploy = JSON.parse(deployJson).deploy

                        //deploy = client.signDeploy(deploy, pairKeyView);
                        console.log("DEPLOY: ", deploy)

                        console.log("after deploy")

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
                        let dto_mint_id_tocasper = new CLString(dto_mint_id)

                        // token metadata => Change to Casper type to fit deploy parameters

                        // token metadata
                        let tokenmetadatas1 = req.tokenMetadatas.map((e) => CLValueBuilder.string(e))
                        let token_metadatas1 = CLValueBuilder.list(tokenmetadatas1)
                        let tokenIds1 = req.tokenIds.map((e) => CLValueBuilder.string(e))
                        let token_ids1 = CLValueBuilder.list(tokenIds1)

                        // let token_metadata1 = new CLString(JSON.stringify(req.tokenMetadatas))
                        // let token_ids = new CLValueBuilder.list(tx.token_ids)
                        // let token_hashs = new CLValueBuilder.list(tx.token_hashs)

                        // token_owner

                        let token_owner1 = req.toWallet

                        let splits = token_owner1.split("-")
                        var re = /[0-9A-Fa-f]{6}/g;
                        if (splits.length != 3 || splits[0] != "account" || splits[1] != "hash" || !re.test(splits[2])) {
                            tx.casperDeployCreated = true
                            tx.casperCreatedFailedReason = "Invalid Account Hash"
                            continue
                        }

                        console.log("token_owner:  ", splits[2])
                        let recipientAccountHashByte = Uint8Array.from(
                            Buffer.from(token_owner1.slice(13), 'hex'),
                        )
                        const accounthash2 = new CLAccountHash(
                            recipientAccountHashByte
                        );
                        const token_owner_to_casper = new CLKey(accounthash2);
                        console.log("token_owner_to_casper:  ", token_owner_to_casper)

                        let token = CasperHelper.getCasperNFTTokenInfoFromOriginToken(req.originToken, req.originChainId)
                        if (!token) {
                            logger.warn("token %s on chain %s not supported", req.originToken, req.originChainId)
                            continue
                        }

                        //TODO: check whether mintid executed => this is to avoid failed transactions as mintid cant be executed more than one time

                        let deploy = DeployUtil.makeDeploy(
                            new DeployUtil.DeployParams(
                                //pairKeyView.publicKey, // MPC public key
                                mpcPubkey,
                                casperConfig.chainName,
                                1,
                                defaultTtl,
                            ),
                            DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                                Uint8Array.from(Buffer.from(token.contractHash, 'hex')),
                                "approve_to_claim",
                                RuntimeArgs.fromMap({
                                    "token_owner": token_owner_to_casper,
                                    "mint_id": dto_mint_id_tocasper, // change to Casper string type
                                    "token_hashes": token_ids1,
                                    "token_meta_datas": token_metadatas1 // fit Casper type
                                })
                            ),
                            DeployUtil.standardPayment(22000000000)
                        );

                        //deploy = client.signDeploy(deploy, pairKeyView);
                        console.log(deploy.approvals)
                        let deployJson = JSON.stringify(DeployUtil.deployToJson(deploy));
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
                                    //destinationContractHash: token.contractHash,
                                    timestamp: Math.floor(deploy.header.timestamp / 1000),
                                    ttl: Math.floor(deploy.header.ttl / 1000),
                                    deadline: Math.floor((deploy.header.timestamp + deploy.header.ttl) / 1000),
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
                    console.log('sleep 60 seconds before create an other tx')
                    await generalHelper.sleep(60000)
                }
            }

            console.log('sleep 60 seconds before create an other tx')
            await generalHelper.sleep(60000)
        } catch (e) {
            console.error(e)
        }
    }
}

module.exports = {
    start
}