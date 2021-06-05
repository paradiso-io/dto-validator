const express = require('express')
const router = express.Router()
const db = require('../models')
const { check, validationResult, query } = require('express-validator')


router.get('/transactions/:account/:networkId',[
    check('account').exists().isLength({ min: 42, max: 42 }).withMessage('address is incorrect.'),
    check('networkId').exists().isNumeric({ no_symbols: true }).withMessage('networkId is incorrect.'),
    query('limit').isInt({ min: 0, max: 200 }).optional().withMessage('limit should greater than 0 and less than 200'),
    query('page').isNumeric({ no_symbols: true }).optional().withMessage('page must be number')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return next(errors.array())
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
    check('account').exists().isLength({ min: 42, max: 42 }).withMessage('address is incorrect'),
    check('signature').exists().withMessage('signature is require'),
    check('message').exists().withMessage('message is incorrect')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return next(errors.array())
    }

})


module.exports = router
