const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const {
	register,
	login,
	logout,
	getMe,
} = require("../controller/auth.controller");
const { protect } = require("../middlewares/auth.middleware");

const loginLimiter = rateLimit({
	windowMs: 3 * 60 * 1000,
	max: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many login attempts, try again later",
	},
});

const registerLimiter = rateLimit({
	windowMs: 5 * 60 * 1000,
	max: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many register attempts, try again later",
	},
});

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/me", protect, getMe);

module.exports = router;
