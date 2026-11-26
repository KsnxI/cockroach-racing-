const jwt = require('jsonwebtoken');
const config = require('../config');

const signAccess = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
  });

const signRefresh = (user) =>
  jwt.sign({ sub: user.id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl,
  });

const verifyAccess = (token) => jwt.verify(token, config.jwt.accessSecret);
const verifyRefresh = (token) => jwt.verify(token, config.jwt.refreshSecret);

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };