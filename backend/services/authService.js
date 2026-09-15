const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const blockchainService = require("./blockchainService");
const mongoService = require("./mongoService");
const { safeUser, tokenForUser } = require("../middleware/auth");

const ROLE_TO_WALLET = Object.freeze({
    ADMIN: "ADMIN",
    BEEKEEPER: "BEEKEEPER",
    LAB_INSPECTOR: "LAB_INSPECTOR",
    PROCESSOR: "PROCESSOR",
    DISTRIBUTOR: "DISTRIBUTOR",
    RETAILER: "RETAILER",
    CONSUMER: null
});

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeRole(role) {
    return typeof role === "string" ? role.trim().toUpperCase() : "";
}

function requireDatabase() {
    if (User.db.readyState !== 1) {
        throw serviceError("MongoDB is not connected", 503);
    }
}

async function register({ username, email, password, role, adminCode }) {
    if (!process.env.JWT_SECRET) {
        throw serviceError("JWT_SECRET must be configured", 503);
    }
    requireDatabase();
    if (typeof username !== "string") {
        throw serviceError("username is required");
    }
    if (typeof email !== "string" || email.trim().length === 0) {
        throw serviceError("email is required");
    }
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email ? email.trim().toLowerCase() : undefined;
    const normalizedRole = normalizeRole(role);

    if (
        normalizedUsername.length < 2 ||
        normalizedUsername.length > 50 ||
        /[\u0000-\u001F\u007F]/.test(normalizedUsername)
    ) {
        throw serviceError("username must be a normal 2-50 character string");
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        throw serviceError("email must be valid");
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 200) {
        throw serviceError("password must be between 8 and 200 characters");
    }
    if (!Object.prototype.hasOwnProperty.call(ROLE_TO_WALLET, normalizedRole)) {
        throw serviceError("role must be ADMIN, BEEKEEPER, LAB_INSPECTOR, PROCESSOR, DISTRIBUTOR, RETAILER or CONSUMER");
    }
    if (normalizedRole === "ADMIN") {
        if (!process.env.ADMIN_REGISTRATION_CODE) {
            throw serviceError("ADMIN_REGISTRATION_CODE is not configured", 503);
        }
        if (adminCode !== process.env.ADMIN_REGISTRATION_CODE) {
            throw serviceError("invalid admin registration code", 403);
        }
    }

    if (await User.exists({ username: normalizedUsername })) {
        throw serviceError("username is already registered", 409);
    }
    if (await User.exists({ email: normalizedEmail })) {
        throw serviceError("email is already registered", 409);
    }
    const walletAddress = normalizedRole === "CONSUMER"
        ? `0x${crypto.randomBytes(20).toString("hex")}`
        : blockchainService.getConfiguredWalletAddress(ROLE_TO_WALLET[normalizedRole]);
    if (await User.exists({ walletAddress })) {
        throw serviceError("the configured blockchain account for this role is already assigned", 409);
    }

    if (normalizedRole !== "ADMIN" && normalizedRole !== "CONSUMER") {
        const roleResult = await blockchainService.ensureRole(walletAddress, normalizedRole);
        if (roleResult) {
            await mongoService.saveTransaction(roleResult);
        }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
        user = await User.create({
            username: normalizedUsername,
            ...(normalizedEmail ? { email: normalizedEmail } : {}),
            passwordHash,
            role: normalizedRole,
            walletAddress,
            isActive: true
        });
    } catch (error) {
        error.statusCode = error.code === 11000 ? 409 : error.statusCode;
        throw error;
    }

    return { user: safeUser(user), token: tokenForUser(user) };
}

async function login({ username, password }) {
    requireDatabase();
    if (typeof username !== "string" || typeof password !== "string") {
        throw serviceError("username and password are required");
    }

    const user = await User.findOne({ username: username.trim().toLowerCase(), isActive: true })
        .select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw serviceError("invalid username or password", 401);
    }

    return { user: safeUser(user), token: tokenForUser(user) };
}

module.exports = { register, login };
