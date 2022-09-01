const config = require('config')
const Web3Util = require('./web3')
const db = require('../models')

const EventHelper = {
  getRequestEvent: async (networkId, txHash, txIndex) => {
    let result = {}
    try {
      let web3 = await Web3Util.getWeb3(networkId)
      let tx = await web3.eth.getTransactionReceipt(txHash)
      let logs = tx.logs
      for (let i = 0; i < logs.length; i++) {
        let log = logs[i]
        if (log.topics[0] === '0xc210de9a5a98ab6c6b579b8d4b8003cce89c8ec3ff669ff2481d63172e00779b') {
          let data = log.data.replace('0x', '')
          let token = log.topics[1].replace('0x', '').substring(24)
          let decoded = web3.eth.abi.decodeParameters([
            {type: "bytes", name: "toAddr"},
            {type: "uint256", name: "amount"},
            {type: "uint256", name: "originChainId"},
            {type: "uint256", name: "fromChainId"},
            {type: "uint256", name: "toChainId"},
            {type: "uint256", name: "index"}
          ], data)
          decoded.token = token

          let originToken = decoded.token.toLowerCase()
          let toAddrBytes = decoded.toAddr
          let decodedAddress = web3.eth.abi.decodeParameters(
            [{ type: "string", name: "decodedAddress" }],
            toAddrBytes
          );
          let account = decodedAddress.decodedAddress.toLowerCase()
          let amount = decoded.amount
          let originChainId = parseInt(decoded.originChainId)
          let fromChainId = parseInt(decoded.fromChainId)
          let toChainId = parseInt(decoded.fromChainId)
          let index = parseInt(decoded.index)
          if (!txIndex || index === parseInt(txIndex)) {
            result = {
              requestHash: txHash,
              requestBlock: log.blockNumber,
              account: account,
              originToken: originToken,
              fromChainId: fromChainId,
              originChainId: originChainId,
              toChainId: toChainId,
              amount: amount,
              index: index,
            }
            if (!txIndex) {
              return result
            }
          }
        }
      }
    } catch (e) {
      console.log(e)
    }
    return result
  },
  getRequestNft721Event: async (networkId, txHash, txIndex) => {
    let result = {}
    try {
      let web3 = await Web3Util.getWeb3(networkId)
      let tx = await web3.eth.getTransactionReceipt(txHash)
      let logs = tx.logs
      for (let i = 0; i < logs.length; i++) {
        let log = logs[i]
        if (log.topics[0] === '0x00d12e72789dde3fcb0c020e7ca91e1b9caec588f827e2cb37b00fdb73b07177') {
          let data = log.data.replace('0x', '')
          if (log.address.toLowerCase() != config.contracts[`${networkId}`].nft721.toLowerCase()) {
            result.invalidTarget = true
            continue
          }
          /*
          _tokenAddress,
          _toAddr,
          abi.encode(_tokenIds),
          chainId,
          chainId,
          _toChainId,
          index
           */
          let decoded = web3.eth.abi.decodeParameters([
            {type: "bytes", name: "token"},
            {type: "bytes", name: "toAddr"},
            {type: "bytes", name: "tokenIds"},
            {type: "uint256", name: "originChainId"},
            {type: "uint256", name: "fromChainId"},
            {type: "uint256", name: "toChainId"},
            {type: "uint256", name: "index"}
          ], data)
          let originToken = decoded.token.toLowerCase()
          let toAddrBytes = decoded.toAddr
          decoded.tokenIds = web3.eth.abi.decodeParameter(
            'uint256[]',
            decoded.tokenIds,
          ).join(',')

          let account = toAddrBytes.toLowerCase()
          let originChainId = parseInt(decoded.originChainId)
          let fromChainId = parseInt(decoded.fromChainId)
          let toChainId = parseInt(decoded.fromChainId)
          let index = parseInt(decoded.index)
          console.log('index', index, txIndex)

          if (!txIndex || index === parseInt(txIndex)) {
            result = {
              requestHash: txHash,
              requestBlock: log.blockNumber,
              account: account,
              originToken: originToken,
              fromChainId: fromChainId,
              originChainId: originChainId,
              toChainId: toChainId,
              tokenIds: decoded.tokenIds,
              index: index,
            }
            if (!txIndex) {
              return result
            }
          }
        }
      }
    } catch (e) {
      console.log(e)
    }
    return result
  },
}

module.exports = EventHelper
