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
        let mapInfo = tokenMap ? tokenMap.mapInfo : {}
        mapInfo = mapInfo ? mapInfo : {}
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
            // update token map for tokens issued on Casper
            const casperConfig = casperHelper.getConfigInfo()
            const supportedEVMChains = config.crawlChainIds[config.caspernetwork]
            const pairs = casperConfig.pairedTokensToEthereum.pairs
            for (const pair of pairs) {
                const tokenMap = await db.TokenMap.findOne({ address: pair.contractPackageHash, networkId: pair.originChainId })
                const needsUpdate = !tokenMap || !tokenMap.lastUpdated || tokenMap.lastUpdated + UPDATE_PERIOD < Math.floor(Date.now() / 1000)
                if (!needsUpdate) {
                    logger.warn("update is scheluded every %s second", UPDATE_PERIOD)
                    continue
                }
                let mapInfo = tokenMap ? tokenMap.mapInfo : {}
                mapInfo = mapInfo ? mapInfo : {}
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
        // get NFTs info
        {   
            const web3 = Web3Helper.getSimpleWeb3()
            const supportedEVMChains = config.crawlChainIds[config.caspernetwork == 'testnet' ? 'nft721testnet' : 'nft721mainnet']
            let casperConfig = casperHelper.getConfigInfo();
            let nftConfig = casperHelper.getNFTConfig()
            let tokensOriginatedFromCasper = nftConfig.tokens.filter(e => e.originChainId == casperConfig.networkId)
            for (const token of tokensOriginatedFromCasper) {
                const tokenMap = await db.TokenMap.findOne({ address: token.contractPackageHash, networkId: token.originChainId })
                const needsUpdate = !tokenMap || !tokenMap.lastUpdated || tokenMap.lastUpdated + UPDATE_PERIOD < Math.floor(Date.now() / 1000)
                if (!needsUpdate) {
                    logger.warn("update is scheluded every %s second", UPDATE_PERIOD)
                    continue
                }
                let mapInfo = tokenMap ? tokenMap.mapInfo : {}
                mapInfo = mapInfo ? mapInfo : {}
                for (const chainId of supportedEVMChains) {
                    await GeneralHelper.tryCallWithTrial(async () => {
                        if (!mapInfo[chainId]) {
                            const bridgeContract = await Web3Helper.getNft721BridgeContract(chainId)
                            const bytesOriginToken = web3.eth.abi.encodeParameters(["string"], [token.contractPackageHash])
                            const bridgedToken = await bridgeContract.methods.tokenMap(token.originChainId, bytesOriginToken).call()
                            if (bridgedToken != "0x0000000000000000000000000000000000000000") {
                                mapInfo[chainId] = {
                                    address: bridgedToken,
                                    networkId: chainId,
                                    name: token.originName,
                                    symbol: token.originSymbol,
                                    decimals: 0 // decimals default to 0 for nfts
                                }
                            }
                        }

                        return mapInfo[chainId] ? mapInfo[chainId].address : undefined
                    }, 5, 5)
                }

                mapInfo[token.originChainId] = {
                    address: token.contractPackageHash,
                    networkId: token.originChainId,
                    name: token.originName,
                    symbol: token.originSymbol,
                    decimals: 0
                }

                //update database
                await db.TokenMap.updateOne(
                    { address: token.contractPackageHash, networkId: token.originChainId },
                    {
                        $set: {
                            name: token.originName,
                            symbol: token.originSymbol,
                            decimals: 0,
                            mapInfo: mapInfo,
                            lastUpdated: Math.floor(Date.now() / 1000)
                        }
                    },
                    { upsert: true, new: true }
                )
            }
        }

        {
            const web3 = Web3Helper.getSimpleWeb3()
            const supportedEVMChains = config.crawlChainIds[config.caspernetwork == 'testnet' ? 'nft721testnet' : 'nft721mainnet']
            let casperConfig = casperHelper.getConfigInfo();
            let nftConfig = casperHelper.getNFTConfig()
            let tokensOriginatedFromEVM = nftConfig.tokens.filter(e => e.originChainId != casperConfig.networkId)
            for (const token of tokensOriginatedFromEVM) {
                const tokenMap = await db.TokenMap.findOne({ address: token.originContractAddress, networkId: token.originChainId })
                const needsUpdate = !tokenMap || !tokenMap.lastUpdated || tokenMap.lastUpdated + UPDATE_PERIOD < Math.floor(Date.now() / 1000)
                if (!needsUpdate) {
                    logger.warn("update is scheluded every %s second", UPDATE_PERIOD)
                    continue
                }
                let mapInfo = tokenMap ? tokenMap.mapInfo : {}
                mapInfo = mapInfo ? mapInfo : {}
                for (const chainId of supportedEVMChains) {
                    await GeneralHelper.tryCallWithTrial(async () => {
                        if (!mapInfo[chainId]) {
                            const bridgeContract = await Web3Helper.getNft721BridgeContract(chainId)
                            const bytesOriginToken = web3.eth.abi.encodeParameters(["address"], [token.originContractAddress])
                            const bridgedToken = await bridgeContract.methods.tokenMap(token.originChainId, bytesOriginToken).call()
                            if (bridgedToken != "0x0000000000000000000000000000000000000000") {
                                mapInfo[chainId] = {
                                    address: bridgedToken,
                                    networkId: chainId,
                                    name: token.originName,
                                    symbol: token.originSymbol,
                                    decimals: 0 // decimals default to 0 for nfts
                                }
                            }
                        }

                        return mapInfo[chainId] ? mapInfo[chainId].address : undefined
                    }, 5, 5)
                }

                mapInfo[casperConfig.networkId] = {
                    address: token.contractPackageHash,
                    networkId: token.originChainId,
                    name: token.originName,
                    symbol: token.originSymbol,
                    decimals: 0
                }

                //update database
                await db.TokenMap.updateOne(
                    { address: token.originContractAddress, networkId: token.originChainId },
                    {
                        $set: {
                            name: token.originName,
                            symbol: token.originSymbol,
                            decimals: 0,
                            mapInfo: mapInfo,
                            lastUpdated: Math.floor(Date.now() / 1000)
                        }
                    },
                    { upsert: true, new: true }
                )
            }
        }

        logger.info("Updated token map")
    }
}

async function update() {
    return await Helper.getAllTokenInfos()
}

module.exports = {
    update
}