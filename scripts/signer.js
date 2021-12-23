const Web3 = require('web3');
const web3 = new Web3();
const signer1 = "0xd6e4ec6d3c911f85652f9ddcef3341343ac7fade4ce0222d1b36f4006d50715f"
const signer2 = "0x625bfe4af8661c13fb501eaec504e989761134b8ae1f189acf05d96ded9a974d"
const signer3 = "0x66e5487461cfe72cbd87550144e8384056ac5f9eb80ae76ff4de676f3900901c"
const signer4 = "0x693eccf5d3f92422ecf978b8b21149ad5e4f519cbc219b2c6c05793d03caa51b"
const signer5 = "0x218469aded3919700974b3c97a02259e12602f04bfce88fc053daf0436d1f7d2"
const signer6 = "0x5e951167805c3500283df4f4b4a32a2fc603dfa829f6736d40d248ee0ceb4ab6"
const signer7 = "0x2aeefc02b2890a36c010b982d7d9a52ded9e8a01073a527cb2a63cef20f27c08"

module.exports = {
    signClaim: function (_originToken, _to, _amount, _chainIdsIndex, _txHash, _name, _symbol, _decimals) {
		const encoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256[]', 'bytes32', 'string', 'string', 'uint8'], [_originToken, _to, _amount, _chainIdsIndex, _txHash, _name, _symbol, _decimals])
        let msgHash = web3.utils.sha3(encoded);
        let sig1 = web3.eth.accounts.sign(msgHash, signer1);
		    let sig2 = web3.eth.accounts.sign(msgHash, signer2);
        let sig3 = web3.eth.accounts.sign(msgHash, signer3);
		    let sig4 = web3.eth.accounts.sign(msgHash, signer4);
        let sig5 = web3.eth.accounts.sign(msgHash, signer5);
		    let sig6 = web3.eth.accounts.sign(msgHash, signer6);
        let sig7 = web3.eth.accounts.sign(msgHash, signer7);
		return {msgHash: msgHash, r: [sig1.r, sig2.r, sig3.r, sig4.r, sig5.r, sig6.r, sig7.r], s: [sig1.s, sig2.s, sig3.s, sig4.s, sig5.s, sig6.s, sig7.s], v: [sig1.v, sig2.v, sig3.v, sig4.v, sig5.v, sig6.v, sig7.v]}
    }
}
