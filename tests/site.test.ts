import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudyServer } from '../server/app.js';
import { siteHandler } from '../server/site.js';

test('built local site serves HTML and local assets without traversal', async t => {
  const app = createStudyServer(siteHandler);
  const url = await app.listen(0);
  t.after(() => app.close());
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  const html = await response.text();
  assert.match(html, /<title>Study Room/);
  const src = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(src, 'built browser JavaScript is referenced');
  const asset = await fetch(url + src);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') ?? '', /javascript/);
  const traversal = await fetch(url + '/%2e%2e%2fpackage.json');
  assert.equal(traversal.status, 404);
  const missing = await fetch(url + '/missing.js');
  assert.equal(missing.status, 404);
});
