const db = require('../models')
const GeneralHelper = require('./general')
const config = require('config')
const axios = require('axios')
const CasperHelper = require('./casper')
let submitDone = true

async function publishSignatures(signatures, requestHash, fromChainId, toChainId, index) {
    try {
        if (Array.isArray(signatures)) {
            signatures = signatures[0]
        }
        let endPoint = GeneralHelper.getEndPoint()
        endPoint = `${endPoint}/nft721/receive-signatures`
        let body = {
            requestHash: requestHash,
            fromChainId: fromChainId,
            toChainId: toChainId,
            index: index,
            signatures: signatures
        }
        await axios.post(endPoint, body, { timeout: 60 * 1000 })
            .then( async() => {
                await db.Nft721Transaction.updateOne(
                    {
                        requestHash: requestHash,
                        fromChainId: fromChainId,
                        toChainId: toChainId,
                        index: index
                    },
                    {
                        $set:
                        {
                            signatureSubmitted: true
                        }
                    },
                    { upsert: true, new: true }
                )
            })
            .catch(error => {
                console.error('There was an error!', error);
            });
    } catch (e) {
        console.error(e)
    }
}

async function doIt() {
    if (config.proxy) {
        return
    }
    if (!submitDone) {
        return
    }
    console.log("collecting signatures")
    submitDone = false
    try {
        let query = {
            $or: [
                { claimed: false },
                { claimed: null },
            ]
        }
        let unclaimedRequests = await db.Nft721Transaction.find(query).sort({ requestTime: 1 }).limit(20).skip(0).lean().exec()
        // console.log('unclaimedRequests', unclaimedRequests)
        for (const request of unclaimedRequests) {
            if (request.signatures && !request.signatureSubmitted) {
                console.log("Find new req !!!")
                publishSignatures(request.signatures, request.requestHash, request.fromChainId, request.toChainId, request.index)
            } else {
                const casperConfig = CasperHelper.getConfigInfo()
                if (request.toChainId == casperConfig.networkId) {
                    continue
                }
                try {
                    let endPoint = GeneralHelper.getEndPoint()
                    endPoint = `${endPoint}/nft721/request-withdraw`
                    console.log("Endpoint: ", endPoint)
                    let body = {
                        requestHash: request.requestHash,
                        fromChainId: request.fromChainId,
                        toChainId: request.toChainId,
                        index: request.index
                    }
                    const url = `http://localhost:${config.server.port}/nft721/request-withdraw`
                    console.log('url', url, body)
                    let { data } = await axios.post(url, body, { timeout: 60 * 1000 })
                    await db.Nft721Transaction.updateOne(
                        { requestHash: request.requestHash, fromChainId: request.fromChainId, toChainId: request.toChainId, index: request.index },
                        {
                            $addToSet: {
                                signatures: data
                            }
                        },
                        { upsert: true, new: true }
                    )
                } catch (e) {
                    console.error(e)
                }
            }
        }
    } catch (e) {
        console.error(e)
    }
    submitDone = true
}

module.exports = { doIt }