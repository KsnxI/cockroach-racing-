require('../src/config');
const prisma = require('../src/db');

jest.setTimeout(20000);

// страховка: никогда не чистим обычную БД
if (!/test/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Tests must run against the test database');
}

beforeAll(async () => {
  await prisma.bet.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.raceEntry.deleteMany();
  await prisma.race.deleteMany();
  await prisma.racer.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});