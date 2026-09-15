const mongoose = require("mongoose");

const syncCursorSchema = new mongoose.Schema({
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true },
    lastProcessedBlock: { type: Number, required: true },
    lastProcessedBlockHash: { type: String, required: false },
    status: { type: String, required: true, enum: ["RUNNING", "IDLE", "ERROR"] },
    errorMessage: { type: String, required: false },
    updatedAt: { type: Date, required: true }
});

syncCursorSchema.index(
    { chainId: 1, contractAddress: 1 },
    { unique: true }
);

module.exports = mongoose.model("SyncCursor", syncCursorSchema);
