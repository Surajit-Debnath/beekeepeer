// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {BEEKEEPER} from "../src/BEEKEEPER.sol";

contract BEEKEEPERScript is Script {
    BEEKEEPER public beekeeper;

    function run() public {
        vm.startBroadcast();

        beekeeper = new BEEKEEPER();

        vm.stopBroadcast();
    }
}
