const mongoose = require('mongoose')
const Schema = mongoose.Schema

const TokenMap = new Schema({
    address: { type: String, index: true }, //origin contract address
    networkId: {type: Number, index: String},   //origin network Id
    name: String,
    symbol: String,
    decimals: Number,
    mapInfo: Object,
    lastUpdated: Number
}, { timestamps: false, v: false })

module.exports = mongoose.model('TokenMap', TokenMap)
