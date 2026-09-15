require("dotenv").config();

const mongoose = require("mongoose");

const models = [
    require("../models/Batch"),
    require("../models/LabTest"),
    require("../models/CustodyTransfer"),
    require("../models/BlockchainTransaction"),
    require("../models/BlockchainEvent"),
    require("../models/SyncCursor"),
    require("../models/User"),
    require("../models/CustodyRequest")
];

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI must be configured");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: Number(
            process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000
        )
    });

    for (const model of models) {
        await model.syncIndexes();
        console.log(`Indexes synchronized: ${model.collection.name}`);
    }
}

main()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
        console.error(error.message);
        await mongoose.disconnect();
        process.exitCode = 1;
    });
