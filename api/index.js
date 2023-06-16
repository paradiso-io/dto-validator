const express = require('express')
const router = express.Router()

router.use('/', require('./main'))
router.use('/nft721', require('./nft721'))
router.use('/airdrop', require('./airdrop'))
router.use('/mpc', require('./mpc'))

module.exports = router
