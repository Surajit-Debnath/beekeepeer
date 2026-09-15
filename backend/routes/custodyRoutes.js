const express = require("express");
const custodyService = require("../services/custodyService");
const { requireAuth, requireRole } = require("../middleware/auth");
const { clientError } = require("../utils/validation");

const router = express.Router();

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.use(requireAuth);

router.post("/request", requireRole("PROCESSOR", "DISTRIBUTOR", "RETAILER"), asyncRoute(async (req, res) => {
    const request = await custodyService.createRequest(req.user, req.body || {});
    res.status(201).json({ success: true, request });
}));

router.get("/requests/incoming", requireRole("BEEKEEPER", "PROCESSOR", "DISTRIBUTOR"), asyncRoute(async (req, res) => {
    res.json({ success: true, requests: await custodyService.listIncoming(req.user) });
}));

router.get("/requests/outgoing", requireRole("PROCESSOR", "DISTRIBUTOR", "RETAILER"), asyncRoute(async (req, res) => {
    res.json({ success: true, requests: await custodyService.listOutgoing(req.user) });
}));

router.post("/requests/:id/approve", requireRole("BEEKEEPER", "PROCESSOR", "DISTRIBUTOR"), asyncRoute(async (req, res) => {
    const { request, result } = await custodyService.approveRequest(req.user, req.params.id);
    res.json({
        success: true,
        request,
        batchId: result.batchId,
        newCustodian: result.event.to,
        status: result.batch.statusName,
        transactionHash: result.transactionHash
    });
}));

router.post("/requests/:id/reject", requireRole("BEEKEEPER", "PROCESSOR", "DISTRIBUTOR"), asyncRoute(async (req, res) => {
    const reason = req.body?.reason;
    if (reason !== undefined && typeof reason !== "string") {
        throw clientError("reason must be a string");
    }
    const request = await custodyService.rejectRequest(req.user, req.params.id, reason);
    res.json({ success: true, request });
}));

module.exports = router;
