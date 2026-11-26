const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const prisma = require('../db');
const config = require('../config');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const { signAccess, signRefresh, verifyRefresh } = require('../utils/jwt');
const { ApiError, asyncHandler } = require('../utils/errors');

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  nickname: z.string().min(3).max(20),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  nickname: u.nickname,
  role: u.role,
  balance: u.balance,
});

const tokensFor = (user) => ({
  accessToken: signAccess(user),
  refreshToken: signRefresh(user),
});

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, nickname } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);


    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, nickname, passwordHash, balance: config.signupBonus },
      });
      await tx.transaction.create({
        data: {
          userId: created.id,
          type: 'SIGNUP_BONUS',
          amount: config.signupBonus,
          balanceAfter: config.signupBonus,
        },
      });
      return created;
    });

    res.status(201).json({
      success: true,
      data: { user: publicUser(user), ...tokensFor(user) },
    });
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));

    if (!ok) throw new ApiError(401, 'Invalid email or password');

    res.json({ success: true, data: { user: publicUser(user), ...tokensFor(user) } });
  })
);

router.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = verifyRefresh(req.body.refreshToken);
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new ApiError(401, 'User no longer exists');

    res.json({ success: true, data: tokensFor(user) });
  })
);

router.get(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new ApiError(404, 'User not found');
    res.json({ success: true, data: publicUser(user) });
  })
);

module.exports = router;