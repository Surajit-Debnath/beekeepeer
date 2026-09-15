// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BEEKEEPER {

    // =========================================================
    // ROLES
    // =========================================================

    enum Role {
        NONE,
        BEEKEEPER,
        LAB_INSPECTOR,
        PROCESSOR,
        DISTRIBUTOR,
        RETAILER
    }

    // =========================================================
    // BATCH STATUS
    // =========================================================

    enum BatchStatus {
        AWAITING_LAB_TEST,
        LAB_PASSED,
        LAB_FAILED,
        PROCESSING,
        IN_TRANSIT,
        READY_FOR_SALE
    }

    // =========================================================
    // BATCH
    // =========================================================

    struct Batch {
        uint256 batchId;
        address beekeeper;
        address currentCustodian;

        string apiaryId;
        string honeyType;
        uint256 quantity;

        uint256 createdAt;

        bool labTested;
        bool labPassed;
        string labReportCID;

        BatchStatus status;
    }

    // =========================================================
    // CUSTODY HISTORY
    // =========================================================

    struct CustodyRecord {
        address from;
        address to;
        Role fromRole;
        Role toRole;

        string location;
        string notes;

        uint256 timestamp;
    }

    // =========================================================
    // STATE VARIABLES
    // =========================================================

    address public admin;

    uint256 private nextBatchId = 1;

    mapping(address => Role) public roles;

    mapping(uint256 => Batch) public batches;

    mapping(uint256 => CustodyRecord[]) private custodyHistory;

    // =========================================================
    // EVENTS
    // =========================================================

    event RoleAssigned(
        address indexed user,
        Role role
    );

    event BatchCreated(
        uint256 indexed batchId,
        address indexed beekeeper,
        string apiaryId,
        string honeyType,
        uint256 quantity
    );

    event LabTestRecorded(
        uint256 indexed batchId,
        address indexed labInspector,
        bool passed,
        string reportCID
    );

    event CustodyTransferred(
        uint256 indexed batchId,
        address indexed from,
        address indexed to,
        Role fromRole,
        Role toRole,
        string location
    );

    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    constructor() {
        admin = msg.sender;

        // The deployer starts as admin.
        roles[msg.sender] = Role.NONE;
    }

    // =========================================================
    // MODIFIERS
    // =========================================================

    modifier onlyAdmin() {
        require(
            msg.sender == admin,
            "Only admin can perform this action"
        );
        _;
    }

    modifier onlyRole(Role _role) {
        require(
            roles[msg.sender] == _role,
            "Unauthorized role"
        );
        _;
    }

    // =========================================================
    // ADMIN: ASSIGN ROLE
    // =========================================================

    function assignRole(
        address _user,
        Role _role
    ) external onlyAdmin {

        require(
            _user != address(0),
            "Invalid address"
        );

        require(
            _role != Role.NONE,
            "Invalid role"
        );

        roles[_user] = _role;

        emit RoleAssigned(_user, _role);
    }

    // =========================================================
    // 1. REGISTER BATCH
    // =========================================================

    function registerBatch(
        string calldata _apiaryId,
        string calldata _honeyType,
        uint256 _quantity
    )
        external
        onlyRole(Role.BEEKEEPER)
        returns (uint256)
    {
        require(
            bytes(_apiaryId).length > 0,
            "Apiary ID required"
        );

        require(
            bytes(_honeyType).length > 0,
            "Honey type required"
        );

        require(
            _quantity > 0,
            "Quantity must be greater than zero"
        );

        uint256 batchId = nextBatchId;

        batches[batchId] = Batch({
            batchId: batchId,
            beekeeper: msg.sender,
            currentCustodian: msg.sender,

            apiaryId: _apiaryId,
            honeyType: _honeyType,
            quantity: _quantity,

            createdAt: block.timestamp,

            labTested: false,
            labPassed: false,
            labReportCID: "",

            status: BatchStatus.AWAITING_LAB_TEST
        });

        // First custody record: batch created by beekeeper.
        custodyHistory[batchId].push(
            CustodyRecord({
                from: address(0),
                to: msg.sender,

                fromRole: Role.NONE,
                toRole: Role.BEEKEEPER,

                location: "Apiary",
                notes: "Batch created",

                timestamp: block.timestamp
            })
        );

        nextBatchId++;

        emit BatchCreated(
            batchId,
            msg.sender,
            _apiaryId,
            _honeyType,
            _quantity
        );

        return batchId;
    }

    // =========================================================
    // 2. RECORD LAB TEST
    // =========================================================

    function recordLabTest(
        uint256 _batchId,
        bool _passed,
        string calldata _reportCID
    )
        external
        onlyRole(Role.LAB_INSPECTOR)
    {
        require(
            _batchId > 0 && _batchId < nextBatchId,
            "Batch does not exist"
        );

        Batch storage batch = batches[_batchId];

        require(
            !batch.labTested,
            "Lab test already recorded"
        );

        require(
            batch.status == BatchStatus.AWAITING_LAB_TEST,
            "Batch is not awaiting lab test"
        );

        require(
            bytes(_reportCID).length > 0,
            "Report CID required"
        );

        batch.labTested = true;
        batch.labPassed = _passed;
        batch.labReportCID = _reportCID;

        if (_passed) {
            batch.status = BatchStatus.LAB_PASSED;
        } else {
            batch.status = BatchStatus.LAB_FAILED;
        }

        emit LabTestRecorded(
            _batchId,
            msg.sender,
            _passed,
            _reportCID
        );
    }

    // =========================================================
    // 3. TRANSFER CUSTODY
    // =========================================================

    function transferCustody(
        uint256 _batchId,
        address _newCustodian,
        string calldata _location,
        string calldata _notes
    )
        external
    {
        require(
            _batchId > 0 && _batchId < nextBatchId,
            "Batch does not exist"
        );

        require(
            _newCustodian != address(0),
            "Invalid new custodian"
        );

        Batch storage batch = batches[_batchId];

        require(
            batch.currentCustodian == msg.sender,
            "You are not the current custodian"
        );

        require(
            batch.labTested && batch.labPassed,
            "Batch has not passed lab test"
        );

        Role senderRole = roles[msg.sender];
        Role receiverRole = roles[_newCustodian];

        require(
            _isValidNextRole(senderRole, receiverRole),
            "Invalid custody transfer"
        );

        // Update current custodian.
        batch.currentCustodian = _newCustodian;

        // Update status according to the new role.
        if (receiverRole == Role.PROCESSOR) {
            // Temporary workflow: processor custody makes the batch sale-ready.
            batch.status = BatchStatus.READY_FOR_SALE;
        }
        else if (receiverRole == Role.DISTRIBUTOR) {
            batch.status = BatchStatus.IN_TRANSIT;
        }
        else if (receiverRole == Role.RETAILER) {
            batch.status = BatchStatus.READY_FOR_SALE;
        }

        // Save custody history.
        custodyHistory[_batchId].push(
            CustodyRecord({
                from: msg.sender,
                to: _newCustodian,

                fromRole: senderRole,
                toRole: receiverRole,

                location: _location,
                notes: _notes,

                timestamp: block.timestamp
            })
        );

        emit CustodyTransferred(
            _batchId,
            msg.sender,
            _newCustodian,
            senderRole,
            receiverRole,
            _location
        );
    }

    // =========================================================
    // CHECK VALID CUSTODY ORDER
    // =========================================================

    function _isValidNextRole(
        Role _from,
        Role _to
    )
        internal
        pure
        returns (bool)
    {
        if (
            _from == Role.BEEKEEPER &&
            _to == Role.PROCESSOR
        ) {
            return true;
        }

        if (
            _from == Role.PROCESSOR &&
            _to == Role.DISTRIBUTOR
        ) {
            return true;
        }

        if (
            _from == Role.DISTRIBUTOR &&
            _to == Role.RETAILER
        ) {
            return true;
        }

        return false;
    }

    // =========================================================
    // 4. VERIFY BATCH
    // =========================================================

    function verifyBatch(
        uint256 _batchId
    )
        external
        view
        returns (
            uint256 batchId,
            address beekeeper,
            address currentCustodian,
            string memory apiaryId,
            string memory honeyType,
            uint256 quantity,
            bool labPassed,
            string memory labReportCID,
            BatchStatus status
        )
    {
        require(
            _batchId > 0 && _batchId < nextBatchId,
            "Batch does not exist"
        );

        Batch memory batch = batches[_batchId];

        return (
            batch.batchId,
            batch.beekeeper,
            batch.currentCustodian,
            batch.apiaryId,
            batch.honeyType,
            batch.quantity,
            batch.labPassed,
            batch.labReportCID,
            batch.status
        );
    }

    // =========================================================
    // 5. GET FULL CUSTODY HISTORY
    // =========================================================

    function getFullHistory(
        uint256 _batchId
    )
        external
        view
        returns (CustodyRecord[] memory)
    {
        require(
            _batchId > 0 && _batchId < nextBatchId,
            "Batch does not exist"
        );

        return custodyHistory[_batchId];
    }

    // =========================================================
    // GET NEXT BATCH ID
    // =========================================================

    function getNextBatchId()
        external
        view
        returns (uint256)
    {
        return nextBatchId;
    }
}
