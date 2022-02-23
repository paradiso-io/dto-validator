const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RequestToCasper = new Schema(
  {
    requestHash: { type: String, index: true },
    requestIndex: { type: Number, index: true },
    deployHash: { type: String, index: true },
    deployHashToSign: { type: String, index: true },
    fromWallet: { type: String, index: true },
    toWallet: { type: String, index: true },
    sourceChainId: { type: Number, index: true },
    destinationChainId: { type: Number, index: true },
    sourceTokenAddress: { type: String, index: true },
    destinationTokenAddress: { type: String, index: true },
    timestamp: Number,
    isProcess: { type: Boolean, index: true },
    depoyJsonString: String,
  },
  { timestamps: false, versionKey: false }
);

module.exports = mongoose.model("RequestToCasper", RequestToCasper);
