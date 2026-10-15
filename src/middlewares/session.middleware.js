const session = require("express-session");
const {MongoStore} = require("connect-mongo");

/**
 * Returns a configured express-session middleware.
 * Call AFTER express.json/cookieParser and BEFORE routes.
 */
function buildSessionMiddleware() {
  const isProd = process.env.NODE_ENV === "production";

  return session({
    name: "vn.sid", // custom cookie name (hides default connect.sid)
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // don't create sessions for anonymous visitors
    rolling: true,            // refresh cookie expiry on every request
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: Math.floor((Number(process.env.SESSION_MAX_AGE_MS) || 604800000) / 1000),
      autoRemove: "native",
    }),
    cookie: {
      httpOnly: true,
      secure: isProd,                 // HTTPS only in prod
      sameSite: isProd ? "none" : "lax",
      maxAge: Number(process.env.SESSION_MAX_AGE_MS) || 604800000,
      path: "/",
    },
  });
}

module.exports = buildSessionMiddleware;