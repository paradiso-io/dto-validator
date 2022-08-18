const Web3 = require('web3')
const config = require('config')
const GenericBridgeABI = require('../contracts/GenericBridge.json')
const Nft721BridgeABI = require('../contracts/NFT721Bridge.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");

let Web3Util = {
  getWeb3: async (networkId) => {
    let both = await Web3Util.getWeb3AndRPC(networkId)
    return both.web3
  },
  getWeb3ForPrivateKey: async (networkId, privateKey) => {
    return new Web3(new PrivateKeyProvider(privateKey, Web3Util.getRandomRPC(networkId)));
  },
  getBridgeContract: async (networkId) => {
    let web3 = await Web3Util.getWeb3(networkId)
    return new web3.eth.Contract(GenericBridgeABI, config.contracts[`${networkId}`].bridge)
  },
  getNft721BridgeContract: async (networkId) => {
    let web3 = await Web3Util.getWeb3(networkId)
    return new web3.eth.Contract(Nft721BridgeABI, config.contracts[`${networkId}`].nft721)
  },
  getWeb3AndRPC: async (networkId) => {
    let rpc = Web3Util.getRandomRPC(networkId);
    return { web3: new Web3(new Web3.providers.HttpProvider(rpc)), rpc: rpc }
  },
  getRandomRPC: (networkId) => {
    let list = []
    if (Array.isArray(config.blockchain[networkId].httpProvider)) {
      list = config.blockchain[networkId].httpProvider
    } else {
      list.push(config.blockchain[networkId].httpProvider)
    }
    let len = list.length
    let random = Math.floor(Math.random() * len)
    let rpc = list[random]
    return rpc
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
    return { msgHash: msgHash, r: sig.r, s: sig.s, v: sig.v }
  },
  signClaimNft721: (_originToken, _toAddr, _tokenIds, _chainIdsIndex, _txHash, _name, _symbol, _tokenUris) => {
    let web3 = new Web3()
    let signer = config.signer
    let encoded = web3.eth.abi.encodeParameters(['bytes', 'address', 'uint256[]', 'uint256[]', 'bytes32', 'string', 'string', 'string[]'], [_originToken, _toAddr, _tokenIds, _chainIdsIndex, _txHash, _name, _symbol, _tokenUris])
    let msgHash = web3.utils.sha3(encoded);
    let sig = web3.eth.accounts.sign(msgHash, signer);
    return { msgHash: msgHash, r: sig.r, s: sig.s, v: sig.v }
  },
  recoverSignerFromSignature: (msgHash, r, s, v) => {
    let web3 = new Web3()
    return web3.eth.accounts.recover(msgHash, v, r, s);
  }
}

module.exports = Web3Util
