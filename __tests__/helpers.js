const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/db');

let n = 0;
const uniq = () => `${Date.now().toString().slice(-7)}${n++}`;
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function registerUser() {
  const id = uniq();
  const res = await request(app).post('/auth/register').send({
    email: `u${id}@test.com`,
    password: 'password123',
    nickname: `user${id}`,
  });
  const { user, accessToken, refreshToken } = res.body.data;
  return { id: user.id, accessToken, refreshToken, auth: bearer(accessToken) };
}

// букмекера через API создать нельзя, поэтому создаём напрямую в БД
async function createBookmaker() {
  const id = uniq();
  const email = `b${id}@test.com`;
  await prisma.user.create({
    data: {
      email,
      nickname: `bookie${id}`,
      passwordHash: await bcrypt.hash('password123', 4),
      role: 'BOOKMAKER',
      balance: 100000,
    },
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  const { user, accessToken } = res.body.data;
  return { id: user.id, accessToken, auth: bearer(accessToken) };
}

// букмекер + два игрока + заезд с двумя участниками и коэффициентами
async function setupRace({ open = true } = {}) {
  const bookie = await createBookmaker();
  const p1 = await registerUser();
  const p2 = await registerUser();

  const race = await request(app)
    .post('/races')
    .set(bookie.auth)
    .send({ title: 'Test cup', startsAt: new Date(Date.now() + 3600e3).toISOString() });
  const raceId = race.body.data.id;

  const entryIds = [];
  for (const [player, name] of [[p1, 'Pirate'], [p2, 'Crumb']]) {
    const racer = await request(app).post('/racers').set(player.auth).send({ name });
    const entry = await request(app)
      .post(`/races/${raceId}/entries`)
      .set(player.auth)
      .send({ racerId: racer.body.data.id });
    entryIds.push(entry.body.data.id);
  }
  const [e1, e2] = entryIds;

  await request(app).patch(`/races/${raceId}/entries/${e1}/odds`).set(bookie.auth).send({ odds: 2.5 });
  await request(app).patch(`/races/${raceId}/entries/${e2}/odds`).set(bookie.auth).send({ odds: 1.8 });
  if (open) await request(app).post(`/races/${raceId}/open-betting`).set(bookie.auth);

  return { bookie, p1, p2, raceId, e1, e2 };
}

module.exports = { registerUser, createBookmaker, setupRace, bearer };