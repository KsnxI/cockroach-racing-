const express = require('express');
const { z } = require('zod');

const prisma = require('../db');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ApiError, asyncHandler } = require('../utils/errors');
const { paginationSchema, buildMeta } = require('../utils/pagination');

const router = express.Router();

const RACER_PRICE = 100;
const TRAIN_PRICE = 50;
const TRAIN_ENERGY = 20;
const MAX_STAT = 100;

const createSchema = z.object({ name: z.string().min(2).max(30) });
const updateSchema = z.object({ name: z.string().min(2).max(30) });
const trainSchema = z.object({ stat: z.enum(['speed', 'stamina', 'luck']) });
const listSchema = paginationSchema.extend({
  ownerId: z.string().optional(),
  minSpeed: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(30).optional(),
  sort: z.enum(['createdAt', 'speed', 'wins']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

//проверка владельца
async function getOwnedRacer(id, userId) {
  const racer = await prisma.racer.findUnique({ where: { id } });
  if (!racer) throw new ApiError(404, 'Racer not found');
  if (racer.ownerId !== userId) throw new ApiError(403, 'You are not the owner of this racer');
  return racer;
}

//список
router.get(
  '/',
  auth,
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, ownerId, minSpeed, search, sort, order } = req.query;
    const where = {
      ...(ownerId && { ownerId }),
      ...(minSpeed && { speed: { gte: minSpeed } }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.racer.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.racer.count({ where }),
    ]);
    res.json({ success: true, data: items, meta: buildMeta(page, limit, total) });
  })
);

router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const racer = await prisma.racer.findUnique({ where: { id: req.params.id } });
    if (!racer) throw new ApiError(404, 'Racer not found');
    res.json({ success: true, data: racer });
  })
);

//покупка таракана
router.post(
  '/',
  auth,
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const racer = await prisma.$transaction(async (tx) => {
      const paid = await tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: RACER_PRICE } },
        data: { balance: { decrement: RACER_PRICE } },
      });
      if (paid.count === 0) throw new ApiError(422, 'Not enough balance');

      const user = await tx.user.findUnique({ where: { id: req.user.id } });
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'RACER_PURCHASE',
          amount: -RACER_PRICE,
          balanceAfter: user.balance,
        },
      });
      return tx.racer.create({ data: { name: req.body.name, ownerId: user.id } });
    });
    res.status(201).json({ success: true, data: racer });
  })
);

router.patch(
  '/:id',
  auth,
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    await getOwnedRacer(req.params.id, req.user.id);
    const racer = await prisma.racer.update({
      where: { id: req.params.id },
      data: { name: req.body.name },
    });
    res.json({ success: true, data: racer });
  })
);

router.delete(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    await getOwnedRacer(req.params.id, req.user.id);
    const entries = await prisma.raceEntry.count({ where: { racerId: req.params.id } });
    if (entries > 0) throw new ApiError(409, 'Racer already took part in races and cannot be deleted');
    await prisma.racer.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

//тренировка
router.post(
  '/:id/train',
  auth,
  validate(trainSchema),
  asyncHandler(async (req, res) => {
    const racer = await getOwnedRacer(req.params.id, req.user.id);
    const { stat } = req.body;
    if (racer.energy < TRAIN_ENERGY) throw new ApiError(409, 'Racer is too tired');
    if (racer[stat] >= MAX_STAT) throw new ApiError(409, `${stat} is already at maximum`);

    const updated = await prisma.$transaction(async (tx) => {
      const paid = await tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: TRAIN_PRICE } },
        data: { balance: { decrement: TRAIN_PRICE } },
      });
      if (paid.count === 0) throw new ApiError(422, 'Not enough balance');

      const user = await tx.user.findUnique({ where: { id: req.user.id } });
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'TRAINING',
          amount: -TRAIN_PRICE,
          balanceAfter: user.balance,
        },
      });
      return tx.racer.update({
        where: { id: racer.id },
        data: { [stat]: { increment: 1 }, energy: { decrement: TRAIN_ENERGY } },
      });
    });
    res.json({ success: true, data: updated });
  })
);

module.exports = router;