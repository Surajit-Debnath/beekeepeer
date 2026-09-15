const express = require("express");
const authService = require("../services/authService");
const { requireAuth } = require("../middleware/auth");
const { clientError } = require("../utils/validation");

const router = express.Router();

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.post("/register", asyncRoute(async (req, res) => {
    const body = req.body || {};
    if (typeof body.username !== "string" || typeof body.password !== "string") {
        throw clientError("username and password are required");
    }

    const result = await authService.register({
        username: body.username,
        email: body.email,
        password: body.password,
        role: body.role,
        adminCode: body.adminCode
    });
    res.status(201).json({ success: true, ...result });
}));

router.post("/login", asyncRoute(async (req, res) => {
    const result = await authService.login(req.body || {});
    res.json({ success: true, ...result });
}));

router.get("/me", requireAuth, (req, res) => {
    res.json({ success: true, user: req.authUser });
});

module.exports = router;
