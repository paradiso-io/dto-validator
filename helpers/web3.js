const Web3 = require('web3')
const config = require('config')
const logger = require('./logger')
const PrivateKeyProvider = require('truffle-privatekey-provider')
require('dotenv').config()


let Web3Util = {
  getWeb3: async (networkId) => {
    return new Web3(new Web3.providers.HttpProvider(config.blockchain[networkId].httpProvider))
  },
  getWeb3WithPrivateKey: async (networkId) => {
    let key = process.env.PRIVATE_KEY
    if (key.startsWith('0x')) {
      key = key.substring(2)
    }
    return new Web3(await new PrivateKeyProvider(key, config.blockchain[networkId].httpProvider))
  },

  getWeb3Socket: async (networkId) => {
    return new Web3(new Web3.providers.WebsocketProvider(config.get('blockchain')[networkId].wsProvider))
  }
}

module.exports = Web3Util
