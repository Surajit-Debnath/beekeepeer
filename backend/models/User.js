const mongoose = require("mongoose");

const APPLICATION_ROLES = [
    "ADMIN",
    "BEEKEEPER",
    "LAB_INSPECTOR",
    "PROCESSOR",
    "DISTRIBUTOR",
    "RETAILER",
    "CONSUMER"
];

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            minlength: 3,
            maxlength: 50
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            required: true,
            unique: true,
            maxlength: 254
        },
        passwordHash: { type: String, required: true, select: false },
        role: { type: String, required: true, enum: APPLICATION_ROLES, index: true },
        walletAddress: { type: String, required: true, unique: true, index: true },
        isActive: { type: Boolean, default: true, index: true }
    },
    { timestamps: true }
);

userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model("User", userSchema);
module.exports.APPLICATION_ROLES = APPLICATION_ROLES;
