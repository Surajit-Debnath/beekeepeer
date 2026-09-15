"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, spawn, spawnSync } = require("child_process");

const projectRoot = __dirname;
const blockchainRoot = path.join(projectRoot, "blockchain");
const backendRoot = path.join(projectRoot, "backend");
const backendEnvFile = path.join(backendRoot, ".env");
const abiFile = path.join(backendRoot, "blockchain", "BEEKEEPER.json");

const defaultRpcUrl = "http://127.0.0.1:8545";
const rpcUrl = process.env.LOCAL_RPC_URL || defaultRpcUrl;
const chainId = String(process.env.ANVIL_CHAIN_ID || "31337");
const expectedContractName = process.env.DEPLOYED_CONTRACT_NAME || "BEEKEEPER";
const signerNames = [
    "ADMIN_PRIVATE_KEY",
    "LOCAL_PRIVATE_KEY",
    "LAB_INSPECTOR_PRIVATE_KEY",
    "PROCESSOR_PRIVATE_KEY",
    "DISTRIBUTOR_PRIVATE_KEY",
    "RETAILER_PRIVATE_KEY"
];

const { ethers } = loadEthers();

let foundry;
let anvilProcess;
let startedAnvil = false;
let success = false;
let handlingSignal = false;

const colorEnabled = !process.env.NO_COLOR && process.stdout.isTTY;
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    dim: "\x1b[2m"
};

function color(name, value) {
    return colorEnabled ? `${colors[name]}${value}${colors.reset}` : value;
}

function status(label, message, colorName = "cyan") {
    console.log(`${color(colorName, `[${label}]`)} ${message}`);
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function loadEthers() {
    try {
        return require(path.join(backendRoot, "node_modules", "ethers"));
    } catch (error) {
        throw new Error(
            "ethers.js is required. Run `npm install` in the backend directory first."
        );
    }
}

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const values = {};
    const contents = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

    for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match) {
            continue;
        }

        let value = match[2];
        if (
            value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")))
        ) {
            value = value.slice(1, -1);
        } else {
            value = value.replace(/\s+#.*$/, "");
        }

        values[match[1]] = value;
    }

    return values;
}

function projectEnv() {
    if (!fs.existsSync(backendEnvFile)) {
        throw new Error(`Backend environment file not found: ${backendEnvFile}`);
    }

    return {
        ...parseEnvFile(backendEnvFile),
        ...process.env
    };
}

function commandWorks(command, args = ["--version"]) {
    try {
        execFileSync(command, args, { stdio: "ignore", windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

function wslPath(filePath) {
    const match = filePath.match(/^([A-Za-z]):[\\/](.*)$/);
    if (!match) {
        throw new Error(`Cannot convert Windows path to WSL path: ${filePath}`);
    }

    return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

function wslFileWorks(filePath) {
    try {
        execFileSync("wsl.exe", ["-e", "test", "-x", filePath], {
            stdio: "ignore",
            windowsHide: true
        });
        return true;
    } catch {
        return false;
    }
}

function firstWorkingWslFile(environmentName, candidates) {
    const configured = process.env[environmentName];
    const paths = configured ? [configured, ...candidates] : candidates;
    return paths.find((candidate) => wslFileWorks(candidate));
}

function resolveFoundry() {
    if (commandWorks("anvil") && commandWorks("forge")) {
        return { mode: "native", anvil: "anvil", forge: "forge" };
    }

    if (process.platform === "win32" && commandWorks("wsl.exe", ["--status"])) {
        const anvil = firstWorkingWslFile("ANVIL_BIN_WSL", [
            "/home/suraj/.foundry/bin/anvil",
            "/usr/bin/anvil"
        ]);
        const forge = firstWorkingWslFile("FORGE_BIN_WSL", [
            "/home/suraj/.foundry/bin/forge",
            "/usr/bin/forge"
        ]);

        if (anvil && forge) {
            return { mode: "wsl", anvil, forge };
        }
    }

    throw new Error(
        "Foundry was not found. Install Anvil/Forge, add them to PATH, or set ANVIL_BIN_WSL and FORGE_BIN_WSL."
    );
}

function wslArguments(command, args) {
    const result = [];
    if (process.env.WSL_DISTRO) {
        result.push("-d", process.env.WSL_DISTRO);
    }
    result.push("-e", command, ...args);
    return result;
}

async function rpcRequest(method, params = []) {
    const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        signal: AbortSignal.timeout(1500)
    });

    const body = await response.json();
    if (body.error) {
        throw new Error(body.error.message || `RPC error for ${method}`);
    }
    if (!response.ok || body.result === undefined) {
        throw new Error(`Invalid RPC response for ${method}`);
    }

    return body.result;
}

async function probeRpc() {
    try {
        const [clientVersion, currentChainId] = await Promise.all([
            rpcRequest("web3_clientVersion"),
            rpcRequest("eth_chainId")
        ]);

        return {
            available: true,
            isAnvil: /anvil/i.test(clientVersion),
            clientVersion,
            chainId: Number.parseInt(currentChainId, 16)
        };
    } catch {
        return { available: false };
    }
}

async function waitForRpc() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const probe = await probeRpc();
        if (probe.available) {
            if (!probe.isAnvil) {
                throw new Error(
                    `RPC ${rpcUrl} is responding, but it is not Anvil (${probe.clientVersion}).`
                );
            }
            if (probe.chainId !== Number(chainId)) {
                throw new Error(
                    `Anvil is using chain ID ${probe.chainId}; expected ${chainId}.`
                );
            }
            return probe;
        }
        await sleep(250);
    }

    throw new Error(`Anvil did not become available at ${rpcUrl}.`);
}

function stopWslAnvil() {
    try {
        execFileSync(
            "wsl.exe",
            [
                "-e",
                "sh",
                "-lc",
                "for pid in $(pgrep -x anvil 2>/dev/null); do kill -INT \"$pid\"; done"
            ],
            { stdio: "ignore", windowsHide: true }
        );
    } catch {
        // No WSL Anvil process is also a successful stop.
    }
}

function stopNativeWindowsAnvil() {
    try {
        execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-Command",
                "$p = Get-Process -Name anvil -ErrorAction SilentlyContinue; if ($p) { $p | Stop-Process -Force }"
            ],
            { stdio: "ignore", windowsHide: true }
        );
    } catch {
        // No native Anvil process is also a successful stop.
    }
}

function stopNativeUnixAnvil() {
    try {
        execFileSync("pkill", ["-INT", "-x", "anvil"], { stdio: "ignore" });
    } catch {
        // No Anvil process is also a successful stop.
    }
}

async function stopAnvil() {
    if (anvilProcess && !anvilProcess.killed) {
        try {
            anvilProcess.kill("SIGINT");
        } catch {
            // The wrapper may already have exited while Anvil is stopping.
        }
    }

    if (process.platform === "win32") {
        stopWslAnvil();
        stopNativeWindowsAnvil();
    } else {
        stopNativeUnixAnvil();
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (!(await probeRpc()).available) {
            anvilProcess = null;
            return;
        }
        await sleep(250);
    }

    throw new Error(`Anvil did not stop cleanly on ${rpcUrl}.`);
}

function startAnvil(environment) {
    const url = new URL(rpcUrl);
    const args = [
        "--host",
        url.hostname,
        "--port",
        url.port || "8545",
        "--chain-id",
        chainId,
        "--accounts",
        "10",
        "--balance",
        "10000"
    ];

    const mnemonic = environment.ANVIL_MNEMONIC;
    if (mnemonic) {
        args.push("--mnemonic", mnemonic);
    }

    const command = foundry.mode === "wsl" ? "wsl.exe" : foundry.anvil;
    const commandArgs = foundry.mode === "wsl"
        ? wslArguments(foundry.anvil, args)
        : args;

    anvilProcess = spawn(command, commandArgs, {
        cwd: projectRoot,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: process.env
    });
    anvilProcess.on("error", () => {
        // waitForRpc reports the actionable startup error.
    });
    anvilProcess.unref();
    startedAnvil = true;
}

function privateKeyAddresses(environment) {
    const addresses = {};

    for (const name of signerNames) {
        const privateKey = environment[name];
        if (!privateKey) {
            throw new Error(`${name} is missing from ${backendEnvFile}.`);
        }

        try {
            addresses[name] = new ethers.Wallet(privateKey).address;
        } catch {
            throw new Error(`${name} is not a valid Ethereum private key.`);
        }
    }

    return addresses;
}

async function verifyConfiguredAccounts(addresses) {
    const accounts = (await rpcRequest("eth_accounts")).map((address) => address.toLowerCase());
    const missing = Object.entries(addresses)
        .filter(([, address]) => !accounts.includes(address.toLowerCase()))
        .map(([name]) => name);

    if (missing.length > 0) {
        throw new Error(
            `Anvil accounts do not match the backend keys: ${missing.join(", ")}. ` +
            "Set ANVIL_MNEMONIC to the mnemonic that derives those keys, or update the backend keys."
        );
    }
}

function deploymentSettings(environment) {
    const script = environment.FOUNDRY_DEPLOY_SCRIPT || "script/BEEKEEPER.s.sol";
    const target = environment.FOUNDRY_DEPLOY_TARGET === undefined
        ? "BEEKEEPERScript"
        : environment.FOUNDRY_DEPLOY_TARGET;
    return {
        scriptSpecifier: target ? `${script}:${target}` : script,
        scriptFile: script,
        target,
        broadcastFile: environment.FOUNDRY_BROADCAST_FILE || null
    };
}

function runCommand(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            ...options,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true
        });
        let output = "";

        for (const stream of [child.stdout, child.stderr]) {
            stream.setEncoding("utf8");
            stream.on("data", (chunk) => {
                output += chunk;
                process.stdout.write(chunk);
            });
        }

        child.on("error", reject);
        child.on("close", (code, signal) => resolve({ code, signal, output }));
    });
}

async function deployContract(environment, adminAddress) {
    const settings = deploymentSettings(environment);
    const root = foundry.mode === "wsl" ? wslPath(blockchainRoot) : blockchainRoot;
    const scriptSpecifier = foundry.mode === "wsl"
        ? `${wslPath(path.join(blockchainRoot, settings.scriptFile))}${settings.target ? `:${settings.target}` : ""}`
        : settings.scriptSpecifier;
    const args = [
        "script",
        scriptSpecifier,
        "--root",
        root,
        "--rpc-url",
        rpcUrl,
        "--unlocked",
        "--sender",
        adminAddress,
        "--broadcast"
    ];
    const command = foundry.mode === "wsl" ? "wsl.exe" : foundry.forge;
    const commandArgs = foundry.mode === "wsl"
        ? wslArguments(foundry.forge, args)
        : args;
    const result = await runCommand(command, commandArgs, {
        cwd: foundry.mode === "wsl" ? projectRoot : blockchainRoot,
        env: process.env
    });

    if (result.code !== 0) {
        throw new Error(
            `Foundry deployment failed${result.signal ? ` (${result.signal})` : ` with exit code ${result.code}`}.`
        );
    }

    return { ...settings, output: result.output };
}

function validAddress(value) {
    return typeof value === "string" && ethers.isAddress(value)
        ? ethers.getAddress(value)
        : null;
}

function addressFromBroadcast(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return null;
    }

    try {
        const deployment = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const transactions = Array.isArray(deployment.transactions)
            ? deployment.transactions
            : [];
        const creations = transactions.filter((transaction) => validAddress(transaction.contractAddress));
        const expected = creations.find(
            (transaction) => transaction.contractName === expectedContractName
        );
        return validAddress((expected || creations.at(-1))?.contractAddress);
    } catch (error) {
        throw new Error(`Could not read Foundry deployment output ${filePath}: ${error.message}`);
    }
}

function deploymentBroadcastFile(settings) {
    if (settings.broadcastFile) {
        return path.resolve(projectRoot, settings.broadcastFile);
    }

    const scriptName = path.basename(settings.scriptFile);
    return path.join(
        blockchainRoot,
        "broadcast",
        scriptName,
        chainId,
        "run-latest.json"
    );
}

function addressFromOutput(output, excludedAddress) {
    const addresses = output.match(/0x[a-fA-F0-9]{40}/g) || [];
    const excluded = excludedAddress.toLowerCase();
    const candidates = addresses
        .map(validAddress)
        .filter((address) => address && address.toLowerCase() !== excluded);
    return candidates.at(-1) || null;
}

function findDeployedAddress(settings, output, adminAddress) {
    const broadcastAddress = addressFromBroadcast(deploymentBroadcastFile(settings));
    return broadcastAddress || addressFromOutput(output, adminAddress);
}

async function verifyContract(address) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const code = await rpcRequest("eth_getCode", [address, "latest"]);
        if (code && code !== "0x") {
            return;
        }
        await sleep(250);
    }

    throw new Error(`No contract bytecode exists at ${address}.`);
}

async function restoreConfiguredRoles(environment, addresses, contractAddress) {
    const artifact = JSON.parse(fs.readFileSync(abiFile, "utf8"));
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const admin = new ethers.NonceManager(
        new ethers.Wallet(environment.ADMIN_PRIVATE_KEY, provider)
    );
    const contract = new ethers.Contract(contractAddress, artifact.abi, admin);
    const roles = [
        ["LOCAL_PRIVATE_KEY", 1],
        ["LAB_INSPECTOR_PRIVATE_KEY", 2],
        ["PROCESSOR_PRIVATE_KEY", 3],
        ["DISTRIBUTOR_PRIVATE_KEY", 4],
        ["RETAILER_PRIVATE_KEY", 5]
    ];

    for (const [environmentName, role] of roles) {
        const address = addresses[environmentName];
        const currentRole = Number(await contract.roles(address));
        if (currentRole === role) {
            continue;
        }

        const transaction = await contract.assignRole(address, role);
        await transaction.wait();
    }

    status("ROLES", "configured blockchain roles restored.", "green");
}

function verifyAbi() {
    if (!fs.existsSync(abiFile)) {
        status("INFO", `ABI check skipped; artifact not found at ${abiFile}.`, "yellow");
        return;
    }

    try {
        const artifact = JSON.parse(fs.readFileSync(abiFile, "utf8"));
        if (!Array.isArray(artifact.abi) || artifact.abi.length === 0) {
            throw new Error("the ABI array is empty");
        }
        status("INFO", `ABI available at ${path.relative(projectRoot, abiFile)}.`, "dim");
    } catch (error) {
        throw new Error(`ABI verification failed: ${error.message}`);
    }
}

function updateContractAddress(address) {
    const original = fs.readFileSync(backendEnvFile, "utf8");
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const lines = original.split(/\r?\n/);
    let found = false;

    const updated = lines.map((line) => {
        if (/^\s*CONTRACT_ADDRESS\s*=/.test(line)) {
            found = true;
            return `CONTRACT_ADDRESS=${address}`;
        }
        return line;
    });

    if (!found) {
        if (updated.length > 0 && updated.at(-1) !== "") {
            updated.push("");
        }
        updated.push(`CONTRACT_ADDRESS=${address}`);
    }

    fs.writeFileSync(backendEnvFile, updated.join(newline), "utf8");
}

function rebuildMongoProjection() {
    if (process.env.REBUILD_MONGO_ON_DEPLOY === "false") {
        status("DB", "MongoDB projection rebuild skipped by configuration.", "yellow");
        return;
    }

    const script = path.join(backendRoot, "scripts", "rebuildDatabase.js");
    const result = spawnSync(
        process.execPath,
        [script, "--confirm"],
        { cwd: backendRoot, stdio: "inherit", windowsHide: true }
    );
    if (result.status !== 0) {
        throw new Error("MongoDB projection rebuild failed after deployment.");
    }
    status("DB", "MongoDB projections rebuilt from the fresh blockchain.", "green");
}

async function handleSignal(signal) {
    if (handlingSignal) {
        return;
    }
    handlingSignal = true;
    console.error(`\n${color("yellow", `[${signal}]`)} stopping Anvil...`);
    try {
        if (startedAnvil && !success) {
            await stopAnvil();
        }
    } finally {
        process.exit(130);
    }
}

async function main() {
    if (new URL(rpcUrl).hostname !== "127.0.0.1") {
        throw new Error(`This script is configured for 127.0.0.1; received ${rpcUrl}.`);
    }

    const environment = projectEnv();
    const addresses = privateKeyAddresses(environment);
    const adminAddress = addresses.ADMIN_PRIVATE_KEY;
    foundry = resolveFoundry();

    const existing = await probeRpc();
    if (existing.available) {
        if (!existing.isAnvil) {
            throw new Error(
                `Port ${new URL(rpcUrl).port || "8545"} is occupied by ${existing.clientVersion || "another RPC service"}.`
            );
        }
        status("STOP", `stopping existing Anvil on ${rpcUrl}...`, "yellow");
        await stopAnvil();
        status("STOP", "existing Anvil stopped.", "green");
    } else {
        status("STOP", "no existing Anvil process detected.", "dim");
    }

    status("START", "starting Anvil with a clean deterministic development chain...");
    startAnvil(environment);
    await waitForRpc();
    status("READY", `RPC ready at ${rpcUrl} (chain ${chainId}).`, "green");

    await verifyConfiguredAccounts(addresses);
    status("INFO", "configured backend signer accounts are unlocked by Anvil.", "dim");

    status("DEPLOY", `starting Foundry deployment: ${deploymentSettings(environment).scriptSpecifier}...`);
    const deployment = await deployContract(environment, adminAddress);
    status("DEPLOY", "deployment successful.", "green");

    const contractAddress = findDeployedAddress(
        deployment,
        deployment.output,
        adminAddress
    );
    if (!contractAddress) {
        throw new Error(
            "Contract address was not detected. Check the Foundry broadcast file or configure FOUNDRY_BROADCAST_FILE."
        );
    }

    status("INFO", `contract address: ${contractAddress}`, "cyan");
    await verifyContract(contractAddress);
    verifyAbi();
    status("VERIFY", "deployed contract bytecode verified.", "green");
    await restoreConfiguredRoles(environment, addresses, contractAddress);

    updateContractAddress(contractAddress);
    status("ENV", `backend/.env updated with CONTRACT_ADDRESS=${contractAddress}.`, "green");
    rebuildMongoProjection();

    success = true;
    status("SUCCESS", "Anvil is running, the contract is deployed, and the backend environment is ready.", "green");
}

process.once("SIGINT", () => handleSignal("SIGINT"));
process.once("SIGTERM", () => handleSignal("SIGTERM"));

main().catch(async (error) => {
    console.error(`${color("red", "[ERROR]")} ${error.message}`);
    if (startedAnvil && !success) {
        try {
            await stopAnvil();
            console.error(`${color("dim", "[CLEANUP]")} stopped Anvil after failure.`);
        } catch (cleanupError) {
            console.error(`${color("red", "[CLEANUP ERROR]")} ${cleanupError.message}`);
        }
    }
    process.exitCode = 1;
});
