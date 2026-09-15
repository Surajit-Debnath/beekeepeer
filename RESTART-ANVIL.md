# Restart Anvil Automation

`restart-anvil.js` replaces the manual local-chain workflow for this project.
Run it from the project root:

```powershell
node restart-anvil.js
```

The script stops an existing Anvil at `http://127.0.0.1:8545`, starts a clean
chain with chain ID `31337`, waits for JSON-RPC readiness, deploys
`blockchain/script/BEEKEEPER.s.sol:BEEKEEPERScript`, verifies bytecode, and
updates only `CONTRACT_ADDRESS` in `backend/.env`.

On a clean chain it also restores the six configured application roles through
the existing contract `assignRole()` function, so users stored in MongoDB can
continue working after Anvil is reset.

After deployment it rebuilds MongoDB projection collections from the fresh
chain. User accounts are preserved; stale batches, events, and custody
requests are removed. Set `REBUILD_MONGO_ON_DEPLOY=false` only when MongoDB is
intentionally unavailable and you accept stale projections.

## Expected Structure

```text
BEEKEEPER/
  restart-anvil.js
  backend/
    .env
    .env.example
    blockchain/BEEKEEPER.json
  blockchain/
    foundry.toml
    script/BEEKEEPER.s.sol
    src/BEEKEEPER.sol
```

The script assumes the paths above. Set `FOUNDRY_DEPLOY_SCRIPT`,
`FOUNDRY_DEPLOY_TARGET`, `FOUNDRY_BROADCAST_FILE`, `ANVIL_BIN_WSL`, or
`FORGE_BIN_WSL` in the shell environment when your project differs.

## Environment

`backend/.env` must contain the existing backend settings and valid local
development signer keys. A minimal example is:

```dotenv
LOCAL_RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
ADMIN_PRIVATE_KEY=<local-only-admin-private-key>
LOCAL_PRIVATE_KEY=<local-only-beekeeper-private-key>
LAB_INSPECTOR_PRIVATE_KEY=<local-only-lab-private-key>
PROCESSOR_PRIVATE_KEY=<local-only-processor-private-key>
DISTRIBUTOR_PRIVATE_KEY=<local-only-distributor-private-key>
RETAILER_PRIVATE_KEY=<local-only-retailer-private-key>
MONGODB_URI=mongodb://127.0.0.1:27017/beekeeper

# Optional. If omitted, Anvil's deterministic default development accounts are used.
# ANVIL_MNEMONIC=<fixed-local-only-anvil-mnemonic>
```

The current project keys are the standard Anvil development accounts, so the
optional mnemonic is not needed. If `ANVIL_MNEMONIC` is set, every backend key
must be derived from that mnemonic or the script will stop before deployment.
Never use these local development keys on a real network.

No npm package is added. The script uses Node standard libraries and the
existing `backend/node_modules/ethers` dependency for address validation.

## Deployment Customization

The defaults match this repository:

```text
script/BEEKEEPER.s.sol:BEEKEEPERScript
```

For a deployment at `blockchain/script/Deploy.s.sol:DeployScript`, set:

```powershell
$env:FOUNDRY_DEPLOY_SCRIPT = "script/Deploy.s.sol"
$env:FOUNDRY_DEPLOY_TARGET = "DeployScript"
$env:DEPLOYED_CONTRACT_NAME = "BEEKEEPER"
node restart-anvil.js
```

The script invokes Foundry with `--unlocked --sender <ADMIN_ADDRESS>`, which
works because Anvil unlocks its development accounts. If a deployment script
needs constructor arguments or extra Forge flags, edit `deployContract()` in
`restart-anvil.js` and add them to the `args` array. The broadcast output is
read from `blockchain/broadcast/<script-file>/<chain-id>/run-latest.json` by
default. Set `FOUNDRY_BROADCAST_FILE` if the project writes elsewhere.

## Backend Integration

The existing backend calls `require("dotenv").config()` and reads
`LOCAL_RPC_URL` and `CONTRACT_ADDRESS` from `backend/.env`. Therefore the
normal sequence is:

```powershell
node restart-anvil.js
cd backend
npm start
```

Do not start the backend before the automation finishes. The script preserves
MongoDB settings, signer keys, RPC settings, and all other `.env` lines.

## Troubleshooting

- **Port 8545 already in use:** If the RPC identifies as Anvil, the script stops it. If it identifies as another service, stop that service or choose a different local setup; the script intentionally does not kill an unknown RPC.
- **Anvil not starting:** Run `wsl.exe -e /home/suraj/.foundry/bin/anvil --version`, or set `ANVIL_BIN_WSL` to the actual WSL path. Remove a stale process with `wsl.exe -e pkill -INT -x anvil`.
- **Foundry not found:** Install Foundry inside WSL and ensure `/home/<user>/.foundry/bin` is available, or set both `ANVIL_BIN_WSL` and `FORGE_BIN_WSL`.
- **Deployment failing:** Run the deployment command manually from `blockchain`, check Solidity compilation and `forge test`, and confirm the admin key address is one of Anvil's accounts.
- **Contract address not detected:** Check `blockchain/broadcast/BEEKEEPER.s.sol/31337/run-latest.json`. Set `FOUNDRY_BROADCAST_FILE` for a different output path and set `DEPLOYED_CONTRACT_NAME` to the deployed contract name.
- **`.env` not updating:** Confirm `backend/.env` exists and is writable. The script updates an existing `CONTRACT_ADDRESS=` line or appends one without changing unrelated lines.
- **WSL/Windows process issues:** Run the script in Windows PowerShell from the project root, use the WSL binary paths above, and avoid running a separate Anvil instance in another WSL distribution. Set `WSL_DISTRO` when a non-default distribution contains Foundry.
