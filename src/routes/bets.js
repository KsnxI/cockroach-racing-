const express = require('express');
const { z } = require('zod');

const prisma = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { ApiError, asyncHandler } = require('../utils/errors');
const { paginationSchema, buildMeta } = require('../utils/pagination');

const router = express.Router();

const createSchema = z.object({
  entryId: z.string().min(1),
  amount: z.number().int().min(config.minBet).max(config.maxBet),
});
const listSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'WON', 'LOST', 'REFUNDED']).optional(),
  raceId: z.string().optional(),
});

const betInclude = {
  entry: { include: { racer: { select: { id: true, name: true } } } },
  race: { select: { id: true, title: true, status: true } },
};

//сделать ставку (только игрок)
router.post(
  '/',
  auth,
  requireRole('PLAYER'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { entryId, amount } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.raceEntry.findUnique({
        where: { id: entryId },
        include: { race: true, racer: true },
      });
      if (!entry) throw new ApiError(404, 'Entry not found');
      if (entry.race.status !== 'BETTING_OPEN') throw new ApiError(409, 'Betting is closed for this race');
      if (entry.race.startsAt <= new Date()) throw new ApiError(409, 'Race has already started');
      if (entry.racer.ownerId === req.user.id) throw new ApiError(403, 'You cannot bet on your own racer');

      // атомарное списание: условие balance >= amount проверяется самой БД
      const paid = await tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (paid.count === 0) throw new ApiError(422, 'Not enough balance');

      const user = await tx.user.findUnique({ where: { id: req.user.id } });
      await tx.transaction.create({
        data: { userId: user.id, type: 'BET', amount: -amount, balanceAfter: user.balance },
      });
      const bet = await tx.bet.create({
        data: {
          userId: user.id,
          raceId: entry.raceId,
          entryId: entry.id,
          amount,
          oddsAtBet: entry.odds, //коэффициент фиксируется на момент ставки
        },
        include: betInclude,
      });
      return { bet, balance: user.balance };
    });

    res.status(201).json({ success: true, data: result });
  })
);

//мои ставки с фильтрами и пагинацией
router.get(
  '/',
  auth,
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, status, raceId } = req.query;
    const where = {
      userId: req.user.id,
      ...(status && { status }),
      ...(raceId && { raceId }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.bet.findMany({
        where,
        include: betInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bet.count({ where }),
    ]);
    res.json({ success: true, data: items, meta: buildMeta(page, limit, total) });
  })
);

//одна ставка: только владелец
router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const bet = await prisma.bet.findUnique({ where: { id: req.params.id }, include: betInclude });
    if (!bet) throw new ApiError(404, 'Bet not found');
    if (bet.userId !== req.user.id) throw new ApiError(403, 'This is not your bet');
    res.json({ success: true, data: bet });
  })
);

module.exports = router;