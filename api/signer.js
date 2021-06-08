const config = require('config')
const Web3 = require('web3')
const web3 = new Web3()

const signer = config.signer

module.exports = {
    signClaim: function (_originToken, _to, _amount, _chainIdsIndex, _txHash, _name, _symbol, _decimals) {
		const encoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256[]', 'bytes32', 'string', 'string', 'uint8'], [_originToken, _to, _amount, _chainIdsIndex, _txHash, _name, _symbol, _decimals])
        let msgHash = web3.utils.sha3(encoded);
        let sig = web3.eth.accounts.sign(msgHash, signer);
		return {msgHash: msgHash, r: sig.r, s: sig.s, v: sig.v}
    }
}
