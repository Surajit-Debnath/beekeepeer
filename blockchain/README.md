## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Persistent WSL Anvil

The default Anvil process is in-memory. Stop it with `Ctrl+C` only after
starting it with `--dump-state`, otherwise the local chain and deployment are
lost.

```shell
mkdir -p .anvil
/home/suraj/.foundry/bin/anvil \
  --host 127.0.0.1 \
  --chain-id 31337 \
  --dump-state .anvil/state.json
```

Restart the saved chain with:

```shell
/home/suraj/.foundry/bin/anvil \
  --host 127.0.0.1 \
  --chain-id 31337 \
  --load-state .anvil/state.json
```

After restarting a saved state, keep the same backend `CONTRACT_ADDRESS` and
run `npm run db:sync` from the `backend` directory. If you intentionally start
a clean chain, redeploy the existing contract, update `CONTRACT_ADDRESS`,
reassign roles, and run `npm run db:rebuild` instead.

### Deploy

```shell
$ forge script script/BEEKEEPER.s.sol:BEEKEEPERScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
