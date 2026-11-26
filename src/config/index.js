require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';
if (isTest && process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },
  signupBonus: Number(process.env.SIGNUP_BONUS) || 1000,
  minBet: Number(process.env.MIN_BET) || 10,
  maxBet: Number(process.env.MAX_BET) || 500,
};
