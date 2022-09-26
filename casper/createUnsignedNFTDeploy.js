const db = require('../models')
const crypto = require('crypto')
const generalHelper = require('../helpers/general')
const CasperHelper = require('../helpers/casper')
const { sha256 } = require("ethereum-cryptography/sha256");
const logger = require("../helpers/logger");
const Web3Utils = require('../helpers/web3')
const BigNumber = require('bignumber.js')
//const { CLAccountHash, DeployUtil } = require("casper-js-sdk");
const {
    DeployUtil,
    CasperClient,
    RuntimeArgs,
    CLString,
    CLPublicKey,
    CLByteArray,
    CLKey,
    CLAccountHash,
    CLValueBuilder,
} = require("casper-js-sdk");

const {
    utils,
    helpers,
    CasperContractClient,
} = require("casper-js-client-helper");
const { setClient, contractSimpleGetter, createRecipientAddress } = helpers;
async function main() {
    //const hash1 = "c21b4b9bb3842a1a4365c3b242bd99ef430d674ba5694813b78d2bcc517bd6a3"
    //const nft_contract = hash1
    //const contracthashbytearray = new CLByteArray(Uint8Array.from(Buffer.from(hash1, 'hex')));
    //const contracthash = new CLKey(contracthashbytearray);

    while (true) {
        try {
            let casperConfig = CasperHelper.getConfigInfo()
            let casperNFTConfig = CasperHelper.getNFTConfig()
            console.log("NFT bidge contract: ", casperNFTConfig.nftbridge)
            let casperChainId = casperConfig.networkId
            let mpcPubkey = CasperHelper.getMPCPubkey()

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
                    let unlockIdToCasper = new CLString(unlockId)


                    // identifierMode
                    console.log("tx.identifierMode: ", tx.identifierMode)
                    let identifierMode = new CLValueBuilder.u8((tx.identifierMode))
                    console.log("identifierMode: ", identifierMode)
                    // toChainId
                    let toChainId = tx.toChainId
                    // fromChainId
                    let fromChainId = new CLValueBuilder.u256(tx.fromChainId)


                    // token metadata
                    let tokenmetadatas = tx.tokenMetadatas.map((e) => CLValueBuilder.string(e))
                    let token_metadatas = CLValueBuilder.list(tokenmetadatas)
                    // token_ids
                    let tokenIds = null
                    let token_ids = null
                    if (identifierMode == 1) {
                        tokenIds = tx.tokenIds.map((e) => CLValueBuilder.string(e.toString()))
                        token_ids = CLValueBuilder.list(tokenIds)
                    }
                    else {
                        tokenIds = tx.tokenIds.map((e) => CLValueBuilder.u64(e))
                        token_ids = CLValueBuilder.list(tokenIds)
                    }

                    // 
                    console.log("NFT contract hash - token.contractHash: ", token.contractHash)
                    const contracthashbytearray = new CLByteArray(Uint8Array.from(Buffer.from(token.contractHash, 'hex')));
                    const nftContractHash = new CLKey(contracthashbytearray);


                    let ttl = 300000

                    console.log("Start create deploy for UNLOCK_NFT")

                    // ARG: token_ids - token_hashes - from_chainid - identifier_mode - nft_contract_hash - target_key - unlock_id

                    let deploy = DeployUtil.makeDeploy(
                        new DeployUtil.DeployParams(
                            mpcPubkey,
                            casperConfig.chainName
                        ),
                        DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                            Uint8Array.from(Buffer.from(casperNFTConfig.nftbridge, "hex")),
                            "unlock_nft",
                            RuntimeArgs.fromMap({
                                // "nft_contract_hash": contracthash,
                                "target_key": ownerKey,
                                "unlock_id": unlockIdToCasper,
                                "token_ids": token_ids,
                                "from_chainid": fromChainId,
                                "identifier_mode": identifierMode,
                                "nft_contract_hash": nftContractHash,

                            })
                        ),
                        DeployUtil.standardPayment(2000000000)
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
                    let tokenIds = tx.tokenIds.map((e) => CLValueBuilder.string(e.toString()))
                    let originTokenIds = []
                    let fromChainId = tx.fromChainId
                    for (const tokenId in tokenIds) {
                        let originTokenId = await generalHelper.tryCallWithTrial(async () => {
                            let contract = await Web3Utils.getNft721BridgeContract(fromChainId)
                            let ret = await contract.methods.tokenMap(casperConfig.networkId, tx.originToken).call()
                            let erc721WrappedToken = await Web3Utils.getWrappedNFT721Contract(fromChainId, ret)
                            let originTokenId = await erc721WrappedToken.methods.mappedOriginTokenIds(tokenId).call()
                            return originTokenId
                        })
                        if (originTokenId == undefined) {
                            return res.status(400).json({ errors: 'Transaction information might be invalid or temporarily invalid' })
                        }
                        originTokenIds.push(originToken)
                    }
                    let token_ids = CLValueBuilder.list(originTokenIds)

                    let ttl = 300000

                    console.log("before deploy")

                    let deploy = DeployUtil.makeDeploy(
                        new DeployUtil.DeployParams(
                            mpcPubkey,
                            casperConfig.chainName
                        ),
                        DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                            Uint8Array.from(Buffer.from(token.contractHash, "hex")),
                            "mint",
                            RuntimeArgs.fromMap({
                                // "nft_contract_hash": contracthash,
                                "token_owner": ownerKey,
                                "mint_id": minidToCasper,
                                "token_hashes": token_ids,
                                "token_meta_datas": token_metadatas
                            })
                        ),
                        DeployUtil.standardPayment(2000000000)
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
                console.log(reqs)
                for (const req of reqs) {
                    if (req.originChainId == casperChainId) { // nft bridge from Casper to EVM => now bridge back => unlock
                        //verify format of  account address must be account hash
                        logger.info(
                            "RENEWAL for UNLOCK_NFT: Origin MINTID %s",
                            req.mintid
                        );
                        let toAddress = req.account // NFT account owner
                        console.log("toAddress: ", toAddress)
                        // To address account => target_key
                        let ownerAccountHashByte = Uint8Array.from(
                            Buffer.from(toAddress.slice(13), 'hex'),
                        )

                        const ownerKey = createRecipientAddress(new CLAccountHash(ownerAccountHashByte)) // Unlock To_address 
                        //console.log("token_owner_to_casper:  ", ownerKey)

                        // umlock_id 
                        //unlock_id = <txHash>-<fromChainId>-<toChainId>-<index>-<originContractAddress>-<originChainId>
                        console.log("tx.index: ", req.index)
                        let mintid = `${req.requestHash.toLowerCase()}-${req.fromChainId}-${req.toChainId}-${req.index}-${req.originToken.toLowerCase()}-${req.originChainId}`

                        console.log("mintId: ", mintid)
                        let unlockId = mintid
                        let unlockIdToCasper = new CLString(unlockId)


                        // identifierMode
                        console.log("req.identifierMode: ", req.identifierMode)
                        let identifierMode = new CLValueBuilder.u8((req.identifierMode))
                        console.log("identifierMode: ", identifierMode)
                        // toChainId
                        let toChainId = req.toChainId
                        // fromChainId
                        let fromChainId = new CLValueBuilder.u256(req.fromChainId)


                        // token metadata
                        let tokenmetadatas = req.tokenMetadatas.map((e) => CLValueBuilder.string(e))
                        let token_metadatas = CLValueBuilder.list(tokenmetadatas)
                        // token_ids
                        let tokenIds = null
                        let token_ids = null
                        if (identifierMode == 1) {
                            tokenIds = req.tokenIds.map((e) => CLValueBuilder.string(e.toString()))
                            token_ids = CLValueBuilder.list(tokenIds)
                        }
                        else {
                            tokenIds = req.tokenIds.map((e) => CLValueBuilder.u64(e))
                            token_ids = CLValueBuilder.list(tokenIds)
                        }

                        // 
                        console.log("NFT contract hash - token.contractHash: ", token.contractHash)
                        const contracthashbytearray = new CLByteArray(Uint8Array.from(Buffer.from(token.contractHash, 'hex')));
                        const nftContractHash = new CLKey(contracthashbytearray);


                        let ttl = 300000

                        console.log("Start create deploy for UNLOCK_NFT")
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
                        let ttl = 300000

                        console.log("Start RENEWAL deploy for UNLOCK_NFT")

                        // ARG: token_ids - token_hashes - from_chainid - identifier_mode - nft_contract_hash - target_key - unlock_id

                        let deploy = DeployUtil.makeDeploy(
                            new DeployUtil.DeployParams(
                                mpcPubkey,
                                casperConfig.chainName
                            ),
                            DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                                Uint8Array.from(Buffer.from(casperNFTConfig.nftbridge, "hex")),
                                "unlock_nft",
                                RuntimeArgs.fromMap({
                                    // "nft_contract_hash": contracthash,
                                    "target_key": ownerKey,
                                    "unlock_id": unlockIdToCasper,
                                    "token_ids": token_ids,
                                    "from_chainid": fromChainId,
                                    "identifier_mode": identifierMode,
                                    "nft_contract_hash": nftContractHash,

                                })
                            ),
                            DeployUtil.standardPayment(2000000000)
                        );


                        //deploy = client.signDeploy(deploy, pairKeyView);
                        console.log("DEPLOY: ", deploy)

                        console.log("after deploy")


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
                        let ttl = 300000

                        let deploy = DeployUtil.makeDeploy(
                            new DeployUtil.DeployParams(
                                //pairKeyView.publicKey, // MPC public key
                                mpcPubkey,
                                casperConfig.chainName
                            ),
                            DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                                Uint8Array.from(Buffer.from(token.contractHash, 'hex')),
                                "mint",
                                RuntimeArgs.fromMap({
                                    "token_owner": token_owner_to_casper,
                                    "mint_id": dto_mint_id_tocasper, // change to Casper string type
                                    "token_hashes": token_ids1,
                                    "token_meta_datas": token_metadatas1 // fit Casper type
                                })
                            ),
                            DeployUtil.standardPayment(2000000000)
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
                }
            }

            console.log('sleep 60 seconds before create an other tx')
            await generalHelper.sleep(60000)
        } catch (e) {
            console.error(e)
        }
    }

}

main()