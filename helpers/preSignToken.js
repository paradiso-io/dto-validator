const db = require('../models')
const GeneralHelper = require('./general')
const config = require('config')
const axios = require('axios')
const CasperHelper = require('./casper')
let submitDone = true
let eventHelper = require('./event')
const logger = require('./logger')
const casperConfig = CasperHelper.getConfigInfo()

async function doIt() {
    logger.info("Start collecting signatures")
    logger.info("config.proxy %s", config.proxy)

    if (!config.proxy) {
        return
    }
    logger.info("config.proxy %s", config.proxy)
    if (!submitDone) {
        return
    }
    submitDone = false
    try {
        logger.info("try catch")
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
        for (const request of unclaimedRequests) {
            if (request.fromChainId == parseInt(casperConfig.networkId)) {
                try {
                    let endPoint = GeneralHelper.getEndPoint()
                    endPoint = `${endPoint}/request-withdraw`
                    let body = {
                        requestHash: request.requestHash,
                        fromChainId: request.fromChainId,
                        toChainId: request.toChainId,
                        index: request.index
                    }
                    const url = `http://localhost:${config.server.port}/request-withdraw`
                    // Data = json({ r: r, s: s, v: v, msgHash: msgHash, name: name, symbol: symbol, decimals: decimals })
                    let { data } = await axios.post(url, body, { timeout: 30 * 1000 })
                    let findTx = await db.Transaction.findOne(
                        { requestHash: request.requestHash, fromChainId: parseInt(request.fromChainId), toChainId: request.toChainId, index: request.index }
                    )
                    console.log(findTx)


                    await db.Transaction.updateOne(
                        { requestHash: request.requestHash, fromChainId: parseInt(request.fromChainId), toChainId: request.toChainId, index: request.index },
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
                    logger.error(e)
                }
            }

        }
    } catch (e) {
        console.error(e)
    }
    submitDone = true
    return
}

module.exports = { doIt }