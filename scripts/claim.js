require('dotenv').config()
const config = require('config')
const BN = require('bignumber.js')
const Web3 = require('web3')
const IERC20ABI = require('../contracts/ERC20.json')
const GenericBridgeABI = require('../contracts/GenericBridge.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");
var args = process.argv.slice(2);

const fromChainId = args[0]
const toChainId = args[1]

const privateKey = process.env.PRIVATE_KEY
const rpcFrom = config.get(`blockchain.${fromChainId}.httpProvider`)
const rpcTo = config.get(`blockchain.${toChainId}.httpProvider`)
const singer = require('./signer')

const bridgeAddressFrom = config.get(`contracts.${fromChainId}.bridge`)
const bridgeAddressTo = config.get(`contracts.${toChainId}.bridge`)

const gasPrice = '20000000000'
const log = console.log
const nativeAddress = config.get('nativeAddress')


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
	let balance = await web3To.eth.getBalance(mainAccount)
	console.log('rpcTo:', rpcTo)
    log('claim token for account', mainAccount, new BN(balance).dividedBy(new BN('1e18')).toFixed(4));

	const bridgeFrom = await new web3From.eth.Contract(GenericBridgeABI, bridgeAddressFrom)
	//reading events
	let fromBlock = config.get(`contracts.${fromChainId}.firstBlockCrawl`)
	console.log('fromBlock:', fromBlock)
	fromBlock = parseInt(fromBlock)
	let endBlock = await web3From.eth.getBlockNumber()
	endBlock = parseInt(endBlock)
	let eventList = await readingAllEvents(bridgeFrom, fromBlock, endBlock)
	for(const e of eventList) {
		try {
			console.log('trying to claim')
			let data = e.returnValues
			let originToken = data._token
			let rpcOrigin = config.get(`blockchain.${data._originChainId}.httpProvider`)
			let web3Origin = new Web3(new PrivateKeyProvider(privateKey, rpcOrigin))
			let name, decimals, symbol
			if (originToken == nativeAddress) {
				name = config.get(`blockchain.${data._originChainId}.nativeName`)
				symbol = config.get(`blockchain.${data._originChainId}.nativeSymbol`)
				decimals = 18
			} else {
				let  originTokenContract = await new web3Origin.eth.Contract(IERC20ABI, originToken)
				name = await originTokenContract.methods.name().call()
				decimals = await originTokenContract.methods.decimals().call()
				symbol = await originTokenContract.methods.symbol().call()
			}

			let chainIdData = [data._originChainId, data._fromChainId, data._toChainId, data._index]
			if (data._fromChainId != fromChainId || data._toChainId != toChainId) {
				continue
			}
			console.log('chainIdData:', chainIdData)
			let sig = singer.signClaim(originToken, mainAccount, data._amount, chainIdData, e.transactionHash, name, symbol, decimals)
			const bridgeTo = await new web3To.eth.Contract(GenericBridgeABI, bridgeAddressTo)
			let alreadyClaim = await bridgeTo.methods.alreadyClaims(sig.msgHash).call()
			if (!alreadyClaim) {
				//making claim tx
				await bridgeTo.methods.claimToken(originToken, mainAccount, data._amount, chainIdData, e.transactionHash, sig.r, sig.s, sig.v, name, symbol, decimals)
					.send({chainId: web3To.utils.toHex(toChainId), from: mainAccount, gasPrice: gasPrice, gas: 5000000})
			} else {
				console.log('already claim')
			}
			let bridgeToken = await bridgeTo.methods.tokenMap(data._originChainId, data._token).call()
			if (data._originChainId == data._toChainId) {
				bridgeToken = data._token
				console.log('done, claimed token:', bridgeToken)
			} else {
				console.log('done, claimed token:', bridgeToken)
			}
		} catch(e) {
			console.log('e:', e)
		}
		
	}
	console.log('finish')
}

requestBridge()