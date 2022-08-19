const express = require('express')
const router = express.Router()
const db = require('../models')
const Web3Utils = require('../helpers/web3')
const { check, validationResult, query } = require('express-validator')
require('dotenv').config()
const config = require('config')
const eventHelper = require('../helpers/event')
const ERC721 = require('../contracts/ERC721.json')
const axios = require('axios')
const CasperHelper = require('../helpers/casper')
const logger = require('../helpers/logger')
const casperConfig = CasperHelper.getConfigInfo()
const tokenHelper = require("../helpers/token");
const GeneralHelper = require('../helpers/general')

router.get('/transactions/:account/:networkId', [
    check('account').exists().isLength({ min: 42, max: 68 }).withMessage('address is incorrect.'),
    check('networkId').exists().isNumeric({ no_symbols: true }).withMessage('networkId is incorrect'),
    query('limit').isInt({ min: 0, max: 200 }).optional().withMessage('limit should greater than 0 and less than 200'),
    query('page').isNumeric({ no_symbols: true }).optional().withMessage('page must be number')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let account = req.params.account.toLowerCase()
    if (account.length != 42 && account.length != 68 && account.length != 66) {
        return res.status(400).json({ errors: "invalid address" })
    }
    {
        //check hex
        let temp = account.replace("0x", "")
        var re = /[0-9A-Fa-f]{6}/g;

        if (!re.test(temp)) {
            return res.status(400).json({ errors: "address must be hex" })
        }

        if (account.length == 68 || account.length == 66) {
            if (account.substring(0, 2) != "01" && account.substring(0, 2) != "02") {
                return res.status(400).json({ errors: "invalid casper public key" })
            }

            // if (account.substring(2, 4) != "03" && account.substring(2, 4) != "02") {
            //     return res.status(400).json({ errors: "invalid casper public key" })
            // }

            account = CasperHelper.fromCasperPubkeyToAccountHash(account)
        }
    }
    let limit = (req.query.limit) ? parseInt(req.query.limit) : 20
    let page = req.query.page || 1
    let skip = limit * (page - 1)
    let networkId = req.params.networkId

    let query = {
        $and: [
            { $or: [{ txCreator: account }, { account: account }] },
            { $or: [{ fromChainId: networkId }, { toChainId: networkId }] }
        ]
    }
    let total = await db.Nft721Transaction.countDocuments(query)
    let transactions = await db.Nft721Transaction.find(query).sort({ requestTime: -1 }).limit(limit).skip(skip).lean().exec()

    return res.json({
        transactions: transactions,
        page: page,
        limit: limit,
        total: total
    })
})


router.get('/transaction-status/:requestHash/:fromChainId', [
    check('requestHash').exists().withMessage('message is required'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    console.log('req', req.params)
    let requestHash = req.params.requestHash
    let fromChainId = req.params.fromChainId
    let index = req.query.index ? req.query.index : ''

    if (req.query.index !== '') {
        {
            //check transaction on-chain
            if (fromChainId != casperConfig.networkId) {
                let transaction = await eventHelper.getRequestNft721Event(fromChainId, requestHash)
                if (!transaction || !transaction.requestHash) {
                    //cant find transaction on-chain
                    return res.status(400).json({ errors: "transaction not found" })
                }
                index = transaction.index
            } else {
                transaction = await db.Nft721Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
                index = transaction.index
            }
        }
    }

    //read tx from the server itself
    let requestData = `verify-transaction/${requestHash}/${fromChainId}/${index}`
    let myself = `http://localhost:${config.server.port}/nft721/${requestData}`
    console.log('verify tx', myself)
    let verifyRet = await axios.get(myself)
    let myNodeResult = verifyRet.data
    console.log('myNodeResult', myNodeResult)
    const readStatus = async (i) => {
        try {
            console.log('reading from', config.signatureServer[i])
            let ret = await axios.get(config.signatureServer[i] + `/${requestData}`, { timeout: 10 * 1000 })
            ret = ret.data
            console.log('reading from ret ', ret)
            ret = ret.success ? ret.success : false
            return { index: i, success: ret }
        } catch (e) {
            console.log('e', e.toString())
        }
        return { index: i, success: false }
    }

    let responses = []
    if (config.signatureServer.length > 0) {
        try {
            let r = []
            for (let i = 0; i < config.signatureServer.length; i++) {
                r.push(readStatus(i))
            }

            responses = await Promise.all(r)

        } catch (e) {
            console.log(e)
        }
    }

    return res.json({ apiServer: myNodeResult.success, others: responses, index: index })
})

router.get('/history', [
    query('limit').isInt({ min: 0, max: 200 }).optional().withMessage('limit should greater than 0 and less than 200'),
    query('page').isNumeric({ no_symbols: true }).optional().withMessage('page must be number')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let limit = (req.query.limit) ? parseInt(req.query.limit) : 50
    let page = req.query.page || 1
    let skip = limit * (page - 1)
    let total = await db.Nft721Transaction.countDocuments({})
    let transactions = await db.Nft721Transaction.find({}).sort({ requestTime: -1 }).limit(limit).skip(skip).lean().exec()

    return res.json({
        transactions: transactions,
        page: page,
        limit: limit,
        total: total
    })
})

router.get('/verify-transaction/:requestHash/:fromChainId/:index', [
    check('requestHash').exists().withMessage('message is require'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('index').exists().withMessage('index is require')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    let requestHash = req.params.requestHash
    let fromChainId = req.params.fromChainId
    let index = req.params.index
    let transaction = {}
    if (fromChainId != casperConfig.networkId) {
        transaction = await eventHelper.getRequestEvent(fromChainId, requestHash, index)
    }
    if (!transaction || (fromChainId != casperConfig.networkId && !transaction.requestHash)) {
        return res.json({ success: false })
    }
    if (fromChainId != casperConfig.networkId) {
        let web3 = await Web3Utils.getWeb3(fromChainId)

        if (!transaction) {
            return res.json({ success: false })
        }
        if (transaction.claimed === true) {
            return res.json({ success: true, claimed: true })
        }

        //re-verify whether tx still in the chain and confirmed (enough confirmation)
        let onChainTx = await web3.eth.getTransaction(transaction.requestHash)
        if (!onChainTx) {
            return res.json({ success: false })
        }

        let latestBlockNumber = await web3.eth.getBlockNumber()
        let confirmations = config.blockchain[fromChainId].confirmations
        if (latestBlockNumber - transaction.requestBlock < confirmations) {
            return res.json({ success: false, unconfirmed: true })
        }

        let txBlock = await web3.eth.getBlock(transaction.requestBlock)
        if (!txBlock || txBlock.number !== onChainTx.blockNumber) {
            return res.json({ success: false })
        }

        //is it necessary? check whether tx included in the block
        if (txBlock.transactions.length <= onChainTx.transactionIndex || txBlock.transactions[onChainTx.transactionIndex].toLowerCase() !== transaction.requestHash.toLowerCase()) {
            return res.json({ success: false })
        }
    } else {
        //casper
        let casperRPC = CasperHelper.getCasperRPC()
        try {
            transaction = await db.Nft721Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
            let deployResult = await casperRPC.getDeployInfo(CasperHelper.toCasperDeployHash(transaction.requestHash))
            let eventData = await CasperHelper.parseRequestFromCasper(deployResult)
            if (eventData.toAddr.toLowerCase() != transaction.account.toLowerCase()
                || eventData.originToken.toLowerCase() != transaction.originToken.toLowerCase()
                || eventData.amount != transaction.amount
                || eventData.fromChainId != transaction.fromChainId
                || eventData.toChainId != transaction.toChainId
                || eventData.originChainId != transaction.originChainId
                || eventData.index != transaction.index) {
                return res.json({ success: false })
            }
        } catch (e) {
            console.error(e)
            return res.json({ success: false })
        }
    }
    return res.json({ success: true })
})

router.post('/request-withdraw', [
    //check('signature').exists().withMessage('signature is require'),
    check('requestHash').exists().withMessage('message is require'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('toChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('index').exists().withMessage('index is require')
],
  async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let requestHash = req.body.requestHash
    let fromChainId = req.body.fromChainId
    let toChainId = req.body.toChainId
    let index = req.body.index
    let transaction = {}
    if (!config.checkTxOnChain) {
        transaction = await db.Nft721Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId, toChainId: toChainId, index: index })
    } else {
        transaction = await eventHelper.getRequestNft721Event(fromChainId, requestHash, index)
    }
    if (!transaction) {
        return res.status(400).json({ errors: "invalid transaction hash" })
    }
    if (fromChainId != casperConfig.networkId) {
        let web3 = await Web3Utils.getWeb3(fromChainId)

        if (!transaction) {
            return res.status(400).json({ errors: 'Transaction does not exist' })
        }
        if (transaction.claimed === true) {
            return res.status(400).json({ errors: 'Transaction claimed' })
        }

        //re-verify whether tx still in the chain and confirmed (enough confirmation)
        let onChainTx = await web3.eth.getTransaction(transaction.requestHash)
        if (!onChainTx) {
            return res.status(400).json({ errors: 'invalid transaction hash' })
        }

        let latestBlockNumber = await web3.eth.getBlockNumber()
        let confirmations = config.blockchain[fromChainId].confirmations
        if (latestBlockNumber - transaction.requestBlock < confirmations) {
            return res.status(400).json({ errors: 'transaction not fully confirmed' })
        }

        let txBlock = await web3.eth.getBlock(transaction.requestBlock)
        if (!txBlock || txBlock.number !== onChainTx.blockNumber) {
            return res.status(400).json({ errors: 'transaction invalid, fork happened' })
        }

        //is it necessary? check whether tx included in the block
        if (txBlock.transactions.length <= onChainTx.transactionIndex || txBlock.transactions[onChainTx.transactionIndex].toLowerCase() !== transaction.requestHash.toLowerCase()) {
            return res.status(400).json({ errors: 'transaction not found, fork happened' })
        }
    } else {
        //casper
        let casperRPC = CasperHelper.getCasperRPC()
        try {
            let deployResult = await casperRPC.getDeployInfo(CasperHelper.toCasperDeployHash(transaction.requestHash))
            let eventData = await CasperHelper.parseRequestFromCasper(deployResult)
            if (eventData.toAddr.toLowerCase() != transaction.account.toLowerCase()
                || eventData.originToken.toLowerCase() != transaction.originToken.toLowerCase()
                || eventData.amount != transaction.amount
                || eventData.fromChainId != transaction.fromChainId
                || eventData.toChainId != transaction.toChainId
                || eventData.originChainId != transaction.originChainId
                || eventData.index != transaction.index) {
                return res.status(400).json({ errors: 'conflict transaction data between local database and on-chain data ' + transaction.requestHash })
            }
        } catch (e) {
            console.error(e)
            return res.status(400).json({ errors: 'failed to get on-chain casper transction for ' + transaction.requestHash })
        }
    }

    let tokenIds = transaction.tokenIds
    let name, symbol, tokenUris = [], bytesOriginToken = transaction.originToken
    let web3Origin = await Web3Utils.getWeb3(transaction.originChainId)
    let originTokenContract = await new web3Origin.eth.Contract(ERC721, transaction.originToken)

    if (transaction.originChainId != casperConfig.networkId) {
        bytesOriginToken = bytesOriginToken.replace('0x', '0x000000000000000000000000')
    }
    let chainIdsIndex = [transaction.originChainId, transaction.fromChainId, transaction.toChainId, transaction.index]

    for (let i = 0; i < tokenIds.length; i++) {
        try {
            tokenUris.push(await originTokenContract.methods.tokenURI(tokenIds[i]).call())
        } catch (e) {
            tokenUris.push('')
        }
    }
    name = await originTokenContract.methods.name().call()
    symbol = await originTokenContract.methods.symbol().call()
    if (transaction.toChainId !== transaction.originChainId) {
        let nativeName = config.blockchain[transaction.toChainId].nativeName
        name = "DTO Wrapped " + name + `(${nativeName})`
        symbol = "d" + symbol
    }

    if (transaction.toChainId == casperConfig.networkId) {
        return res.status(400).json({ errors: 'Dont manually claim on casper chain' })
    }

    let r = []
    let s = []
    let v = []
    if (config.proxy) {
        let msgHash = ""
        //dont sign

        let otherSignature = []
        if (config.signatureServer.length > 0) {
            try {
                let body = {
                    requestHash: req.body.requestHash,
                    fromChainId: req.body.fromChainId,
                    toChainId: req.body.toChainId,
                    index: req.body.index
                }
                let r = []
                const requestSignatureFromOther = async function (i) {
                    try {
                        console.log("requesting signature from ", config.signatureServer[i])
                        let ret = await axios.post(config.signatureServer[i] + 'nft721/request-withdraw', body, { timeout: 20 * 1000 })
                        let recoveredAddress = Web3Utils.recoverSignerFromSignature(ret.data.msgHash, ret.data.r[0], ret.data.s[0], ret.data.v[0])
                        console.log("signature data ok ", config.signatureServer[i], recoveredAddress)
                        return ret
                    } catch (e) {
                        console.log("failed to get signature from ", config.signatureServer[i], e.toString())
                        return { data: {} }
                    }
                }
                for (let i = 0; i < config.signatureServer.length; i++) {
                    r.push(requestSignatureFromOther(i))
                }

                const responses = await Promise.all(r)

                for (let i = 0; i < config.signatureServer.length; i++) {
                    otherSignature.push(responses[i].data)
                }

            } catch (e) {
                console.log(e)
            }
        }

        if (otherSignature.length > 0) {
            for (let i = 0; i < otherSignature.length; i++) {
                if (otherSignature[i].r) {
                    msgHash = otherSignature[i].msgHash
                    r.push(otherSignature[i].r[0])
                    s.push(otherSignature[i].s[0])
                    v.push(otherSignature[i].v[0])
                }
            }
        }

        //reading required number of signature
        let minApprovers = 0
        let approverList = []
        let retry = 10
        console.log("reading minApprovers", minApprovers)
        while(retry > 0) {
            try {
                let bridgeContract = await Web3Utils.getNft721BridgeContract(transaction.toChainId)
                minApprovers = await bridgeContract.methods.minApprovers().call()
                approverList = await bridgeContract.methods.getBridgeApprovers().call()
                minApprovers = parseInt(minApprovers)
                break
            } catch(e) {
                console.log(e)
                console.log("error in reading approver", minApprovers)
                await GeneralHelper.sleep(5 * 1000)
            }
            retry--
        }
        approverList = approverList.map(e => e.toLowerCase())
        //filtering only good signature
        console.log("done reading minApprovers", minApprovers)
        let goodR = []
        let goodS = []
        let goodV = []
        for(var i = 0; i < r.length; i++) {
            let recoveredAddress = Web3Utils.recoverSignerFromSignature(msgHash, r[i], s[i], v[i])
            if (approverList.includes(recoveredAddress.toLowerCase())) {
                goodR.push(r[i])
                goodS.push(s[i])
                goodV.push(v[i])
            }
        }
        r = goodR
        s = goodS
        v = goodV
        
        if (r.length < minApprovers) {
            console.warn('Validators data are not fully synced yet, please try again later')
            return res.status(400).json({ errors: 'Validators data are not fully synced yet, please try again later' })
        }

        r = r.slice(0, minApprovers + 2)
        s = s.slice(0, minApprovers + 2)
        v = v.slice(0, minApprovers + 2)

        return res.json({r, s, v, msgHash, name, symbol, tokenUris, originToken: bytesOriginToken, chainIdsIndex, tokenIds})
    } else {
        let txHashToSign = transaction.requestHash.includes("0x") ? transaction.requestHash : ("0x" + transaction.requestHash)
        logger.info("txHashToSign %s", txHashToSign)
        let sig = Web3Utils.signClaimNft721(
            bytesOriginToken,
            transaction.account,
            transaction.tokenIds,
            chainIdsIndex,
            txHashToSign,
            name,
            symbol,
            tokenUris
        )

        let r = [sig.r]
        let s = [sig.s]
        let v = [sig.v]


        return res.json({r, s, v, msgHash: sig.msgHash, name, symbol, tokenUris, originToken: bytesOriginToken, chainIdsIndex, tokenIds})
    }
})

router.get('/bridge-fee/:originToken/:networkId/:toChainId', [
    check('networkId').exists().isNumeric({ no_symbols: true }).withMessage('networkId is incorrect'),
    check('toChainId').exists().isNumeric({ no_symbols: true }).withMessage('toChainId is incorrect'),
    check('originToken').exists().isLength({ min: 42, max: 68 }).withMessage('token address is incorrect.')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let originToken = req.params.originToken.toLowerCase()
    if (originToken.length != 42) {
        return res.status(400).json({ errors: "invalid token address" })
    }

    let networkId = req.params.networkId
    let toChainId = req.params.toChainId
    if (`${toChainId}` == `${casperConfig.networkId}`) {
        return CasperHelper.getBridgeFee(originToken)
    }

    let feeToken = await db.Fee.findOne({ token: originToken, networkId: networkId, toChainId: toChainId })
    let feeAmount = '0'
    let feePercent = 0
    let feeDivisor = 10000
    if (feeToken) {
        feeAmount = feeToken.feeAmount
        feePercent = feeToken.feePercent
    }
    return res.json({
        feeAmount: feeAmount,
        feePercent: feePercent,
        feeDivisor: feeDivisor
    })
})


module.exports = router
