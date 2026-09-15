const blockchainService = require("../services/blockchainService");
const { clientError } = require("../utils/validation");

function requireBlockchainRole(roleName) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw clientError("Authentication required", 401);
            }

            if (roleName === "ADMIN") {
                const adminAddress = blockchainService.getConfiguredWalletAddress("ADMIN");
                if (req.user.walletAddress.toLowerCase() !== adminAddress.toLowerCase()) {
                    throw clientError("The authenticated account is not the configured blockchain admin", 403);
                }
                return next();
            }

            const onChainRole = await blockchainService.getRole(req.user.walletAddress);
            if (onChainRole.roleName !== roleName) {
                throw clientError("The authenticated wallet does not have the required blockchain role", 403);
            }
            return next();
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = { requireBlockchainRole };
