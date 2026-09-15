require("dotenv").config();

const mongoose = require("mongoose");
const mongoService = require("../services/mongoService");
const blockchainService = require("../services/blockchainService");
const blockchainIndexer = require("../services/blockchainIndexer");

mongoService.configureRoleLookup(blockchainService.getRole);

const collections = [
    "batches",
    "labtests",
    "custodytransfers",
    "blockchaintransactions",
    "blockchainevents",
    "synccursors",
    "custodyrequests"
];

async function main() {
    if (!process.argv.includes("--confirm")) {
        throw new Error("Database rebuild requires the --confirm flag");
    }

    await mongoService.connectMongo();

    for (const collectionName of collections) {
        await mongoose.connection.collection(collectionName).deleteMany({});
        console.log(`Cleared ${collectionName}`);
    }

    const result = await blockchainIndexer.syncOnce();
    console.log(JSON.stringify(result));
}

main()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
        console.error(error.message);
        await mongoose.disconnect();
        process.exitCode = 1;
    });
