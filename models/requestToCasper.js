const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RequestToCasper = new Schema(
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
    timestamp: Number,
    amount: { type: String, index: true },
    isProcessed: { type: Boolean, index: true },  //already submit to the MPC
    deployJsonString: String,
  },
  { timestamps: false, versionKey: false }
);

module.exports = mongoose.model("RequestToCasper", RequestToCasper);
