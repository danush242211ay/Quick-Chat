// Integration test: boots the real server and drives it with real HTTP + WebSocket clients.
// Needs a MongoDB:  TEST_MONGO_URI=mongodb://127.0.0.1:27017/quickchat_test npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { io: ioClient } = require('socket.io-client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/quickchat_test';
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = '1000';

const app = require('../src/app');
const { initSocket } = require('../src/socket');
const User = require('../src/models/user.model');
const Message = require('../src/models/message.model');

let server, base;
const sockets = [];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Resolves with the next `event` (optionally only one that passes `match`).
const once = (socket, event, ms = 3000, match = () => true) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => { socket.off(event, handler); reject(new Error(`timeout waiting for "${event}"`)); }, ms);
    function handler(data) {
      if (!match(data)) return;
      clearTimeout(t);
      socket.off(event, handler);
      resolve(data);
    }
    socket.on(event, handler);
  });

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data: await res.json().catch(() => ({})), cookie: setCookie ? setCookie.split(';')[0] : null, raw: setCookie };
}

function connect(cookie) {
  const socket = ioClient(base, { extraHeaders: cookie ? { Cookie: cookie } : {}, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  return socket;
}
const connected = (socket) => new Promise((res, rej) => { socket.once('connect', res); socket.once('connect_error', rej); });

const emitAck = (socket, event, payload) => new Promise((res) => socket.emit(event, payload, res));

test.before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([User.deleteMany({}), Message.deleteMany({})]);
  server = http.createServer(app);
  initSocket(server);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  sockets.forEach((s) => s.close());
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  process.exit(0);
});

let alice, bob, carol;

test('auth: register validates input, logs in, sets an httpOnly cookie', async () => {
  const bad = await api('/api/auth/register', { method: 'POST', body: { email: 'nope', fullName: 'X', password: '123456' } });
  assert.equal(bad.status, 400);
  const short = await api('/api/auth/register', { method: 'POST', body: { email: 'a@a.com', fullName: 'X', password: '123' } });
  assert.equal(short.status, 400);

  alice = await api('/api/auth/register', { method: 'POST', body: { email: 'Alice@Test.com', fullName: 'Alice', password: 'secret1' } });
  assert.equal(alice.status, 201);
  assert.match(alice.raw, /HttpOnly/i);
  assert.equal(alice.data.user.email, 'alice@test.com'); // lower-cased
  assert.equal(alice.data.user.password, undefined);     // never leaked

  bob = await api('/api/auth/register', { method: 'POST', body: { email: 'bob@test.com', fullName: 'Bob', password: 'secret2' } });
  carol = await api('/api/auth/register', { method: 'POST', body: { email: 'carol@test.com', fullName: 'Carol', password: 'secret3' } });

  const dup = await api('/api/auth/register', { method: 'POST', body: { email: 'bob@test.com', fullName: 'Bob', password: 'secret2' } });
  assert.equal(dup.status, 400);

  const wrong = await api('/api/auth/login', { method: 'POST', body: { email: 'bob@test.com', password: 'wrongpw' } });
  assert.equal(wrong.status, 401);
  const right = await api('/api/auth/login', { method: 'POST', body: { email: 'bob@test.com', password: 'secret2' } });
  assert.equal(right.status, 200);
  assert.ok(right.cookie.startsWith('token='));
});

test('auth: /me and protected routes require the cookie', async () => {
  assert.equal((await api('/api/auth/me')).status, 401);
  assert.equal((await api('/api/users')).status, 401);
  assert.equal((await api('/api/messages/inbox')).status, 401);
  const me = await api('/api/auth/me', { cookie: alice.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.fullName, 'Alice');
});

test('users: directory excludes me and never exposes passwords', async () => {
  const { data } = await api('/api/users', { cookie: alice.cookie });
  assert.deepEqual(data.users.map((u) => u.fullName).sort(), ['Bob', 'Carol']);
  assert.ok(data.users.every((u) => u.password === undefined));
});

test('socket: connection without a valid cookie is rejected', async () => {
  const anon = connect(null);
  await assert.rejects(connected(anon), /Unauthorized/);
  const forged = connect('token=not.a.real.jwt');
  await assert.rejects(connected(forged), /Unauthorized/);
});

let sA, sB;

test('presence: online list + live updates', async () => {
  sA = connect(alice.cookie);
  const listA = once(sA, 'presence:list');
  await connected(sA);
  assert.deepEqual(await listA, [alice.data.user.id]);

  const updateOnA = once(sA, 'presence:update', 3000, (u) => u.userId === bob.data.user.id);
  sB = connect(bob.cookie);
  const listB = once(sB, 'presence:list');
  await connected(sB);
  const update = await updateOnA;
  assert.equal(update.userId, bob.data.user.id);
  assert.equal(update.online, true);
  assert.deepEqual((await listB).sort(), [alice.data.user.id, bob.data.user.id].sort());
});

test('messaging: send over socket -> ack to sender, push to receiver, delivered status', async () => {
  const incoming = once(sB, 'message:new');
  const ack = await emitAck(sA, 'message:send', { to: bob.data.user.id, text: '  Hello Bob!  ', tempId: 't1' });
  assert.equal(ack.ok, true);
  assert.equal(ack.tempId, 't1');
  assert.equal(ack.message.text, 'Hello Bob!');          // trimmed
  assert.equal(ack.message.status, 'delivered');           // Bob was online
  const pushed = await incoming;
  assert.equal(pushed._id, ack.message._id);
  assert.equal(pushed.sender, alice.data.user.id);
});

test('messaging: validation errors come back through the ack', async () => {
  assert.equal((await emitAck(sA, 'message:send', { to: bob.data.user.id, text: '   ' })).ok, false);
  assert.equal((await emitAck(sA, 'message:send', { to: alice.data.user.id, text: 'hi me' })).ok, false);
  assert.equal((await emitAck(sA, 'message:send', { to: 'garbage', text: 'x' })).ok, false);
  assert.equal((await emitAck(sA, 'message:send', { to: '64b000000000000000000000', text: 'x' })).error, 'Receiver not found');
  assert.equal((await emitAck(sA, 'message:send', { to: bob.data.user.id, text: 'x'.repeat(2001) })).ok, false);
});

test('typing: relayed to the other user only', async () => {
  const typing = once(sB, 'typing');
  sA.emit('typing', { to: bob.data.user.id, isTyping: true });
  assert.deepEqual(await typing, { from: alice.data.user.id, isTyping: true });
});

test('read receipts: Bob opens the chat -> Alice is told', async () => {
  const readOnA = once(sA, 'messages:read');
  sB.emit('messages:read', { from: alice.data.user.id });
  assert.deepEqual(await readOnA, { by: bob.data.user.id });
  const { data } = await api(`/api/messages/conversation/${bob.data.user.id}`, { cookie: alice.cookie });
  assert.equal(data.messages[0].status, 'read');
});

test('offline delivery: message to an offline user is "sent", then "delivered" when they connect', async () => {
  const ack = await emitAck(sA, 'message:send', { to: carol.data.user.id, text: 'Are you there, Carol?' });
  assert.equal(ack.message.status, 'sent');

  const deliveredOnA = once(sA, 'messages:delivered');
  const sC = connect(carol.cookie);
  await connected(sC);
  assert.deepEqual(await deliveredOnA, { by: carol.data.user.id });
  const { data } = await api(`/api/messages/conversation/${carol.data.user.id}`, { cookie: alice.cookie });
  assert.equal(data.messages[0].status, 'delivered');
  sC.close();
});

test('multi-tab: a message sent from one tab appears on the sender\'s other tab', async () => {
  const sA2 = connect(alice.cookie);
  await connected(sA2);
  const onOtherTab = once(sA2, 'message:new');
  await emitAck(sA, 'message:send', { to: bob.data.user.id, text: 'from tab 1' });
  const m = await onOtherTab;
  assert.equal(m.text, 'from tab 1');
  assert.equal(m.sender, alice.data.user.id);
  sA2.close();
  await wait(300);
});

test('REST fallback: POST /api/messages/send still delivers in real time', async () => {
  const incoming = once(sB, 'message:new');
  const res = await api('/api/messages/send', { method: 'POST', cookie: alice.cookie, body: { to: bob.data.user.id, text: 'via REST' } });
  assert.equal(res.status, 201);
  assert.equal((await incoming).text, 'via REST');
  assert.equal((await api('/api/messages/send', { method: 'POST', cookie: alice.cookie, body: { to: bob.data.user.id, text: '' } })).status, 400);
});

test('history: pagination returns oldest->newest with hasMore + before cursor', async () => {
  for (let i = 1; i <= 5; i++) {
    await emitAck(sB, 'message:send', { to: alice.data.user.id, text: `page-${i}` });
    await wait(15);
  }
  const first = await api(`/api/messages/conversation/${bob.data.user.id}?limit=3`, { cookie: alice.cookie });
  assert.equal(first.data.messages.length, 3);
  assert.equal(first.data.hasMore, true);
  assert.equal(first.data.messages.at(-1).text, 'page-5'); // newest page, oldest-first order
  const older = await api(`/api/messages/conversation/${bob.data.user.id}?limit=100&before=${encodeURIComponent(first.data.messages[0].createdAt)}`, { cookie: alice.cookie });
  assert.ok(older.data.messages.every((m) => new Date(m.createdAt) < new Date(first.data.messages[0].createdAt)));
  assert.equal(older.data.hasMore, false);
});

test('conversations: last message + unread counts per person', async () => {
  const { data } = await api('/api/messages/conversations', { cookie: alice.cookie });
  const withBob = data.conversations.find((c) => c.userId === bob.data.user.id);
  const withCarol = data.conversations.find((c) => c.userId === carol.data.user.id);
  assert.equal(withBob.lastMessage.text, 'page-5');
  assert.equal(withBob.lastMessage.fromMe, false);
  assert.equal(withBob.unread, 5);        // Bob sent 5, Alice hasn't read them
  assert.equal(withCarol.lastMessage.fromMe, true);
  assert.equal(withCarol.unread, 0);
});

test('privacy: a third person cannot read someone else\'s conversation', async () => {
  const { data } = await api(`/api/messages/conversation/${bob.data.user.id}`, { cookie: carol.cookie });
  assert.equal(data.messages.length, 0); // Carol<->Bob has no messages; she can't see Alice<->Bob
});

test('delete: only the sender can delete; both sides are notified; text is wiped', async () => {
  const ack = await emitAck(sA, 'message:send', { to: bob.data.user.id, text: 'oops wrong chat' });
  const id = ack.message._id;

  const forbidden = await api(`/api/messages/${id}`, { method: 'DELETE', cookie: bob.cookie });
  assert.equal(forbidden.status, 403);

  const onBob = once(sB, 'message:deleted');
  const onAlice = once(sA, 'message:deleted');
  const ok = await api(`/api/messages/${id}`, { method: 'DELETE', cookie: alice.cookie });
  assert.equal(ok.status, 200);
  assert.deepEqual(await onBob, { messageId: id, with: alice.data.user.id });
  assert.deepEqual(await onAlice, { messageId: id, with: bob.data.user.id });

  const raw = await Message.findById(id);
  assert.equal(raw.text, ''); // really wiped in the DB
  const { data } = await api(`/api/messages/conversation/${bob.data.user.id}?limit=1`, { cookie: alice.cookie });
  assert.equal(data.messages[0].deleted, true);
  assert.equal(data.messages[0].text, '');
});

test('rate limit: spamming messages is throttled per socket', async () => {
  const sp = connect(alice.cookie);
  await connected(sp);
  const results = [];
  for (let i = 0; i < 25; i++) results.push(await emitAck(sp, 'message:send', { to: carol.data.user.id, text: `spam ${i}` }));
  assert.ok(results.slice(0, 20).every((r) => r.ok));
  assert.equal(results[24].ok, false);
  assert.match(results[24].error, /too fast/);
  sp.close();
});

test('presence: going offline broadcasts lastSeen after the grace period', async () => {
  const offline = once(sA, 'presence:update', 5000, (u) => u.userId === bob.data.user.id);
  sB.close();
  const update = await offline;
  assert.equal(update.userId, bob.data.user.id);
  assert.equal(update.online, false);
  assert.ok(update.lastSeen);
  const saved = await User.findById(bob.data.user.id);
  assert.ok(saved.lastSeen);
});

test('presence: quick reconnect (page refresh) does NOT flicker offline', async () => {
  const s1 = connect(bob.cookie); await connected(s1);
  let sawOffline = false;
  sA.on('presence:update', (u) => { if (u.userId === bob.data.user.id && !u.online) sawOffline = true; });
  s1.close();
  await wait(300);
  const s2 = connect(bob.cookie); await connected(s2);
  await wait(2200);
  assert.equal(sawOffline, false);
  s2.close();
});

test('unknown API route returns JSON 404; bad JSON returns 400', async () => {
  assert.equal((await api('/api/nope')).status, 404);
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
});
