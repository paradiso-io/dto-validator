const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Setting = new Schema({
    networkId: { type: Number, index: true },
    lastBlockRequest: Number,
    lastNft721BlockRequest: Number,
    lastBlockClaim: Number
}, { timestamps: false })

module.exports = mongoose.model('Setting', Setting)
