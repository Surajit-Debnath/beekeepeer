const mongoose = require("mongoose");

const custodyTransferSchema = new mongoose.Schema({
    blockchainBatchId: { type: String, required: true, index: true },
    fromWallet: { type: String, required: true },
    toWallet: { type: String, required: true },
    fromRole: { type: String, required: true },
    toRole: { type: String, required: true },
    location: { type: String, required: true },
    notes: { type: String, default: "" },
    transactionHash: { type: String, required: true },
    blockNumber: { type: Number, required: true },
    blockHash: { type: String, required: false },
    transactionIndex: { type: Number, required: false },
    logIndex: { type: Number, required: false },
    timestamp: { type: Date, required: true },
    contractAddress: { type: String, required: true },
    chainId: { type: Number, required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, required: false },
    eventKey: { type: String, required: true }
});

custodyTransferSchema.index({ blockchainBatchId: 1, timestamp: 1 });
custodyTransferSchema.index(
    { chainId: 1, contractAddress: 1, eventKey: 1 },
    { unique: true }
);
custodyTransferSchema.index({ transactionHash: 1, logIndex: 1 });

module.exports = mongoose.model("CustodyTransfer", custodyTransferSchema);
