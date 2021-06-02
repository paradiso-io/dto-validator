const Web3Util = require('./web3')

const TokenHelper = {
  getToken:async (hash, networkId) => {
    let token = await db.Token.findOne({hash: hash, networkId: networkId})
    if (token) {
      return token
    }

    const web3 = await Web3Util.getWeb3(networkId)
    let tokenFuncs = {
      decimals: '0x313ce567', // hex to decimal
      symbol: '0x95d89b41', // hex to ascii
      totalSupply: '0x18160ddd',
      transfer: '0xa9059cbb',
      name: '0x06fdde03'
    }
    let name = await web3.eth.call({ to: hash, data: tokenFuncs.name })
    name = await TokenHelper.removeXMLInvalidChars(await web3.utils.toUtf8(name))

    let symbol = await web3.eth.call({ to: hash, data: tokenFuncs.symbol })
    symbol = await TokenHelper.removeXMLInvalidChars(await web3.utils.toUtf8(symbol))

    let decimals = await web3.eth.call({ to: hash, data: tokenFuncs.decimals })
    decimals = await web3.utils.hexToNumberString(decimals)


    let totalSupply = await web3.eth.call({ to: hash, data: tokenFuncs.totalSupply })
    totalSupply = await web3.utils.hexToNumberString(totalSupply).trim()
    let totalSupplyNumber = new BigNumber(totalSupply).div(10 ** parseInt(decimals))

    try {
      return await db.Token.findOneAndUpdate({hash: hash, networkId: networkId}, {
        totalSupply: totalSupplyNumber.toNumber(),
        symbol: symbol,
        decimals: decimals,
        name: name,
      }, {upsert: true, new: true})
    } catch (e) {
      return await db.Token.findOne({hash: hash, networkId: networkId})
    }
  },
}

module.exports = TokenHelper
