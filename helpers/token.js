const Web3Util = require('./web3')
const db = require('../models')
const BigNumber = require('bignumber.js')
const ERC20 = require('../contracts/ERC20.json')

const TokenHelper = {

  /**
   * get token info by contract code
   * @param hash token hash
   * @param networkId network id (or chain id) of EVM a network
   *
   * @return token object
   */
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
  getTokenSymbol:async (hash, networkId) => {
    const web3 = await Web3Util.getWeb3(networkId)
    let contract = new web3.eth.Contract(ERC20, hash)

    return contract.methods.symbol().call()
  },
  removeXMLInvalidChars: async (string, removeDiscouragedChars = true) => {
    // remove everything forbidden by XML 1.0 specifications, plus the unicode replacement character U+FFFD
    /* eslint-disable max-len */
    let regex = /((?:[\0-\x08\x0B\f\x0E-\x1F\uFFFD\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]))/g // eslint-disable-line no-control-regex
    string = string.replace(regex, '')

    if (removeDiscouragedChars) {
      // remove everything not suggested by XML 1.0 specifications

      regex = new RegExp(
          '([\\x7F-\\x84]|[\\x86-\\x9F]|[\\uFDD0-\\uFDEF]|(?:\\uD83F[\\uDFFE\\uDFFF])|(?:\\uD87F[\\uDF' +
          'FE\\uDFFF])|(?:\\uD8BF[\\uDFFE\\uDFFF])|(?:\\uD8FF[\\uDFFE\\uDFFF])|(?:\\uD93F[\\uDFFE\\uD' +
          'FFF])|(?:\\uD97F[\\uDFFE\\uDFFF])|(?:\\uD9BF[\\uDFFE\\uDFFF])|(?:\\uD9FF[\\uDFFE\\uDFFF])' +
          '|(?:\\uDA3F[\\uDFFE\\uDFFF])|(?:\\uDA7F[\\uDFFE\\uDFFF])|(?:\\uDABF[\\uDFFE\\uDFFF])|(?:\\' +
          'uDAFF[\\uDFFE\\uDFFF])|(?:\\uDB3F[\\uDFFE\\uDFFF])|(?:\\uDB7F[\\uDFFE\\uDFFF])|(?:\\uDBBF' +
          '[\\uDFFE\\uDFFF])|(?:\\uDBFF[\\uDFFE\\uDFFF])(?:[\\0-\\t\\x0B\\f\\x0E-\\u2027\\u202A-\\uD7FF\\' +
          'uE000-\\uFFFF]|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|' +
          '(?:[^\\uD800-\\uDBFF]|^)[\\uDC00-\\uDFFF]))', 'g')
      string = string.replace(regex, '')
    }

    return string.trim()
  },
}

module.exports = TokenHelper
