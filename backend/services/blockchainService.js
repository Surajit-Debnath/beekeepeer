const {
    provider,
    contractAddress,
    readContract,
    adminContract,
    contract,
    labContract,
    processorContract,
    distributorContract,
    retailerContract,
    adminWallet,
    wallet,
    labWallet,
    processorWallet,
    distributorWallet,
    retailerWallet,
    configuredWallets
} = require("../blockchain/blockchain");

const ROLES = Object.freeze({
    NONE: 0,
    BEEKEEPER: 1,
    LAB_INSPECTOR: 2,
    PROCESSOR: 3,
    DISTRIBUTOR: 4,
    RETAILER: 5
});

const ROLE_NAMES = Object.fromEntries(
    Object.entries(ROLES).map(([name, value]) => [value, name])
);

const STATUSES = Object.freeze([
    "AWAITING_LAB_TEST",
    "LAB_PASSED",
    "LAB_FAILED",
    "PROCESSING",
    "IN_TRANSIT",
    "READY_FOR_SALE"
]);

const signerContracts = [
    { role: ROLES.BEEKEEPER, wallet, contract },
    { role: ROLES.LAB_INSPECTOR, wallet: labWallet, contract: labContract },
    { role: ROLES.PROCESSOR, wallet: processorWallet, contract: processorContract },
    { role: ROLES.DISTRIBUTOR, wallet: distributorWallet, contract: distributorContract },
    { role: ROLES.RETAILER, wallet: retailerWallet, contract: retailerContract }
];

class BlockchainError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = "BlockchainError";
        this.statusCode = statusCode;
    }
}

function formatBatch(batch) {
    const status = Number(batch[10]);
    return {
        batchId: batch[0].toString(),
        beekeeper: batch[1],
        currentCustodian: batch[2],
        apiaryId: batch[3],
        honeyType: batch[4],
        quantity: batch[5].toString(),
        createdAt: batch[6].toString(),
        labTested: batch[7],
        labPassed: batch[8],
        labReportCID: batch[9],
        status,
        statusName: STATUSES[status] || "UNKNOWN"
    };
}

function formatVerification(result) {
    const status = Number(result[8]);
    return {
        batchId: result[0].toString(),
        beekeeper: result[1],
        currentCustodian: result[2],
        apiaryId: result[3],
        honeyType: result[4],
        quantity: result[5].toString(),
        labPassed: result[6],
        labReportCID: result[7],
        status,
        statusName: STATUSES[status] || "UNKNOWN"
    };
}

function formatHistory(history) {
    return history.map((record) => ({
        from: record[0],
        to: record[1],
        fromRole: Number(record[2]),
        fromRoleName: ROLE_NAMES[Number(record[2])] || "UNKNOWN",
        toRole: Number(record[3]),
        toRoleName: ROLE_NAMES[Number(record[3])] || "UNKNOWN",
        location: record[4],
        notes: record[5],
        timestamp: record[6].toString()
    }));
}

function parseEvent(receipt, eventName) {
    for (const log of receipt.logs) {
        if (log.fragment?.name === eventName) {
            return { args: log.args, log };
        }

        try {
            const parsed = readContract.interface.parseLog({
                topics: log.topics,
                data: log.data
            });
            if (parsed?.name === eventName) {
                return { args: parsed.args, log };
            }
        } catch {
            // Ignore logs emitted by other contracts.
        }
    }

    throw new BlockchainError(`Expected ${eventName} event was not emitted`, 502);
}

async function transactionResult(transaction, eventName, fromWallet) {
    const receipt = await transaction.wait();
    const parsedEvent = parseEvent(receipt, eventName);
    const block = receipt.blockNumber === null
        ? null
        : await provider.getBlock(receipt.blockNumber);
    const transactionIndex = receipt.index ?? receipt.transactionIndex ?? 0;
    const logIndex = parsedEvent.log.index ?? parsedEvent.log.logIndex ?? 0;

    return {
        transactionHash: receipt.hash || transaction.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        transactionIndex,
        logIndex,
        eventName,
        eventKey: `${receipt.hash || transaction.hash}:${logIndex}`,
        toContract: transaction.to || contractAddress,
        nonce: transaction.nonce,
        status: receipt.status === 1 ? "CONFIRMED" : "FAILED",
        fromWallet,
        contractAddress,
        chainId: Number((await provider.getNetwork()).chainId),
        timestamp: block ? new Date(Number(block.timestamp) * 1000) : new Date(),
        eventArgs: parsedEvent.args
    };
}

async function getBatch(batchId) {
    const nextBatchId = await readContract.getNextBatchId();
    if (BigInt(batchId) >= nextBatchId) {
        throw new BlockchainError("Batch does not exist", 404);
    }

    return formatBatch(await readContract.batches(batchId));
}

async function getVerification(batchId) {
    return formatVerification(await readContract.verifyBatch(batchId));
}

async function getFullHistory(batchId) {
    return formatHistory(await readContract.getFullHistory(batchId));
}

async function getNextBatchId() {
    return (await readContract.getNextBatchId()).toString();
}

async function getRole(address) {
    const role = Number(await readContract.roles(address));
    return { address, role, roleName: ROLE_NAMES[role] || "UNKNOWN" };
}

function walletRole(walletAddress) {
    return signerContracts.find(
        ({ wallet: signerWallet }) => signerWallet.address.toLowerCase() === walletAddress.toLowerCase()
    );
}

function getConfiguredWalletAddress(roleName) {
    const configuredWallet = configuredWallets[roleName];
    if (!configuredWallet) {
        throw new BlockchainError(`No configured wallet exists for ${roleName}`, 503);
    }
    return configuredWallet.address;
}

async function ensureRole(address, roleName) {
    const role = ROLES[roleName];
    if (role === undefined || role === ROLES.NONE) {
        throw new BlockchainError(`Invalid blockchain role ${roleName}`, 400);
    }

    const current = await getRole(address);
    if (current.role === role) {
        return null;
    }

    return assignRole(address, role);
}

async function registerBatch(apiaryId, honeyType, quantity) {
    const configuredRole = await getRole(wallet.address);
    if (configuredRole.role !== ROLES.BEEKEEPER) {
        throw new BlockchainError("Configured beekeeper signer is not a BEEKEEPER", 403);
    }

    const transaction = await contract.registerBatch(apiaryId, honeyType, quantity);
    const result = await transactionResult(transaction, "BatchCreated", wallet.address);
    const event = result.eventArgs;
    const batchId = event.batchId?.toString() || event[0]?.toString();

    if (!batchId) {
        throw new BlockchainError("BatchCreated event did not include a batch ID", 502);
    }

    return {
        ...result,
        operation: "REGISTER_BATCH",
        batchId,
        event: {
            batchId,
            beekeeper: event.beekeeper || event[1],
            apiaryId: event.apiaryId || event[2],
            honeyType: event.honeyType || event[3],
            quantity: (event.quantity || event[4]).toString()
        },
        batch: await getBatch(batchId)
    };
}

async function recordLabTest(batchId, passed, reportCID) {
    const batch = await getBatch(batchId);
    const configuredRole = await getRole(labWallet.address);

    if (configuredRole.role !== ROLES.LAB_INSPECTOR) {
        throw new BlockchainError("Configured lab signer is not a LAB_INSPECTOR", 403);
    }
    if (batch.labTested) {
        throw new BlockchainError("Lab test already recorded", 400);
    }
    if (batch.status !== 0) {
        throw new BlockchainError("Batch is not awaiting lab test", 400);
    }

    const transaction = await labContract.recordLabTest(batchId, passed, reportCID);
    const result = await transactionResult(transaction, "LabTestRecorded", labWallet.address);
    const event = result.eventArgs;

    return {
        ...result,
        operation: "LAB_TEST",
        batchId: batchId.toString(),
        event: {
            batchId: (event.batchId || event[0]).toString(),
            labInspector: event.labInspector || event[1],
            passed: event.passed ?? event[2],
            reportCID: event.reportCID || event[3]
        },
        batch: await getBatch(batchId)
    };
}

async function transferCustody(batchId, newCustodian, location, notes, expectedRole) {
    const batch = await getBatch(batchId);

    if (!batch.labTested || !batch.labPassed) {
        throw new BlockchainError("Batch has not passed lab test", 400);
    }

    const currentRole = await getRole(batch.currentCustodian);

    if (expectedRole !== undefined && currentRole.role !== expectedRole) {
        throw new BlockchainError(
            `Current custodian role is ${currentRole.roleName}, not ${ROLE_NAMES[expectedRole]}`,
            400
        );
    }

    const signer = walletRole(batch.currentCustodian);

    if (!signer) {
        throw new BlockchainError(
            "Current custodian is not controlled by a configured backend signer",
            403
        );
    }

    const transaction = await signer.contract.transferCustody(
        batchId,
        newCustodian,
        location,
        notes
    );
    const result = await transactionResult(transaction, "CustodyTransferred", signer.wallet.address);
    const event = result.eventArgs;

    return {
        ...result,
        operation: "CUSTODY_TRANSFER",
        batchId: batchId.toString(),
        event: {
            batchId: (event.batchId || event[0]).toString(),
            from: event.from || event[1],
            to: event.to || event[2],
            fromRole: Number(event.fromRole ?? event[3]),
            fromRoleName: ROLE_NAMES[Number(event.fromRole ?? event[3])],
            toRole: Number(event.toRole ?? event[4]),
            toRoleName: ROLE_NAMES[Number(event.toRole ?? event[4])],
            location: event.location || event[5],
            notes
        },
        batch: await getBatch(batchId)
    };
}

async function assignRole(address, role) {
    const transaction = await adminContract.assignRole(address, role);
    const result = await transactionResult(transaction, "RoleAssigned", adminWallet.address);
    const event = result.eventArgs;

    return {
        ...result,
        operation: "ROLE_ASSIGNMENT",
        address,
        role,
        roleName: ROLE_NAMES[role],
        event: {
            user: event.user || event[0],
            role: Number(event.role ?? event[1]),
            roleName: ROLE_NAMES[Number(event.role ?? event[1])]
        }
    };
}

async function getNetworkMetadata() {
    const network = await provider.getNetwork();
    return {
        chainId: Number(network.chainId),
        network: process.env.NETWORK_NAME || network.name
    };
}

async function getHealth() {
    const network = await getNetworkMetadata();
    const code = await provider.getCode(contractAddress);

    return {
        connected: Boolean(code && code !== "0x"),
        chainId: network.chainId,
        network: network.network,
        contractAddress
    };
}

module.exports = {
    ROLES,
    ROLE_NAMES,
    STATUSES,
    BlockchainError,
    contractAddress,
    getBatch,
    getVerification,
    getFullHistory,
    getNextBatchId,
    getRole,
    getConfiguredWalletAddress,
    ensureRole,
    walletRole,
    getNetworkMetadata,
    getHealth,
    registerBatch,
    recordLabTest,
    transferCustody,
    assignRole
};
