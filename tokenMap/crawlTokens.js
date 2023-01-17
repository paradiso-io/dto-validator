let config = require('config')
let casperHelper = require('../helpers/casper')
let Web3Helper = require('../helpers/web3')
let ERC20ABI = require('../contracts/ERC20.json')
let BigNumber = require('bignumber.js')
let generalHelper = require('../helpers/general')
const db = require('../models')
const Helper = {
    getTokenInfo: async (token) => {
        let supportedEVMChains = config.crawlChainIds[config.caspernetwork]
        //reading token info
        // {
        //     "name": "ETH",
        //     "symbol": "ETH",
        //     "decimals": 18,
        //     "originChainId": 42,
        //     "fee": "1000000000000000",
        //     "originContractAddress": "0x1111111111111111111111111111111111111111",
        //     "contractHash": "71a4fb803b350cb76f73f9bde7f4a7d4ac6157dada5075d5b76815bc3c4f285c"
        //   },
        let name = token.name
        let symbol = token.symbol
        let decimals = token.decimals
        let networkId = token.originChainId
        let address = token.originContractAddress.toLowerCase()

        let mapInfo = {}
        //creating mapInfo
        for (const chainId of supportedEVMChains) {
            let trial = 20
            while (trial > 0) {
                try {
                    if (chainId != networkId) {
                        let bridgeContract = await Web3Helper.getBridgeContract(chainId)
                        let bridgedToken = await bridgeContract.methods.tokenMap(networkId, address).call()
                        if (bridgedToken != "0x0000000000000000000000000000000000000000") {
                            mapInfo[chainId] = {
                                address: bridgedToken,
                                networkId: chainId,
                                name: name,
                                symbol: "d" + symbol,
                                decimals: decimals
                            }
                        }
                    }
                    break
                } catch (e) {
                    console.error(e.toString())
                    await generalHelper.sleep(5 * 1000)
                }
                trial--
            }
        }

        //update for casper
        let tokenConfigInfo = casperHelper.getConfigInfo();
        mapInfo[tokenConfigInfo.networkId] = {
            address: token.contractHash,
            networkId: tokenConfigInfo.networkId,
            name: name,
            symbol: "d" + symbol,
            decimals: decimals
        }

        //update database
        await db.TokenMap.updateOne(
            { address: address, networkId: networkId },
            {
                $set: {
                    address: address,
                    networkId: networkId,
                    name: name,
                    symbol: symbol,
                    decimals: decimals,
                    mapInfo: mapInfo
                }
            },
            { upsert: true, new: true }
        )
    },
    getAllTokenInfos: async () => {
        {
            let tokenConfigInfo = casperHelper.getConfigInfo();
            let tokens = tokenConfigInfo.tokens
            for (const token of tokens) {
                console.log('token', token)
                await Helper.getTokenInfo(token)
            }
        }
        // get NFTs info
        {
            let tokenConfigInfo = casperHelper.getNFTConfig()
            let tokens = tokenConfigInfo.tokens
            for (const token of tokens) {
                console.log('token', token)
                await Helper.getTokenInfo(token)
            }
        }
    }
}

async function main() {
    let tvl = await Helper.getAllTokenInfos();
    process.exit(0)
}

main()