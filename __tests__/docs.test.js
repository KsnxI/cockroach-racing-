const request = require('supertest');
const app = require('../src/app');

describe('Swagger', () => {
  test('/api/docs отдаёт страницу Swagger UI', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  test('спецификация описывает маршруты и схемы моделей', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths).length).toBeGreaterThanOrEqual(15);
    for (const name of ['User', 'Racer', 'Race', 'RaceEntry', 'Bet', 'Transaction']) {
      expect(res.body.components.schemas[name]).toBeDefined();
    }
  });
});