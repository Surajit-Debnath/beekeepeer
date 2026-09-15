require("dotenv").config();

const {
    provider,
    wallet,
    labWallet,
    contract,
    labContract
} = require("./blockchain/blockchain");

async function main() {
    console.log("Beekeeper wallet:", wallet.address);
    console.log("Lab wallet:", labWallet.address);

    console.log(
        "Contract:",
        await contract.getAddress()
    );

    console.log(
        "Lab contract:",
        await labContract.getAddress()
    );
}

main().catch(console.error);