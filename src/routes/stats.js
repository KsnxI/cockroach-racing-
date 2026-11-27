const express = require('express');

const prisma = require('../db');
const auth = require('../middleware/auth');
const { cached } = require('../utils/cache');
const { asyncHandler } = require('../utils/errors');

const router = express.Router();

router.get(
  '/leaderboard',
  auth,
  asyncHandler(async (req, res) => {
    const { value, cached: hit } = await cached('leaderboard:v1', 30, async () => {
      const [racers, players] = await Promise.all([
        prisma.racer.findMany({
          where: { wins: { gt: 0 } },
          orderBy: [{ wins: 'desc' }, { races: 'asc' }],
          take: 10,
          select: { id: true, name: true, wins: true, races: true, owner: { select: { nickname: true } } },
        }),
        prisma.user.findMany({
          where: { role: 'PLAYER' },
          orderBy: { balance: 'desc' },
          take: 10,
          select: { nickname: true, balance: true },
        }),
      ]);
      return { racers, players };
    });
    res.set('X-Cache', hit ? 'HIT' : 'MISS');
    res.json({ success: true, data: value });
  })
);

module.exports = router;