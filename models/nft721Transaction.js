const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Nft721Transaction = new Schema({
    requestHash: { type: String, index: true },
    requestBlock: { type: Number, index: true },
    claimHash: { type: String, index: true },
    claimBlock: Number,
    account: { type: String, index: true },
    txCreator: { type: String, index: true },
    originToken: { type: String, index: true },
    fromToken: { type: String, index: true },
    toToken: { type: String, index: true },
    claimed: { type: Boolean, index: true },
    originSymbol: String,
    originName: String,
    fromSymbol: String,
    toSymbol: String,
    fromChainId: { type: Number, index: true },
    originChainId: { type: Number, index: true },
    toChainId: { type: Number, index: true },
    tokenIds: [{ type: String }],
    tokenHashes: [{ type: String }],
    index: { type: Number, index: true },
    claimId: String,
    requestTime: { type: Number, index: true },
    casperDeployCreated: { type: Boolean, index: true },
    casperCreatedFailedReason: String,
    isNFT: Boolean,
    tokenMetadatas: [{ type: String }],
    identifierMode: Number,
    signatures: [Object],
    signatureSubmitted: Boolean,
    txInvalidTarget: Boolean,
    isCasperApproveToClaim: Boolean,
    isCasperClaimed: Boolean,
    failureCount: { type: Number, index: true }
}, { timestamps: false, versionKey: false })

module.exports = mongoose.model('Nft721Transaction', Nft721Transaction)
