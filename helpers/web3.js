const Web3 = require('web3')
const config = require('config')
const logger = require('./logger')

let Web3Util = {
  getWeb3: async (networkId) => {
    return new Web3(new Web3.providers.HttpProvider(config.get('blockchain')[networkId].httpProvider))
  },

  getWeb3Socket: async (networkId) => {
    return new Web3(new Web3.providers.WebsocketProvider(config.get('blockchain')[networkId].wsProvider))
  }
}

module.exports = Web3Util
