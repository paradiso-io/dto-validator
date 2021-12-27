require('dotenv').config()
const config = require('config')
const BN = require('bignumber.js')
const Web3 = require('web3')
const IERC20ABI = require('../../contracts/ERC20.json')
const GenericBridgeABI = require('../../contracts/GenericBridge.json')
const SwapABI = require('../../contracts/Swap.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");
var args = process.argv.slice(2);

const fromChainId = args[0]
const toChainId = args[1]

const privateKey = process.env.PRIVATE_KEY
const rpcFrom = config.get(`blockchain.${fromChainId}.httpProvider`)
const rpcTo = config.get(`blockchain.${toChainId}.httpProvider`)
const singer = require('../signer')

const bridgeAddressFrom = config.get(`contracts.${fromChainId}.bridge`)
const bridgeAddressTo = config.get(`contracts.${toChainId}.bridge`)

const swapAddressFrom = config.get(`contracts.${fromChainId}.swap`)
const swapAddressTo = config.get(`contracts.${toChainId}.swap`)

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

async function claimSwap() {
	const web3From = new Web3(new PrivateKeyProvider(privateKey, rpcFrom))
	const web3To = new Web3(new PrivateKeyProvider(privateKey, rpcTo))

	const accounts = await web3From.eth.getAccounts();
    const mainAccount = accounts[0];
	let balance = await web3To.eth.getBalance(mainAccount)
	console.log('rpcTo:', rpcTo)
    log('claim token for account', mainAccount, new BN(balance).dividedBy(new BN('1e18')).toFixed(4));

	const bridgeFrom = await new web3From.eth.Contract(GenericBridgeABI, bridgeAddressFrom)
    const swapFrom = await new web3From.eth.Contract(SwapABI, swapAddressFrom)

	//reading events
	let fromBlock = config.get(`contracts.${fromChainId}.firstBlockCrawl`)
	console.log('fromBlock:', fromBlock)
	fromBlock = parseInt(fromBlock)
	let endBlock = await web3From.eth.getBlockNumber()
	endBlock = parseInt(endBlock)
	let bridgeeventList = await readingAllEvents(bridgeFrom, fromBlock, endBlock)
    let swapeventList = await readingAllEvents(swapFrom, fromBlock, endBlock)


    // let _toTokens = data._toTokens
    // let _amountsOut = data._amountsOut

	for(const bridgeevent of bridgeeventList) {
        for(const swapevent of swapeventList) {
            try {
                console.log('bridgeevent.transactionHash', bridgeevent.transactionHash)
                console.log('swapevent.transactionHash', swapevent.transactionHash)
                if(bridgeevent.transactionHash != swapevent.transactionHash){
                    continue
                }
                console.log('trying to claim')
                let dataBridge = bridgeevent.returnValues
                let originToken = dataBridge._token
                let _toAddr = dataBridge._toAddr
                let rpcOrigin = config.get(`blockchain.${dataBridge._originChainId}.httpProvider`)
                let web3Origin = new Web3(new PrivateKeyProvider(privateKey, rpcOrigin))
                let name, decimals, symbol
                if (originToken === nativeAddress) {
                    name = config.get(`blockchain.${dataBridge._originChainId}.nativeName`)
                    symbol = config.get(`blockchain.${dataBridge._originChainId}.nativeSymbol`)
                    decimals = 18
                } else {
                    let  originTokenContract = await new web3Origin.eth.Contract(IERC20ABI, originToken)
                    name = await originTokenContract.methods.name().call()
                    decimals = await originTokenContract.methods.decimals().call()
                    symbol = await originTokenContract.methods.symbol().call()
                }
    
                let chainIdData = [dataBridge._originChainId, dataBridge._fromChainId, dataBridge._toChainId, dataBridge._index]
                if (dataBridge._fromChainId != fromChainId || dataBridge._toChainId != toChainId) {
                    continue
                }
                console.log('chainIdData:', chainIdData)

                let sig = singer.signClaim(originToken, swapAddressTo, dataBridge._amount, chainIdData, bridgeevent.transactionHash, name, symbol, decimals)

                let dataSwap = swapevent.returnValues
                let _amountsOut = dataSwap.amountsOut       

                const bridgeTo = await new web3To.eth.Contract(GenericBridgeABI, bridgeAddressTo)
                const swapTo = await new web3To.eth.Contract(SwapABI, swapAddressTo)
                let alreadyClaim = await bridgeTo.methods.alreadyClaims(sig.msgHash).call()

                if (!alreadyClaim) {
                    //making claim tx
                    await swapTo.methods.claimToken(originToken, _toAddr, dataBridge._amount, chainIdData, bridgeevent.transactionHash, sig.r, sig.s, sig.v, name, symbol, decimals, _amountsOut)
                        .send({chainId: web3To.utils.toHex(toChainId), from: mainAccount, gasPrice: gasPrice, gas: 5000000})
                } else {
                    console.log('already claim')
                }
                let bridgeToken = await bridgeTo.methods.tokenMap(dataBridge._originChainId, dataBridge._token).call()
                if (dataBridge._originChainId === dataBridge._toChainId) {
                    bridgeToken = dataBridge._token
                    console.log('done, claimed token:', bridgeToken)
                } else {
                    console.log('done, claimed token:', bridgeToken)
                }
            } catch(e) {
                console.log('e:', e)
            }
        }
	}
	console.log('finish')
}

claimSwap()

