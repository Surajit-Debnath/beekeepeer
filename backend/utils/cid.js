function isValidCid(value) {
    if (typeof value !== "string") {
        return false;
    }

    const cid = value.trim();
    return (
        /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid) ||
        /^b[a-z2-7]{20,}$/.test(cid) ||
        /^z[1-9A-HJ-NP-Za-km-z]{20,}$/.test(cid)
    );
}

function requireCid(value) {
    if (!isValidCid(value)) {
        const error = new Error("reportCID must be a valid IPFS CID");
        error.statusCode = 400;
        throw error;
    }

    return value.trim();
}

function gatewayUrl(cid) {
    const gateway = process.env.IPFS_GATEWAY_URL;
    if (!gateway || !isValidCid(cid)) {
        return null;
    }

    return `${gateway.replace(/\/$/, "")}/ipfs/${cid}`;
}

module.exports = { isValidCid, requireCid, gatewayUrl };
