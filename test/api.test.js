import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const { createApp } = require('../app.js');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
let app;

async function signup(email = 'a@example.com', password = 'password123') {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  return res.body.token;
}
async function makeProject(token, key = 'WEB') {
  const res = await request(app).post('/api/projects').set(auth(token)).send({ key, name: 'Website' });
  return res.body;
}

beforeEach(() => { app = createApp({ jwtSecret: 'test-secret' }); });

describe('auth', () => {
  it('registers a user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'A@Example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('a@example.com');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects invalid email and short password', async () => {
    expect((await request(app).post('/api/auth/register').send({ email: 'nope', password: 'password123' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ email: 'a@example.com', password: 'short' })).status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    await signup();
    const res = await request(app).post('/api/auth/register').send({ email: 'a@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials only', async () => {
    await signup();
    const ok = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    const wrong = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'wrong-password' });
    expect(wrong.status).toBe(401);
  });

  it('protects routes with a valid token', async () => {
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/projects').set(auth('garbage'))).status).toBe(401);
    const token = await signup();
    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('a@example.com');
  });
});

describe('projects and issues', () => {
  it('creates a project and validates the key', async () => {
    const token = await signup();
    expect((await request(app).post('/api/projects').set(auth(token)).send({ key: '1', name: 'X' })).status).toBe(400);
    const project = await makeProject(token);
    expect(project.key).toBe('WEB');
    expect((await request(app).post('/api/projects').set(auth(token)).send({ key: 'web', name: 'Again' })).status).toBe(409);
  });

  it('creates, moves and deletes an issue', async () => {
    const token = await signup();
    const project = await makeProject(token);
    const created = await request(app).post('/api/issues').set(auth(token)).send({ project_id: project.id, title: 'Fix bug', priority: 'high' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('todo');

    const moved = await request(app).patch(`/api/issues/${created.body.id}`).set(auth(token)).send({ status: 'done' });
    expect(moved.body.status).toBe('done');

    const list = await request(app).get(`/api/projects/${project.id}/issues`).set(auth(token));
    expect(list.body).toHaveLength(1);

    expect((await request(app).delete(`/api/issues/${created.body.id}`).set(auth(token))).status).toBe(204);
    const after = await request(app).get(`/api/projects/${project.id}/issues`).set(auth(token));
    expect(after.body).toHaveLength(0);
  });

  it('validates issue input', async () => {
    const token = await signup();
    const project = await makeProject(token);
    expect((await request(app).post('/api/issues').set(auth(token)).send({ project_id: project.id, title: '  ' })).status).toBe(400);
    const issue = await request(app).post('/api/issues').set(auth(token)).send({ project_id: project.id, title: 'Task' });
    expect((await request(app).patch(`/api/issues/${issue.body.id}`).set(auth(token)).send({ status: 'archived' })).status).toBe(400);
  });

  it("keeps each user's data private", async () => {
    const alice = await signup('alice@example.com');
    const bob = await signup('bob@example.com');
    const project = await makeProject(alice);
    const issue = await request(app).post('/api/issues').set(auth(alice)).send({ project_id: project.id, title: 'Secret' });

    expect((await request(app).get('/api/projects').set(auth(bob))).body).toHaveLength(0);
    expect((await request(app).get(`/api/projects/${project.id}/issues`).set(auth(bob))).status).toBe(404);
    expect((await request(app).post('/api/issues').set(auth(bob)).send({ project_id: project.id, title: 'Hack' })).status).toBe(404);
    expect((await request(app).patch(`/api/issues/${issue.body.id}`).set(auth(bob)).send({ status: 'done' })).status).toBe(404);
    expect((await request(app).delete(`/api/issues/${issue.body.id}`).set(auth(bob))).status).toBe(404);
  });
});
