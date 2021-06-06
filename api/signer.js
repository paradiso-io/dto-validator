
const Web3 = require('web3');
const web3 = new Web3();
const signer1 = "0xcb50047f1a1e8ad4539ab0ee19af43169377869a11d25ebd18de7c20701a6e60"
const signer2 = "0xc281de60c01017255d01148b7e3fce2a4f2db748b48033063a45bf0fcd34cd67"
const singnerAddr1 = "0x51DA78da1758B6F5D5320BD7Ba7DCeb9B3472e9C"
const singnerAddr2 = "0x117cA9A7030E36AA0A55D0Da61261025c0578eD1"

module.exports = {
    signClaim: function (_originToken, _to, _amount, _chainIdsIndex, _txHash, _name, _symbol, _decimals) {
		const encoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256[]', 'bytes32', 'string', 'string', 'uint8'], [_originToken, _to, _amount, _chainIdsIndex, _txHash, _name, _symbol, _decimals])
        let msgHash = web3.utils.sha3(encoded);
        let sig1 = web3.eth.accounts.sign(msgHash, signer1);
		let sig2 = web3.eth.accounts.sign(msgHash, signer2);
		return {msgHash: msgHash, r: [sig1.r, sig2.r], s: [sig1.s, sig2.s], v: [sig1.v, sig2.v]}
    }
}
