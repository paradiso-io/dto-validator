const db = require('../models')
const GeneralHelper = require('./general')
const config = require('config')
const axios = require('axios')
const CasperHelper = require('./casper')
let submitDone = true
const logger = require('./logger')
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
                {
                    $or: [
                        { claimed: false },
                        { claimed: null },
                    ]
                },
                // { claimId: { $ne: null } }
            ]
        }

        let unclaimedRequests = await db.Transaction.find(query).sort({ requestTime: 1 }).limit(20).skip(0).lean().exec()
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
                logger.info("save signature to db")
            } catch (e) {
                logger.warn('failed to fetch for transaction %s, index %s', request.requestHash, request.index)
                logger.error(e)
            }
        }
        const requestPerBatch = 8
        for(var i = 0; i < Math.floor(unclaimedRequests.length / requestPerBatch) + 1; i++) {
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