const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./routers/auth.routes');
const messageRoutes = require('./routers/message.route');
const userRoutes = require('./routers/user.routes');

const app = express();

// Behind a proxy (Render, Heroku, nginx) so secure cookies and rate limiting see the real client.
app.set('trust proxy', 1);

// CORS is only needed if the frontend runs on a different origin than this server.
// In development Vite proxies /api and /socket.io, so requests are same-origin.
if (process.env.CLIENT_URL) {
  app.use(cors({ origin: process.env.CLIENT_URL.split(','), credentials: true }));
}

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Unknown /api/* route -> JSON 404 (and never the React index.html)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route not found' }));

// Central error handler: AppError -> its message; anything else -> generic 500.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.expose) return res.status(err.status || 400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

module.exports = app;
