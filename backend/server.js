require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const blockchainService = require("./services/blockchainService");
const blockchainIndexer = require("./services/blockchainIndexer");
const mongoService = require("./services/mongoService");
const authRoutes = require("./routes/authRoutes");
const custodyRoutes = require("./routes/custodyRoutes");
const labRoutes = require("./routes/labRoutes");
const qrRoutes = require("./routes/qrRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const { requireAuth, requireRole } = require("./middleware/auth");
const { requireBlockchainRole } = require("./middleware/blockchainAuth");
const { requireCid, gatewayUrl } = require("./utils/cid");
const {
    clientError,
    parsePositiveUint,
    requiredString,
    parseAddress,
    parseRole
} = require("./utils/validation");

mongoService.configureRoleLookup(blockchainService.getRole);

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/custody", custodyRoutes);
app.use("/api/lab", labRoutes);
app.use("/api/batches", qrRoutes);
app.use("/api/dashboard", dashboardRoutes);

function errorMessage(error) {
    return (
        error?.shortMessage ||
        error?.reason ||
        error?.info?.error?.message ||
        error?.message ||
        "Request failed"
    );
}

function sendError(res, error) {
    const message = errorMessage(error);
    const lowerMessage = message.toLowerCase();
    let statusCode = error?.statusCode || 500;

    if (!error?.statusCode && lowerMessage.includes("batch does not exist")) {
        statusCode = 404;
    } else if (!error?.statusCode && error?.code === "LIMIT_FILE_SIZE") {
        statusCode = 400;
    } else if (!error?.statusCode && error?.code === "CALL_EXCEPTION") {
        statusCode = 400;
    } else if (
        !error?.statusCode &&
        (error?.code === "NETWORK_ERROR" ||
            error?.code === "SERVER_ERROR" ||
            lowerMessage.includes("econnrefused") ||
            lowerMessage.includes("network"))
    ) {
        statusCode = 503;
    }

    const response = { success: false, error: message };
    if (error?.blockchainResult) {
        response.blockchain = {
            transactionHash: error.blockchainResult.transactionHash,
            batchId: error.blockchainResult.batchId,
            operation: error.blockchainResult.operation,
            persistence: "failed"
        };
    }

    return res.status(statusCode).json(response);
}

function handle(handler) {
    return async (req, res) => {
        try {
            await handler(req, res);
        } catch (error) {
            console.error(error);
            if (!res.headersSent) {
                sendError(res, error);
            }
        }
    };
}

async function persistOrReport(operation, result, extra = {}) {
    try {
        if (operation === "REGISTER_BATCH") {
            await mongoService.saveBatch(result, extra);
        } else if (operation === "LAB_TEST") {
            await mongoService.saveLabTest(result, extra);
        } else if (operation === "CUSTODY_TRANSFER") {
            await mongoService.saveCustodyTransfer(result, extra);
        } else if (operation === "ROLE_ASSIGNMENT") {
            await mongoService.saveTransaction(result);
        }
    } catch (error) {
        error.statusCode = error.statusCode || 503;
        error.blockchainResult = result;
        throw error;
    }
}

app.get("/", (req, res) => {
    res.json({ message: "BEEKEEPER backend is running" });
});

app.get("/api/health", handle(async (req, res) => {
    const blockchain = await blockchainService.getHealth();
    const mongo = mongoService.mongoStatus();
    const ready = blockchain.connected && mongo.connected;

    res.status(ready ? 200 : 503).json({
        status: ready ? "ok" : "degraded",
        blockchain,
        mongodb: mongo
    });
}));

app.get("/api/batches/next-id", handle(async (req, res) => {
    res.json({
        success: true,
        nextBatchId: await blockchainService.getNextBatchId()
    });
}));

app.get("/api/batches", handle(async (req, res) => {
    const filter = {};
    if (req.query.apiaryId) {
        filter.apiaryId = requiredString(req.query.apiaryId, "apiaryId");
    }
    if (req.query.status) {
        filter.status = requiredString(req.query.status, "status").toUpperCase();
    }

    if (mongoService.isConnected()) {
        return res.json({
            success: true,
            source: "mongodb",
            batches: await mongoService.listBatches(filter)
        });
    }

    const nextBatchId = BigInt(await blockchainService.getNextBatchId());
    const batches = [];
    for (let id = 1n; id < nextBatchId; id++) {
        const batch = await blockchainService.getBatch(id.toString());
        if (
            (!filter.apiaryId || filter.apiaryId === batch.apiaryId) &&
            (!filter.status || filter.status === batch.statusName)
        ) {
            batches.push(batch);
        }
    }

    res.json({ success: true, source: "blockchain", batches });
}));

app.post("/api/batches", requireAuth, requireRole("BEEKEEPER"), requireBlockchainRole("BEEKEEPER"), handle(async (req, res) => {
    const apiaryId = [
        "APIARY",
        req.user.walletAddress.slice(2, 10).toUpperCase(),
        Date.now().toString(36).toUpperCase(),
        crypto.randomBytes(2).toString("hex").toUpperCase()
    ].join("-");
    const honeyType = requiredString(req.body?.honeyType, "honeyType");
    const quantity = parsePositiveUint(req.body?.quantity, "quantity");
    const network = await blockchainService.getNetworkMetadata();
    const result = await blockchainService.registerBatch(apiaryId, honeyType, quantity);

    await persistOrReport("REGISTER_BATCH", result, {
        ...network,
        beekeeperUserId: req.user._id
    });

    res.status(201).json({
        success: true,
        batchId: result.batchId,
        apiaryId: result.batch.apiaryId,
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        status: result.batch.statusName
    });
}));

app.get("/api/batches/:id", handle(async (req, res) => {
    const batch = await blockchainService.getBatch(
        parsePositiveUint(req.params.id, "batchId")
    );
    res.json({ success: true, source: "blockchain", batch });
}));

app.get("/api/batches/:id/verify", handle(async (req, res) => {
    const batch = await blockchainService.getVerification(
        parsePositiveUint(req.params.id, "batchId")
    );
    res.json({
        success: true,
        source: "blockchain",
        batch,
        labReportUrl: gatewayUrl(batch.labReportCID)
    });
}));

app.get("/api/batches/:id/history", handle(async (req, res) => {
    const batchId = parsePositiveUint(req.params.id, "batchId");
    const history = await blockchainService.getFullHistory(batchId);
    const network = await blockchainService.getNetworkMetadata();
    let projectedTransfers = [];
    if (mongoService.isConnected()) {
        projectedTransfers = await mongoService.listCustodyTransfers(
            batchId,
            network.chainId,
            blockchainService.contractAddress
        );
    }

    res.json({
        success: true,
        source: "blockchain",
        batchId,
        history: history.map((record, index) => ({
            ...record,
            transactionHash: projectedTransfers[index]?.transactionHash || null,
            blockNumber: projectedTransfers[index]?.blockNumber ?? null
        }))
    });
}));

app.get("/api/roles/:address", handle(async (req, res) => {
    res.json({
        success: true,
        source: "blockchain",
        role: await blockchainService.getRole(parseAddress(req.params.address, "address"))
    });
}));

app.post("/api/admin/roles", requireAuth, requireRole("ADMIN"), requireBlockchainRole("ADMIN"), handle(async (req, res) => {
    const address = parseAddress(req.body?.address, "address");
    const role = parseRole(req.body?.role, blockchainService.ROLES);
    const result = await blockchainService.assignRole(address, role);
    await persistOrReport("ROLE_ASSIGNMENT", result);

    res.status(201).json({
        success: true,
        address,
        role: result.role,
        roleName: result.roleName,
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber
    });
}));

app.post("/api/lab/test", requireAuth, requireRole("LAB_INSPECTOR"), requireBlockchainRole("LAB_INSPECTOR"), handle(async (req, res) => {
    const batchId = parsePositiveUint(req.body?.batchId, "batchId");
    if (typeof req.body?.passed !== "boolean") {
        throw clientError("passed must be a boolean");
    }
    const reportCID = requireCid(req.body?.reportCID);
    const network = await blockchainService.getNetworkMetadata();
    const result = await blockchainService.recordLabTest(batchId, req.body.passed, reportCID);

    await persistOrReport("LAB_TEST", result, {
        ...network,
        inspectorUserId: req.user._id
    });

    res.json({
        success: true,
        batchId: result.batchId,
        passed: result.event.passed,
        reportCID: result.event.reportCID,
        reportUrl: gatewayUrl(result.event.reportCID),
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        status: result.batch.statusName
    });
}));

async function custodyHandler(req, res, expectedRole) {
    const batchId = parsePositiveUint(req.body?.batchId, "batchId");
    const newCustodian = parseAddress(req.body?.newCustodian, "newCustodian");
    const location = requiredString(req.body?.location, "location");
    const notes = req.body?.notes === undefined
        ? ""
        : requiredString(req.body.notes, "notes");
    const network = await blockchainService.getNetworkMetadata();
    const result = await blockchainService.transferCustody(
        batchId,
        newCustodian,
        location,
        notes,
        expectedRole
    );

    await persistOrReport("CUSTODY_TRANSFER", result, network);

    res.json({
        success: true,
        batchId: result.batchId,
        fromWallet: result.event.from,
        toWallet: result.event.to,
        fromRole: result.event.fromRoleName,
        toRole: result.event.toRoleName,
        location: result.event.location,
        notes,
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        status: result.batch.statusName
    });
}

app.post("/api/custody/transfer", requireAuth, requireRole("BEEKEEPER"), requireBlockchainRole("BEEKEEPER"), handle((req, res) =>
    custodyHandler(req, res, blockchainService.ROLES.BEEKEEPER)
));
app.post("/api/custody/processor-transfer", requireAuth, requireRole("PROCESSOR"), requireBlockchainRole("PROCESSOR"), handle((req, res) =>
    custodyHandler(req, res, blockchainService.ROLES.PROCESSOR)
));
app.post("/api/custody/distributor-transfer", requireAuth, requireRole("DISTRIBUTOR"), requireBlockchainRole("DISTRIBUTOR"), handle((req, res) =>
    custodyHandler(req, res, blockchainService.ROLES.DISTRIBUTOR)
));

app.use((error, req, res, next) => {
    if (error?.type === "entity.parse.failed") {
        return res.status(400).json({
            success: false,
            error: "Request body must be valid JSON"
        });
    }
    next(error);
});

app.use((req, res) => {
    res.status(404).json({ success: false, error: "Endpoint not found" });
});

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    return sendError(res, error);
});

const PORT = Number(process.env.PORT || 5000);

async function start() {
    try {
        await mongoService.connectMongo();
        if (mongoService.isConnected()) {
            const sync = await blockchainIndexer.syncOnce();
            console.log(
                `Blockchain sync completed through block ${sync.toBlock}`
            );
        }
    } catch (error) {
        console.error(`Startup persistence sync failed: ${errorMessage(error)}`);
    }

    app.listen(PORT, () => {
        console.log(`Backend running on http://localhost:${PORT}`);
    });
}

if (require.main === module) {
    start();
}

module.exports = app;
