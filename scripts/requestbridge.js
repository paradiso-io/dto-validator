require('dotenv').config()
const config = require('config')
const BN = require('bignumber.js')
const Web3 = require('web3')
const IERC20ABI = require('../contracts/IERC20.json')
const GenericBridgeABI = require('../contracts/GenericBridge.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");
//const erc20Address = "0x5248e0f6683431Cc107Db1Ed0a02728b64542A7C"
var args = process.argv.slice(2);

const erc20Address = args[0]
const fromChainId = args[1]
const toChainId = args[2]
const amount = args[3]
console.log('to:', erc20Address)
const privateKey = process.env.PRIVATE_KEY
const rpc = config.get(`blockchain.${fromChainId}.httpProvider`)
const bridgeAddress = config.get(`contracts.${fromChainId}.bridge`)
const gasPrice = '22000000000'
const log = console.log
const nativeAddress = config.get('nativeAddress')

async function requestBridge() {
	try {
		const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc))
		const accounts = await web3.eth.getAccounts();
		const mainAccount = accounts[0];
		log('rpc', rpc);
		log('Request from account', mainAccount);
		log('Request bridge from ', fromChainId, " to ", toChainId);

		const token = await new web3.eth.Contract(IERC20ABI, erc20Address);
		const bridge = await new web3.eth.Contract(GenericBridgeABI, bridgeAddress)

		//approve
		console.log('approving')
		if (erc20Address != nativeAddress) 
			await token.methods.approve(bridge.options.address, new BN('100000e18').toFixed(0)).send({chainId: web3.utils.toHex(fromChainId), from: mainAccount, gas: 1000000, gasPrice: gasPrice})

		console.log('requesting')
		let value = 0
		let amountInWei = new BN(amount).multipliedBy(new BN('1e18')).toFixed(0)
		if (erc20Address == nativeAddress) {
			value = amountInWei
		}

		await bridge.methods.requestBridge(erc20Address, amountInWei, toChainId).send({chainId: web3.utils.toHex(fromChainId), from: mainAccount, gas: 1000000, gasPrice: gasPrice, value: value})
		console.log('done')
		}catch (e) {
		console.log(e)
	}
}

requestBridge()