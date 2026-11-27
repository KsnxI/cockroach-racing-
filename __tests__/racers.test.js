const request = require('supertest');
const app = require('../src/app');
const { registerUser } = require('./helpers');

describe('Racers', () => {
  test('создание таракана с токеном: 201, баланс уменьшился', async () => {
    const user = await registerUser();
    const res = await request(app).post('/racers').set(user.auth).send({ name: 'Усатый' });
    expect(res.status).toBe(201);
    expect(res.body.data.ownerId).toBe(user.id);

    const me = await request(app).get('/auth/me').set(user.auth);
    expect(me.body.data.balance).toBeLessThan(1000);
  });

  test('создание таракана без токена: 401', async () => {
    const res = await request(app).post('/racers').send({ name: 'Усатый' });
    expect(res.status).toBe(401);
  });

  test('невалидное имя: 400', async () => {
    const user = await registerUser();
    const res = await request(app).post('/racers').set(user.auth).send({ name: 'a' });
    expect(res.status).toBe(400);
  });

  test('чужого таракана нельзя изменить или удалить: 403', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const racer = await request(app).post('/racers').set(owner.auth).send({ name: 'Усатый' });
    const id = racer.body.data.id;

    const patch = await request(app).patch(`/racers/${id}`).set(stranger.auth).send({ name: 'Взлом' });
    expect(patch.status).toBe(403);
    const del = await request(app).delete(`/racers/${id}`).set(stranger.auth);
    expect(del.status).toBe(403);
  });

  test('владелец: читает, меняет и удаляет своего таракана', async () => {
    const owner = await registerUser();
    const created = await request(app).post('/racers').set(owner.auth).send({ name: 'Усатый' });
    const id = created.body.data.id;

    const get = await request(app).get(`/racers/${id}`).set(owner.auth);
    expect(get.status).toBe(200);

    const patch = await request(app).patch(`/racers/${id}`).set(owner.auth).send({ name: 'Новое имя' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.name).toBe('Новое имя');

    const del = await request(app).delete(`/racers/${id}`).set(owner.auth);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/racers/${id}`).set(owner.auth);
    expect(after.status).toBe(404);
  });

  test('список: фильтр по владельцу и пагинация', async () => {
    const owner = await registerUser();
    for (const name of ['Один', 'Два', 'Три']) {
      await request(app).post('/racers').set(owner.auth).send({ name });
    }
    const res = await request(app)
      .get(`/racers?ownerId=${owner.id}&limit=2&page=1`)
      .set(owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });
});