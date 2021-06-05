const express = require('express')
const router = express.Router()
const db = require('../models')
const { check, validationResult, query } = require('express-validator')


router.get('/:account',[
    check('account').exists().isLength({ min: 42, max: 42 }).withMessage('address is incorrect.')
], async function (req, res, next) {
    let account = req.params.account
    let transactions = await db.Transaction.find({account: account})
    return res.json({error: 0, transactions: transactions})
})


module.exports = router
