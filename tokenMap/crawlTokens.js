let config = require('config')
let casperHelper = require('../helpers/casper')
let Web3Helper = require('../helpers/web3')
const db = require('../models')
const logger = require('../helpers/logger')
const GeneralHelper = require('../helpers/general')
const UPDATE_PERIOD = 120
const Helper = {
    fetchWrappedToken: async (originToken, chainId, originChainId) => {
        const bridgeContract = await Web3Helper.getBridgeContract(chainId)
        const bridgedToken = await bridgeContract.methods.tokenMap(originChainId, originToken).call()
        return bridgedToken
    },
    getTokenInfo: async (token) => {
        let supportedEVMChains = config.crawlChainIds[config.caspernetwork]
        let name = token.name
        let symbol = token.symbol
        let decimals = token.decimals
        let networkId = token.originChainId
        let address = token.originContractAddress.toLowerCase()

        const tokenMap = await db.TokenMap.findOne({ address: address, networkId: networkId })
        const needsUpdate = !tokenMap || !tokenMap.lastUpdated || tokenMap.lastUpdated + UPDATE_PERIOD < Math.floor(Date.now() / 1000)
        if (!needsUpdate) {
            logger.warn("update is scheluded every %s second", UPDATE_PERIOD)
            return
        }
        const mapInfo = tokenMap ? tokenMap.mapInfo : {}
        //creating mapInfo
        for (const chainId of supportedEVMChains) {
            await GeneralHelper.tryCallWithTrial(async () => {
                if (chainId != networkId) {
                    if (!mapInfo[chainId]) {
                        const bridgedToken = await Helper.fetchWrappedToken(address, chainId, networkId)
                        if (bridgedToken != "0x0000000000000000000000000000000000000000") {
                            mapInfo[chainId] = {
                                address: bridgedToken,
                                networkId: chainId,
                                name: name,
                                symbol: symbol,
                                decimals: decimals
                            }
                        }
                    }
                }
                return mapInfo[chainId] ? mapInfo[chainId].address : undefined
            }, 5, 5)
        }

        //update for casper
        const tokenConfigInfo = casperHelper.getConfigInfo();
        mapInfo[tokenConfigInfo.networkId] = {
            address: token.contractHash,
            networkId: tokenConfigInfo.networkId,
            name: name,
            symbol: symbol,
            decimals: decimals
        }

        return mapInfo
    },
    getAllTokenInfos: async () => {
        {
            let tokenConfigInfo = casperHelper.getConfigInfo();
            let tokens = tokenConfigInfo.tokens
            for (const token of tokens) {
                const mapInfo = await Helper.getTokenInfo(token)
                const address = token.originContractAddress.toLowerCase()
                const networkId = token.originChainId
                //update database
                await db.TokenMap.updateOne(
                    { address: address, networkId: networkId },
                    {
                        $set: {
                            address: address,
                            networkId: networkId,
                            name: token.name,
                            symbol: token.symbol,
                            decimals: token.decimals,
                            mapInfo: mapInfo,
                            lastUpdated: Math.floor(Date.now() / 1000)
                        }
                    },
                    { upsert: true, new: true }
                )
            }
        }

        {
            const supportedEVMChains = config.crawlChainIds[config.caspernetwork]
            // update token map for tokens issued on Casper
            const casperConfig = casperHelper.getConfigInfo()
            const pairs = casperConfig.pairedTokensToEthereum.pairs
            for (const pair of pairs) {
                const tokenMap = await db.TokenMap.findOne({ address: pair.contractPackageHash, networkId: pair.originChainId })
                const needsUpdate = !tokenMap || !tokenMap.lastUpdated || tokenMap.lastUpdated + UPDATE_PERIOD < Math.floor(Date.now() / 1000)
                if (!needsUpdate) {
                    logger.warn("update is scheluded every %s second", UPDATE_PERIOD)
                    continue
                }
                const mapInfo = tokenMap ? tokenMap.mapInfo : {}
                for (const chainId of supportedEVMChains) {
                    await GeneralHelper.tryCallWithTrial(async () => {
                        if (chainId != pair.evmChainId) {
                            if (!mapInfo[chainId]) {
                                let bridgeContract = await Web3Helper.getBridgeContract(chainId)
                                let bridgedToken = await bridgeContract.methods.tokenMap(pair.evmChainId, pair.contractAddress).call()
                                if (bridgedToken != "0x0000000000000000000000000000000000000000") {
                                    mapInfo[chainId] = {
                                        address: bridgedToken,
                                        networkId: chainId,
                                        name: pair.name,
                                        symbol: "d" + pair.symbol,
                                        decimals: pair.decimals
                                    }
                                }
                            }
                        }
                        return mapInfo[chainId] ? mapInfo[chainId].address : undefined
                    }, 5, 5)
                }

                mapInfo[pair.originChainId] = {
                    address: pair.contractPackageHash,
                    networkId: pair.originChainId,
                    name: pair.name,
                    symbol: pair.symbol,
                    decimals: pair.decimals
                }

                mapInfo[pair.evmChainId] = {
                    address: pair.contractAddress,
                    networkId: pair.evmChainId,
                    name: pair.name,
                    symbol: pair.symbol,
                    decimals: pair.decimals
                }

                //update database
                await db.TokenMap.updateOne(
                    { address: pair.contractPackageHash, networkId: pair.originChainId },
                    {
                        $set: {
                            name: pair.name,
                            symbol: pair.symbol,
                            decimals: pair.decimals,
                            mapInfo: mapInfo,
                            lastUpdated: Math.floor(Date.now() / 1000)
                        }
                    },
                    { upsert: true, new: true }
                )
            }

        }
        // // get NFTs info
        // {
        //     let tokenConfigInfo = casperHelper.getNFTConfig()
        //     let tokens = tokenConfigInfo.tokens
        //     for (const token of tokens) {
        //         console.log('token', token)
        //         await Helper.getTokenInfo(token)
        //     }
        // }
    }
}

async function update() {
    return await Helper.getAllTokenInfos()
}

module.exports = {
    update
}