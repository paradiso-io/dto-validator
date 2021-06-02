const express = require('express')
const router = express.Router()
const db = require('../models')
const { check, validationResult, query } = require('express-validator')


router.get('/:account/:networkId',[
    check('candidate').exists().isLength({ min: 42, max: 42 }).withMessage('Candidate address is incorrect.')
], async function (req, res, next) {

})


module.exports = router
