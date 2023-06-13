const db = require('../models')
const GeneralHelper = require('./general')
const config = require('config')
const axios = require('axios')
const CasperHelper = require('./casper')
let submitDone = true
let eventHelper = require('./event')
const Web3Util = require('./web3')
const logger = require("./logger");
const casperConfig = CasperHelper.getConfigInfo()


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
            .then(async () => {
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

function isValidSignature(signature) {
    let ret = signature.tokenIds && signature.originTokenIds && Array.isArray(signature.tokenIds) && Array.isArray(signature.originTokenIds)
    ret = ret && signature.originTokenIds.filter(e => e != '').length == signature.originTokenIds.length
    return ret && signature.r && signature.s && signature.v && signature.msgHash
}

function getValidSignature(signatures) {
    if (!signatures) return null
    if (Array.isArray(signatures)) {
        for (const sig of signatures) {
            if (sig.msgHash && isValidSignature(sig)) {
                return sig
            }
        }
    } else {
        return isValidSignature(signatures) ? signatures : null
    }
    return null
}
async function doIt() {
    logger.info("Start collecting signatures for NFT")
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
            ]
        }

        let unclaimedRequests = await db.Nft721Transaction.find(query).sort({ requestTime: 1 }).limit(20).skip(0).lean().exec()
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
                const url = `http://localhost:${config.server.port}/nft721/request-withdraw`
                let { data } = await axios.post(url, body, { timeout: 300 * 1000 })

                if (data.r) {
                    const validators = []
                    for (var i = 0; i < data.r.length; i++) {
                        const recoveredAddress = Web3Util.recoverSignerFromSignature(data.msgHash, data.r[i], data.s[i], data.v[i])
                        validators.push(recoveredAddress)
                    }
                    data.validators = validators
                }

                await db.Nft721Transaction.updateOne(
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


module.exports = { doIt, getValidSignature, isValidSignature }