const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Transaction = new Schema({
    requestHash: { type: String, index: true },
    requestBlock: {type: Number, index: true},
    claimHash: { type: String, index: true },
    claimBlock: Number,
    account: { type: String, index: true },
    originToken: { type: String, index: true },
    fromToken: { type: String, index: true },
    toToken: { type: String, index: true },
    isClaim: { type: Boolean, index: true },
    originSymbol: String,
    fromSymbol: String,
    toSymbol: String,
    fromChainId: { type: Number, index: true},
    originChainId: { type: Number, index: true},
    toChainId: { type: Number, index: true},
    amount: String,
    amountNumber: Number,
    index: { type: Number, index: true},
    claimId: String,
    requestTime: { type: Number, index: true}
}, { timestamps: false, versionKey: false })

module.exports = mongoose.model('Transaction', Transaction)
