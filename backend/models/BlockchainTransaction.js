const mongoose = require("mongoose");

const blockchainTransactionSchema = new mongoose.Schema({
    transactionHash: { type: String, required: true },
    batchId: { type: String, required: false, index: true },
    operation: {
        type: String,
        required: true,
        enum: ["REGISTER_BATCH", "LAB_TEST", "CUSTODY_TRANSFER", "ROLE_ASSIGNMENT"]
    },
    fromWallet: { type: String, required: true },
    toContract: { type: String, required: false },
    nonce: { type: Number, required: false },
    contractAddress: { type: String, required: true },
    chainId: { type: Number, required: true },
    blockNumber: { type: Number, required: true },
    blockHash: { type: String, required: false },
    transactionIndex: { type: Number, required: false },
    status: { type: String, required: true, enum: ["CONFIRMED", "FAILED"] },
    submittedAt: { type: Date, required: false },
    confirmedAt: { type: Date, required: false },
    createdAt: { type: Date, required: true },
    errorMessage: { type: String, required: false }
});

blockchainTransactionSchema.index(
    { chainId: 1, contractAddress: 1, transactionHash: 1 },
    { unique: true }
);
blockchainTransactionSchema.index({ batchId: 1, createdAt: -1 });

module.exports = mongoose.model("BlockchainTransaction", blockchainTransactionSchema);
