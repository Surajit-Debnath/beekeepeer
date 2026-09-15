const mongoose = require("mongoose");

const blockchainEventSchema = new mongoose.Schema({
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true },
    eventName: { type: String, required: true },
    operation: { type: String, required: true },
    blockchainBatchId: { type: String, required: false, index: true },
    transactionHash: { type: String, required: true },
    blockHash: { type: String, required: true },
    blockNumber: { type: Number, required: true },
    transactionIndex: { type: Number, required: true },
    logIndex: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    args: { type: mongoose.Schema.Types.Mixed, required: true },
    indexedAt: { type: Date, required: true }
});

blockchainEventSchema.index(
    { chainId: 1, contractAddress: 1, transactionHash: 1, logIndex: 1 },
    { unique: true }
);
blockchainEventSchema.index({ chainId: 1, contractAddress: 1, blockNumber: 1 });

module.exports = mongoose.model("BlockchainEvent", blockchainEventSchema);
