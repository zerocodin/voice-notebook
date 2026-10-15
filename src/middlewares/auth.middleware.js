const { User } = require("../models/user.model");

/**
 * Require an authenticated session.
 * Attaches req.user (full mongoose doc, sans password) on success.
 */
async function protect(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const user = await User.findById(userId).select("-password");
    if (!user || !user.isActive) {
      // Session points at a dead user — destroy it
      req.session.destroy(() => {});
      return res.status(401).json({ success: false, message: "Session invalid" });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Like protect, but does NOT fail if no session.
 * Useful for routes that behave differently for logged-in users.
 */
async function optionalAuth(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (userId) {
      const user = await User.findById(userId).select("-password");
      if (user && user.isActive) req.user = user;
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { protect, optionalAuth };