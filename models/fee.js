const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Fee = new Schema({
    token: { type: String, index: true },
    networkId: { type: String, index: true },
    toChainId: { type: String, index: true },
    feeAmount: String,
    feePercent: String,
    lastUpdatedAt: Number
}, { timestamps: false, v: false })

module.exports = mongoose.model('Fee', Fee)
