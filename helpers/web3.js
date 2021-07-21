const Web3 = require('web3')
const config = require('config')

let Web3Util = {
  getWeb3: async (networkId) => {
    return new Web3(new Web3.providers.HttpProvider(config.blockchain[networkId].httpProvider))
  },
  getWeb3Socket: async (networkId) => {
    return new Web3(new Web3.providers.WebsocketProvider(config.get('blockchain')[networkId].wsProvider))
  },
  signClaim: (_originToken, _to, _amount, _chainIdsIndex, _txHash, _name, _symbol, _decimals) => {
    let web3 = new Web3()
    let signer = config.signer
    let encoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256[]', 'bytes32', 'string', 'string', 'uint8'], [_originToken, _to, _amount, _chainIdsIndex, _txHash, _name, _symbol, _decimals])
    let msgHash = web3.utils.sha3(encoded);
    let sig = web3.eth.accounts.sign(msgHash, signer);
    return {msgHash: msgHash, r: sig.r, s: sig.s, v: sig.v}
  }
}

module.exports = Web3Util
