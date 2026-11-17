# Jira Clone

A minimal Jira-style issue tracker with a drag-and-drop kanban board.

**Stack:** Node.js, Express, SQLite (better-sqlite3), vanilla JavaScript

## Features
- Multiple projects with keys (e.g. `WEB-12`)
- Create, move (drag and drop) and delete issues
- Priorities, assignees, descriptions
- Input validation and error messages
- Seed data on first start, dark mode support

## Run locally
Requires Node.js 18+.

```bash
git clone https://github.com/khalil135711/jira-clone.git
cd jira-clone
npm install
npm start
```

Open http://localhost:3000

## API
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project `{key, name}` |
| GET | `/api/projects/:id/issues` | List issues |
| POST | `/api/issues` | Create issue |
| PATCH | `/api/issues/:id` | Update issue (e.g. status) |
| DELETE | `/api/issues/:id` | Delete issue |

## Roadmap (ideas for extending it)
- User registration and login (JWT)
- Comments, labels, sprints
- Search and filters
- Tests (Vitest/Jest) and GitHub Actions CI
- Docker Compose + PostgreSQL
