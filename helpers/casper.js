const config = require('config')
const { CLPublicKey, CLPublicKeyTag, CasperServiceByJsonRPC, CLListBytesParser, CLListType, CLType, CLStringType, CLU8BytesParser, CLStringBytesParser, CLKeyBytesParser, CLU256BytesParser } = require("casper-js-sdk");

const { ERC20Client } = require('casper-erc20-js-client')
const BigNumber = require("bignumber.js");
let { DTOWrappedNFT, NFTBridge } = require("casper-nft-utils")
const logger = require("./logger");
const CWeb3 = require('casper-web3')


const CasperHelper = {
    /* Getting the config info from the config file. */
    getConfigInfo: () => {
        let network = config.caspernetwork;
        const CasperContractConfig = require("../casper-contract-hash/config.json")
        return CasperContractConfig[network]
    },
    /* Getting the RPC link from the config file. */
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
    /* To get a good RPC link. */
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
                    logger.warn("selecting RPC %s", rpc)
                    return rpc
                }
            } catch (e) {

            }
            rpcList.splice(random, 1)
        }
        return ""
    },
    /* Getting the fee of the token. */
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
    /* Getting the MPC public key from the config file. */
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
        let token
        if (originChainId != casperConfig.networkId) {
            let tokens = casperConfig.tokens
            token = tokens.find((e) => e.originContractAddress.toLowerCase() == originTokenAddress.toLowerCase() && e.originChainId == originChainId)
        } else {
            let pairs = casperConfig.pairedTokensToEthereum.pairs
            token = pairs.find((e) => e.contractPackageHash.toLowerCase() == originTokenAddress.toLowerCase())
        }
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
        logger.log("args: %s, argName: %s, arg: %s", args, argName, arg)
        return arg[1].parsed
    },
    getCasperRPC: async (height = 1) => {
        let rpc = await CasperHelper.getRandomGoodCasperRPCLink(height)
        return new CasperServiceByJsonRPC(rpc)
    },
    fromCasperPubkeyToAccountHash: (clPubkeyHex) => {
        let clPubkey = CLPublicKey.fromHex(clPubkeyHex);
        return `account-hash-${Buffer.from(clPubkey.toAccountHash()).toString('hex')}`
    },
    /* This function is used to parse the deploy result from Casper. */
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
    getAllWrapCep78ContractOnCasper: () => {
        let casperConfig = CasperHelper.getNFTConfig()
        let tokens = casperConfig.tokens
        let array = []
        for (var token of tokens) {
            let wrapContract = token.contractHash.toLowerCase()
            logger.info("wrap contract for networkId %s is %s ", token.originChainId, wrapContract)
            array.push(wrapContract)
        }
        return array
    },
    getNftBridgePkgAddress: () => {
        let casperConfig = CasperHelper.getNFTConfig()
        let nftBridge = casperConfig.nftBridgePackageHash
        return nftBridge
    },
    getHashFromKeyString: (k) => {
        const prefixIndex = k.startsWith('Key::Account(') ? 'Key::Account('.length : 'Key::Hash('.length
        return k.substring(prefixIndex, k.length - 1)
    },
    parseRequestBridgeDataFromContract: (rawData) => {
        // desearlize it
        let ret = new CLKeyBytesParser().fromBytesWithRemainder(rawData)
        let nftPackageHash = ret.result.val.value()
        nftPackageHash = Buffer.from(nftPackageHash.data).toString('hex')

        ret = new CLU8BytesParser().fromBytesWithRemainder(ret.remainder)
        let identifierMode = parseInt(ret.result.val.value().toString())

        ret = new CLU256BytesParser().fromBytesWithRemainder(ret.remainder)
        let toChainId = parseInt(ret.result.val.value().toString())

        ret = new CLU256BytesParser().fromBytesWithRemainder(ret.remainder)
        let requestIndex = parseInt(ret.result.val.value().toString())

        ret = new CLKeyBytesParser().fromBytesWithRemainder(ret.remainder)
        let from = ret.result.val.value()
        from = from.data ? Buffer.from(from.data).toString('hex') : ""
        from = `account-hash-${from}`
        ret = new CLStringBytesParser().fromBytesWithRemainder(ret.remainder)

        let to = ret.result.val.value()

        ret = new CLListBytesParser().fromBytesWithRemainder(ret.remainder, new CLListType(new CLStringType()))

        const tokenIds = ret.result.val.value().map(e => e.data)

        let retData = {
            nftPackageHash: nftPackageHash,
            identifierMode: identifierMode,
            toChainId: toChainId,
            requestIndex: requestIndex,
            from: from,
            to: to,
            tokenIds: tokenIds
        }
        return retData
    }





}

module.exports = CasperHelper;
