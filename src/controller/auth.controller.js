const { User } = require("../models/user.model");
const { validate } = require("../utils/validators");

// Regenerate the session on login to prevent session fixation attacks.
// (Creates a fresh session id while carrying over data we choose.)
const regenerateSession = (req) =>
	new Promise((resolve, reject) => {
		req.session.regenerate((err) => (err ? reject(err) : resolve()));
	});

const saveSession = (req) =>
	new Promise((resolve, reject) => {
		req.session.save((err) => (err ? reject(err) : resolve()));
	});

const destroySession = (req) =>
	new Promise((resolve, reject) => {
		req.session.destroy((err) => (err ? reject(err) : resolve()));
	});

// POST /api/auth/register
exports.register = async (req, res, next) => {
	try {
		const rules = {
			name: { required: true, type: "string", min: 2, max: 60 },
			email: { required: true, type: "string", match: /^\S+@\S+\.\S+$/ },
			password: { required: true, type: "string", min: 6, max: 100 },
		};
		const { ok, errors } = validate(req.body, rules);
		if (!ok) return res.status(400).json({ success: false, errors });

		const email = req.body.email.toLowerCase().trim();

		const exists = await User.findOne({ email });
		if (exists) {
			return res
				.status(409)
				.json({ success: false, message: "Email already registered" });
		}

		const user = await User.create({
			name: req.body.name.trim(),
			email,
			password: req.body.password,
			preferredLanguage: req.body.preferredLanguage || "en-US",
		});

		// Create session right after registering (auto-login)
		await regenerateSession(req);
		req.session.userId = user._id.toString();
		await saveSession(req);

		res.status(201).json({ success: true, user: user.toPublicJSON() });
	} catch (err) {
		next(err);
	}
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
	try {
		const rules = {
			email: { required: true, type: "string", match: /^\S+@\S+\.\S+$/ },
			password: { required: true, type: "string" },
		};
		const { ok, errors } = validate(req.body, rules);
		if (!ok) return res.status(400).json({ success: false, errors });

		const email = req.body.email.toLowerCase().trim();

		// Must explicitly select password (schema has select:false)
		const user = await User.findOne({ email }).select("+password");
		if (!user || !(await user.matchPassword(req.body.password))) {
			return res
				.status(401)
				.json({ success: false, message: "Invalid email or password" });
		}

		if (!user.isActive) {
			return res
				.status(403)
				.json({ success: false, message: "Account is disabled" });
		}

		// Session fixation protection + fresh session
		await regenerateSession(req);
		req.session.userId = user._id.toString();
		await saveSession(req);

		// Update lastSeen
		user.lastSeenAt = new Date();
		await user.save({ validateBeforeSave: false });

		// Strip password before sending
		const safe = user.toObject();
		delete safe.password;

		res.json({ success: true, user: safe });
	} catch (err) {
		next(err);
	}
};

// POST /api/auth/logout
exports.logout = async (req, res, next) => {
  try {
    const isProd = process.env.NODE_ENV === "production";
    await destroySession(req);
    res.clearCookie("vn.sid", {
      path: "/",
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
    });
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
	res.json({ success: true, user: req.user.toPublicJSON() });
};
