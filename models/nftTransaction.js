const mongoose = require('mongoose')
const Schema = mongoose.Schema

const NFTTransaction = new Schema({
    requestHash: { type: String, index: true },
    requestBlock: {type: Number, index: true},
    claimHash: { type: String, index: true },
    claimBlock: Number,
    token_owner: { type: String, index: true },
    txCreator: { type: String, index: true },
    originToken: { type: String, index: true },
    fromToken: { type: String, index: true },
    toToken: { type: String, index: true },
    claimed: { type: Boolean, index: true },
    originSymbol: String,
    fromSymbol: String,
    toSymbol: String,
    fromChainId: { type: Number, index: true},
    originChainId: { type: Number, index: true},
    toChainId: { type: Number, index: true},
    amount: String,
    nft_id: String,
    token_metadata: {type : Object},
    amountNumber: Number,
    index: { type: Number, index: true},
    claimId: String,
    requestTime: { type: Number, index: true},
    casperDeployCreated: { type: Boolean, index: true },
    casperCreatedFailedReason: String
}, { timestamps: false, versionKey: false })

module.exports = mongoose.model('NFTTransaction', NFTTransaction)
