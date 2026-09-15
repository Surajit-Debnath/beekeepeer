const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { clientError } = require("../utils/validation");

function jwtSecret() {
    if (!process.env.JWT_SECRET) {
        const error = new Error("JWT_SECRET must be configured");
        error.statusCode = 503;
        throw error;
    }
    return process.env.JWT_SECRET;
}

function tokenForUser(user) {
    return jwt.sign(
        { sub: user._id.toString() },
        jwtSecret(),
        { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );
}

function safeUser(user) {
    return {
        id: user._id.toString(),
        username: user.username,
        email: user.email || null,
        role: user.role,
        walletAddress: user.walletAddress,
        isActive: user.isActive
    };
}

function requireDatabase() {
    if (User.db.readyState !== 1) {
        const error = new Error("MongoDB is not connected");
        error.statusCode = 503;
        throw error;
    }
}

function requireAuth(req, res, next) {
    Promise.resolve()
        .then(async () => {
            const header = req.get("authorization") || "";
            const match = header.match(/^Bearer\s+(.+)$/i);
            if (!match) {
                throw clientError("Authentication required", 401);
            }

            let payload;
            try {
                payload = jwt.verify(match[1], jwtSecret());
            } catch {
                throw clientError("Invalid or expired authentication token", 401);
            }

            requireDatabase();
            const user = await User.findOne({ _id: payload.sub, isActive: true }).lean();
            if (!user) {
                throw clientError("Authenticated user was not found", 401);
            }

            req.user = user;
            req.authUser = safeUser(user);
            next();
        })
        .catch(next);
}

function requireRole(...roles) {
    const allowed = new Set(roles);
    return (req, res, next) => {
        if (!req.user) {
            return next(clientError("Authentication required", 401));
        }
        if (!allowed.has(req.user.role)) {
            return next(clientError("You do not have permission for this action", 403));
        }
        return next();
    };
}

module.exports = { requireAuth, requireRole, safeUser, tokenForUser };
