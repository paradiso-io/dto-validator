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
        if (log.topics[0] === '0x56e67c8e68bcd127d4be811709a5f04a9dbf3c7757868c0e5b9f554f175cb4fc') {
          let data = log.data.replace('0x', '')
          let params = []
          for (let i = 0; i < data.length / 64; i++) {
            params.push(data.substr(i * 64, 64))
          }
          let originToken = log.topics[1].replace('000000000000000000000000', '0x').toLowerCase()
          let account = log.topics[2].replace('000000000000000000000000', '0x').toLowerCase()
          let amount = web3.utils.hexToNumberString('0x' + params[0])
          let originChainId = web3.utils.hexToNumber('0x' + params[1])
          let fromChainId = web3.utils.hexToNumber('0x' + params[2])
          let toChainId = web3.utils.hexToNumber('0x' + params[3])
          let index = web3.utils.hexToNumber('0x' + params[4])

          if (index === txIndex) {
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
          }
        }
      }
    } catch (e) {
      console.log(e)
    }
    return result
  }
}

module.exports = EventHelper
