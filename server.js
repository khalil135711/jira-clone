const crypto = require('crypto');
const path = require('path');
const { createApp } = require('./app');

let secret = process.env.JWT_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET is not set. Using a random secret: logins reset on every restart.');
}

const PORT = process.env.PORT || 3000;
const app = createApp({ dbFile: process.env.DB_FILE || path.join(__dirname, 'data.db'), jwtSecret: secret });
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
