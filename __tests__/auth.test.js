const request = require('supertest');
const app = require('../src/app');
const config = require('../src/config');

const creds = (suffix) => ({
  email: `auth${suffix}@test.com`,
  password: 'password123',
  nickname: `auth${suffix}`,
});

describe('Auth', () => {
  test('регистрация: 201, бонус на баланс, роль PLAYER, без хеша пароля', async () => {
    const res = await request(app).post('/auth/register').send(creds('1'));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.balance).toBe(config.signupBonus);
    expect(res.body.data.user.role).toBe('PLAYER');
    expect(res.body.data.accessToken).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  test('регистрация с занятым email: 409', async () => {
    await request(app).post('/auth/register').send(creds('2'));
    const res = await request(app).post('/auth/register').send(creds('2'));
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('регистрация со слабым паролем: 400 с описанием поля', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...creds('3'), password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('password');
  });

  test('логин: 200 и пара токенов', async () => {
    await request(app).post('/auth/register').send(creds('4'));
    const res = await request(app)
      .post('/auth/login')
      .send({ email: creds('4').email, password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  test('логин с неверным паролем: 401', async () => {
    await request(app).post('/auth/register').send(creds('5'));
    const res = await request(app)
      .post('/auth/login')
      .send({ email: creds('5').email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('refresh выдаёт рабочий access-токен', async () => {
    const reg = await request(app).post('/auth/register').send(creds('6'));
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: reg.body.data.refreshToken });
    expect(res.status).toBe(200);

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
  });

  test('защищённый маршрут без токена и с мусорным токеном: 401', async () => {
    const noToken = await request(app).get('/auth/me');
    expect(noToken.status).toBe(401);
    const garbage = await request(app).get('/auth/me').set('Authorization', 'Bearer garbage');
    expect(garbage.status).toBe(401);
  });
});