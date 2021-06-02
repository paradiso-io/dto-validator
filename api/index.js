const express = require('express')
const router = express.Router()

router.use('/api/', require('./main'))

module.exports = router
