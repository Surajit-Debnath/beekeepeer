require("dotenv").config();

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");

const port = String(Number(process.env.E2E_PORT || 5014));
const baseUrl = `http://127.0.0.1:${port}/api`;
const password = "HoneyChainTest123!";
const suffix = Date.now().toString(36);
const e2eMongoUri = process.env.E2E_MONGODB_URI || process.env.MONGODB_URI;

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.token) {
        headers.set("authorization", `Bearer ${options.token}`);
    }
    if (!(options.body instanceof FormData)) {
        headers.set("content-type", "application/json");
    }

    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const text = await response.text();
    let body = {};
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = { error: text };
    }
    if (!response.ok) {
        const error = new Error(`${response.status}: ${body.error || text}`);
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return body;
}

async function waitForHealth() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/health`);
            if (response.ok) {
                return;
            }
        } catch {
            // The server may still be starting.
        }
        await sleep(500);
    }
    throw new Error("Backend health did not become ready");
}

async function expectFailure(work, status) {
    try {
        await work();
    } catch (error) {
        assert.equal(error.status, status, error.message);
        return;
    }
    throw new Error(`Expected request to fail with HTTP ${status}`);
}

async function main() {
    const child = spawn(process.execPath, ["server.js"], {
        cwd: __dirname + "/..",
        stdio: "ignore",
        windowsHide: true,
        env: {
            ...process.env,
            PORT: port,
            MONGODB_URI: e2eMongoUri,
            JWT_SECRET: process.env.JWT_SECRET || "e2e-only-test-secret",
            ADMIN_REGISTRATION_CODE: process.env.ADMIN_REGISTRATION_CODE || "e2e-only-admin-code"
        }
    });

    try {
        await waitForHealth();

        const roles = ["BEEKEEPER", "LAB_INSPECTOR", "PROCESSOR", "DISTRIBUTOR", "RETAILER"];
        const sessions = {};
        for (const role of roles) {
            const result = await request("/auth/register", {
                method: "POST",
                body: JSON.stringify({
                    username: `e2e_${role.toLowerCase()}_${suffix}`,
                    email: `e2e_${role.toLowerCase()}_${suffix}@example.test`,
                    password,
                    role
                })
            });
            sessions[role] = result.token;
        }

        const batch = await request("/batches", {
            method: "POST",
            token: sessions.BEEKEEPER,
            body: JSON.stringify({
                apiaryId: `E2E-APIARY-${suffix}`,
                honeyType: "Mustard Honey",
                quantity: "25"
            })
        });
        assert.equal(batch.status, "AWAITING_LAB_TEST");

        await expectFailure(
            () => request("/batches", {
                method: "POST",
                token: sessions.BEEKEEPER,
                body: JSON.stringify({ apiaryId: "E2E", honeyType: "Honey", quantity: "0" })
            }),
            400
        );

        const cid = `Qm${"a".repeat(44)}`;
        const lab = await request("/lab/test", {
            method: "POST",
            token: sessions.LAB_INSPECTOR,
            body: JSON.stringify({ batchId: batch.batchId, passed: true, reportCID: cid })
        });
        assert.equal(lab.status, "LAB_PASSED");

        await expectFailure(
            () => request("/lab/test", {
                method: "POST",
                token: sessions.LAB_INSPECTOR,
                body: JSON.stringify({ batchId: batch.batchId, passed: true, reportCID: cid })
            }),
            400
        );

        async function handoff(requesterRole, currentRole, nextRole, location) {
            const eligible = await request("/dashboard/eligible-batches", {
                token: sessions[requesterRole]
            });
            assert.ok(eligible.batches.some((item) => String(item.blockchainBatchId || item.batchId) === String(batch.batchId)), `${requesterRole} did not see the eligible batch`);

            const custodyRequest = await request("/custody/request", {
                method: "POST",
                token: sessions[requesterRole],
                body: JSON.stringify({ batchId: batch.batchId, location, notes: `${currentRole} to ${nextRole}` })
            });
            assert.equal(custodyRequest.request.status, "PENDING");

            const incoming = await request("/custody/requests/incoming", {
                token: sessions[currentRole]
            });
            const pending = incoming.requests.find((item) => item._id === custodyRequest.request._id);
            assert.ok(pending, `${currentRole} did not receive the custody request`);

            return request(`/custody/requests/${pending._id}/approve`, {
                method: "POST",
                token: sessions[currentRole],
                body: JSON.stringify({})
            });
        }

        const processorTransfer = await handoff("PROCESSOR", "BEEKEEPER", "PROCESSOR", "Processing plant");
        assert.equal(processorTransfer.status, "PROCESSING");
        const distributorTransfer = await handoff("DISTRIBUTOR", "PROCESSOR", "DISTRIBUTOR", "Distribution hub");
        assert.equal(distributorTransfer.status, "IN_TRANSIT");
        const retailerTransfer = await handoff("RETAILER", "DISTRIBUTOR", "RETAILER", "Retail store");
        assert.equal(retailerTransfer.status, "READY_FOR_SALE");

        const verification = await request(`/batches/${batch.batchId}/verify`);
        assert.equal(verification.batch.statusName, "READY_FOR_SALE");
        assert.equal(verification.batch.labPassed, true);
        const history = await request(`/batches/${batch.batchId}/history`);
        assert.equal(history.history.length, 4);
        assert.ok(history.history.every((item) => item.from && item.to));

        const qr = await request(`/batches/${batch.batchId}/qr`, {
            method: "POST",
            token: sessions.RETAILER,
            body: JSON.stringify({})
        });
        assert.match(qr.verificationUrl, new RegExp(`/verify/${batch.batchId}$`));
        assert.match(qr.qrCodeDataUrl, /^data:image\/png;base64,/);

        await expectFailure(
            () => request("/custody/request", {
                method: "POST",
                token: sessions.PROCESSOR,
                body: JSON.stringify({ batchId: batch.batchId, location: "Invalid retry" })
            }),
            400
        );

        console.log(`E2E workflow passed for batch ${batch.batchId}`);
    } finally {
        child.kill();
        if (process.env.E2E_DROP_DATABASE === "true" && e2eMongoUri) {
            await mongoose.connect(e2eMongoUri, { serverSelectionTimeoutMS: 5000 });
            await mongoose.connection.dropDatabase();
            await mongoose.disconnect();
        }
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
