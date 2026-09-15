require("dotenv").config();

const mongoose = require("mongoose");
const mongoService = require("../services/mongoService");
const blockchainService = require("../services/blockchainService");
const blockchainIndexer = require("../services/blockchainIndexer");

mongoService.configureRoleLookup(blockchainService.getRole);

async function main() {
    await mongoService.connectMongo();
    const result = await blockchainIndexer.syncOnce();
    console.log(JSON.stringify(result));
}

main()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
        console.error(error);
        await mongoose.disconnect();
        process.exitCode = 1;
    });
