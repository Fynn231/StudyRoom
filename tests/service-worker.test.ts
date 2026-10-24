import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const stores = new Map<string, Map<string, any>>();
  let response: any = { ok: true, status: 200, type: 'basic', redirected: false, headers: new Headers({ 'content-type': 'text/html' }) };
  response.clone = () => response;
  let offline = false;
  let typedPublicResponses = false;
  const key = (r: any) => typeof r === 'string' ? r : new URL(r.url).pathname;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return { match: async (r: any) => store.get(key(r)), put: async (r: any, v: any) => { store.set(key(r), v); }, addAll: async () => {} };
    },
    match: async (r: any) => [...stores.values()].map(s => s.get(key(r))).find(Boolean),
  };
  runInNewContext(readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://study.example' }, addEventListener: (n: string, f: any) => listeners[n] = f, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, URL, fetch: async (request: any) => {
      if (offline) throw new Error('Offline');
      if (!typedPublicResponses) return response;
      const path = typeof request === 'string' ? request : new URL(request.url).pathname;
      const mime = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.png') ? 'image/png' : path.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html';
      const result = { ...response, headers: new Headers({ 'content-type': mime }), clone: (): any => result };
      return result;
    },
  });
  return {
    stores,
    response: (values: any) => { response = { ...response, ...values }; response.clone = () => response; },
    offline: () => { offline = true; },
    publicResponses: () => { typedPublicResponses = true; },
    async lifecycle(name: string) { let done: any; listeners[name]({ waitUntil: (p: any) => done = p }); await done; },
    async fetch(path: string, mode = 'navigate', extra: any = {}) {
      let answer: any; const pending: Promise<unknown>[] = [];
      listeners.fetch({ request: { url: new URL(path, 'https://study.example').href, method: 'GET', mode, ...extra }, respondWith: (p: any) => answer = p, waitUntil: (p: any) => pending.push(p) });
      const result = await answer; await Promise.all(pending); await new Promise(r => setImmediate(r)); return result;
    },
  };
}

test('freshly installed shell and all exact emitted assets work offline without an earlier runtime visit', async () => {
  const w = worker(); w.publicResponses();
  await w.lifecycle('install'); await w.lifecycle('activate'); w.offline();
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const paths = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)].map(m => m[1]);
  for (const path of ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', ...paths]) {
    assert.ok(await w.fetch(path, path.endsWith('.html') || path === '/' ? 'navigate' : 'cors'), path);
  }
});

test('worker only intercepts exact public shell/static paths without query or private navigation', async () => {
  const w = worker();
  for (const path of ['/private', '/login', '/api/me', '/socket.io/', '/unknown.js', '/assets/private.json', '/?code=PRIVATE', '/index.html?session=PRIVATE', 'https://other.example/']) {
    assert.equal(await w.fetch(path), undefined, path);
  }
  assert.ok(await w.fetch('/'));
  assert.ok([...w.stores.values()].some(s => s.has('/index.html')));
});

test('worker never stores errors redirects or wrong-content responses, including install', async () => {
  for (const invalid of [ { ok: false, status: 404 }, { ok: false, status: 500 }, { redirected: true }, { status: 302, ok: false }, { type: 'opaque' }, { headers: new Headers({ 'content-type': 'application/json' }) } ]) {
    const w = worker(); w.response(invalid);
    await w.fetch('/');
    assert.equal([...w.stores.values()].some(s => s.size), false, JSON.stringify(invalid));
    await assert.rejects(w.lifecycle('install'));
    assert.equal([...w.stores.values()].some(s => s.size), false);
  }
});

test('activation removes only obsolete owned cache versions and offline fallback stays shell-only', async () => {
  const w = worker();
  for (const name of ['unrelated-app', 'studyroom-v1-shell', 'studyroom-v1-assets', 'studyroom-v1-other', 'studyroom-v20-shell-extra']) w.stores.set(name, new Map());
  await w.lifecycle('activate');
  assert.equal(w.stores.has('unrelated-app'), true);
  assert.equal(w.stores.has('studyroom-v1-other'), true);
  assert.equal(w.stores.has('studyroom-v20-shell-extra'), true);
  assert.equal(w.stores.has('studyroom-v1-shell'), false);
  assert.equal(w.stores.has('studyroom-v1-assets'), false);
  await w.fetch('/'); w.offline();
  assert.ok(await w.fetch('/index.html'));
  assert.equal(await w.fetch('/private'), undefined);
});

test('built worker allowlists the actual emitted JavaScript and CSS, validates their content types', async () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const paths = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)].map(m => m[1]);
  assert.ok(paths.length >= 2);
  for (const path of paths) {
    const w = worker();
    await w.fetch(path, 'cors');
    assert.equal([...w.stores.values()].some(s => s.has(path)), false);
    w.response({ headers: new Headers({ 'content-type': path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css' }) });
    assert.ok(await w.fetch(path, 'cors'));
    assert.equal([...w.stores.values()].some(s => s.has(path)), true);
  }
});
