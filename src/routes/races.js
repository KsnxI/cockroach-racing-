const express = require('express');
const { z } = require('zod');

const prisma = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { ApiError, asyncHandler } = require('../utils/errors');
const { paginationSchema, buildMeta } = require('../utils/pagination');

const router = express.Router();

const createSchema = z.object({
  title: z.string().min(3).max(60),
  startsAt: z.coerce.date().refine((d) => d > new Date(), 'startsAt must be in the future'),
});
const updateSchema = z
  .object({
    title: z.string().min(3).max(60).optional(),
    startsAt: z.coerce.date().refine((d) => d > new Date(), 'startsAt must be in the future').optional(),
  })
  .refine((v) => v.title || v.startsAt, 'Provide title or startsAt');
const listSchema = paginationSchema.extend({
  status: z.enum(['SCHEDULED', 'BETTING_OPEN', 'RUNNING', 'FINISHED', 'CANCELLED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

//проверка заезд существует, создан этим букмекером и ещё не начался
async function getEditableRace(id, userId) {
  const race = await prisma.race.findUnique({ where: { id } });
  if (!race) throw new ApiError(404, 'Race not found');
  if (race.createdById !== userId) throw new ApiError(403, 'You are not the creator of this race');
  if (race.status !== 'SCHEDULED') throw new ApiError(409, 'Only scheduled races can be changed');
  return race;
}

router.get(
  '/',
  auth,
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, status, from, to, order } = req.query;
    const where = {
      ...(status && { status }),
      ...((from || to) && {
        startsAt: { ...(from && { gte: from }), ...(to && { lte: to }) },
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.race.findMany({
        where,
        orderBy: { startsAt: order },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { entries: true } } },
      }),
      prisma.race.count({ where }),
    ]);
    res.json({ success: true, data: items, meta: buildMeta(page, limit, total) });
  })
);

router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const race = await prisma.race.findUnique({
      where: { id: req.params.id },
      include: { entries: { include: { racer: { select: { id: true, name: true, speed: true, stamina: true, luck: true } } } } },
    });
    if (!race) throw new ApiError(404, 'Race not found');
    res.json({ success: true, data: race });
  })
);

router.post(
  '/',
  auth,
  requireRole('BOOKMAKER'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const race = await prisma.race.create({
      data: { title: req.body.title, startsAt: req.body.startsAt, createdById: req.user.id },
    });
    res.status(201).json({ success: true, data: race });
  })
);

router.patch(
  '/:id',
  auth,
  requireRole('BOOKMAKER'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    await getEditableRace(req.params.id, req.user.id);
    const race = await prisma.race.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: race });
  })
);

router.delete(
  '/:id',
  auth,
  requireRole('BOOKMAKER'),
  asyncHandler(async (req, res) => {
    await getEditableRace(req.params.id, req.user.id);
    await prisma.race.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

module.exports = router;