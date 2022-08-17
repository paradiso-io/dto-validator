const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const Nft721RequestToCasper = new Schema(
  {
    requestHash: { type: String, index: true },
    index: { type: Number, index: true },
    deployHash: { type: String, index: true },
    deployHashToSign: { type: String, index: true },
    toWallet: { type: String, index: true },
    fromChainId: { type: Number, index: true },
    toChainId: { type: Number, index: true },
    originChainId: { type: Number, index: true },
    originToken: { type: String, index: true },
    destinationContractHash: { type: String, index: true },
    timestamp: { type: Number, index: true },
    ttl: { type: Number, index: true },
    deadline: { type: Number, index: true },
    identifierMode: { type: Number, index: true },
    tokenIds: { type: String, index: true },
    isProcessed: { type: Boolean, index: true },  //already submit to the MPC
    deployJsonString: String,
    claimId: { type: String, unique: true },
    txExecuted: { type: Boolean, index: true },
    renewalCount: {type: Number, index: true}
  },
  { timestamps: false, versionKey: false }
);

module.exports = mongoose.model("Nft721RequestToCasper", Nft721RequestToCasper);
