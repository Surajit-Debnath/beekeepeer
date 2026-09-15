const CustodyRequest = require("../models/CustodyRequest");
const User = require("../models/User");
const blockchainService = require("./blockchainService");
const mongoService = require("./mongoService");
const { clientError, parsePositiveUint, requiredString } = require("../utils/validation");

const TRANSITIONS = Object.freeze({
    PROCESSOR: { fromRole: "BEEKEEPER", status: "LAB_PASSED" },
    DISTRIBUTOR: { fromRole: "PROCESSOR", status: "PROCESSING" },
    RETAILER: { fromRole: "DISTRIBUTOR", status: "IN_TRANSIT" }
});

function transitionFor(role) {
    const transition = TRANSITIONS[role];
    if (!transition) {
        throw clientError("This role cannot request custody", 403);
    }
    return transition;
}

function userIdEquals(left, right) {
    return left?.toString() === right?.toString();
}

async function loadEligibleBatch(user, batchId) {
    const transition = transitionFor(user.role);
    const batch = await blockchainService.getBatch(parsePositiveUint(batchId, "batchId"));
    const currentRole = await blockchainService.getRole(batch.currentCustodian);

    if (currentRole.roleName !== transition.fromRole || batch.statusName !== transition.status) {
        throw clientError(
            `Batch is not eligible for ${user.role} custody (current state: ${batch.statusName}, custodian role: ${currentRole.roleName})`,
            400
        );
    }
    if (batch.labPassed !== true) {
        throw clientError("Only laboratory-passed batches can be transferred", 400);
    }

    const requesterRole = await blockchainService.getRole(user.walletAddress);
    if (requesterRole.roleName !== user.role) {
        throw clientError("Your configured blockchain role does not match your application role", 403);
    }

    const fromUser = await User.findOne({
        walletAddress: batch.currentCustodian,
        isActive: true
    });
    if (!fromUser) {
        throw clientError("The current blockchain custodian is not linked to an application user", 409);
    }

    return { batch, currentRole, fromUser, transition };
}

async function createRequest(user, input) {
    const { batch, currentRole, fromUser, transition } = await loadEligibleBatch(
        user,
        input.batchId
    );
    const location = requiredString(input.location, "location");
    const notes = input.notes === undefined ? "" : requiredString(input.notes, "notes");

    if (userIdEquals(fromUser._id, user._id)) {
        throw clientError("The current custodian cannot request custody from themselves", 400);
    }

    const existing = await CustodyRequest.findOne({
        chainId: Number((await blockchainService.getNetworkMetadata()).chainId),
        contractAddress: blockchainService.contractAddress,
        blockchainBatchId: batch.batchId,
        status: "PENDING"
    });
    if (existing) {
        throw clientError("A custody request is already pending for this batch", 409);
    }

    try {
        const request = await CustodyRequest.create({
            blockchainBatchId: batch.batchId,
            ...(await blockchainService.getNetworkMetadata()),
            contractAddress: blockchainService.contractAddress,
            fromUserId: fromUser._id,
            fromWallet: batch.currentCustodian,
            fromRole: currentRole.roleName,
            toUserId: user._id,
            toWallet: user.walletAddress,
            toRole: user.role,
            status: "PENDING",
            location,
            notes
        });
        return request;
    } catch (error) {
        if (error.code === 11000) {
            throw clientError("A custody request is already pending for this batch", 409);
        }
        throw error;
    }
}

async function listIncoming(user) {
    return CustodyRequest.find({ fromUserId: user._id, status: "PENDING" })
        .sort({ createdAt: -1 })
        .populate("fromUserId", "username role walletAddress")
        .populate("toUserId", "username role walletAddress")
        .lean();
}

async function listOutgoing(user) {
    return CustodyRequest.find({ toUserId: user._id })
        .sort({ createdAt: -1 })
        .populate("fromUserId", "username role walletAddress")
        .populate("toUserId", "username role walletAddress")
        .lean();
}

async function loadIncomingRequest(user, requestId) {
    const request = await CustodyRequest.findById(requestId);
    if (!request) {
        throw clientError("Custody request not found", 404);
    }
    if (!userIdEquals(request.fromUserId, user._id)) {
        throw clientError("You are not the current custodian for this request", 403);
    }
    if (request.status !== "PENDING") {
        throw clientError(`Custody request is already ${request.status.toLowerCase()}`, 409);
    }
    return request;
}

async function rejectRequest(user, requestId, reason = "") {
    const request = await loadIncomingRequest(user, requestId);
    request.status = "REJECTED";
    request.rejectedAt = new Date();
    request.rejectionReason = reason || undefined;
    await request.save();
    return request;
}

async function approveRequest(user, requestId) {
    const request = await loadIncomingRequest(user, requestId);
    const batch = await blockchainService.getBatch(request.blockchainBatchId);
    const currentRole = await blockchainService.getRole(batch.currentCustodian);

    if (batch.currentCustodian.toLowerCase() !== user.walletAddress.toLowerCase()) {
        throw clientError("You are no longer the current blockchain custodian", 409);
    }
    if (currentRole.roleName !== request.fromRole) {
        throw clientError("The blockchain custodian role no longer matches this request", 409);
    }
    if (request.toRole !== currentRole.roleName && !TRANSITIONS[request.toRole]) {
        throw clientError("Invalid custody transition", 400);
    }

    const targetRole = await blockchainService.getRole(request.toWallet);
    if (targetRole.roleName !== request.toRole) {
        throw clientError("The requested recipient does not have the required blockchain role", 409);
    }

    const expected = TRANSITIONS[request.toRole];
    if (!expected || expected.fromRole !== currentRole.roleName || batch.labPassed !== true) {
        throw clientError("Invalid custody transition for the current blockchain state", 400);
    }

    let result;
    try {
        result = await blockchainService.transferCustody(
            request.blockchainBatchId,
            request.toWallet,
            request.location,
            request.notes
        );
        await mongoService.saveCustodyTransfer(result);
    } catch (error) {
        if (result) {
            error.statusCode = error.statusCode || 503;
            error.blockchainResult = result;
        }
        throw error;
    }

    request.status = "COMPLETED";
    request.transactionHash = result.transactionHash;
    request.completedAt = new Date();
    await request.save();

    return { request, result };
}

module.exports = {
    createRequest,
    listIncoming,
    listOutgoing,
    approveRequest,
    rejectRequest
};
