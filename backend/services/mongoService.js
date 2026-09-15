const mongoose = require("mongoose");
const Batch = require("../models/Batch");
const LabTest = require("../models/LabTest");
const CustodyTransfer = require("../models/CustodyTransfer");
const BlockchainTransaction = require("../models/BlockchainTransaction");
const BlockchainEvent = require("../models/BlockchainEvent");
const SyncCursor = require("../models/SyncCursor");

const mongoUri = process.env.MONGODB_URI;
let roleLookup = async () => "UNKNOWN";

async function connectMongo() {
    if (!mongoUri) {
        return { configured: false, connected: false };
    }

    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: Number(
            process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000
        )
    });

    return { configured: true, connected: true };
}

function isConnected() {
    return mongoose.connection.readyState === 1;
}

function requireMongo() {
    if (!isConnected()) {
        const error = new Error("MongoDB is not connected");
        error.statusCode = 503;
        throw error;
    }
}

function configureRoleLookup(getRole) {
    roleLookup = async (address) => (await getRole(address)).roleName;
}

async function withMongoTransaction(work) {
    requireMongo();
    const session = await mongoose.startSession();

    try {
        let result;
        await session.withTransaction(async () => {
            result = await work(session);
        });
        return result;
    } finally {
        await session.endSession();
    }
}

async function upsertTransaction(result, session) {
    return BlockchainTransaction.findOneAndUpdate(
        {
            chainId: result.chainId,
            contractAddress: result.contractAddress,
            transactionHash: result.transactionHash
        },
        {
            $set: {
                batchId: result.batchId,
                operation: result.operation,
                fromWallet: result.fromWallet,
                toContract: result.toContract,
                nonce: result.nonce,
                blockNumber: result.blockNumber,
                blockHash: result.blockHash,
                transactionIndex: result.transactionIndex,
                status: result.status,
                confirmedAt: result.timestamp,
                createdAt: result.timestamp
            },
            $setOnInsert: {
                submittedAt: result.submittedAt || result.timestamp
            }
        },
        {
            upsert: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            session
        }
    );
}

async function upsertEvent(result, session) {
    const event = await BlockchainEvent.findOneAndUpdate(
        {
            chainId: result.chainId,
            contractAddress: result.contractAddress,
            transactionHash: result.transactionHash,
            logIndex: result.logIndex
        },
        {
            $set: {
                eventName: result.eventName,
                operation: result.operation,
                blockchainBatchId: result.batchId,
                blockHash: result.blockHash,
                blockNumber: result.blockNumber,
                transactionIndex: result.transactionIndex,
                timestamp: result.timestamp,
                args: result.event || {},
                indexedAt: new Date()
            }
        },
        {
            upsert: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            session
        }
    );

    return event;
}

async function upsertBatch(result, extra, session) {
    const batch = result.batch;
    const now = new Date();
    const network = extra.network || process.env.NETWORK_NAME || String(result.chainId);

    return Batch.findOneAndUpdate(
        {
            chainId: result.chainId,
            contractAddress: result.contractAddress,
            blockchainBatchId: batch.batchId
        },
        {
            $set: {
                apiaryId: batch.apiaryId,
                honeyType: batch.honeyType,
                quantity: batch.quantity,
                beekeeperWallet: batch.beekeeper,
                currentCustodianWallet: batch.currentCustodian,
                currentCustodianRole: await roleLookup(batch.currentCustodian),
                status: batch.statusName,
                labTested: batch.labTested,
                labPassed: batch.labPassed,
                labReportCID: batch.labReportCID,
                contractAddress: result.contractAddress,
                chainId: result.chainId,
                network,
                updatedAt: now,
                lastSyncedBlockNumber: result.blockNumber,
                ...(extra.beekeeperUserId
                    ? { beekeeperUserId: extra.beekeeperUserId }
                    : {})
            },
            $setOnInsert: {
                blockchainBatchId: batch.batchId,
                createdTxHash: result.transactionHash,
                createdBlockNumber: result.blockNumber,
                createdAt: new Date(Number(batch.createdAt) * 1000),
                projectionVersion: 1
            }
        },
        {
            upsert: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            session
        }
    );
}

async function upsertLabTest(result, extra, eventDocument, session) {
    return LabTest.findOneAndUpdate(
        {
            chainId: result.chainId,
            contractAddress: result.contractAddress,
            blockchainBatchId: result.batchId
        },
        {
            $set: {
                inspectorUserId: extra.inspectorUserId,
                inspectorWallet: result.event.labInspector,
                passed: result.event.passed,
                reportCID: result.event.reportCID,
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber,
                testedAt: result.timestamp,
                contractAddress: result.contractAddress,
                chainId: result.chainId,
                blockHash: result.blockHash,
                transactionIndex: result.transactionIndex,
                logIndex: result.logIndex,
                eventId: eventDocument._id
            }
        },
        {
            upsert: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            session
        }
    );
}

async function upsertCustodyTransfer(result, eventDocument, session) {
    return CustodyTransfer.findOneAndUpdate(
        {
            chainId: result.chainId,
            contractAddress: result.contractAddress,
            eventKey: result.eventKey
        },
        {
            $set: {
                blockchainBatchId: result.batchId,
                fromWallet: result.event.from,
                toWallet: result.event.to,
                fromRole: result.event.fromRoleName,
                toRole: result.event.toRoleName,
                location: result.event.location,
                notes: result.event.notes || "",
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber,
                blockHash: result.blockHash,
                transactionIndex: result.transactionIndex,
                logIndex: result.logIndex,
                timestamp: result.timestamp,
                contractAddress: result.contractAddress,
                chainId: result.chainId,
                ...(eventDocument ? { eventId: eventDocument._id } : {})
            }
        },
        {
            upsert: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            session
        }
    );
}

async function upsertInitialCustody(result, session) {
    const batch = result.batch;
    const eventKey = `${result.chainId}:${result.contractAddress}:${batch.batchId}:initial`;

    return CustodyTransfer.findOneAndUpdate(
        {
            chainId: result.chainId,
            contractAddress: result.contractAddress,
            eventKey
        },
        {
            $set: {
                blockchainBatchId: batch.batchId,
                fromWallet: "0x0000000000000000000000000000000000000000",
                toWallet: batch.beekeeper,
                fromRole: "NONE",
                toRole: "BEEKEEPER",
                location: "Apiary",
                notes: "Batch created",
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber,
                blockHash: result.blockHash,
                transactionIndex: result.transactionIndex,
                logIndex: -1,
                timestamp: new Date(Number(batch.createdAt) * 1000),
                contractAddress: result.contractAddress,
                chainId: result.chainId
            }
        },
        {
            upsert: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            session
        }
    );
}

async function saveResult(result, extra = {}) {
    return withMongoTransaction(async (session) => {
        const eventDocument = await upsertEvent(result, session);

        if (result.operation === "REGISTER_BATCH") {
            await upsertBatch(result, extra, session);
            await upsertInitialCustody(result, session);
        } else if (result.operation === "LAB_TEST") {
            await upsertLabTest(result, extra, eventDocument, session);
            await upsertBatch(result, extra, session);
        } else if (result.operation === "CUSTODY_TRANSFER") {
            await upsertCustodyTransfer(result, eventDocument, session);
            await upsertBatch(result, extra, session);
        }

        await upsertTransaction(result, session);
        return eventDocument;
    });
}

async function saveTransaction(result) {
    return withMongoTransaction((session) => upsertTransaction(result, session));
}

async function saveBatch(result, extra = {}) {
    return saveResult(result, extra);
}

async function saveLabTest(result, extra = {}) {
    return saveResult(result, extra);
}

async function saveCustodyTransfer(result, extra = {}) {
    return saveResult(result, extra);
}

async function listBatches(filter = {}) {
    requireMongo();
    return Batch.find(filter).sort({ createdAt: -1 }).lean();
}

async function listCustodyTransfers(blockchainBatchId, chainId, contractAddress) {
    requireMongo();
    return CustodyTransfer.find({ blockchainBatchId, chainId, contractAddress })
        .sort({ timestamp: 1, logIndex: 1 })
        .lean();
}

async function getSyncCursor(chainId, contractAddress, defaultBlock) {
    requireMongo();
    return SyncCursor.findOneAndUpdate(
        { chainId, contractAddress },
        {
            $setOnInsert: {
                lastProcessedBlock: defaultBlock - 1,
                status: "IDLE",
                updatedAt: new Date()
            }
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();
}

async function updateSyncCursor(chainId, contractAddress, values) {
    requireMongo();
    return SyncCursor.findOneAndUpdate(
        { chainId, contractAddress },
        { $set: { ...values, updatedAt: new Date() } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
}

function mongoStatus() {
    return {
        configured: Boolean(mongoUri),
        connected: isConnected()
    };
}

module.exports = {
    connectMongo,
    isConnected,
    mongoStatus,
    configureRoleLookup,
    saveResult,
    saveTransaction,
    saveBatch,
    saveLabTest,
    saveCustodyTransfer,
    listBatches,
    listCustodyTransfers,
    getSyncCursor,
    updateSyncCursor
};
