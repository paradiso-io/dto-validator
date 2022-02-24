const config = require('config')
const { CLPublicKey, CLPublicKeyTag } = require("casper-js-sdk");

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
    }
}

module.exports = CasperHelper;
