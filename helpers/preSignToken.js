const db = require('../models')
const GeneralHelper = require('./general')
const config = require('config')
const axios = require('axios')
const CasperHelper = require('./casper')
let submitDone = true
const logger = require('./logger')
const Web3Util = require('./web3')
const casperConfig = CasperHelper.getConfigInfo()

async function doIt() {
    logger.info("Start collecting signatures")
    logger.info("config.proxy %s", config.proxy)

    if (!config.proxy) {
        return
    }
    if (!submitDone) {
        return
    }
    submitDone = false
    try {
        let query = {
            $and: [
                { toChainId: { $ne: parseInt(casperConfig.networkId) } },
                { signatures: null },
                {
                    $or: [
                        { claimed: false },
                        { claimed: null },
                    ]
                },
                // { claimId: { $ne: null } }
            ]
        }

        let unclaimedRequests = await db.Transaction.find(query).sort({ requestTime: 1 }).skip(0).lean().exec()
        const fetchSignature = async (request) => {
            if (!request || request.signatures) return
            try {
                let body = {
                    requestHash: request.requestHash,
                    fromChainId: request.fromChainId,
                    toChainId: request.toChainId,
                    index: request.index
                }
                logger.info("fetching signature for transaction %s", body)
                const url = `http://localhost:${config.server.port}/request-withdraw`
                let { data } = await axios.post(url, body, { timeout: 300 * 1000 })

                if (data.r) {
                    const validators = []
                    for (var i = 0; i < data.r.length; i++) {
                        const recoveredAddress = Web3Util.recoverSignerFromSignature(data.msgHash, data.r[i], data.s[i], data.v[i])
                        validators.push(recoveredAddress)
                    }
                    data.validators = validators
                }

                await db.Transaction.updateOne(
                    { requestHash: request.requestHash, fromChainId: parseInt(request.fromChainId), toChainId: parseInt(request.toChainId), index: parseInt(request.index) },
                    {
                        $set:
                        {
                            signatures: data
                        }
                    },
                    { upsert: true, new: true }
                )
                logger.info("save signature to db for transaction %s", request.requestHash)
            } catch (e) {
                logger.warn('failed to fetch for transaction %s, index %s, fromChainId = %s, toChainId = %s', request.requestHash, request.index, request.fromChainId, request.toChainId)
                logger.error(e)
            }
        }
        const requestPerBatch = 8
        for (var i = 0; i < Math.floor(unclaimedRequests.length / requestPerBatch) + 1; i++) {
            const fetchTasks = []
            const requests = unclaimedRequests.slice(i * requestPerBatch, (i + 1) * requestPerBatch)
            for (var k = 0; k < requests.length; k++) {
                fetchTasks.push(fetchSignature(requests[k]))
            }
            await Promise.all(fetchTasks)
            logger.info("done this batch %s", i)
        }
        logger.info("done for this round")
    } catch (e) {
        console.error(e)
    }
    submitDone = true
    return
}

module.exports = { doIt }