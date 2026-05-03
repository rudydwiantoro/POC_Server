const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");

function issueAccessToken(payload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: "1h" });
}

function issueRefreshToken(payload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: "30d" });
}

function verifyToken(token) {
  return jwt.verify(token, jwtSecret);
}

module.exports = {
  issueAccessToken,
  issueRefreshToken,
  verifyToken
};
