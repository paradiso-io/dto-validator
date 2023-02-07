const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Token = new Schema({
    hash: { type: String, index: true },
    networkId: {type: Number, index: String},
    name: String,
    symbol: String,
    decimals: Number,
    totalSupply: Number,
}, { timestamps: false, versionKey: false })

module.exports = mongoose.model('Token', Token)
