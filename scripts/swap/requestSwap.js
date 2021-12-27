require('dotenv').config()
const config = require('config')
const BN = require('bignumber.js')
const Web3 = require('web3')
const IERC20ABI = require('../../contracts/IERC20.json')
const Swap = require('../../contracts/Swap.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");
//const erc20Address = "0x5248e0f6683431Cc107Db1Ed0a02728b64542A7C"
var args = process.argv.slice(2);

const erc20Address = args[0]
const fromChainId = args[1]
const toChainId = args[2]
const amount = args[3]
const toAddr = args[4]
const amountOut1 = args[5]
const amountOut2 = args[6]
const amountOut3 = args[7]
console.log('to:', erc20Address)
const privateKey = process.env.PRIVATE_KEY
const rpc = config.get(`blockchain.${fromChainId}.httpProvider`)
const swapAddress = config.get(`contracts.${fromChainId}.swap`)
const gasPrice = '22000000000'
const log = console.log
const nativeAddress = config.get('nativeAddress')

async function requestSwap() {
	try {
		const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc))
		const accounts = await web3.eth.getAccounts();
		const mainAccount = accounts[0];
		log('rpc', rpc);
		log('Request from account', mainAccount);
		log('Request swap from ', fromChainId, " to ", toChainId);

		const token = await new web3.eth.Contract(IERC20ABI, erc20Address);
		const swap = await new web3.eth.Contract(Swap, swapAddress)

		//approve
		console.log('approving')
		if (erc20Address !== nativeAddress)
			await token.methods.approve(swap.options.address, new BN('100000e18').toFixed(0)).send({chainId: web3.utils.toHex(fromChainId), from: mainAccount, gas: 1000000, gasPrice: gasPrice})

		console.log('requesting')
		let value = 0
		let amountInWei = new BN(amount).multipliedBy(new BN('1e18')).toFixed(0)
		if (erc20Address === nativeAddress) {
			value = amountInWei
		}
		let amountOutWei0 = new BN(amountOut1).multipliedBy(new BN('1e18')).toFixed(0)
		let amountOutWei1 = new BN(amountOut2).multipliedBy(new BN('1e18')).toFixed(0)
		let amountOutWei2 = new BN(amountOut3).multipliedBy(new BN('1e18')).toFixed(0)
		var _amountsOut = [amountOutWei0, amountOutWei1, amountOutWei2]
		await swap.methods.requestBridge(erc20Address, toAddr, amountInWei, toChainId, _amountsOut).send({chainId: web3.utils.toHex(fromChainId), from: mainAccount, gas: 1000000, gasPrice: gasPrice, value: value})
		console.log('done')
		}catch (e) {
		console.log(e)
	}
}

requestSwap()
