require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { ethers } = require("ethers");

const backendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendRoot, "..");
const blockchainRoot = path.join(projectRoot, "blockchain");
const stateDirectory = path.join(blockchainRoot, ".anvil");
const stateFile = path.join(stateDirectory, "state.json");
const envFile = path.join(backendRoot, ".env");
const deploymentFile = path.join(
    blockchainRoot,
    "broadcast",
    "BEEKEEPER.s.sol",
    "31337",
    "run-latest.json"
);
const abi = require("../blockchain/BEEKEEPER.json").abi;

const rpcUrl = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
const adminAddress = adminPrivateKey
    ? new ethers.Wallet(adminPrivateKey).address
    : null;

const roleWallets = [
    ["LOCAL_PRIVATE_KEY", 1],
    ["LAB_INSPECTOR_PRIVATE_KEY", 2],
    ["PROCESSOR_PRIVATE_KEY", 3],
    ["DISTRIBUTOR_PRIVATE_KEY", 4],
    ["RETAILER_PRIVATE_KEY", 5]
];

function toWslPath(value) {
    const match = value.match(/^([A-Za-z]):[\\/](.*)$/);
    if (!match) {
        throw new Error(`Cannot convert path to WSL path: ${value}`);
    }

    return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function providerIsReady(provider) {
    try {
        await provider.getBlockNumber();
        return true;
    } catch {
        return false;
    }
}

async function waitForRpc(provider) {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (await providerIsReady(provider)) {
            return;
        }
        await sleep(500);
    }

    throw new Error(`Anvil did not become available at ${rpcUrl}`);
}

function startAnvil() {
    fs.mkdirSync(stateDirectory, { recursive: true });
    const wslStateFile = toWslPath(stateFile);
    const command = [
        "nohup",
        "/home/suraj/.foundry/bin/anvil",
        "--host 127.0.0.1",
        "--chain-id 31337",
        `--state ${wslStateFile}`,
        ">/tmp/beekeeper-anvil.log 2>&1 </dev/null &"
    ].join(" ");

    const child = spawn(
        "wsl.exe",
        ["-e", "sh", "-lc", command],
        { stdio: "ignore", windowsHide: true }
    );
    child.unref();
}

function updateContractAddress(address) {
    let contents = fs.readFileSync(envFile, "utf8");
    const line = `CONTRACT_ADDRESS=${address}`;

    if (/^CONTRACT_ADDRESS=.*$/m.test(contents)) {
        contents = contents.replace(/^CONTRACT_ADDRESS=.*$/m, line);
    } else {
        contents += `\n${line}\n`;
    }

    fs.writeFileSync(envFile, contents);
    process.env.CONTRACT_ADDRESS = address;
}

function deployContract() {
    if (!adminAddress) {
        throw new Error("ADMIN_PRIVATE_KEY must be configured before deployment");
    }

    const result = spawnSync(
        "wsl.exe",
        [
            "-e",
            "/home/suraj/.foundry/bin/forge",
            "script",
            `${toWslPath(path.join(blockchainRoot, "script", "BEEKEEPER.s.sol"))}:BEEKEEPERScript`,
            "--root",
            toWslPath(blockchainRoot),
            "--rpc-url",
            rpcUrl,
            "--unlocked",
            "--sender",
            adminAddress,
            "--broadcast"
        ],
        { cwd: projectRoot, stdio: "inherit", windowsHide: true }
    );

    if (result.status !== 0) {
        throw new Error("The existing BEEKEEPER contract deployment failed");
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const transaction = deployment.transactions.find(
        (item) => item.contractName === "BEEKEEPER" && item.contractAddress
    );

    if (!transaction) {
        throw new Error(`No BEEKEEPER contract address found in ${deploymentFile}`);
    }

    updateContractAddress(transaction.contractAddress);
    return transaction.contractAddress;
}

async function assignRoles(provider, contractAddress) {
    const admin = new ethers.NonceManager(
        new ethers.Wallet(adminPrivateKey, provider)
    );
    const roleContract = new ethers.Contract(contractAddress, abi, admin);
    const readContract = roleContract.connect(provider);

    for (const [environmentName, role] of roleWallets) {
        const privateKey = process.env[environmentName];
        if (!privateKey) {
            throw new Error(`${environmentName} must be configured`);
        }

        const address = new ethers.Wallet(privateKey).address;
        const currentRole = Number(await readContract.roles(address));

        if (currentRole === role) {
            continue;
        }

        const transaction = await roleContract.assignRole(address, role);
        await transaction.wait();
        console.log(`Assigned role ${role} to ${address}`);
    }
}

function runNodeScript(scriptName, extraArguments = []) {
    const result = spawnSync(
        process.execPath,
        [path.join(__dirname, scriptName), ...extraArguments],
        {
        cwd: backendRoot,
        stdio: "inherit",
        windowsHide: true
        }
    );

    if (result.status !== 0) {
        throw new Error(`${scriptName} failed`);
    }
}

function stopBackendOnPort() {
    spawnSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-Command",
            "$connection = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if ($connection) { Stop-Process -Id $connection.OwningProcess -Force }"
        ],
        { stdio: "ignore", windowsHide: true }
    );
}

function startBackend() {
    const child = spawn(process.execPath, [path.join(backendRoot, "server.js")], {
        cwd: backendRoot,
        detached: true,
        stdio: "ignore",
        windowsHide: true
    });
    child.unref();
}

async function waitForBackend() {
    const url = `${process.env.API_URL || "http://127.0.0.1:5000"}/api/health`;

    for (let attempt = 0; attempt < 30; attempt++) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        } catch {
            // The process may still be starting.
        }
        await sleep(500);
    }

    throw new Error("Backend health check did not become ready");
}

async function main() {
    if (!adminPrivateKey) {
        throw new Error("ADMIN_PRIVATE_KEY must be configured");
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wasRunning = await providerIsReady(provider);

    if (!wasRunning) {
        console.log("Starting managed Anvil with persistent state...");
        startAnvil();
        await waitForRpc(provider);
    }

    const chainId = Number((await provider.getNetwork()).chainId);
    if (chainId !== 31337) {
        throw new Error(`Expected Anvil chain 31337, received ${chainId}`);
    }

    let contractAddress = process.env.CONTRACT_ADDRESS;
    let deployedNewContract = false;

    if (!contractAddress || !ethers.isAddress(contractAddress)) {
        contractAddress = null;
    } else {
        const code = await provider.getCode(contractAddress);
        if (code === "0x") {
            contractAddress = null;
        }
    }

    stopBackendOnPort();

    if (!contractAddress) {
        console.log("Deploying the existing BEEKEEPER contract...");
        contractAddress = deployContract();
        deployedNewContract = true;
        console.log(`Contract address updated in backend/.env`);
    }

    await assignRoles(provider, contractAddress);
    runNodeScript("migrateDatabase.js");
    runNodeScript(
        deployedNewContract ? "rebuildDatabase.js" : "syncBlockchain.js",
        deployedNewContract ? ["--confirm"] : []
    );
    startBackend();
    await waitForBackend();

    console.log(`Local BEEKEEPER stack is ready at ${contractAddress}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
