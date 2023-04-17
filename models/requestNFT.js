const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RequestNFT = new Schema(
  {
    requestHash: { type: String, index: true },
    index: { type: Number, index: true },
    deployHash: { type: String, index: true },
    deployHashToSign: { type: String, index: true },
    account: { type: String, index: true }, // to Address
    fromChainId: { type: Number, index: true },
    toChainId: { type: Number, index: true },
    originChainId: { type: Number, index: true },
    originToken: { type: String, index: true },
    destinationContractHash: { type: String, index: true },
    timestamp: { type: Number, index: true },
    ttl: { type: Number, index: true },
    deadline: { type: Number, index: true },
    amount: { type: String, index: true },
    isProcessed: { type: Boolean, index: true },  //already submit to the MPC
    deployJsonString: String,
    mintid: { type: String, unique: true },
    token_metadata : {type: Object, index : true},
    txExecuted: { type: Boolean, index: true },
    renewalCount: {type: Number, index: true},
    isNFT: Boolean,
    tokenIds : [{type: String}],
    tokenHashes: [{type: String}]
  },
  { timestamps: false, versionKey: false }
);

module.exports = mongoose.model("RequestNFT", RequestNFT);
