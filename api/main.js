const express = require('express')
const router = express.Router()
const db = require('../models')
const Web3Utils = require('../helpers/web3')
const { check, validationResult, query } = require('express-validator')
const PrivateKeyProvider = require('truffle-privatekey-provider')


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
    let account = req.params.account
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
    check('signature').exists().withMessage('signature is require'),
    check('requestHash').exists().withMessage('message is require'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('toChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('index').exists().withMessage('index is require')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let signature = req.body.signature
    let requestHash = req.body.requestHash
    let fromChainId = req.body.fromChainId
    let toChainId = req.body.toChainId
    let index = req.body.index

    let transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId, toChainId: toChainId, index: index})
    if (!transaction) {
        return res.status(400).json({errors: 'Transaction does not exist'})
    }
    if (transaction.claimed) {
        return res.status(400).json({errors: 'Transaction was claimed'})
    }

    let web3 = await Web3Utils.getWeb3(fromChainId)

    const signer = await web3.eth.accounts.recover(requestHash, signature)
    if (signer.toLowerCase() !== transaction.account) {
        return res.status(400).json({errors: 'Signer is incorrect'})
    }

    let web3key = await Web3Utils.getWeb3WithPrivateKey(fromChainId)
    let coinbase = (await web3key.eth.getCoinbase()).toLowerCase()
    let managerSignature = await web3key.eth.sign(requestHash, coinbase)

    return res.json({manager: coinbase, signature: managerSignature})


})


module.exports = router
