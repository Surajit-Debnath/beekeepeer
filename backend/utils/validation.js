const { ethers } = require("ethers");
const mongoose = require("mongoose");

function clientError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePositiveUint(value, field) {
    const text = typeof value === "number" ? String(value) : value;

    if (
        typeof text !== "string" ||
        !/^\d+$/.test(text) ||
        BigInt(text) <= 0n
    ) {
        throw clientError(`${field} must be a positive integer`);
    }

    return text;
}

function requiredString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw clientError(`${field} is required`);
    }

    return value.trim();
}

function parseAddress(value, field) {
    if (typeof value !== "string" || !ethers.isAddress(value)) {
        throw clientError(`${field} must be a valid Ethereum address`);
    }

    return ethers.getAddress(value);
}

function parseRole(value, roles) {
    if (typeof value === "string") {
        const normalized = value.trim().toUpperCase();
        if (Object.prototype.hasOwnProperty.call(roles, normalized)) {
            return roles[normalized];
        }
        if (/^\d+$/.test(normalized)) {
            value = Number(normalized);
        }
    }

    if (
        !Number.isInteger(value) ||
        value <= roles.NONE ||
        value > roles.RETAILER
    ) {
        throw clientError(
            "role must be BEEKEEPER, LAB_INSPECTOR, PROCESSOR, DISTRIBUTOR or RETAILER"
        );
    }

    return value;
}

function optionalUserId(value, field) {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }

    if (!mongoose.Types.ObjectId.isValid(value)) {
        throw clientError(`${field} must be a valid MongoDB ObjectId`);
    }

    return new mongoose.Types.ObjectId(value);
}

module.exports = {
    clientError,
    parsePositiveUint,
    requiredString,
    parseAddress,
    parseRole,
    optionalUserId
};
