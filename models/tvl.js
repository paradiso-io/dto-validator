const mongoose = require('mongoose')
const Schema = mongoose.Schema

const TVL = new Schema({
    tvl: Number,
    lastUpdatedTimestamp: Number,
}, { timestamps: false })

module.exports = mongoose.model('TVL', TVL)
