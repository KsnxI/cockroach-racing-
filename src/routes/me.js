const express = require('express');
const { z } = require('zod');

const prisma = require('../db');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler } = require('../utils/errors');
const { paginationSchema, buildMeta } = require('../utils/pagination');

const router = express.Router();

const listSchema = paginationSchema.extend({
  type: z
    .enum(['SIGNUP_BONUS', 'BET', 'BET_WIN', 'REFUND', 'RACER_PURCHASE', 'TRAINING', 'PRIZE'])
    .optional(),
});

router.get(
  '/transactions',
  auth,
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, type } = req.query;
    const where = { userId: req.user.id, ...(type && { type }) };
    const [items, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);
    res.json({ success: true, data: items, meta: buildMeta(page, limit, total) });
  })
);

module.exports = router;