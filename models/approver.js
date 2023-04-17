const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Approver = new Schema({
    chainId: { type: String, index: true },
    minNumber: Number,
    list: [{type: String}],
    fetchedAt: Number
}, { timestamps: false, versionKey: false })

module.exports = mongoose.model('Approver', Approver)
