const request = require('supertest');
const app = require('../../server');

describe('API Endpoints', () => {
  let server;

  beforeAll(async () => {
    return new Promise((resolve) => {
      server = app.listen(3002, resolve);
    });
  });

  afterAll(async () => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  test('GET / - Health Check', async () => {
    const response = await request(server).get('/');
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('message', 'E3rbly Backend is running!');
  });

  test('POST /api/analysis/analyze - Arabic Analysis', async () => {
    const response = await request(server)
      .post('/api/analysis/analyze')
      .send({ text: 'مرحبا بالعالم' })
      .set('Accept', 'application/json');
      
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('status', 'success');
    expect(response.body).toHaveProperty('analysis');
  });

  test('POST /api/exercises/generate - Generate Exercises', async () => {
    const response = await request(server)
      .post('/api/exercises/generate')
      .send({
        difficulty: 'beginner',
        exerciseType: 'vocabulary',
        topic: 'greetings',
        count: 3
      });
    expect(response.statusCode).toBe(200);
  }, 10000);

  test('POST /api/quiz/generate - Generate Quiz', async () => {
    const response = await request(server)
      .post('/api/quiz/generate')
      .send({
        difficulty: 'beginner',
        topic: 'daily conversation',
        questionCount: 5
      });
    expect(response.statusCode).toBe(200);
  }, 10000);
});