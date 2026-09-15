# BEEKEEPER Backend

The backend connects to the EVM node running in WSL through
`http://127.0.0.1:8545`. Configure `.env` with the deployed contract address,
one funded private key for each signer role, and `MONGODB_URI`.

## Quick Start

From the `backend` directory, run this single command:

```shell
npm run local:up
```

This automatically starts or restores WSL Anvil, checks the contract, deploys
the existing contract only when necessary, updates `CONTRACT_ADDRESS`, assigns
the configured roles, migrates and synchronizes MongoDB, and starts the
backend. Do not run `npm start` separately after `npm run local:up`.

To stop the local stack cleanly:

```shell
npm run local:down
```

The Anvil state is saved in `blockchain/.anvil/state.json`. The next
`npm run local:up` restores that state automatically. Check the stack with:

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/health
```

Start the API from this directory:

```shell
npm start
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Basic service response |
| GET | `/api/health` | RPC and contract health |
| GET | `/api/batches` | List registered batches |
| POST | `/api/batches` | Register a batch |
| GET | `/api/batches/:id` | Read a full batch |
| GET | `/api/batches/:id/verify` | Read verification data |
| GET | `/api/batches/:id/history` | Read custody history |
| GET | `/api/batches/next-id` | Read the next batch ID |
| POST | `/api/lab/test` | Record a lab result |
| POST | `/api/custody/transfer` | Beekeeper to processor |
| POST | `/api/custody/processor-transfer` | Processor to distributor |
| POST | `/api/custody/distributor-transfer` | Distributor to retailer |
| GET | `/api/roles/:address` | Read an account role |
| POST | `/api/admin/roles` | Assign an account role |

The API waits for every write transaction to be mined before returning its
transaction hash. Signers use nonce management so sequential writes from the
same account do not reuse an RPC nonce.

## Authentication and Role Workflow

Configure these additional values in `.env` before using the authenticated
workflow:

```dotenv
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=8h
ADMIN_REGISTRATION_CODE=<local-admin-bootstrap-code>
IPFS_API_URL=http://127.0.0.1:5001/api/v0/add
PUBLIC_VERIFY_BASE_URL=http://localhost:5173/verify
```

The prototype associates one MongoDB user with each backend-managed signer.
Registration requires a username, email, password, and role.
Private keys remain in environment variables and are never returned by the
API. Registration assigns the corresponding on-chain role through the existing
admin signer when necessary.

Additional endpoints are:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create a role-linked user |
| POST | `/api/auth/login` | Authenticate and return a JWT |
| GET | `/api/auth/me` | Read the authenticated user |
| GET | `/api/dashboard/my-batches` | Read the user's projected batches |
| GET | `/api/dashboard/summary` | Read role dashboard counts |
| GET | `/api/dashboard/eligible-batches` | Read eligible downstream batches |
| GET | `/api/lab/batches/pending` | Read batches awaiting lab testing |
| POST | `/api/lab/test/upload` | Upload a PDF to IPFS and record the lab result |
| POST | `/api/custody/request` | Request the next custody handoff |
| GET | `/api/custody/requests/incoming` | Read approval requests |
| GET | `/api/custody/requests/outgoing` | Read submitted requests |
| POST | `/api/custody/requests/:id/approve` | Approve and execute blockchain transfer |
| POST | `/api/custody/requests/:id/reject` | Reject a pending request |
| POST | `/api/batches/:id/qr` | Generate a retailer verification QR code |

The public verification routes remain unauthenticated and read their core
state directly from blockchain:

```text
GET /api/batches/:id/verify
GET /api/batches/:id/history
```

Blockchain reads are authoritative. MongoDB stores confirmed projections of
batches, lab tests, custody transfers, and blockchain transactions. If MongoDB
is unavailable, read endpoints can fall back to the chain, while write
endpoints report the confirmed transaction hash together with a persistence
failure so the projection can be repaired.

## Database Projection

MongoDB contains these collections:

- `batches`: current searchable batch state.
- `labtests`: confirmed `LabTestRecorded` projections and report CIDs.
- `custodytransfers`: append-only custody history projections.
- `blockchaintransactions`: confirmed transaction metadata.
- `blockchainevents`: canonical event log indexed by transaction hash and log index.
- `synccursors`: replay position for the blockchain indexer.

The contract remains authoritative for ownership, roles, status, lab results,
and custody history. MongoDB is used for search, pagination, application
metadata, event indexing, and reconciliation. Quantities are stored as strings
in MongoDB so Solidity `uint256` values are not rounded by JavaScript numbers.

Apply indexes to an existing database:

```shell
npm run db:migrate
```

Replay missed blockchain events:

```shell
npm run db:sync
```

Rebuild projection collections from the deployed contract. This is destructive
to MongoDB projection data but does not affect the blockchain:

```shell
npm run db:rebuild
```

## Deploying From WSL

With Anvil running in WSL, deploy from the blockchain directory:

```shell
/home/suraj/.foundry/bin/forge script script/BEEKEEPER.s.sol:BEEKEEPERScript --rpc-url http://127.0.0.1:8545 --private-key <anvil-deployer-key> --broadcast
```

Put the resulting contract address in `backend/.env` as `CONTRACT_ADDRESS`.

## Anvil Stop and Restart

Anvil is an in-memory local blockchain by default. If it is stopped without a
state file, all local blocks, contract deployments, role assignments, batches,
and transactions are lost. MongoDB is not a replacement for this chain state.

### Recommended Persistent Workflow

Start Anvil with a state dump from a WSL terminal. Run this from the
repository's `blockchain` directory:

```shell
mkdir -p .anvil
/home/suraj/.foundry/bin/anvil \
  --host 127.0.0.1 \
  --chain-id 31337 \
  --dump-state .anvil/state.json
```

When Anvil is running with `--dump-state`, stop it with `Ctrl+C` so it can
write `.anvil/state.json`. Restart it with the saved state:

```shell
/home/suraj/.foundry/bin/anvil \
  --host 127.0.0.1 \
  --chain-id 31337 \
  --load-state .anvil/state.json
```

Then start the backend from `backend`:

```shell
npm start
```

The backend automatically checks the chain and replays new contract events
into MongoDB. To run the replay manually after downtime:

```shell
npm run db:sync
```

With a loaded state file, keep the existing `CONTRACT_ADDRESS` in `.env`. Do
not run `db:rebuild` for a normal restart; use it only when rebuilding the
MongoDB projections deliberately.

### Clean Chain Restart

Use this workflow when you intentionally want a new empty Anvil chain:

1. Stop the current Anvil process with `Ctrl+C`.
2. Start Anvil without `--load-state`.
3. Deploy the existing contract from WSL:

```shell
/home/suraj/.foundry/bin/forge script \
  script/BEEKEEPER.s.sol:BEEKEEPERScript \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <anvil-deployer-key> \
  --broadcast
```

4. Read the new deployed address from Foundry output and update
   `CONTRACT_ADDRESS` in `backend/.env`.
5. Start the backend with `npm start`.
6. Reassign the application wallets with `POST /api/admin/roles`, because a
   fresh contract has no roles assigned.
7. Rebuild MongoDB projections from the new chain:

```shell
npm run db:rebuild
```

Never use the old MongoDB projections with a newly deployed contract. A fresh
chain can reuse the same `chainId`, so the contract address and chain state
must be treated as part of every database record.

### Health Check

From Windows PowerShell, verify both dependencies before using the API:

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/health
```

The response must show `status: "ok"`, a connected blockchain, the expected
`CONTRACT_ADDRESS`, and a connected MongoDB. If the contract address has no
code, stop the backend, correct `.env`, and restart it.
