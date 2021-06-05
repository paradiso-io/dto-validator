const events = require('events')
const BigNumber = require('bignumber.js')
const config = require('config')

const logger = require('./helpers/logger')
const Web3Utils = require('./helpers/web3')
const tokenHelper = require('./helpers/token')
const GenericBridge = require('./contracts/GenericBridge')
const db = require('./models')

BigNumber.config({EXPONENTIAL_AT: [-100, 100]})
const baseUnit = 10 ** 18


// fix warning max listener
events.EventEmitter.defaultMaxListeners = 1000
process.setMaxListeners(1000)
let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))

async function processEvent(event, bridgeAddress, networkId, lastBlock, confirmations) {
    logger.info('New event at block %s', event.blockNumber)

    if (lastBlock - event.blockNumber < confirmations) {
        return
    }

    let setting = await db.Setting.findOne({networkId: networkId})
    if (!setting) {
        await db.Setting.updateOne({networkId: networkId}, {$set: {lastBlockRequest: event.blockNumber}}, {
            upsert: true,
            new: true
        })
    } else {
        if (event.blockNumber > setting.lastBlockRequest) {
            setting.lastBlockRequest = event.blockNumber
            await setting.save()
        }
    }
    let tokenAddress = event.returnValues._token.toLowerCase()
    let token = await tokenHelper.getToken(tokenAddress, networkId)

    let amount = event.returnValues._amount
    let amountNumber = new BigNumber(amount).div(10**token.decimals).toNumber()

    // event RequestBridge(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index);
    await db.Transaction.updateOne({
            index: event.returnValues._index,
            fromChainId: event.returnValues._fromChainId,
            toChainId: event.returnValues._toChainId
        },
        {
            $set: {
                requestHash: event.transactionHash,
                requestBlock: event.blockNumber,
                account: event.returnValues._addr.toLowerCase(),
                originToken: token.hash,
                isClaim: false,
                originSymbol: token.symbol,
                fromChainId: event.returnValues._fromChainId,
                originChainId: event.returnValues._originChainId,
                toChainId: event.returnValues._toChainId,
                amount: amount,
                amountNumber: amountNumber,
                index: event.returnValues._index,
            }
        }, {upsert: true, new: true})


}

async function getPastEvent(networkId, bridgeAddress, step) {
    let web3 = await Web3Utils.getWeb3(networkId)
    const confirmations = config.get('blockchain')[networkId].confirmations
    let lastBlock = await web3.eth.getBlockNumber()
    let setting = await db.Setting.findOne({networkId: networkId})
    let lastCrawl = config.contracts[networkId].firstBlockCrawl
    if (lastBlock === null) {
        lastBlock = 9394711
    }
    if (setting && setting.lastBlockRequest) {
        lastCrawl = setting.lastBlockRequest
    }
    lastCrawl = parseInt(lastCrawl)

    while (lastBlock - lastCrawl > 5) {
        let toBlock
        if (lastBlock - lastCrawl > step) {
            toBlock = lastCrawl + step
        } else {
            toBlock = 'latest'
        }
        const contract = new web3.eth.Contract(GenericBridge, bridgeAddress)
        logger.info('Network %s: Get Past Event from block %s to %s', networkId, lastCrawl + 1, toBlock)
        contract.getPastEvents('RequestBridge', {fromBlock: lastCrawl + 1, toBlock: toBlock}, async (err, evts) => {
            if (!err) {
                if (evts.length > 0) {
                    logger.info(`network ${networkId}: there are ${evts.length} events from ${lastCrawl + 1} to ${toBlock}`)
                }
                if (evts.length === 0 && lastBlock - toBlock > confirmations) {
                    await db.Setting.updateOne({networkId: networkId}, {$set: {lastBlockRequest: toBlock}}, {
                        upsert: true,
                        new: true
                    })
                }
                for (let i = 0; i < evts.length; i++) {
                    let event = evts[i]
                    await processEvent(event, bridgeAddress, networkId, lastBlock, confirmations)
                }
            } else {
                logger.error('error', err)
            }
        })
        // console.log('sleep 2 seconds and wait to continue')
        await sleep(1000)

        lastBlock = await web3.eth.getBlockNumber()
        lastCrawl = toBlock
    }

}

async function watch(networkId, bridgeAddress) {
    let step = 3000
    await getPastEvent(networkId, bridgeAddress, step)

    setInterval(async () => {
        await getPastEvent(networkId, bridgeAddress, step);
    }, 10000);

}

function main() {
    let contracts = config.contracts
    let networks = Object.keys(contracts)
    networks.forEach(networkId => {
        let contractAddress = contracts[networkId].bridge
        if (contractAddress !== '') {
            watch(networkId, contractAddress)
        }
    })
}

main()

