require('dotenv').config()
const config = require('config')
const BN = require('bignumber.js')
const Web3 = require('web3')
const IERC20ABI = require('../contracts/IERC20.json')
const GenericBridgeABI = require('../contracts/GenericBridge.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");
const erc20Address = "0xFCfa8B2E2596F81b260218Ea3CE2D6Af0578f2Ae"
const fromChainId = "97"
const toChainId = "42"
const privateKey = process.env.PRIVATE_KEY
const rpc = config.get(`blockchain.${fromChainId}.httpProvider`)
const bridgeAddress = config.get(`contracts.${fromChainId}.bridge`)
const gasPrice = '10000000000'
const log = console.log

async function requestBridge() {
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
	await token.methods.approve(bridge.options.address, new BN('100000e18').toFixed(0)).send({from: mainAccount, gas: 1000000, gasPrice: gasPrice})

	console.log('requesting')
	await bridge.methods.requestBridge(erc20Address, new BN('20e18').toFixed(0), toChainId).send({from: mainAccount, gas: 1000000, gasPrice: gasPrice})

	console.log('done')
}

requestBridge()