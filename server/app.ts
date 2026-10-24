import { createServer, type RequestListener, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createMusicHandler } from './music.js';
import { assertLocalDeployment } from './deployment.js';
import { Server } from 'socket.io';
import { createInferenceHandler, inferenceConfig, type InferenceConfig } from './ai.js';
import { authenticate, type AuthConfig } from './auth.js';
import { createSocketSession, type SessionGuard } from './socketAuth.js';
import type { Participant, Timer, RoomState, Reply } from '../src/protocol.js';

type Room = { code: string; people: Map<string, Participant>; timer: Timer; emptySince: number | null; owner: string; locked: boolean };
type RoomLimits = { maxRooms: number; maxParticipants: number; emptyTtlMs: number };
type RateLimits = { events: number; creates: number; joins: number; windowMs: number; maxAddresses: number };
export type SafetyOptions = {
  maxConnections?: number;
  roomLimits?: Partial<RoomLimits>;
  rateLimits?: Partial<RateLimits>;
  schedule?: (sweep: () => void, intervalMs: number) => () => void;
};
type Payload = Record<string, unknown>;

const record = (value: unknown): value is Payload =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);

export interface CreateServerOptions extends SafetyOptions {
  // Hosted mode only. In local mode this is undefined and sockets stay anonymous.
  auth?: AuthConfig;
}

export function createStudyServer(
  handler?: RequestListener,
  clock: () => number = Date.now,
  aiConfig = inferenceConfig() as InferenceConfig | undefined,
  options: CreateServerOptions = {},
) {
  assertLocalDeployment();
  const mode = process.env.STUDY_DEPLOYMENT_MODE ?? 'local';
  const hosted = mode === 'hosted';
  const authConfig = hosted
    ? { supabaseUrl: process.env.SUPABASE_URL!, anonKey: process.env.SUPABASE_ANON_KEY!, publicOrigin: process.env.STUDY_PUBLIC_ORIGIN! }
    : undefined;
  // Permissive defaults: effectively no limits when options are not supplied.
  const roomLimits: RoomLimits = {
    maxRooms: hosted ? 128 : Number.MAX_SAFE_INTEGER,
    maxParticipants: 16,
    emptyTtlMs: hosted ? 300000 : Number.MAX_SAFE_INTEGER,
    ...options.roomLimits,
  };
  const rateLimits: RateLimits = {
    events: hosted ? 120 : Number.MAX_SAFE_INTEGER,
    creates: hosted ? 10 : Number.MAX_SAFE_INTEGER,
    joins: hosted ? 30 : Number.MAX_SAFE_INTEGER,
    windowMs: hosted ? 60000 : Number.MAX_SAFE_INTEGER,
    maxAddresses: hosted ? 1024 : Number.MAX_SAFE_INTEGER,
    ...options.rateLimits,
  };
  const maxConnections = options.maxConnections ?? (hosted ? 256 : Number.MAX_SAFE_INTEGER);
  for (const value of [...Object.values(roomLimits), ...Object.values(rateLimits), maxConnections]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Safety limits must be positive safe integers.');
  const inference = createInferenceHandler(aiConfig);
  const music = createMusicHandler(undefined, { auth: authConfig });
  let pendingRequests = 0;
  const httpBuckets = new Map<string, { start: number; count: number }>();
  const http = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    if (!allowed(req.headers.host, req.headers.origin)) { res.writeHead(403); res.end('Canonical same-origin requests only.'); return; }
    let path;
    try { path = new URL(req.url ?? '/', 'http://localhost').pathname; }
    catch { res.writeHead(400); res.end(); return; }
    let identity;
    if (hosted) {
      const now = Date.now();
      for (const [key,bucket] of httpBuckets) if (now-bucket.start >= 60000) httpBuckets.delete(key);
      const key = req.socket.remoteAddress ?? 'unknown';
      let bucket = httpBuckets.get(key);
      if (!bucket && httpBuckets.size < 1024) { bucket = { start: now, count: 0 }; httpBuckets.set(key,bucket); }
      if (!bucket || ++bucket.count > 240) { res.writeHead(429); res.end(); return; }
      if (path.startsWith('/api/') && path !== '/api/config' && path !== '/api/music/spotify/callback') {
        if (pendingRequests >= 64) { res.writeHead(503); res.end('Authentication capacity reached. Retry shortly.'); return; }
        pendingRequests++;
        try {
          const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
          if (!token) throw Error();
          const user = await authenticate(token, authConfig!);
          identity = { user, token };
        } catch { res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'Session expired or unavailable. Sign in again; if this persists the operator must install the session RPC.' })); return; }
        finally { pendingRequests--; }
      }
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (path.startsWith('/api/music/')) { void music(req, res, identity); return; }
    if (path === '/api/session' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ ok: true })); return; }
    if (req.url?.startsWith('/api/ai/')) { void inference(req, res); return; }
    if (path === '/api/config' && req.method === 'GET') { sendConfig(res); return; }
    if (path === '/healthz' && req.method === 'GET') { sendHealth(res); return; }
    (handler ?? ((_req, response) => response.end('Study Room')))(req, res);
  });
  http.maxHeadersCount = 128;
  http.requestTimeout = 15000; http.headersTimeout = 10000; http.keepAliveTimeout = 5000; http.maxConnections = hosted ? 256 : 1024;
  function allowed(host?: string, origin?: string) {
    if (hosted) return host === new URL(authConfig!.publicOrigin).host && (origin === undefined || origin === authConfig!.publicOrigin);
    const address = http.address();
    if (!address || typeof address === 'string') return false;
    const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    return hosts.includes(host ?? '') && (origin === undefined || hosts.some(h => origin === `http://${h}`));
  }
  function sendConfig(res: ServerResponse) {
    const mode = process.env.STUDY_DEPLOYMENT_MODE ?? 'local';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      mode,
      auth: {
        required: mode === 'hosted',
        url: authConfig?.supabaseUrl ?? '',
        anonKey: authConfig?.anonKey ?? '',
      },
    }));
  }
  function sendHealth(res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
  }
  const io = new Server(http, {
    maxHttpBufferSize: 4096,
    allowRequest: (req, callback) => callback(null, allowed(req.headers.host, req.headers.origin) && (!hosted || io.engine.clientsCount < maxConnections)),
  });
  if (hosted) {
    const requestListeners = http.listeners('request');
    http.removeAllListeners('request');
    http.on('request', (req, res) => {
      if (req.url?.startsWith('/socket.io/')) {
        const key = req.socket.remoteAddress ?? 'unknown';
        const now = Date.now();
        for (const [address, bucket] of httpBuckets) if (now - bucket.start >= 60000) httpBuckets.delete(address);
        let bucket = httpBuckets.get(key);
        if (!bucket && httpBuckets.size < 1024) { bucket = { start: now, count: 0 }; httpBuckets.set(key, bucket); }
        if (!bucket || ++bucket.count > 240) { res.writeHead(429); res.end(); return; }
      }
      for (const listener of requestListeners) listener.call(http, req, res);
    });
  }
  let activeConnections = 0, pendingConnections = 0;
  io.use(async (socket, next) => {
    // Hosted mode requires a verified Supabase access token on the handshake;
    // local sockets stay anonymous exactly as today.
    if (activeConnections + pendingConnections >= maxConnections) return next(new Error('Connection capacity reached. Try again shortly.'));
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    if (hosted) {
      if (!token) return next(new Error('Sign in required'));
      pendingConnections++;
      try {
        socket.data.user = await authenticate(token, authConfig!);
        socket.data.token = token;
      } catch {
        return next(new Error('Session expired or session RPC unavailable'));
      } finally { pendingConnections--; }
    }
    // Direct transport address only: the remote address of the real TCP/WS
    // connection. No forwarded-remote address is ever consulted for trust or
    // rate limiting, and this value cannot be overwritten by the client.
    if (activeConnections >= maxConnections) return next(new Error('Connection capacity reached. Try again shortly.'));
    socket.data.transportAddress = socket.conn.remoteAddress ?? 'unknown';
    next();
  });
  const rooms = new Map<string, Room>();
  // Direct transport address only, never X-Forwarded-For. Fixed-size counters
  // survive socket reconnection at the transport layer without trusting an
  // attacker-controlled header.
  const attempts = new Map<string, { start: number; events: number; creates: number; joins: number }>();
  function sweep() {
    const now = clock();
    for (const [code, room] of rooms) {
      if (room.people.size === 0 && room.emptySince !== null && now - room.emptySince >= roomLimits.emptyTtlMs) rooms.delete(code);
    }
    for (const [address, bucket] of attempts) if (now - bucket.start >= rateLimits.windowMs) attempts.delete(address);
  }
  function throttle(address: string, event: string) {
    let bucket = attempts.get(address);
    if (!bucket) {
      if (attempts.size >= rateLimits.maxAddresses) throw new Error('Room request capacity reached. Try again later.');
      bucket = { start: clock(), events: 0, creates: 0, joins: 0 }; attempts.set(address, bucket);
    }
    const retry = Math.max(1, Math.ceil((bucket.start + rateLimits.windowMs - clock()) / 1000));
    if (bucket.events >= rateLimits.events) throw new Error(`Too many room event requests. Try again in ${retry} seconds.`);
    bucket.events++;
    const kind = event === 'room:create' ? 'creates' : event === 'room:join' ? 'joins' : undefined;
    if (kind) {
      if (bucket[kind] >= rateLimits[kind]) throw new Error(`Too many ${event} requests. Try again in ${retry} seconds.`);
      bucket[kind]++;
    }
  }
  const stopSweep = (options.schedule ?? ((run, intervalMs) => {
    const timer = setInterval(run, intervalMs); timer.unref(); return () => clearInterval(timer);
  }))(sweep, Math.min(15000, roomLimits.emptyTtlMs));
  function normalize(room: Room) {
    if (room.timer.endsAt !== null) {
      room.timer.remainingMs = Math.max(0, room.timer.endsAt - clock());
      if (room.timer.remainingMs === 0) room.timer.endsAt = null;
    }
  }
  function snapshot(room: Room): RoomState {
    normalize(room);
    const hostId = [...room.people.keys()].find(id => {
      const peer = io.sockets.sockets.get(id);
      return (hosted ? peer?.data.user?.id : id) === room.owner;
    }) ?? null;
    return { code: room.code, participants: [...room.people.values()], timer: { ...room.timer }, serverNow: clock(), hostId, locked: room.locked, maxParticipants: roomLimits.maxParticipants };
  }
  const guards = new Map<string, SessionGuard>();
  const broadcast = (room: Room) => {
    const state = snapshot(room);
    for (const id of room.people.keys()) {
      if (!hosted || guards.get(id)?.canDeliver()) io.sockets.sockets.get(id)?.emit('room:state', state);
    }
  };
  io.on('connection', socket => {
    activeConnections++;
    if (hosted) {
      const guard = createSocketSession(socket.data.token, authConfig!, socket.data.user, () => socket.disconnect(true), {
        onIdleVerified: () => {
          const room = rooms.get(socket.data.code);
          if (room && guard.canDeliver()) socket.emit('room:state', snapshot(room));
        },
      });
      guards.set(socket.id, guard);
      socket.once('disconnect', () => { guard.dispose(); guards.delete(socket.id); });
    }
    socket.on('disconnect', () => { activeConnections = Math.max(0, activeConnections - 1); });
    function rateKey() {
      // Local: keyed by direct transport address. Hosted: per-user key (id, then
      // email) so one account cannot be throttled across multiple sockets.
      return (socket.data.user?.id ?? socket.data.user?.email ?? socket.data.transportAddress) ?? 'unknown';
    }
    // Never trust either the payload or an optional acknowledgement argument.
    function on(event: string, run: (data: Payload) => Room) {
      socket.on(event, async (input: unknown, ack: unknown) => {
        let reply: Reply;
        try {
          sweep();
          throttle(rateKey(), event);
          if (!record(input)) throw new Error('Expected an object payload.');
          if (hosted) {
            await guards.get(socket.id)!.check();
            if (!socket.connected) throw Error('Session expired');
          }
          const room = run(input);
          reply = { ok: true, state: snapshot(room), selfId: socket.id };
          broadcast(room);
        } catch (error) {
          reply = { ok: false, error: error instanceof Error ? error.message : 'Invalid request.' };
        }
        if (typeof ack === 'function') ack(reply);
      });
    }
    function current() {
      const room = rooms.get(socket.data.code);
      if (!room || !room.people.has(socket.id)) throw new Error('Join a room first.');
      return room;
    }
    function isHost(room: Room) { return room.owner === (hosted ? socket.data.user.id : socket.id); }
    function hostRoom() {
      const room = current();
      if (!isHost(room)) throw new Error('Only the room host can manage admission and participants.');
      return room;
    }
    function leave() {
      const room = rooms.get(socket.data.code);
      if (!room) return;
      room.people.delete(socket.id);
      if (room.people.size === 0) room.emptySince = clock();
      socket.leave(room.code);
      socket.data.code = undefined;
      broadcast(room);
    }
    function enter(room: Room, name: string) {
      if (room.locked && !room.people.has(socket.id) && !isHost(room)) throw new Error('This room is locked. Ask the host to unlock admission, then try Join room again.');
      if (!room.people.has(socket.id) && room.people.size >= roomLimits.maxParticipants) throw new Error('This room is full. Try another room.');
      leave();
      room.emptySince = null;
      socket.data.code = room.code;
      room.people.set(socket.id, { id: socket.id, name: name.trim() });
      socket.join(room.code);
      return room;
    }
    on('room:create', data => {
      const name = data.name;
      const nameOk = text(name, 32);
      if (typeof name !== 'string' || !nameOk) {
        throw new Error('Use a name of 1–32 characters, without control characters.');
      }
      if (rooms.size >= roomLimits.maxRooms) throw new Error('Room capacity reached. Wait for an empty room to expire or join an existing room.');
      let code = '';
      for (let attempt = 0; attempt < 16; attempt++) {
        const candidate = randomBytes(3).toString('hex').toUpperCase();
        if (!rooms.has(candidate)) { code = candidate; break; }
      }
      if (!code) throw new Error('Could not allocate a room code. Try again.');
      const room: Room = { code, people: new Map(), emptySince: clock(), owner: hosted ? socket.data.user.id : socket.id, locked: false, timer: { durationMs: 1500000, remainingMs: 1500000, endsAt: null } };
      rooms.set(code, room);
      broadcast(room);
      return enter(room, name);
    });
    on('room:join', data => {
      if (!text(data.name, 32) || typeof data.code !== 'string' || !/^[A-Z0-9]{6}$/.test(data.code)) throw new Error('Enter a name and a six-character room code.');
      const room = rooms.get(data.code);
      if (!room) throw new Error('Room not found. Check the code or create a room.');
      return enter(room, data.name);
    });
    on('room:lock', data => {
      const room = hostRoom();
      if (typeof data.locked !== 'boolean') throw new Error('Admission lock must be true or false.');
      room.locked = data.locked;
      return room;
    });
    on('room:remove', data => {
      const room = hostRoom();
      if (typeof data.participantId !== 'string' || data.participantId.length > 64 || !room.people.has(data.participantId)) throw new Error('Choose a current participant to remove.');
      const target = io.sockets.sockets.get(data.participantId);
      if (!target || (hosted ? target.data.user.id : target.id) === room.owner) throw new Error('The host cannot remove their own presence. Use Solo to leave.');
      room.people.delete(target.id);
      target.data.code = undefined;
      target.leave(room.code);
      target.emit('room:removed', { code: room.code, error: 'The host removed you from this room. Your private draft is unchanged. Join again only when invited; removal is not a ban.' });
      return room;
    });
    on('timer:control', data => {
      const room = current();
      if (!['start', 'pause', 'reset'].includes(data.action as string)) throw new Error('Unknown timer action.');
      if (data.durationMinutes !== undefined && (data.action !== 'start' || typeof data.durationMinutes !== 'number' || !Number.isInteger(data.durationMinutes) || data.durationMinutes < 1 || data.durationMinutes > 180)) throw new Error('Duration must be a whole number from 1 to 180 minutes, on start only.');
      const timer = room.timer;
      normalize(room);
      const now = clock();
      if (data.action === 'start') {
        if (data.durationMinutes !== undefined) {
          if (timer.endsAt !== null || timer.remainingMs !== timer.durationMs) throw new Error('Reset the in-progress cycle before changing its duration.');
          timer.durationMs = (data.durationMinutes as number) * 60000;
          timer.remainingMs = timer.durationMs;
          timer.endsAt = null;
        }
        if (timer.endsAt === null && timer.remainingMs > 0) timer.endsAt = now + timer.remainingMs;
      } else if (data.action === 'pause') {
        if (timer.endsAt !== null) timer.remainingMs = Math.max(0, timer.endsAt - now);
        timer.endsAt = null;
      } else {
        timer.endsAt = null;
        timer.remainingMs = timer.durationMs;
      }
      return room;
    });
    on('intention:share', data => {
      const room = current();
      if (!text(data.text, 240)) throw new Error('Intention must be 1–240 characters, without control characters.');
      room.people.get(socket.id)!.intention = data.text.trim();
      return room;
    });
    on('intention:withdraw', () => {
      const room = current();
      delete room.people.get(socket.id)!.intention;
      return room;
    });
    socket.on('disconnect', leave);
  });
  return {
    http,
    listen: (port: number) => new Promise<string>((resolve, reject) => {
      http.once('error', reject);
      http.listen(port, hosted ? '0.0.0.0' : '127.0.0.1', () => { http.off('error', reject); resolve(`http://127.0.0.1:${(http.address() as { port: number }).port}`); });
    }),
    close: () => new Promise<void>(resolve => { stopSweep(); for (const guard of guards.values()) guard.dispose(); guards.clear(); music.close(); inference.close(); http.closeAllConnections(); io.close(() => { rooms.clear(); attempts.clear(); resolve(); }); }),
  };
}
