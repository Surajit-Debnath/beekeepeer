const express = require("express");
const Batch = require("../models/Batch");
const LabTest = require("../models/LabTest");
const blockchainService = require("../services/blockchainService");
const mongoService = require("../services/mongoService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function blockchainBatches(user) {
    const nextBatchId = BigInt(await blockchainService.getNextBatchId());
    const batches = [];
    for (let id = 1n; id < nextBatchId; id += 1n) {
        const batch = await blockchainService.getBatch(id.toString());
        if (
            (user.role === "BEEKEEPER" && batch.beekeeper.toLowerCase() === user.walletAddress.toLowerCase()) ||
            (user.role !== "BEEKEEPER" && batch.currentCustodian.toLowerCase() === user.walletAddress.toLowerCase())
        ) {
            batches.push(batch);
        }
    }
    return batches;
}

async function blockchainEligibleBatches(user) {
    const eligible = {
        PROCESSOR: { status: "LAB_PASSED", role: "BEEKEEPER" },
        DISTRIBUTOR: { status: "PROCESSING", role: "PROCESSOR" },
        RETAILER: { status: "IN_TRANSIT", role: "DISTRIBUTOR" }
    }[user.role];
    if (!eligible) {
        return [];
    }

    const nextBatchId = BigInt(await blockchainService.getNextBatchId());
    const batches = [];
    for (let id = 1n; id < nextBatchId; id += 1n) {
        const batch = await blockchainService.getBatch(id.toString());
        const currentRole = await blockchainService.getRole(batch.currentCustodian);
        if (batch.statusName === eligible.status && currentRole.roleName === eligible.role) {
            batches.push(batch);
        }
    }
    return batches;
}

async function projectedBatchesForUser(user) {
    if (user.role === "BEEKEEPER") {
        return Batch.find({ beekeeperUserId: user._id }).sort({ createdAt: -1 }).lean();
    }
    if (user.role === "LAB_INSPECTOR") {
        const testedBatchIds = await LabTest.distinct("blockchainBatchId", {
            inspectorUserId: user._id
        });
        return Batch.find({ blockchainBatchId: { $in: testedBatchIds } })
            .sort({ createdAt: -1 })
            .lean();
    }
    return Batch.find({ currentCustodianWallet: user.walletAddress })
        .sort({ createdAt: -1 })
        .lean();
}

router.use(requireAuth);

router.get("/my-batches", asyncRoute(async (req, res) => {
    if (mongoService.isConnected()) {
        return res.json({
            success: true,
            source: "mongodb",
            batches: await projectedBatchesForUser(req.user)
        });
    }
    return res.json({ success: true, source: "blockchain", batches: await blockchainBatches(req.user) });
}));

router.get("/summary", asyncRoute(async (req, res) => {
    const batches = mongoService.isConnected()
        ? await projectedBatchesForUser(req.user)
        : await blockchainBatches(req.user);
    const counts = Object.fromEntries(
        ["AWAITING_LAB_TEST", "LAB_PASSED", "LAB_FAILED", "PROCESSING", "IN_TRANSIT", "READY_FOR_SALE"]
            .map((status) => [status, batches.filter((batch) => batch.status === status || batch.statusName === status).length])
    );
    res.json({ success: true, total: batches.length, counts });
}));

router.get("/eligible-batches", asyncRoute(async (req, res) => {
    const eligible = {
        PROCESSOR: { status: "LAB_PASSED", currentCustodianRole: "BEEKEEPER" },
        DISTRIBUTOR: { status: "PROCESSING", currentCustodianRole: "PROCESSOR" },
        RETAILER: { status: "IN_TRANSIT", currentCustodianRole: "DISTRIBUTOR" }
    }[req.user.role];
    if (!eligible) {
        return res.json({ success: true, source: "none", batches: [] });
    }
    if (mongoService.isConnected()) {
        return res.json({
            success: true,
            source: "mongodb",
            batches: await Batch.find(eligible).sort({ createdAt: -1 }).lean()
        });
    }
    return res.json({ success: true, source: "blockchain", batches: await blockchainEligibleBatches(req.user) });
}));

module.exports = router;
