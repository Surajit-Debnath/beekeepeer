// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BEEKEEPER} from "../src/BEEKEEPER.sol";

contract BEEKEEPERTest is Test {
    BEEKEEPER public beekeeper;

    address public surajit = address(0x1);
    address public suman = address(0x2);
    address public amit = address(0x3);
    address public rohit = address(0x4);
    address public neha = address(0x5);

    function setUp() public {
        beekeeper = new BEEKEEPER();

        beekeeper.assignRole(
            surajit,
            BEEKEEPER.Role.BEEKEEPER
        );

        beekeeper.assignRole(
            suman,
            BEEKEEPER.Role.LAB_INSPECTOR
        );

        beekeeper.assignRole(
            amit,
            BEEKEEPER.Role.PROCESSOR
        );

        beekeeper.assignRole(
            rohit,
            BEEKEEPER.Role.DISTRIBUTOR
        );

        beekeeper.assignRole(
            neha,
            BEEKEEPER.Role.RETAILER
        );
    }

    // ================================================
    // TEST 1: ROLE ASSIGNMENT
    // ================================================

    function test_AssignRoles() public view {
        assertEq(
            uint256(beekeeper.roles(surajit)),
            uint256(BEEKEEPER.Role.BEEKEEPER)
        );

        assertEq(
            uint256(beekeeper.roles(suman)),
            uint256(BEEKEEPER.Role.LAB_INSPECTOR)
        );

        assertEq(
            uint256(beekeeper.roles(amit)),
            uint256(BEEKEEPER.Role.PROCESSOR)
        );

        assertEq(
            uint256(beekeeper.roles(rohit)),
            uint256(BEEKEEPER.Role.DISTRIBUTOR)
        );

        assertEq(
            uint256(beekeeper.roles(neha)),
            uint256(BEEKEEPER.Role.RETAILER)
        );
    }

    // ================================================
    // TEST 2: REGISTER BATCH
    // ================================================

    function test_RegisterBatch() public {
        vm.prank(surajit);

        uint256 batchId = beekeeper.registerBatch(
            "APIARY-001",
            "Wildflower Honey",
            25
        );

        assertEq(batchId, 1);

        (
            uint256 storedBatchId,
            address batchBeekeeper,
            address currentCustodian,
            string memory apiaryId,
            string memory honeyType,
            uint256 quantity,
            uint256 createdAt,
            bool labTested,
            bool labPassed,
            string memory reportCID,
            BEEKEEPER.BatchStatus status
        ) = beekeeper.batches(batchId);

        assertEq(storedBatchId, 1);
        assertEq(batchBeekeeper, surajit);
        assertEq(currentCustodian, surajit);
        assertEq(apiaryId, "APIARY-001");
        assertEq(honeyType, "Wildflower Honey");
        assertEq(quantity, 25);
        assertGt(createdAt, 0);

        assertFalse(labTested);
        assertFalse(labPassed);
        assertEq(reportCID, "");

        assertEq(
            uint256(status),
            uint256(BEEKEEPER.BatchStatus.AWAITING_LAB_TEST)
        );
    }

    // ================================================
    // TEST 3: LAB TEST PASS
    // ================================================

    function test_LabTestPass() public {
        vm.prank(surajit);

        uint256 batchId = beekeeper.registerBatch(
            "APIARY-001",
            "Wildflower Honey",
            25
        );

        vm.prank(suman);

        beekeeper.recordLabTest(
            batchId,
            true,
            "QmExampleLabReportCID"
        );

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            bool labTested,
            bool labPassed,
            string memory reportCID,
            BEEKEEPER.BatchStatus status
        ) = beekeeper.batches(batchId);

        assertTrue(labTested);
        assertTrue(labPassed);
        assertEq(reportCID, "QmExampleLabReportCID");

        assertEq(
            uint256(status),
            uint256(BEEKEEPER.BatchStatus.LAB_PASSED)
        );
    }

    // ================================================
    // TEST 4: LAB TEST FAIL
    // ================================================

    function test_LabTestFail() public {
        vm.prank(surajit);

        uint256 batchId = beekeeper.registerBatch(
            "APIARY-001",
            "Wildflower Honey",
            25
        );

        vm.prank(suman);

        beekeeper.recordLabTest(
            batchId,
            false,
            "QmFailedLabReportCID"
        );

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            bool labTested,
            bool labPassed,
            string memory reportCID,
            BEEKEEPER.BatchStatus status
        ) = beekeeper.batches(batchId);

        assertTrue(labTested);
        assertFalse(labPassed);
        assertEq(reportCID, "QmFailedLabReportCID");

        assertEq(
            uint256(status),
            uint256(BEEKEEPER.BatchStatus.LAB_FAILED)
        );
    }

    // ================================================
    // TEST 5: CUSTODY TRANSFER
    // ================================================

    function test_TransferCustody() public {
        vm.prank(surajit);

        uint256 batchId = beekeeper.registerBatch(
            "APIARY-001",
            "Wildflower Honey",
            25
        );

        vm.prank(suman);

        beekeeper.recordLabTest(
            batchId,
            true,
            "QmLabReportCID"
        );

        vm.prank(surajit);

        beekeeper.transferCustody(
            batchId,
            amit,
            "Siliguri",
            "Transferred to processor"
        );

        (
            ,
            ,
            address currentCustodian,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            
        ) = beekeeper.batches(batchId);

        assertEq(currentCustodian, amit);
    }

    // ================================================
    // TEST 6: COMPLETE CUSTODY CHAIN
    // ================================================

    function test_CompleteCustodyChain() public {
        // Surajit creates the honey batch
        vm.prank(surajit);

        uint256 batchId = beekeeper.registerBatch(
            "APIARY-001",
            "Wildflower Honey",
            25
        );

        // Suman performs laboratory test
        vm.prank(suman);

        beekeeper.recordLabTest(
            batchId,
            true,
            "QmLabReportCID"
        );

        // Beekeeper -> Processor
        vm.prank(surajit);

        beekeeper.transferCustody(
            batchId,
            amit,
            "Siliguri",
            "Honey sent to processor"
        );

        // Processor -> Distributor
        vm.prank(amit);

        beekeeper.transferCustody(
            batchId,
            rohit,
            "Kolkata",
            "Processed honey sent to distributor"
        );

        // Distributor -> Retailer
        vm.prank(rohit);

        beekeeper.transferCustody(
            batchId,
            neha,
            "Kolkata Retail Market",
            "Honey sent to retailer"
        );

        (
            ,
            ,
            address currentCustodian,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            
        ) = beekeeper.batches(batchId);

        assertEq(currentCustodian, neha);
    }

    // ================================================
    // TEST 7: VERIFY BATCH
    // ================================================

    function test_VerifyBatch() public {
        vm.prank(surajit);

        uint256 batchId = beekeeper.registerBatch(
            "APIARY-001",
            "Mustard Honey",
            50
        );

        (
            uint256 storedBatchId,
            address batchBeekeeper,
            address currentCustodian,
            string memory apiaryId,
            string memory honeyType,
            uint256 quantity,
            uint256 createdAt,
            bool labTested,
            bool labPassed,
            string memory reportCID,
            BEEKEEPER.BatchStatus status
        ) = beekeeper.batches(batchId);

        assertEq(storedBatchId, 1);
        assertEq(batchBeekeeper, surajit);
        assertEq(currentCustodian, surajit);
        assertEq(apiaryId, "APIARY-001");
        assertEq(honeyType, "Mustard Honey");
        assertEq(quantity, 50);
        assertGt(createdAt, 0);

        assertFalse(labTested);
        assertFalse(labPassed);
        assertEq(reportCID, "");

        assertEq(
            uint256(status),
            uint256(BEEKEEPER.BatchStatus.AWAITING_LAB_TEST)
        );
    }
}
