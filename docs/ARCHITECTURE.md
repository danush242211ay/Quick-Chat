# Quick Chat — Architecture

## 1. The big picture

```
┌────────────────────┐   HTTP (axios)    ┌─────────────────────────┐   Mongoose   ┌───────────┐
│  Browser A (React) │ ───────────────▶ │                         │ ───────────▶ │           │
│                    │ ◀─────────────── │   Express  +  Socket.io │ ◀─────────── │  MongoDB  │
│  Browser B (React) │   WebSocket      │      (one Node.js       │              │           │
│                    │ ◀══════════════▶ │       process)          │              └───────────┘
└────────────────────┘  (always open)   └─────────────────────────┘
```

Two channels, two jobs:

| Channel | Used for | Why |
|---|---|---|
| **HTTP / REST** | login, history (users, conversations, older messages), delete, fallback send | request → response; cacheable; easy to test |
| **WebSocket (Socket.io)** | everything *live*: new messages, typing, presence, ticks, deletes | the **server can push** to a browser without being asked |

The database is the **source of truth**. Socket events are just notifications that something changed;
if you miss one (e.g. network drop) the app simply re-fetches from the database (see *Reconnect*, §6).

---

## 2. Backend layout and layering

```
HTTP request ──▶ router ──▶ middleware (protect) ──▶ controller ──▶ service ──▶ model ──▶ MongoDB
Socket event ──▶ socket/index.js (auth + handlers) ───────────────▶ service ──▶ model
                                                                       │
                                                                       └──▶ socket/io.js  emitToUser()  (push to clients)
```

| Layer | Files | Rule |
|---|---|---|
| Routers | `routers/*.js` | map URL → controller, attach middleware |
| Controllers | `controllers/*.js` | read `req`, call a service, write `res`. No business logic |
| **Service** | `services/message.service.js` | validation, saving, "who gets notified". **One place** for the rules |
| Models | `models/*.js` | MongoDB schemas |
| Socket layer | `socket/*` | auth handshake, event handlers, presence |

**Why a service layer?** A message can be sent two ways: over the socket (normal) or `POST /api/messages/send`
(fallback). Both call `createMessage()`, so validation, delivery status and notifications can never drift apart.

`socket/io.js` stores the Socket.io server so any file can do `emitToUser(userId, 'event', data)`
without importing the whole socket setup (this avoids circular imports).

---

## 3. Data model

**User** — `email` (unique, lower-cased), `fullName`, `password` (bcrypt hash, `select:false`), `profilePic`, `lastSeen`

**Message** — `sender`, `receiver` (ObjectIds → User), `text` (≤ 2000), `status` (`sent` | `delivered` | `read`), `deletedAt`
Indexes: `{sender, receiver, createdAt}` (open a conversation) and `{receiver, status}` (unread counts / mark-read).

There is **no Conversation collection**: a conversation is simply "all messages between user A and user B",
fetched with `$or: [{A→B}, {B→A}]` sorted by `createdAt`. Simple, and the indexes keep it fast.

A **delete** is soft: `deletedAt` is set and `text` is wiped, so ordering stays intact and clients show
*"This message was deleted"*.

---

## 4. Authentication

1. `POST /auth/login` → server verifies bcrypt hash → signs a JWT `{ id }` (1 day) → sets it as an **`httpOnly` cookie**.
2. Every HTTP request carries the cookie automatically → `protect` middleware verifies it and loads `req.user`.
3. **The WebSocket handshake also carries the cookie**, so `io.use(...)` in `socket/index.js` runs the same check
   *before* a connection is accepted. No valid cookie ⇒ `Unauthorized`, the socket never connects.
4. Page refresh: the frontend calls `GET /auth/me`; the cookie is still there, so you stay logged in.

Why a cookie and not `localStorage`? `httpOnly` means JavaScript cannot read it, so an XSS bug cannot steal the token.
`SameSite=Lax` blocks cross-site request forgery; `Secure` (production) keeps it on HTTPS.

---

## 5. The real-time engine (`socket/`)

### Rooms: "send to a user" = "send to a room"
When a socket connects it joins a private room `user:<userId>`. To notify a person we emit to that room, which
automatically reaches **every tab and device** they have open.

```js
socket.join(`user:${userId}`);              // on connect
io.to(`user:${receiverId}`).emit('message:new', msg);   // later, from anywhere
```

### Presence (`presence.js`)
`Map<userId, Set<socketId>>` — one user may have many sockets. A user is **online** while the set is non-empty.
- First socket connects → broadcast `presence:update {online:true}`.
- Last socket disconnects → wait **1.5 s** (grace period) → if still no sockets, save `lastSeen` and broadcast offline.
  The grace period stops the green dot flickering when you refresh the page.
- A newly connected socket receives `presence:list` (everyone currently online).

### Events

**Client → server**

| Event | Payload | Notes |
|---|---|---|
| `message:send` | `{ to, text, tempId }` + **ack callback** | server replies `{ ok, message }` or `{ ok:false, error }` |
| `typing` | `{ to, isTyping }` | relayed only, never stored |
| `messages:read` | `{ from }` | "I opened the chat with `from`" |

**Server → client**

| Event | Payload | Meaning |
|---|---|---|
| `message:new` | message | new message for you (or sent from your other tab) |
| `messages:delivered` | `{ by }` | `by` came online / received → ✓ becomes ✓✓ |
| `messages:read` | `{ by }` | `by` opened the chat → ticks turn blue |
| `conversation:read` | `{ with }` | you read it in another tab → clear badge here |
| `message:deleted` | `{ messageId, with }` | delete-for-everyone happened |
| `typing` | `{ from, isTyping }` | other person typing |
| `presence:list` / `presence:update` | ids / `{ userId, online, lastSeen }` | who is online |
| `user:new` | user | someone just registered → appears in the sidebar live |

### Message status lifecycle
```
              receiver online?            receiver connects later         receiver opens the chat
  created ─────────── yes ──▶ delivered ─────────────────────────────────────────▶ read
      └────────────── no ───▶ sent ───────────────▶ delivered ───────────────────▶ read
```

---

## 6. Life of one message (sequence)

```
Alice's browser            Server                                   Bob's browser
      │  1. optimistic bubble (🕓)                                         │
      │  2. emit message:send ──────▶ validate · save to DB                │
      │                              status = Bob online? delivered : sent │
      │                              emit message:new ─────────────────────▶ 4. bubble appears, badge +1
      │◀───── 3. ack {ok, message} ─ emit to Alice's OTHER tabs            │
      │  swap temp bubble → real (✓✓)                                      │
      │                                     Bob opens the chat             │
      │                              ◀──── messages:read {from: Alice} ────┤
      │                              update DB · emit messages:read ──▶    │
      │◀──── ticks turn blue ─────────                                     │
```

**Optimistic UI:** the sender sees their message immediately (status `sending`); when the ack arrives it is replaced by the
saved version. If the ack reports an error (or times out after 8 s) the bubble turns red with **Retry / Remove**.
If the socket is down, the same message is sent over `POST /api/messages/send` instead.

**Reconnect:** Socket.io reconnects by itself. When the connection returns, `ChatContext` re-fetches people +
conversations and reloads the open chat, so nothing sent during the outage is missed. Messages sent to you while offline
are stored as `sent`, and flipped to `delivered` (with a notification to the sender) the moment you reconnect.

---

## 7. Frontend structure

```
<AuthProvider>                  who am I?  (GET /auth/me)
  └─ <App>                      loading? → splash · logged out? → <AuthScreen> · logged in? ↓
       <SocketProvider>         opens ONE socket (lives only while logged in)
         <ChatProvider>         all chat state + every socket listener
           <Sidebar/>  <ChatWindow/> → <MessageList/> <MessageBubble/>  <MessageInput/>
```

State in `ChatContext` and how it is kept in sync:

| State | Shape | Loaded by | Updated by |
|---|---|---|---|
| `users` | `[{id, fullName, lastSeen}]` | `GET /users` | `user:new`, `presence:update` |
| `summaries` | `{ [userId]: {lastMessage, unread} }` | `GET /messages/conversations` | `message:new`, ticks, reads, deletes |
| `threads` | `{ [userId]: {messages, hasMore} }` | `GET /messages/conversation/:id` | `message:new`, ticks, deletes |
| `typing` | `{ [userId]: true }` | — | `typing` (auto-expires after 5 s) |

Socket listeners are registered once in one `useEffect` and use **functional `setState`** (`prev => …`) plus refs, so they never
act on stale data and never need re-subscribing.

---

## 8. Security checklist

- Passwords hashed with bcrypt (10 rounds); never selected or returned by default
- JWT in `httpOnly` + `SameSite` (+ `Secure` in production) cookie; same check for HTTP **and** WebSocket
- Users can only read **their own** conversations (queries are always scoped to `req.user`); only the **sender** can delete
- Input validated server-side (length, ObjectId format, empty text); React escapes all text (no `dangerouslySetInnerHTML`)
- Rate limits: login/register per IP (`express-rate-limit`), messages per socket (20 per 10 s)
- Login errors don't reveal whether an email exists; request body size capped at 100 kB
- Async route errors are funnelled into one error handler (no crashes, no stack traces to clients)

---

## 9. Known limits & how to grow

| Today | To scale / extend |
|---|---|
| Presence & rooms live in **one process's memory**. Two server instances can't see each other's users | Add the **Socket.io Redis adapter** (`@socket.io/redis-adapter`) and keep presence in Redis |
| One-to-one chats only | Add a `Conversation`/`Group` model and emit to `group:<id>` rooms |
| Text only | Upload images to S3/Cloudinary, store the URL on the message |
| People list = all users | Add search-as-you-type on the server / friend requests |
| Unread count & previews use a few indexed queries | Denormalise into a `Conversation` document if you reach very many chats per user |
| Pagination cursor is `createdAt` | Use `(createdAt, _id)` to be exact when two messages share a millisecond |
| No push notifications | Service worker + Web Push for offline users |
