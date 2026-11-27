const { execSync } = require('child_process');

module.exports = async () => {
  process.env.NODE_ENV = 'test';
  require('../src/config'); // подменяет DATABASE_URL на DATABASE_URL_TEST

  if (!/test/.test(process.env.DATABASE_URL || '')) {
    throw new Error('DATABASE_URL_TEST is missing or does not contain "test". Refusing to run tests.');
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
};