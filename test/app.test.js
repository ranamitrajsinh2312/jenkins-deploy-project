const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');

test('GET /health returns 200 and UP status with database diagnostics', async () => {
  const response = await request(app).get('/health');
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.status, 'UP');
  assert.ok(response.body.version);
  assert.ok(response.body.pod);
  assert.ok(response.body.database);
  assert.ok(response.body.timestamp);
  assert.ok(response.body.uptimeSeconds >= 0);
});

test('GET /api/info returns app and runtime metadata', async () => {
  const response = await request(app).get('/api/info');
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.app, 'DevOpsFlow Portal');
  assert.ok(response.body.version);
  assert.ok(response.body.nodeVersion);
  assert.ok(response.body.platform);
  assert.ok(response.body.hostname);
});

test('GET /api/db/stats returns database diagnostics', async () => {
  const response = await request(app).get('/api/db/stats');
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.success, true);
  assert.ok(response.body.database);
  assert.ok('connected' in response.body.database);
  assert.ok('taskCount' in response.body);
});

test('GET /api/tasks returns task array', async () => {
  const response = await request(app).get('/api/tasks');
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.success, true);
  assert.ok(Array.isArray(response.body.data));
});

test('POST /api/tasks rejects empty or invalid title', async () => {
  const response = await request(app)
    .post('/api/tasks')
    .send({ title: '   ' });
  assert.strictEqual(response.statusCode, 400);
  assert.strictEqual(response.body.success, false);
});

test('POST /api/tasks adds a valid task', async () => {
  const response = await request(app)
    .post('/api/tasks')
    .send({ title: 'CI/CD Automated Test Task' });
  assert.strictEqual(response.statusCode, 201);
  assert.strictEqual(response.body.success, true);
  assert.strictEqual(response.body.data.title, 'CI/CD Automated Test Task');
  assert.strictEqual(response.body.data.completed, false);
  assert.ok(response.body.data.id);
});

test('PATCH /api/tasks/:id/toggle toggles task completion', async () => {
  // First create a task
  const createRes = await request(app)
    .post('/api/tasks')
    .send({ title: 'Task to toggle' });
  const taskId = createRes.body.data.id;

  // Toggle it
  const toggleRes = await request(app)
    .patch(`/api/tasks/${taskId}/toggle`);
  assert.strictEqual(toggleRes.statusCode, 200);
  assert.strictEqual(toggleRes.body.success, true);
  assert.strictEqual(toggleRes.body.data.completed, true);

  // Toggle again
  const toggleRes2 = await request(app)
    .patch(`/api/tasks/${taskId}/toggle`);
  assert.strictEqual(toggleRes2.statusCode, 200);
  assert.strictEqual(toggleRes2.body.data.completed, false);
});

test('DELETE /api/tasks/:id removes a task', async () => {
  // Create a task
  const createRes = await request(app)
    .post('/api/tasks')
    .send({ title: 'Task to delete' });
  const taskId = createRes.body.data.id;

  // Delete it
  const deleteRes = await request(app)
    .delete(`/api/tasks/${taskId}`);
  assert.strictEqual(deleteRes.statusCode, 200);
  assert.strictEqual(deleteRes.body.success, true);
  assert.strictEqual(deleteRes.body.id, taskId);

  // Deleting again should return 404
  const deleteRes2 = await request(app)
    .delete(`/api/tasks/${taskId}`);
  assert.strictEqual(deleteRes2.statusCode, 404);
  assert.strictEqual(deleteRes2.body.success, false);
});
