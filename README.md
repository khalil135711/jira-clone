# Jira Clone

![CI](../../actions/workflows/ci.yml/badge.svg)

A Jira-style issue tracker with user accounts and a drag-and-drop kanban board.

**Stack:** Node.js, Express, SQLite (better-sqlite3), JWT (jsonwebtoken + bcryptjs), vanilla JavaScript, Vitest + Supertest

## Features
- Registration and login with JWT (7 days) and bcrypt-hashed passwords
- Every user only sees their own projects and issues
- Multiple projects with keys (e.g. `WEB-12`)
- Create, move (drag and drop) and delete issues
- Priorities, assignees, descriptions
- API tests and GitHub Actions CI (Node 20 and 22)

## Run locally
Requires Node.js 18+.

```bash
git clone https://github.com/khalil135711/jira-clone.git
cd jira-clone
npm install
cp .env.example .env   # then set JWT_SECRET
node --env-file=.env server.js   # or: npm start
```

Open http://localhost:3000. Without `JWT_SECRET`, a random secret is generated and logins reset on every restart.

## Tests
```bash
npm test
```
The tests run against an in-memory database and cover registration, login, protected routes, issue CRUD, validation and data isolation between users.

## API
| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | no | Create account `{email, password}` |
| POST | `/api/auth/login` | no | Get a token |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/projects` | yes | List own projects |
| POST | `/api/projects` | yes | Create project `{key, name}` |
| GET | `/api/projects/:id/issues` | yes | List issues |
| POST | `/api/issues` | yes | Create issue |
| PATCH | `/api/issues/:id` | yes | Update issue (e.g. status) |
| DELETE | `/api/issues/:id` | yes | Delete issue |

Send the token as `Authorization: Bearer <token>`.

## Security notes
- The token is stored in `localStorage` for simplicity. For production, prefer an httpOnly cookie.
- Add rate limiting on the auth routes before deploying publicly.

## Roadmap
- Comments, labels, sprints
- Search and filters
- Docker Compose + PostgreSQL
