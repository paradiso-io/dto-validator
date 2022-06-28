let config = require('config')
let casperHelper = require('../helpers/casper')
let Web3Helper = require('../helpers/web3')
let ERC20ABI = require('../contracts/ERC20.json')
let BigNumber = require('bignumber.js')
let generalHelper = require('../helpers/general')
const { ERC20Client } = require('casper-erc20-js-client')
const exchangeHelper = require('./readPrice')
const db = require('../models')
const TVLHelper = {
    computeTVLForToken: async () => {
        let tokenConfigInfo = casperHelper.getConfigInfo();
        let supportedEVMChains = config.crawlChainIds
        let tokens = tokenConfigInfo.tokens
        let bridgeContracts = config.contracts
        let balances = {}
        let decimals = {}
        let addTokens = []
        let tvl = 0
        for (const token of tokens) {
            console.log('token', token)
            if (supportedEVMChains.includes(token.originChainId)) {
                let originContractAddress = token.originContractAddress
                if (originContractAddress == "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2") {
                    continue
                }
                let web3 = await Web3Helper.getWeb3(token.originChainId)
                let tokenSymbol = token.symbol
                let tokenBalance = '0'
                let bridgeContractAddress = bridgeContracts[`${token.originChainId}`].bridge
                if (token.originContractAddress === "0x1111111111111111111111111111111111111111") {
                    tokenBalance = await web3.eth.getBalance(bridgeContractAddress)
                } else {
                    console.log('originContractAddress', originContractAddress)
                    let originTokenContract = await new web3.eth.Contract(ERC20ABI, originContractAddress)
                    tokenSymbol = await originTokenContract.methods.symbol().call()
                    console.log('tokenSymbol', tokenSymbol)
                    tokenBalance = await originTokenContract.methods.balanceOf(bridgeContractAddress).call()
                    console.log('tokenBalance', tokenBalance)
                }
                
                console.log('token ', tokenSymbol, tokenBalance)
                tokenSymbol = tokenSymbol.toLowerCase()
                addTokens.push(tokenSymbol)
                //reading balance from casper contract
                const erc20 = new ERC20Client(
                    casperHelper.getRandomCasperRPCLink(),
                    tokenConfigInfo.chainName,
                    tokenConfigInfo.eventStream,
                )

                await erc20.setContractHash(
                    token.contractHash
                )
                let supply = await erc20.totalSupply()
                supply = supply.toString()

                console.log('token on casper ', supply)

                let total = new BigNumber(supply).plus(tokenBalance).toString()
                decimals[tokenSymbol] = token.decimals
                balances[tokenSymbol] = total
            }
        }

        console.log(balances)

        //reading prices
        let priceMap = await exchangeHelper.readPrices(addTokens)
        for(const token of Object.keys(balances)) {
            let tokenInPriceMap = token.toLowerCase()
            let price = priceMap[tokenInPriceMap]
            let balance = balances[token]
            let value = new BigNumber(balance).multipliedBy(`${price}`).dividedBy(`1e${decimals[token]}`).dividedBy('1e8').toFixed(0)
            tvl += parseInt(value)
        }
        return tvl
    }
}

async function main() {
    let tvl = await TVLHelper.computeTVLForToken();
    console.log('tvl', tvl)
    await db.TVL.updateOne(
        {},
        {
            tvl: tvl,
            lastUpdatedTimestamp: generalHelper.now()
        },
        {upsert: true, new: true}
    )
    process.exit(0)
}

main()