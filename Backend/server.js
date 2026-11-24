require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');

const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initSocket } = require('./src/socket');

const PORT = process.env.PORT || 3000;

// Socket.io needs the raw HTTP server (not just the Express app) so that
// HTTP requests and WebSocket upgrades share the same port.
const server = http.createServer(app);
initSocket(server);

// In production this one server also serves the built React app.
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../Frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (_req, res) => res.sendFile(path.resolve(frontendPath, 'index.html')));
}

connectDB()
  .then(() => {
    server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
