const { requireCid } = require("../utils/cid");

async function uploadBuffer(buffer, filename, contentType = "application/octet-stream") {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        const error = new Error("A non-empty file is required");
        error.statusCode = 400;
        throw error;
    }

    const endpoint = process.env.IPFS_API_URL || "http://127.0.0.1:5001/api/v0/add";
    if (endpoint.includes("api.pinata.cloud") && !process.env.IPFS_JWT) {
        const error = new Error("Pinata upload requires IPFS_JWT in backend/.env");
        error.statusCode = 503;
        throw error;
    }
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: contentType }), filename || "upload");

    const headers = {};
    if (process.env.IPFS_JWT) {
        headers.Authorization = `Bearer ${process.env.IPFS_JWT}`;
    }
    const response = await fetch(endpoint, { method: "POST", headers, body: form });
    const text = await response.text();
    if (!response.ok) {
        let details = text.trim();
        try {
            const parsed = JSON.parse(details);
            details = parsed?.error?.details || parsed?.error?.reason || parsed?.error || details;
        } catch {
            // Keep the raw response when the upload service does not return JSON.
        }
        const error = new Error(`IPFS upload failed (${response.status}): ${String(details).slice(0, 240)}`);
        error.statusCode = 503;
        throw error;
    }

    let result;
    for (const line of text.trim().split(/\r?\n/).reverse()) {
        try {
            result = JSON.parse(line);
            break;
        } catch {
            // Kubo may return one JSON object per line.
        }
    }

    const cid = result?.Hash || result?.IpfsHash || result?.cid || result?.Cid;
    if (!cid) {
        const error = new Error("IPFS upload did not return a CID");
        error.statusCode = 503;
        throw error;
    }

    return requireCid(cid);
}

module.exports = { uploadBuffer };
