const config = require('config')
const { CLPublicKey, CLPublicKeyTag, CasperServiceByJsonRPC } = require("casper-js-sdk");
const { ERC20Client } = require('casper-erc20-js-client')
const BigNumber = require("bignumber.js");
let { DTOWrappedNFT, NFTBridge } = require("casper-nft-utils")
const logger = require("./logger");

const CasperHelper = {
    getConfigInfo: () => {
        let network = config.caspernetwork;
        const CasperContractConfig = require("../casper-contract-hash/config.json")
        return CasperContractConfig[network]
    },
    getNFTConfig: () => {
        let network = config.caspernetwork;
        const CasperContractConfig = require("../casper-contract-hash/nftconfig.json")
        return CasperContractConfig[network]
    },
    getRandomCasperRPCLink: () => {
        let casperConfigInfo = CasperHelper.getConfigInfo();
        let rpcList = []
        if (casperConfigInfo.rpc) {
            if (Array.isArray(casperConfigInfo.rpc)) {
                rpcList.push(...casperConfigInfo.rpc)
            } else {
                rpcList.push(casperConfigInfo.rpc)
            }
        }

        if (casperConfigInfo.rpcs) {
            if (Array.isArray(casperConfigInfo.rpcs)) {
                rpcList.push(...casperConfigInfo.rpcs)
            } else {
                rpcList.push(casperConfigInfo.rpcs)
            }
        }
        let random = Math.floor(Math.random() * rpcList.length)
        return rpcList[random]
    },
    getRandomGoodCasperRPCLink: async (minLastBlockHeight, currentRPC) => {
        if (currentRPC) {
            return currentRPC
        }
        let casperConfigInfo = CasperHelper.getConfigInfo();
        let rpcList = []
        if (casperConfigInfo.rpc) {
            if (Array.isArray(casperConfigInfo.rpc)) {
                rpcList.push(...casperConfigInfo.rpc)
            } else {
                rpcList.push(casperConfigInfo.rpc)
            }
        }

        if (casperConfigInfo.rpcs) {
            if (Array.isArray(casperConfigInfo.rpcs)) {
                rpcList.push(...casperConfigInfo.rpcs)
            } else {
                rpcList.push(casperConfigInfo.rpcs)
            }
        }
        while (rpcList.length > 0) {
            let random = Math.floor(Math.random() * rpcList.length)
            let rpc = rpcList[random]
            let client = new CasperServiceByJsonRPC(rpc)
            try {
                let currentBlock = await client.getLatestBlockInfo();
                let currentBlockHeight = parseInt(
                    currentBlock.block.header.height.toString()
                );
                if (currentBlockHeight >= minLastBlockHeight) {
                    console.warn("selecting RPC", rpc)
                    return rpc
                }
            } catch (e) {

            }
            rpcList.splice(random, 1)
        }
        return ""
    },
    getBridgeFee: (originTokenAddress) => {
        let casperConfig = CasperHelper.getConfigInfo()
        let tokens = casperConfig.tokens
        for (const t of tokens) {
            if (t.originContractAddress.toLowerCase() == originTokenAddress.toLowerCase()) {
                return t.fee
            }
        }
        return '0'
    },
    getMPCPubkey: () => {
        let casperConfig = CasperHelper.getConfigInfo()
        let mpcPubkey = casperConfig.mpcPubkey
        let byteArray = Buffer.from(mpcPubkey, 'hex')
        byteArray = Uint8Array.from(byteArray)
        return new CLPublicKey(byteArray, CLPublicKeyTag.SECP256K1)
    },
    toCasperDeployHash: (h) => {
        return h.replace("0x", "")
    },
    toNormalTxHash: (h) => {
        return "0x" + h.replace("0x", "")
    },
    getCasperTokenInfoFromOriginToken: (originTokenAddress, originChainId) => {
        let casperConfig = CasperHelper.getConfigInfo()
        let tokens = casperConfig.tokens
        let token = tokens.find((e) => e.originContractAddress.toLowerCase() == originTokenAddress.toLowerCase() && e.originChainId == originChainId)
        return token
    },
    getCasperNFTTokenInfoFromOriginToken: (originTokenAddress, originChainId) => {
        let casperConfig = CasperHelper.getNFTConfig()
        let tokens = casperConfig.tokens
        let token = tokens.find((e) => e.originContractAddress.toLowerCase() == originTokenAddress.toLowerCase() && e.originChainId == originChainId)
        return token
    },
    findArg: (args, argName) => {
        return args.find((e) => e[0] == argName);
    },
    findArgParsed: function (args, argName) {
        let arg = CasperHelper.findArg(args, argName)
        return arg[1].parsed
    },
    getCasperRPC: async () => {
        let rpc = await CasperHelper.getRandomGoodCasperRPCLink(1)
        return new CasperServiceByJsonRPC(rpc)
    },
    fromCasperPubkeyToAccountHash: (clPubkeyHex) => {
        let clPubkey = CLPublicKey.fromHex(clPubkeyHex);
        return `account-hash-${Buffer.from(clPubkey.toAccountHash()).toString('hex')}`
    },
    parseRequestFromCasper: async (deployResult) => {
        let deploy = deployResult.deploy;
        let casperConfig = CasperHelper.getConfigInfo()
        let contractHashes = casperConfig.tokens.map((e) => e.contractHash);
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
                        if (
                            StoredContractByHash.entry_point == "request_bridge_back"
                        ) {
                            let amount = CasperHelper.findArg(args, "amount");
                            amount = amount[1].parsed;
                            let toChainId = CasperHelper.findArg(args, "to_chainid");
                            toChainId = toChainId[1].parsed;
                            let fee = CasperHelper.findArg(args, "fee");
                            fee = fee[1].parsed;
                            let receiver_address = CasperHelper.findArg(args, "receiver_address");
                            receiver_address = receiver_address[1].parsed;
                            let id = CasperHelper.findArg(args, "id");
                            id = id[1].parsed;

                            //reading index from id
                            const erc20 = new ERC20Client(
                                casperConfig.rpc,
                                casperConfig.chainName,
                                casperConfig.eventStream,
                            )

                            await erc20.setContractHash(
                                tokenData.contractHash
                            )

                            id = await erc20.readRequestIndex(id)
                            //amount after fee
                            amount = new BigNumber(amount).minus(fee).toString();

                            let eventData = {
                                token: tokenData.originContractAddress.toLowerCase(),
                                index: parseInt(id),
                                fromChainId: parseInt(casperConfig.networkId),
                                toChainId: parseInt(toChainId),
                                originChainId: tokenData.originChainId,
                                originToken: tokenData.originContractAddress.toLowerCase(),
                                transactionHash: CasperHelper.toNormalTxHash(deploy.hash),
                                toAddr: receiver_address,
                                amount: amount,
                                index: parseInt(id)
                            };

                            return eventData
                        }
                    }
                }
            }
        }
        return null
    },
    getTokenIdsFromArgs: (identifierMode, args) => {
        let tokenIds
        if (identifierMode == 0) {
            tokenIds = CasperHelper.findArgParsed(args, "token_ids")
            tokenIds = tokenIds.map(e => e.toString())
        } else {
            tokenIds = CasperHelper.findArgParsed(args, "token_hashes")
            console.log('token_hashes', tokenIds)
            tokenIds = tokenIds.map(e => e.toString())
        }
        return tokenIds
    },
    getTokenHashesFromArgs: (args) => {
        let tokenIds = CasperHelper.findArgParsed(args, "token_hashes")
        return tokenIds
    },
    isDeploySuccess: (deployResult) => {
        if (deployResult.execution_results) {
            let result = deployResult.execution_results[0];
            if (result.result.Success) {
                return true
            }
            return false
        }
    },
    parseRequestNFTFromCasper: async (deploy, height) => {
        //analyzing deploy details
        let casperConfig = CasperHelper.getConfigInfo()
        let session = deploy.session;
        if (session && session.StoredContractByHash) {
            let storedContractByHash = session.StoredContractByHash;
            let nftConfig = CasperHelper.getNFTConfig();
            let tokenData = nftConfig.tokens.find(
                (e) => e.contractHash == storedContractByHash.hash
            );
            let args = storedContractByHash.args;
            let entryPoint = storedContractByHash.entry_point;

            if (tokenData) {
                if (entryPoint == "request_bridge_back") {
                    let randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height)
                    let nftContractHash = storedContractByHash.hash
                    let txCreator = "";
                    if (deploy.approvals.length > 0) {
                        txCreator = deploy.approvals[0].signer;
                        txCreator = CasperHelper.fromCasperPubkeyToAccountHash(txCreator);
                    }

                    let nftContract = await DTOWrappedNFT.createInstance(nftContractHash, randomGoodRPC, casperConfig.chainName)
                    let identifierMode = await nftContract.identifierMode()
                    let tokenIds = CasperHelper.getTokenIdsFromArgs(identifierMode, args)
                    let tokenHashes = []
                    if (identifierMode == 1) {
                        tokenHashes = CasperHelper.getTokenHashesFromArgs(args)
                    }
                    let tokenMetadatas = []
                    for (var i = 0; i < tokenIds.length; i++) {
                        let tokenId = identifierMode == 0 ? tokenIds[i] : tokenHashes[i]
                        while (true) {
                            try {
                                //read metadata
                                let metadata = await nftContract.getTokenMetadata(tokenId)
                                tokenMetadatas.push(metadata)
                                break
                            } catch (e) {
                                randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height)
                                nftContract.nodeAddress = randomGoodRPC
                                console.error(e.toString())
                            }
                        }
                    }

                    let toChainId = CasperHelper.findArgParsed(args, "to_chainid");
                    let receiverAddress = CasperHelper.findArgParsed(args, "receiver_address");
                    let requestId = CasperHelper.findArgParsed(args, "request_id");
                    let index = await nftContract.getIndexFromRequestId(requestId)

                    if (parseInt(index) == 0) {
                        throw "RPC error";
                    }

                    logger.info("Casper Network Request: %s", deploy.hash);
                    if (!tokenData.originChainId) {
                        throw "Missconfigued for token " + tokenData.originContractAddress
                    }
                    if (!tokenData.originSymbol) {
                        throw "Missconfigued for token symbol " + tokenData.originContractAddress
                    }
                    if (!tokenData.originName) {
                        throw "Missconfigued for token name " + tokenData.originContractAddress
                    }
                    let ret =
                    {
                        index,
                        fromChainId: casperConfig.networkId,
                        toChainId,
                        originChainId: tokenData.originChainId,
                        originToken: tokenData.originContractAddress,
                        deployHash: deploy.hash,
                        height: height,
                        receiverAddress: receiverAddress,
                        txCreator,
                        originSymbol: tokenData.originSymbol,
                        originName: tokenData.originName,
                        tokenIds,
                        identifierMode,
                        tokenMetadatas
                    }
                    return ret
                }
            } else if (storedContractByHash.hash == nftConfig.nftbridge) {
                if (entryPoint == "request_bridge_nft") {
                    let randomGoodRPC = await CasperHelper.getRandomGoodCasperRPCLink(height, randomGoodRPC)
                    let txCreator = "";
                    if (deploy.approvals.length > 0) {
                        txCreator = deploy.approvals[0].signer;
                        txCreator = CasperHelper.fromCasperPubkeyToAccountHash(txCreator);
                    }
                    let toChainId = CasperHelper.findArgParsed(args, "to_chainid");
                    let receiverAddress = CasperHelper.findArgParsed(args, "receiver_address");
                    let nftContractHash = CasperHelper.findArgParsed(args, "nft_contract_hash")
                    if (nftContractHash.Hash) {
                        nftContractHash = nftContractHash.Hash.slice(5)
                    }
                    nftContractHash = nftContractHash.toLowerCase()
                    let _tokenData = nftConfig.tokens.find(
                        (e) => e.contractHash.toLowerCase() == nftContractHash
                    );
                    if (!_tokenData) {
                        //unsupported token
                        return;
                    }

                    if (_tokenData.originChainId != casperConfig.networkId || _tokenData.originContractAddress != nftContractHash) {
                        logger.warn("invalid or unsupported token hash %s to bridge.", nftContractHash)
                        return;
                    }
                    let requestId = CasperHelper.findArgParsed(args, "request_id");
                    console.log('requestId', requestId)
                    const nftBridge = new NFTBridge(nftConfig.nftbridge, randomGoodRPC, casperConfig.chainName)
                    await nftBridge.init()

                    let requestData = await nftBridge.getIndexFromRequestId(requestId)
                    console.log('requestData', requestData)
                    requestData = JSON.parse(requestData)

                    let tokenIds = requestData.token_ids
                    let identifierMode = requestData.identifier_mode
                    if (identifierMode != 0) {
                        tokenIds = requestData.token_hashes
                    }

                    let index = requestData.request_index
                    if (parseInt(index) == 0) {
                        throw "RPC error";
                    }

                    let nftSymbol = _tokenData.originSymbol
                    let nftName = _tokenData.originName
                    let nftContract = {}
                    if (!nftSymbol || !nftName) {
                        nftContract = await DTOWrappedNFT.createInstance(nftContractHash, randomGoodRPC, casperConfig.chainName)
                        await nftContract.init()
                        nftSymbol = await nftContract.collectionSymbol()
                        nftName = await nftContract.collectionName()
                    }

                    let tokenMetadatas = []
                    for (var i = 0; i < tokenIds.length; i++) {
                        let tokenId = tokenIds[i]
                        while (true) {
                            try {
                                //read metadata
                                let metadata = await nftContract.getTokenMetadata(tokenId)
                                tokenMetadatas.push(metadata)
                                break
                            } catch (e) {
                                nftContract.nodeAddress = randomGoodRPC
                                console.error(e.toString())
                            }
                        }
                    }

                    logger.info("Casper Network Request: %s", deploy.hash);

                    let ret =
                    {
                        index,
                        fromChainId,
                        toChainId,
                        originChainId: casperConfig.networkId,
                        originToken: nftContractHash,
                        deployHash: deploy.hash,
                        height: height,
                        receiverAddress: receiverAddress,
                        txCreator,
                        originSymbol: nftSymbol,
                        originName: nftName,
                        tokenIds,
                        identifierMode,
                        tokenMetadatas
                    }

                    return ret
                }
            }
        }

        return null
    }
}

module.exports = CasperHelper;
