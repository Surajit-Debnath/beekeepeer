const express = require("express");
const multer = require("multer");
const blockchainService = require("../services/blockchainService");
const mongoService = require("../services/mongoService");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireBlockchainRole } = require("../middleware/blockchainAuth");
const { parsePositiveUint } = require("../utils/validation");
const { requireCid } = require("../utils/cid");

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_LAB_REPORT_BYTES || 10 * 1024 * 1024) }
});

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.post(
    "/test/upload",
    requireAuth,
    requireRole("LAB_INSPECTOR"),
    requireBlockchainRole("LAB_INSPECTOR"),
    upload.single("report"),
    asyncRoute(async (req, res) => {
        const batchId = parsePositiveUint(req.body?.batchId, "batchId");
        const passed = true;
        const reportCID = requireCid(process.env.TEMPORARY_LAB_REPORT_CID);
        const result = await blockchainService.recordLabTest(batchId, passed, reportCID);

        try {
            await mongoService.saveLabTest(result, { inspectorUserId: req.user._id });
        } catch (error) {
            error.statusCode = error.statusCode || 503;
            error.blockchainResult = result;
            throw error;
        }

        res.json({
            success: true,
            batchId: result.batchId,
            passed,
            reportCID,
            transactionHash: result.transactionHash,
            blockNumber: result.blockNumber,
            status: result.batch.statusName
        });
    })
);

router.get(
    "/batches/pending",
    requireAuth,
    requireRole("LAB_INSPECTOR"),
    asyncRoute(async (req, res) => {
        if (mongoService.isConnected()) {
            const batches = await mongoService.listBatches({ status: "AWAITING_LAB_TEST" });
            return res.json({ success: true, source: "mongodb", batches });
        }

        const nextBatchId = BigInt(await blockchainService.getNextBatchId());
        const batches = [];
        for (let id = 1n; id < nextBatchId; id += 1n) {
            const batch = await blockchainService.getBatch(id.toString());
            if (batch.statusName === "AWAITING_LAB_TEST") {
                batches.push(batch);
            }
        }
        return res.json({ success: true, source: "blockchain", batches });
    })
);

module.exports = router;
