const express = require('express')
const router = express.Router()
const db = require('../models')
const Web3Utils = require('../helpers/web3')
const { check, validationResult, query } = require('express-validator')
require('dotenv').config()
const config = require('config')
const eventHelper = require('../helpers/event')
const IERC20ABI = require('../contracts/ERC20.json')
const axios = require('axios')


router.get('/status',[], async function (req, res) {
    return res.json({status: 'ok'})
})

router.get('/transactions/:account/:networkId',[
    check('account').exists().isLength({ min: 42, max: 42 }).withMessage('address is incorrect.'),
    check('networkId').exists().isNumeric({ no_symbols: true }).withMessage('networkId is incorrect'),
    query('limit').isInt({ min: 0, max: 200 }).optional().withMessage('limit should greater than 0 and less than 200'),
    query('page').isNumeric({ no_symbols: true }).optional().withMessage('page must be number')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let limit = (req.query.limit) ? parseInt(req.query.limit) : 20
    let page = req.query.page || 1
    let skip = limit * (page - 1)
    let account = req.params.account.toLowerCase()
    let networkId = req.params.networkId
    let query = {account: account, $or: [{fromChainId: networkId}, {toChainId: networkId}]}
    let total = await db.Transaction.countDocuments(query)
    let transactions = await db.Transaction.find(query).sort({requestTime: -1}).limit(limit).skip(skip)
    return res.json({transactions: transactions,
        page: page,
        limit: limit,
        total: total})
})


router.post('/request-withdraw',[
    //check('signature').exists().withMessage('signature is require'),
    check('requestHash').exists().withMessage('message is require'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('toChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('index').exists().withMessage('index is require')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let requestHash = req.body.requestHash
    let fromChainId = req.body.fromChainId
    let toChainId = req.body.toChainId
    let index = req.body.index

    let web3 = await Web3Utils.getWeb3(fromChainId)
    let transaction = {}
    if (!config.checkTxOnChain) {
        transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId, toChainId: toChainId, index: index})
    } else {
        transaction = await eventHelper.getRequestEvent(fromChainId, requestHash, index)
    }

    if (!transaction) {
        return res.status(400).json({errors: 'Transaction does not exist'})
    }
    if (transaction.claimed === true) {
        return res.status(400).json({errors: 'Transaction claimed'})
    }

    //re-verify whether tx still in the chain and confirmed (enough confirmation)
    let onChainTx = await web3.eth.getTransaction(transaction.requestHash)
    if (!onChainTx) {
        return res.status(400).json({errors: 'invalid transaction hash'})
    }

    let latestBlockNumber = await web3.eth.getBlockNumber()
    let confirmations = config.blockchain[fromChainId].confirmations
    if (latestBlockNumber - transaction.requestBlock < confirmations) {
        return res.status(400).json({errors: 'transaction not fully confirmed'})
    }

    let txBlock = await web3.eth.getBlock(transaction.requestBlock)
    if (!txBlock || txBlock.number !== onChainTx.blockNumber) {
        return res.status(400).json({errors: 'transaction invalid, fork happened'})
    }

    //is it necessary? check whether tx included in the block
    if (txBlock.transactions.length <= onChainTx.transactionIndex || txBlock.transactions[onChainTx.transactionIndex].toLowerCase() !== transaction.requestHash.toLowerCase()) {
        return res.status(400).json({errors: 'transaction not found, fork happened'})
    }
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
            for (let i = 0; i < config.signatureServer.length; i++) {
                r.push(axios.post(config.signatureServer[i] + '/request-withdraw', body))
            }

            const responses = await Promise.all(r)

            for (let i = 0; i < config.signatureServer.length; i++) {
                otherSignature.push(responses[i].data)
            }

        } catch (e) {
            console.log(e)
        }
    }

    const nativeAddress = config.get('nativeAddress')
    let name, decimals, symbol
    if (transaction.originToken.toLowerCase() === nativeAddress.toLowerCase()) {
        name = config.blockchain[data.originChainId].nativeName
        symbol = config.blockchain[data.originChainId].nativeSymbol
        decimals = 18
    } else {
        let web3Origin = await Web3Utils.getWeb3(transaction.originChainId)
        let  originTokenContract = await new web3Origin.eth.Contract(IERC20ABI, transaction.originToken)
        name = await originTokenContract.methods.name().call()
        decimals = await originTokenContract.methods.decimals().call()
        symbol = await originTokenContract.methods.symbol().call()
    }
    if (transaction.toChainId !== transaction.originChainId) {
        name = "dto" + name
    }
    //signing
    let sig = Web3Utils.signClaim(
        transaction.originToken,
        transaction.account,
        transaction.amount,
        [transaction.originChainId, transaction.fromChainId, transaction.toChainId, transaction.index],
        transaction.requestHash,
        name,
        symbol,
        decimals
    )
    let r =[sig.r]
    let s =[sig.s]
    let v =[sig.v]
    if (otherSignature.length > 0) {
        for (let i = 0; i < otherSignature.length; i++) {
            r.push(otherSignature[i].r[0])
            s.push(otherSignature[i].s[0])
            v.push(otherSignature[i].v[0])
        }
    }

    return res.json({r: r, s: s, v: v, msgHash: sig.msgHash, name: name, symbol: symbol, decimals: decimals})
})


module.exports = router
