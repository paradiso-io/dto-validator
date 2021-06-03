require('dotenv').config()
const config = require('config')
const BN = require('bignumber.js')
const Web3 = require('web3')
const IERC20ABI = require('../contracts/ERC20.json')
const GenericBridgeABI = require('../contracts/GenericBridge.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");
const erc20Address = "0xFCfa8B2E2596F81b260218Ea3CE2D6Af0578f2Ae"
const fromChainId = "97"
const toChainId = "42"
const privateKey = process.env.PRIVATE_KEY
const rpcFrom = config.get(`blockchain.${fromChainId}.httpProvider`)
const rpcTo = config.get(`blockchain.${toChainId}.httpProvider`)
const singer = require('./signer')

const bridgeAddressFrom = config.get(`contracts.${fromChainId}.bridge`)
const bridgeAddressTo = config.get(`contracts.${toChainId}.bridge`)

const gasPrice = '10000000000'
const log = console.log

async function readingAllEvents(ctr, fromBlock, endBlock) {
	let from = fromBlock 
	let eventList = []
	while(from < endBlock) {
		let to = from + 4999
		if (to > endBlock) {
			to = endBlock
		}
		try {
			console.log('reading', from, to)
			let events = await ctr.getPastEvents('RequestBridge', {
				fromBlock: from,
				toBlock: to
			});
			from = to
			events.forEach(e => {
				eventList.push(e)
			});
		} catch(e) {
			console.log('error:', e)
		}
	}
	return eventList
}

async function requestBridge() {
	const web3From = new Web3(new PrivateKeyProvider(privateKey, rpcFrom))
	const web3To = new Web3(new PrivateKeyProvider(privateKey, rpcTo))

	const accounts = await web3From.eth.getAccounts();
    const mainAccount = accounts[0];
    log('claim token for account', mainAccount);

	const bridgeFrom = await new web3From.eth.Contract(GenericBridgeABI, bridgeAddressFrom)
	//reading events
	let fromBlock = 9392004
	let endBlock = await web3From.eth.getBlockNumber()
	endBlock = parseInt(endBlock)
	let eventList = await readingAllEvents(bridgeFrom, fromBlock, endBlock)
	for(const e of eventList) {
		console.log('trying to claim')
		let data = e.returnValues
		let originToken = data._token
		let rpcOrigin = config.get(`blockchain.${data._originChainId}.httpProvider`)
		let web3Origin = new Web3(new PrivateKeyProvider(privateKey, rpcOrigin))
		let originTokenContract = await new web3Origin.eth.Contract(IERC20ABI, originToken)
		let name = await originTokenContract.methods.name().call()
		let decimals = await originTokenContract.methods.decimals().call()
		let symbol = await originTokenContract.methods.symbol().call()
		let chainIdData = [data._originChainId, data._fromChainId, data._toChainId, data._index]
		let sig = singer.signClaim(originToken, mainAccount, data._amount, chainIdData, e.transactionHash, name, symbol, decimals)
		const bridgeTo = await new web3To.eth.Contract(GenericBridgeABI, bridgeAddressTo)
		let alreadyClaim = await bridgeTo.methods.alreadyClaims(sig.msgHash).call()
		if (!alreadyClaim) {
			//making claim tx
			await bridgeTo.methods.claimToken(originToken, mainAccount, data._amount, chainIdData, e.transactionHash, sig.r, sig.s, sig.v, name, symbol, decimals)
				.send({from: mainAccount, gasPrice: 1000000000, gas: 10000000})
		} else {
			console.log('already claim')
		}
		console.log('done')
		
	}
	//approve
	// console.log('approving')
	// await token.methods.approve(bridge.options.address, new BN('100000e18').toFixed(0)).send({from: mainAccount, gas: 1000000, gasPrice: gasPrice})

	// console.log('requesting')
	// await bridge.methods.requestBridge(erc20Address, new BN('100e18').toFixed(0), toChainId).send({from: mainAccount, gas: 1000000, gasPrice: gasPrice})

	// console.log('done')
}

requestBridge()