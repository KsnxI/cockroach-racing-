require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
const bookmakerHash = await bcrypt.hash(process.env.BOOKMAKER_PASSWORD || 'bookmaker123', 10);
  const playerHash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'bookie@race.com' },
    update: {},
    create: {
      email: 'bookie@race.com',
      nickname: 'bookie',
      passwordHash: bookmakerHash,
      role: 'BOOKMAKER',
      balance: 100000,
    },
  });

  await prisma.user.upsert({
    where: { email: 'player@race.com' },
    update: {},
    create: {
      email: 'player@race.com',
      nickname: 'player1',
      passwordHash: playerHash,
      role: 'PLAYER',
      balance: 1000,
    },
  });

  console.log('Seed done: bookie@race.com / bookmaker123, player@race.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());