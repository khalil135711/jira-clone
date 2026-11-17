const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.PORT || 3000;
const db = new Database(process.env.DB_FILE || path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
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

// Seed data on first start
if (db.prepare('SELECT COUNT(*) c FROM projects').get().c === 0) {
  const p = db.prepare('INSERT INTO projects (key, name) VALUES (?, ?)').run('DEMO', 'Demo Project');
  const ins = db.prepare('INSERT INTO issues (project_id, title, description, status, priority, assignee) VALUES (?,?,?,?,?,?)');
  ins.run(p.lastInsertRowid, 'Set up repository', 'Init git, add README', 'done', 'low', 'Alex');
  ins.run(p.lastInsertRowid, 'Build login page', 'Email + password', 'in_progress', 'high', 'Sam');
  ins.run(p.lastInsertRowid, 'Add issue filters', 'Filter by assignee and priority', 'todo', 'medium', '');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const STATUS = ['todo', 'in_progress', 'done'];
const PRIORITY = ['low', 'medium', 'high'];
const bad = (res, msg) => res.status(400).json({ error: msg });

app.get('/api/projects', (_req, res) => {
  res.json(db.prepare('SELECT * FROM projects ORDER BY name').all());
});

app.post('/api/projects', (req, res) => {
  const key = String(req.body.key || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  if (!/^[A-Z]{2,6}$/.test(key)) return bad(res, 'Key must be 2-6 letters');
  if (!name) return bad(res, 'Name is required');
  try {
    const r = db.prepare('INSERT INTO projects (key, name) VALUES (?, ?)').run(key, name);
    res.status(201).json({ id: r.lastInsertRowid, key, name });
  } catch {
    bad(res, 'Project key already exists');
  }
});

app.get('/api/projects/:id/issues', (req, res) => {
  res.json(db.prepare('SELECT * FROM issues WHERE project_id = ? ORDER BY id').all(req.params.id));
});

app.post('/api/issues', (req, res) => {
  const { project_id, description = '', assignee = '' } = req.body;
  const title = String(req.body.title || '').trim();
  const priority = req.body.priority || 'medium';
  if (!title) return bad(res, 'Title is required');
  if (!PRIORITY.includes(priority)) return bad(res, 'Invalid priority');
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
  if (!project) return bad(res, 'Project not found');
  const r = db.prepare('INSERT INTO issues (project_id, title, description, priority, assignee) VALUES (?,?,?,?,?)')
    .run(project_id, title, description, priority, assignee);
  res.status(201).json(db.prepare('SELECT * FROM issues WHERE id = ?').get(r.lastInsertRowid));
});

app.patch('/api/issues/:id', (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  const next = { ...issue, ...req.body };
  if (!STATUS.includes(next.status)) return bad(res, 'Invalid status');
  if (!PRIORITY.includes(next.priority)) return bad(res, 'Invalid priority');
  if (!String(next.title).trim()) return bad(res, 'Title is required');
  db.prepare('UPDATE issues SET title=?, description=?, status=?, priority=?, assignee=? WHERE id=?')
    .run(next.title, next.description, next.status, next.priority, next.assignee, issue.id);
  res.json(db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id));
});

app.delete('/api/issues/:id', (req, res) => {
  db.prepare('DELETE FROM issues WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
