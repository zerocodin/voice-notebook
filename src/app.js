const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const buildSessionMiddleware = require("./middlewares/session.middleware");

const authRoutes = require("./routes/auth.routes");
const userRoutes =  require("./routes/user.routes");
const noteRoutes = require("./routes/note.routes")
const friendRoutes = require("./routes/friend.routes")

const app = express();

// Middleware
app.use(helmet());
app.use(
	cors({
		origin: process.env.CLIENT_URL,
		credentials: true,
	}),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

app.use(buildSessionMiddleware());

// Rate limiter (basic)
app.use(
	"/api",
	rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 300,
		standardHeaders: true,
		legacyHeaders: false,
	}),
);

// Health route
app.get("/", (req, res) => res.json({ ok: true, msg: "Voice Notes API" }));

// auth routes
app.use("/api/auth", authRoutes);

// user routes
app.use('/api/users', userRoutes)

// note routes
app.use("/api/notes", noteRoutes)

// friend routes
app.use("/api/friends", friendRoutes)


// Error handler
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(err.status || 500).json({
		success: false,
		message: err.message || "Server error",
	});
});

module.exports = app;