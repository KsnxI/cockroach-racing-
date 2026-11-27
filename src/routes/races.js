const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');

const prisma = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { ApiError, asyncHandler } = require('../utils/errors');
const { paginationSchema, buildMeta } = require('../utils/pagination');
const { runRace } = require('../services/raceRunner');
const { simulate } = require('../workers/simulate');

const router = express.Router();

const MAX_ENTRIES = 8;

// seed скрыт, пока заезд не завершён (иначе можно заранее посчитать результат)
const publicRace = (race) => {
  if (race.status === 'FINISHED') return race;
  const { seed, ...rest } = race;
  return rest;
};

const futureDate = z.coerce.date().refine((d) => d > new Date(), 'startsAt must be in the future');

const createSchema = z.object({
  title: z.string().min(3).max(60),
  startsAt: futureDate,
});
const updateSchema = z
  .object({
    title: z.string().min(3).max(60).optional(),
    startsAt: futureDate.optional(),
  })
  .refine((v) => v.title || v.startsAt, 'Provide title or startsAt');
const listSchema = paginationSchema.extend({
  status: z.enum(['SCHEDULED', 'BETTING_OPEN', 'RUNNING', 'FINISHED', 'CANCELLED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});
const enterSchema = z.object({ racerId: z.string().min(1) });
const oddsSchema = z.object({
  odds: z.number().min(1.1).max(50).transform((v) => Math.round(v * 100) / 100),
});

// заезд существует и создан этим букмекером
async function getCreatedRace(id, userId) {
  const race = await prisma.race.findUnique({ where: { id } });
  if (!race) throw new ApiError(404, 'Race not found');
  if (race.createdById !== userId) throw new ApiError(403, 'You are not the creator of this race');
  return race;
}

// то же + заезд ещё не начался (для изменения и удаления)
async function getEditableRace(id, userId) {
  const race = await getCreatedRace(id, userId);
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
    res.json({ success: true, data: items.map(publicRace), meta: buildMeta(page, limit, total) });
  })
);

router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const race = await prisma.race.findUnique({
      where: { id: req.params.id },
      include: {
        entries: {
          include: { racer: { select: { id: true, name: true, speed: true, stamina: true, luck: true } } },
        },
      },
    });
    if (!race) throw new ApiError(404, 'Race not found');
    res.json({ success: true, data: publicRace(race) });
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
    res.status(201).json({ success: true, data: publicRace(race) });
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
    res.json({ success: true, data: publicRace(race) });
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


router.post(
  '/:id/entries',
  auth,
  validate(enterSchema),
  asyncHandler(async (req, res) => {
    const race = await prisma.race.findUnique({ where: { id: req.params.id } });
    if (!race) throw new ApiError(404, 'Race not found');
    if (race.status !== 'SCHEDULED') throw new ApiError(409, 'Entries are closed for this race');

    const racer = await prisma.racer.findUnique({ where: { id: req.body.racerId } });
    if (!racer) throw new ApiError(404, 'Racer not found');
    if (racer.ownerId !== req.user.id) throw new ApiError(403, 'You are not the owner of this racer');

    const count = await prisma.raceEntry.count({ where: { raceId: race.id } });
    if (count >= MAX_ENTRIES) throw new ApiError(409, 'Race is full');


    const entry = await prisma.raceEntry.create({ data: { raceId: race.id, racerId: racer.id } });
    res.status(201).json({ success: true, data: entry });
  })
);


router.delete(
  '/:id/entries/:entryId',
  auth,
  asyncHandler(async (req, res) => {
    const entry = await prisma.raceEntry.findFirst({
      where: { id: req.params.entryId, raceId: req.params.id },
      include: { race: true, racer: true },
    });
    if (!entry) throw new ApiError(404, 'Entry not found');
    if (entry.racer.ownerId !== req.user.id) throw new ApiError(403, 'You are not the owner of this racer');
    if (entry.race.status !== 'SCHEDULED') throw new ApiError(409, 'Entries are closed for this race');
    await prisma.raceEntry.delete({ where: { id: entry.id } });
    res.status(204).send();
  })
);


router.patch(
  '/:id/entries/:entryId/odds',
  auth,
  requireRole('BOOKMAKER'),
  validate(oddsSchema),
  asyncHandler(async (req, res) => {
    const race = await getCreatedRace(req.params.id, req.user.id);
    if (!['SCHEDULED', 'BETTING_OPEN'].includes(race.status)) {
      throw new ApiError(409, 'Odds can no longer be changed');
    }
    const entry = await prisma.raceEntry.findFirst({
      where: { id: req.params.entryId, raceId: race.id },
    });
    if (!entry) throw new ApiError(404, 'Entry not found');
    const updated = await prisma.raceEntry.update({
      where: { id: entry.id },
      data: { odds: req.body.odds },
    });
    res.json({ success: true, data: updated });
  })
);


router.post(
  '/:id/open-betting',
  auth,
  requireRole('BOOKMAKER'),
  asyncHandler(async (req, res) => {
    const race = await getCreatedRace(req.params.id, req.user.id);
    if (race.status !== 'SCHEDULED') throw new ApiError(409, 'Betting can only be opened for scheduled races');
    if (race.startsAt <= new Date()) throw new ApiError(409, 'Race start time has passed');
    const entries = await prisma.raceEntry.count({ where: { raceId: race.id } });
    if (entries < 2) throw new ApiError(409, 'At least 2 racers are required');

    const seed = crypto.randomBytes(16).toString('hex');
    const seedHash = crypto.createHash('sha256').update(seed).digest('hex');
    const updated = await prisma.race.update({
      where: { id: race.id },
      data: { status: 'BETTING_OPEN', seed, seedHash },
    });
    res.json({ success: true, data: publicRace(updated) });
  })
);

// собирает результат заезда и проверяет честность
async function buildResult(id) {
  const race = await prisma.race.findUnique({
    where: { id },
    include: {
      entries: {
        include: { racer: { select: { id: true, name: true } } },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!race) throw new ApiError(404, 'Race not found');
  if (race.status !== 'FINISHED') throw new ApiError(409, 'Race is not finished yet');

  // 1) хеш seed совпадает с тем, что был опубликован до заезда
  const seedMatchesHash = crypto.createHash('sha256').update(race.seed).digest('hex') === race.seedHash;

  // 2) повторная симуляция по seed и снимку даёт те же позиции
  const replay = simulate(race.commentary.snapshot, race.seed);
  const replayMatches = replay.results.every(
    (r) => race.entries.find((e) => e.id === r.entryId)?.position === r.position
  );

  return {
    raceId: race.id,
    title: race.title,
    seedHash: race.seedHash,
    seed: race.seed,
    standings: race.entries.map((e) => ({
      position: e.position,
      entryId: e.id,
      racer: e.racer,
      odds: e.odds,
      finishTime: e.finishTime / 100,
    })),
    commentary: race.commentary.lines,
    verification: { seedMatchesHash, replayMatches },
  };
}

// запустить заезд вручную (позже это будет делать воркер)
router.post(
  '/:id/run',
  auth,
  requireRole('BOOKMAKER'),
  asyncHandler(async (req, res) => {
    await getCreatedRace(req.params.id, req.user.id);
    const outcome = await runRace(req.params.id);
    if (outcome.cancelled) {
      return res.json({ success: true, data: { status: 'CANCELLED', message: 'Not enough racers, bets refunded' } });
    }
    res.json({ success: true, data: await buildResult(req.params.id) });
  })
);

// результат: позиции, комментарий, раскрытый seed и проверка честности
router.get(
  '/:id/result',
  auth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await buildResult(req.params.id) });
  })
);

module.exports = router;
