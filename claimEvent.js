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
    let eventName = event.event
    logger.info('New event %s at block %s', eventName, event.blockNumber)

    if (lastBlock - event.blockNumber < confirmations) {
        return
    }

    let setting = await db.Setting.findOne({networkId: networkId})
    if (!setting) {
        await db.Setting.updateOne({networkId: networkId}, {$set: {lastBlockClaim: event.blockNumber}}, {
            upsert: true,
            new: true
        })
    } else {
        if (event.blockNumber > setting.lastBlockClaim) {
            setting.lastBlockClaim = event.blockNumber
            await setting.save()
        }
    }

    // event ClaimToken(address indexed _token, address indexed _addr, uint256 _amount, uint256 _originChainId, uint256 _fromChainId, uint256 _toChainId, uint256 _index, bytes32 _claimId);
    await db.Transaction.updateOne({index: event.returnValues._index, sourceChainId: event.returnValues._fromChainId}, {
        $set: {claimHash: event.transactionHash, claimBlock: event.blockNumber, isClaim: true, claimId: event.returnValues._claimId}
    })


}

async function getPastEvent(networkId, bridgeAddress, step) {
    let web3 = await Web3Utils.getWeb3(networkId)
    const confirmations = config.get('blockchain')[networkId].confirmations
    let lastBlock = await web3.eth.getBlockNumber()
    let setting = await db.Setting.findOne({networkId: networkId})
    let lastCrawl = 5890000
    if (setting) {
        lastCrawl = setting.lastBlockClaim
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
        logger.info('Get Past Event from block %s to %s', lastCrawl + 1, toBlock)
        contract.getPastEvents('RequestBridge', {fromBlock: lastCrawl + 1, toBlock: toBlock}, async (err, evts) => {
            if (!err) {
                logger.info(`there are ${evts.length} events from ${lastCrawl + 1} to ${toBlock}`)
                if (evts.length === 0 && lastBlock - toBlock > confirmations) {
                    await db.Setting.updateOne({networkId: networkId}, {$set: {lastBlockClaim: toBlock}}, {
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
        console.log('sleep 2 seconds and wait to continue')
        await sleep(1000)

        lastBlock = await web3.eth.getBlockNumber()
        lastCrawl = toBlock
    }

}

let watch = async () => {
    if (process.argv.length <= 2) {
        logger.error('Missing instance address')
        process.exit(1)
    }
    let networkId = process.argv[2]
    let bridgeAddress = process.argv[3].toLowerCase()

    let step = 3000
    await getPastEvent(networkId, bridgeAddress, step)

    setInterval(async () => {
        await getPastEvent(bridgeAddress, step);
    }, 10000);

}

watch()
