const mongoose = require("mongoose");

const labTestSchema = new mongoose.Schema({
    blockchainBatchId: { type: String, required: true },
    inspectorUserId: { type: mongoose.Schema.Types.ObjectId, required: false },
    inspectorWallet: { type: String, required: true },
    passed: { type: Boolean, required: true },
    reportCID: { type: String, required: true },
    transactionHash: { type: String, required: true },
    blockNumber: { type: Number, required: true },
    testedAt: { type: Date, required: true },
    contractAddress: { type: String, required: true },
    chainId: { type: Number, required: true },
    blockHash: { type: String, required: false },
    transactionIndex: { type: Number, required: false },
    logIndex: { type: Number, required: false },
    eventId: { type: mongoose.Schema.Types.ObjectId, required: false }
});

labTestSchema.index(
    { chainId: 1, contractAddress: 1, blockchainBatchId: 1 },
    { unique: true }
);

module.exports = mongoose.model("LabTest", labTestSchema);
