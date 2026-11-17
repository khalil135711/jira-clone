const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const STATUS = ['todo', 'in_progress', 'done'];
const PRIORITY = ['low', 'medium', 'high'];

function createApp({ dbFile = ':memory:', jwtSecret = process.env.JWT_SECRET } = {}) {
  if (!jwtSecret) throw new Error('JWT_SECRET is required');

  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE (owner_id, key)
  );
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
    assignee TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
  const sign = (user) => jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' });

  // ---------- Auth ----------
  app.post('/api/auth/register', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Enter a valid email address');
    if (password.length < 8) return bad(res, 'Password must have at least 8 characters');
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return bad(res, 'Email is already registered', 409);
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    const user = { id: r.lastInsertRowid, email };
    res.status(201).json({ token: sign(user), user });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || !bcrypt.compareSync(String(req.body.password || ''), row.password_hash)) {
      return bad(res, 'Wrong email or password', 401);
    }
    const user = { id: row.id, email: row.email };
    res.json({ token: sign(user), user });
  });

  function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return bad(res, 'Sign in required', 401);
    try {
      req.userId = jwt.verify(token, jwtSecret).sub;
      next();
    } catch {
      bad(res, 'Session expired. Sign in again.', 401);
    }
  }

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.userId);
    if (!user) return bad(res, 'Sign in required', 401);
    res.json(user);
  });

  // ---------- Projects ----------
  const ownProject = (id, userId) => db.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ?').get(id, userId);
  const ownIssue = (id, userId) => db.prepare(
    'SELECT i.* FROM issues i JOIN projects p ON p.id = i.project_id WHERE i.id = ? AND p.owner_id = ?').get(id, userId);

  app.get('/api/projects', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT id, key, name FROM projects WHERE owner_id = ? ORDER BY name').all(req.userId));
  });

  app.post('/api/projects', requireAuth, (req, res) => {
    const key = String(req.body.key || '').trim().toUpperCase();
    const name = String(req.body.name || '').trim();
    if (!/^[A-Z]{2,6}$/.test(key)) return bad(res, 'Key must be 2-6 letters');
    if (!name) return bad(res, 'Name is required');
    try {
      const r = db.prepare('INSERT INTO projects (owner_id, key, name) VALUES (?, ?, ?)').run(req.userId, key, name);
      res.status(201).json({ id: r.lastInsertRowid, key, name });
    } catch {
      bad(res, 'Project key already exists', 409);
    }
  });

  // ---------- Issues ----------
  app.get('/api/projects/:id/issues', requireAuth, (req, res) => {
    if (!ownProject(req.params.id, req.userId)) return bad(res, 'Project not found', 404);
    res.json(db.prepare('SELECT * FROM issues WHERE project_id = ? ORDER BY id').all(req.params.id));
  });

  app.post('/api/issues', requireAuth, (req, res) => {
    const { project_id, description = '', assignee = '' } = req.body;
    const title = String(req.body.title || '').trim();
    const priority = req.body.priority || 'medium';
    if (!title) return bad(res, 'Title is required');
    if (!PRIORITY.includes(priority)) return bad(res, 'Invalid priority');
    if (!ownProject(project_id, req.userId)) return bad(res, 'Project not found', 404);
    const r = db.prepare('INSERT INTO issues (project_id, title, description, priority, assignee) VALUES (?,?,?,?,?)')
      .run(project_id, title, description, priority, assignee);
    res.status(201).json(db.prepare('SELECT * FROM issues WHERE id = ?').get(r.lastInsertRowid));
  });

  app.patch('/api/issues/:id', requireAuth, (req, res) => {
    const issue = ownIssue(req.params.id, req.userId);
    if (!issue) return bad(res, 'Issue not found', 404);
    const next = { ...issue, ...req.body, id: issue.id, project_id: issue.project_id };
    if (!STATUS.includes(next.status)) return bad(res, 'Invalid status');
    if (!PRIORITY.includes(next.priority)) return bad(res, 'Invalid priority');
    if (!String(next.title).trim()) return bad(res, 'Title is required');
    db.prepare('UPDATE issues SET title=?, description=?, status=?, priority=?, assignee=? WHERE id=?')
      .run(next.title, next.description, next.status, next.priority, next.assignee, issue.id);
    res.json(db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id));
  });

  app.delete('/api/issues/:id', requireAuth, (req, res) => {
    const issue = ownIssue(req.params.id, req.userId);
    if (!issue) return bad(res, 'Issue not found', 404);
    db.prepare('DELETE FROM issues WHERE id = ?').run(issue.id);
    res.status(204).end();
  });

  return app;
}

module.exports = { createApp };
