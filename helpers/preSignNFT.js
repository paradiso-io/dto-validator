const db = require('../models')
const GeneralHelper = require('./general')
const config = require('config')
const axios = require('axios')
const CasperHelper = require('./casper')
let submitDone = true
let eventHelper = require('./event')
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
        for(const sig of signatures) {
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
        unclaimedRequests = unclaimedRequests.filter(e => !e.signatureSubmitted || !e.signatures || !getValidSignature(e.signatures))
        // console.log('unclaimedRequests', unclaimedRequests)
        for (const request of unclaimedRequests) {
            const validSignature = getValidSignature(request.signatures)
            if (request.signatures && validSignature && !request.signatureSubmitted && !request.txInvalidTarget) {
                let tx = await eventHelper.getRequestNft721Event(request.fromChainId, request.requestHash, request.index)
                if (tx.invalidTarget) {
                    await db.Nft721Transaction.updateOne(
                        { requestHash: request.requestHash, fromChainId: request.fromChainId, toChainId: request.toChainId, index: request.index },
                        {
                            $set: {
                                txInvalidTarget: true
                            }
                        },
                        { upsert: true, new: true }
                    )
                    continue
                }
                console.log("Find new req !!!")
                publishSignatures(validSignature, request.requestHash, request.fromChainId, request.toChainId, request.index)
            } else {
                if (request.txInvalidTarget) {
                    console.warn("invalid", request.requestHash)
                    continue
                }
                const casperConfig = CasperHelper.getConfigInfo()
                if (request.toChainId == casperConfig.networkId) {
                    await db.Nft721Transaction.updateOne(
                        {
                            requestHash: request.requestHash,
                            fromChainId: request.fromChainId,
                            toChainId: request.toChainId,
                            index: request.index
                        },
                        {
                            $set:
                            {
                                signatures: [],
                                signatureSubmitted: true
                            }
                        },
                        { upsert: true, new: true }
                    )
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
                    let { data } = await axios.post(url, body, { timeout: 30 * 1000 })
                    console.log('data returned url', url, data)
                    await db.Nft721Transaction.updateOne(
                        { requestHash: request.requestHash, fromChainId: request.fromChainId, toChainId: request.toChainId, index: request.index },
                        {
                            $set: 
                            {
                                signatures: [data]
                            }
                        },
                        { upsert: true, new: true }
                    )
                } catch (e) {
                    if (request.fromChainId != casperConfig.networkId) {
                        let tx = await eventHelper.getRequestNft721Event(request.fromChainId, request.requestHash, request.index)
                        if (tx.invalidTarget) {
                            await db.Nft721Transaction.updateOne(
                                { requestHash: request.requestHash, fromChainId: request.fromChainId, toChainId: request.toChainId, index: request.index },
                                {
                                    $set: {
                                        txInvalidTarget: true
                                    }
                                },
                                { upsert: true, new: true }
                            )
                        }
                    }
                    console.error(e)
                }
            }
        }
    } catch (e) {
        console.error(e)
    }
    submitDone = true
    return
}

module.exports = { doIt, getValidSignature, isValidSignature }