const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Transaction = new Schema({
    requestHash: { type: String, index: true },
    requestBlock: {type: Number, index: true},
    claimHash: { type: String, index: true },
    claimBlock: Number,
    account: { type: String, index: true },
    originToken: { type: String, index: true },
    sourceToken: { type: String, index: true },
    targetToken: { type: String, index: true },
    isClaim: { type: Boolean, index: true },
    originSymbol: String,
    sourceSymbol: String,
    targetSymbol: String,
    sourceChainId: { type: Number, index: true},
    originChainId: { type: Number, index: true},
    targetChainId: { type: Number, index: true},
    amount: String,
    amountNumber: Number,
    index: { type: Number, index: true},
    claimId: String,
}, { timestamps: false, v: false })

module.exports = mongoose.model('Transaction', Transaction)
