const config = require('./exchangeConfig.json')
const exchangeHelper = require('./exchange')
function capitalize(string) {
    return string[0].toUpperCase() + string.slice(1);
}
let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))

async function readPrices(addTokens) {
    if (!addTokens) {
        addTokens = []
    }

    let tokenMap = addTokens.map(async token => {
        let price = await exchangeHelper.getPriceFromCGK(config.tokenOnExchangeMap[token])

        return { token: token, price: [price] }
    })
    let result = await Promise.all(tokenMap)
    let priceMap = {}
    result.forEach(item => {
        console.log('item', item)
        let price = 1
        if (item.token != 'usdt') {
            price = (item.price.reduce((a, b) => a + b, 0)) / item.price.filter(x => x !== null && x != 0).length
        }
        price = Math.floor(price * 100000000)
        priceMap[item.token.toLowerCase()] = price
    })
    return priceMap
}

module.exports = {
    readPrices
}