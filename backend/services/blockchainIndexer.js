const {
    provider,
    readContract,
    contractAddress
} = require("../blockchain/blockchain");
const blockchainService = require("./blockchainService");
const mongoService = require("./mongoService");

const OPERATION_BY_EVENT = {
    BatchCreated: "REGISTER_BATCH",
    LabTestRecorded: "LAB_TEST",
    CustodyTransferred: "CUSTODY_TRANSFER",
    RoleAssigned: "ROLE_ASSIGNMENT"
};

function serializedArgs(fragment, args) {
    const values = {};

    fragment.inputs.forEach((input, index) => {
        const value = args[index];
        values[input.name || String(index)] = typeof value === "bigint"
            ? value.toString()
            : value;
    });

    return values;
}

function eventValue(args, name, index) {
    const value = args[name] ?? args[index];
    return typeof value === "bigint" ? value.toString() : value;
}

async function makeResult(log, parsed) {
    const transaction = await provider.getTransaction(log.transactionHash);
    const receipt = await provider.getTransactionReceipt(log.transactionHash);
    const block = await provider.getBlock(log.blockNumber);
    const eventName = parsed.name;
    const operation = OPERATION_BY_EVENT[eventName];
    const batchId = eventName === "RoleAssigned"
        ? undefined
        : eventValue(parsed.args, "batchId", 0);
    const result = {
        transactionHash: log.transactionHash,
        blockHash: log.blockHash,
        blockNumber: log.blockNumber,
        transactionIndex: log.transactionIndex,
        logIndex: log.index,
        eventKey: `${log.transactionHash}:${log.index}`,
        eventName,
        operation,
        fromWallet: transaction?.from || "0x0000000000000000000000000000000000000000",
        toContract: transaction?.to || contractAddress,
        nonce: transaction?.nonce,
        status: receipt?.status === 1 ? "CONFIRMED" : "FAILED",
        contractAddress,
        chainId: Number((await provider.getNetwork()).chainId),
        timestamp: new Date(Number(block.timestamp) * 1000),
        event: serializedArgs(parsed.fragment, parsed.args),
        batchId
    };

    if (eventName === "BatchCreated") {
        result.event = {
            batchId,
            beekeeper: eventValue(parsed.args, "beekeeper", 1),
            apiaryId: eventValue(parsed.args, "apiaryId", 2),
            honeyType: eventValue(parsed.args, "honeyType", 3),
            quantity: eventValue(parsed.args, "quantity", 4)
        };
        result.batch = await blockchainService.getBatch(batchId);
    } else if (eventName === "LabTestRecorded") {
        result.event = {
            batchId,
            labInspector: eventValue(parsed.args, "labInspector", 1),
            passed: eventValue(parsed.args, "passed", 2),
            reportCID: eventValue(parsed.args, "reportCID", 3)
        };
        result.batch = await blockchainService.getBatch(batchId);
    } else if (eventName === "CustodyTransferred") {
        const fromRole = Number(eventValue(parsed.args, "fromRole", 3));
        const toRole = Number(eventValue(parsed.args, "toRole", 4));
        result.event = {
            batchId,
            from: eventValue(parsed.args, "from", 1),
            to: eventValue(parsed.args, "to", 2),
            fromRole,
            fromRoleName: blockchainService.ROLE_NAMES[fromRole],
            toRole,
            toRoleName: blockchainService.ROLE_NAMES[toRole],
            location: eventValue(parsed.args, "location", 5),
            notes: ""
        };
        result.batch = await blockchainService.getBatch(batchId);
    } else if (eventName === "RoleAssigned") {
        const role = Number(eventValue(parsed.args, "role", 1));
        result.event = {
            user: eventValue(parsed.args, "user", 0),
            role,
            roleName: blockchainService.ROLE_NAMES[role]
        };
    }

    return result;
}

async function processChunk(fromBlock, toBlock) {
    const logs = await provider.getLogs({
        address: contractAddress,
        fromBlock,
        toBlock
    });

    for (const log of logs) {
        let parsed;
        try {
            parsed = readContract.interface.parseLog({
                topics: log.topics,
                data: log.data
            });
        } catch {
            continue;
        }

        if (!parsed || !OPERATION_BY_EVENT[parsed.name]) {
            continue;
        }

        const result = await makeResult(log, parsed);
        await mongoService.saveResult(result);
    }
}

async function syncOnce() {
    const network = await blockchainService.getNetworkMetadata();
    const startBlock = Number(process.env.INDEXER_START_BLOCK || 0);
    const chunkSize = Number(process.env.INDEXER_CHUNK_SIZE || 2000);
    const cursor = await mongoService.getSyncCursor(
        network.chainId,
        contractAddress,
        startBlock
    );
    const latestBlock = await provider.getBlockNumber();
    let fromBlock = Math.max(startBlock, cursor.lastProcessedBlock + 1);

    if (fromBlock > latestBlock) {
        await mongoService.updateSyncCursor(network.chainId, contractAddress, {
            status: "IDLE"
        });
        return { fromBlock, toBlock: latestBlock, processed: 0 };
    }

    let processed = 0;
    await mongoService.updateSyncCursor(network.chainId, contractAddress, {
        status: "RUNNING",
        errorMessage: null
    });

    try {
        while (fromBlock <= latestBlock) {
            const toBlock = Math.min(fromBlock + chunkSize - 1, latestBlock);
            await processChunk(fromBlock, toBlock);
            const block = await provider.getBlock(toBlock);
            await mongoService.updateSyncCursor(network.chainId, contractAddress, {
                lastProcessedBlock: toBlock,
                lastProcessedBlockHash: block?.hash,
                status: "RUNNING"
            });
            processed += toBlock - fromBlock + 1;
            fromBlock = toBlock + 1;
        }

        await mongoService.updateSyncCursor(network.chainId, contractAddress, {
            status: "IDLE"
        });
    } catch (error) {
        await mongoService.updateSyncCursor(network.chainId, contractAddress, {
            status: "ERROR",
            errorMessage: error.message
        });
        throw error;
    }

    return { fromBlock, toBlock: latestBlock, processed };
}

module.exports = { syncOnce };
