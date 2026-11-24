# Quick Chat — Frontend

React 19 + Vite. All state lives in three React contexts:

| Context | Responsibility |
|---|---|
| `AuthContext` | who is logged in (`/api/auth/me`, login, register, logout) |
| `SocketContext` | the single Socket.io connection, `connected` flag, who is online |
| `ChatContext` | people list, conversations, messages, typing, unread counts, sending |

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api and /socket.io to http://localhost:3000)
npm run build    # outputs dist/, which the backend serves in production
npm run lint
```

Environment variables (optional): `VITE_SERVER_URL` (backend URL if it is on another domain), `VITE_PROXY_TARGET` (dev proxy target, default `http://localhost:3000`).

See the main [README](../README.md) and [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
