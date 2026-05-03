const { verifyToken } = require("../services/tokenService");

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "missing or invalid authorization header" });
  }

  try {
    req.auth = verifyToken(token);
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "invalid or expired token" });
  }
}

module.exports = { requireAuth };
