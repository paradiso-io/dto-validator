const Web3Utils = require('./web3')
const config = require('config')
const ManagerABI = require('../contracts/CandidateManager.json')
const CandidateABI = require('../contracts/CandidateContract.json')

let Contract = {
  getManager: async () => {
    let web3 = await Web3Utils.getWeb3()
    return new web3.eth.Contract(ManagerABI, config.get('ManagerAddress'))
  },

  getCandidate: async (candidate) => {
    let web3 = await Web3Utils.getWeb3()
    return new web3.eth.Contract(CandidateABI, candidate)

  },
  getManagerWs: async () => {
    let web3 = await Web3Utils.getWeb3Socket()
    return  new web3.eth.Contract(ManagerABI, config.get('ManagerAddress'))
  },

  getCandidateWs: async (candidate) => {
    let web3 = await Web3Utils.getWeb3Socket()
    return new web3.eth.Contract(CandidateABI, candidate)
  }
}

module.exports = Contract
