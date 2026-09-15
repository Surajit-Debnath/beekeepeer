const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema({
    blockchainBatchId: { type: String, required: true },
    apiaryId: { type: String, required: true, index: true },
    honeyType: { type: String, required: true },
    // Keep uint256 values exact instead of coercing them through a JS Number.
    quantity: { type: String, required: true },
    beekeeperUserId: { type: mongoose.Schema.Types.ObjectId, required: false },
    beekeeperWallet: { type: String, required: true },
    currentCustodianWallet: { type: String, required: true, index: true },
    currentCustodianRole: { type: String, required: true },
    status: { type: String, required: true, index: true },
    labTested: { type: Boolean, required: true },
    labPassed: { type: Boolean, required: true },
    labReportCID: { type: String, default: "" },
    contractAddress: { type: String, required: true },
    chainId: { type: Number, required: true },
    network: { type: String, required: true },
    createdTxHash: { type: String, required: true },
    createdBlockNumber: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    projectionVersion: { type: Number, default: 1 },
    lastSyncedBlockNumber: { type: Number, required: true }
});

batchSchema.index(
    { chainId: 1, contractAddress: 1, blockchainBatchId: 1 },
    { unique: true }
);
batchSchema.index({ contractAddress: 1, blockchainBatchId: 1 });
batchSchema.index({ beekeeperUserId: 1 });

module.exports = mongoose.model("Batch", batchSchema);
