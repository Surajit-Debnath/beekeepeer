const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePositiveUint, parseAddress, parseRole } = require("../utils/validation");
const { isValidCid } = require("../utils/cid");

test("positive uint validation accepts exact integer strings", () => {
    assert.equal(parsePositiveUint("25", "quantity"), "25");
    assert.throws(() => parsePositiveUint("0", "quantity"), /positive integer/);
    assert.throws(() => parsePositiveUint("1.5", "quantity"), /positive integer/);
});

test("Ethereum address and contract role validation are strict", () => {
    assert.equal(
        parseAddress("0x0000000000000000000000000000000000000001", "address"),
        "0x0000000000000000000000000000000000000001"
    );
    assert.equal(parseRole("PROCESSOR", { NONE: 0, PROCESSOR: 3, RETAILER: 5 }), 3);
    assert.throws(() => parseAddress("not-an-address", "address"), /valid Ethereum address/);
});

test("IPFS CID validation rejects arbitrary strings", () => {
    assert.equal(isValidCid("not-a-cid"), false);
    assert.equal(isValidCid(""), false);
});
