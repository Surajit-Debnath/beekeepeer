require("dotenv").config();

const { ethers } = require("ethers");
const contractJson = require("./BEEKEEPER.json");

const rpcUrl = process.env.LOCAL_RPC_URL;
const contractAddress = process.env.CONTRACT_ADDRESS;

if (!rpcUrl) {
    throw new Error("LOCAL_RPC_URL must be configured");
}

if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error(
        "CONTRACT_ADDRESS must be set to a deployed BEEKEEPER contract address"
    );
}

const privateKeyNames = [
    "ADMIN_PRIVATE_KEY",
    "LOCAL_PRIVATE_KEY",
    "LAB_INSPECTOR_PRIVATE_KEY",
    "PROCESSOR_PRIVATE_KEY",
    "DISTRIBUTOR_PRIVATE_KEY",
    "RETAILER_PRIVATE_KEY"
];

for (const name of privateKeyNames) {
    if (!process.env[name]) {
        throw new Error(`${name} must be configured`);
    }
}

const provider = new ethers.JsonRpcProvider(rpcUrl);

function walletFromEnv(name) {
    const wallet = new ethers.Wallet(process.env[name], provider);
    return {
        wallet,
        signer: new ethers.NonceManager(wallet)
    };
}

const admin = walletFromEnv("ADMIN_PRIVATE_KEY");
const beekeeper = walletFromEnv("LOCAL_PRIVATE_KEY");
const lab = walletFromEnv("LAB_INSPECTOR_PRIVATE_KEY");
const processor = walletFromEnv("PROCESSOR_PRIVATE_KEY");
const distributor = walletFromEnv("DISTRIBUTOR_PRIVATE_KEY");
const retailer = walletFromEnv("RETAILER_PRIVATE_KEY");

const configuredWallets = Object.freeze({
    ADMIN: admin.wallet,
    BEEKEEPER: beekeeper.wallet,
    LAB_INSPECTOR: lab.wallet,
    PROCESSOR: processor.wallet,
    DISTRIBUTOR: distributor.wallet,
    RETAILER: retailer.wallet
});

function contractWith(signer) {
    return new ethers.Contract(contractAddress, contractJson.abi, signer);
}

const adminContract = contractWith(admin.signer);
const contract = contractWith(beekeeper.signer);
const labContract = contractWith(lab.signer);
const processorContract = contractWith(processor.signer);
const distributorContract = contractWith(distributor.signer);
const retailerContract = contractWith(retailer.signer);

module.exports = {
    provider,
    rpcUrl,
    contractAddress,
    adminWallet: admin.wallet,
    adminContract,
    wallet: beekeeper.wallet,
    contract,
    labWallet: lab.wallet,
    labContract,
    processorWallet: processor.wallet,
    processorContract,
    distributorWallet: distributor.wallet,
    distributorContract,
    retailerWallet: retailer.wallet,
    retailerContract,
    configuredWallets,
    readContract: new ethers.Contract(contractAddress, contractJson.abi, provider),
    abi: contractJson.abi
};
