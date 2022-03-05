const config = require('config')
const { CLPublicKey, CLPublicKeyTag, CasperServiceByJsonRPC } = require("casper-js-sdk");
const { ERC20Client } = require('casper-erc20-js-client')
const BigNumber = require("bignumber.js");

const CasperHelper = {
    getConfigInfo: () => {
        let network = config.caspernetwork;
        return config[network]
    },
    getMPCPubkey: () => {
        let casperConfig = CasperHelper.getConfigInfo()
        let mpcPubkey = casperConfig.mpcPubkey
        let byteArray = Buffer.from(mpcPubkey, 'hex')
        byteArray = Uint8Array.from(byteArray)
        return new CLPublicKey(byteArray, CLPublicKeyTag.SECP256K1)
    },
    getCasperTokenInfoFromOriginToken: (originTokenAddress, originChainId) => {
        let casperConfig = CasperHelper.getConfigInfo()
        let tokens = casperConfig.tokens
        let token = tokens.find((e) => e.originContractAddress.toLowerCase() == originTokenAddress.toLowerCase() && e.originChainId == originChainId)
        return token
    },
    findArg: (args, argName) => {
        return args.find((e) => e[0] == argName);
    },
    getCasperRPC: () => {
        let casperConfig = CasperHelper.getConfigInfo()
        return new CasperServiceByJsonRPC(casperConfig.rpc)
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

                            let timestamp = Date.parse(block.block.header.timestamp)

                            let eventData = {
                                token: tokenData.originContractAddress.toLowerCase(),
                                index: parseInt(id),
                                fromChainId: parseInt(casperConfig.networkId),
                                toChainId: parseInt(toChainId),
                                originChainId: tokenData.originChainId,
                                originToken: tokenData.originContractAddress.toLowerCase(),
                                transactionHash: h,
                                blockNumber: block.block.header.height,
                                toAddr: receiver_address,
                                amount: amount,
                                index: parseInt(id),
                                requestTime: Math.floor(timestamp / 1000),
                            };

                            return eventData
                        }
                    }
                }
            }
        }
        return null
    }
}

module.exports = CasperHelper;
