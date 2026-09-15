const mongoose = require("mongoose");

const custodyRequestSchema = new mongoose.Schema(
    {
        blockchainBatchId: { type: String, required: true, index: true },
        chainId: { type: Number, required: true },
        contractAddress: { type: String, required: true },
        fromUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
        fromWallet: { type: String, required: true },
        fromRole: { type: String, required: true },
        toUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
        toWallet: { type: String, required: true },
        toRole: { type: String, required: true },
        status: {
            type: String,
            required: true,
            enum: ["PENDING", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"],
            default: "PENDING",
            index: true
        },
        location: { type: String, required: true, maxlength: 200 },
        notes: { type: String, default: "", maxlength: 1000 },
        transactionHash: { type: String },
        completedAt: { type: Date },
        rejectedAt: { type: Date },
        rejectionReason: { type: String, maxlength: 500 }
    },
    { timestamps: true }
);

custodyRequestSchema.index(
    { chainId: 1, contractAddress: 1, blockchainBatchId: 1, status: 1 },
    { partialFilterExpression: { status: "PENDING" }, unique: true }
);

module.exports = mongoose.model("CustodyRequest", custodyRequestSchema);
