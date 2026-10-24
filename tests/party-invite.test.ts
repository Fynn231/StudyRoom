import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteCode, roomInvite, loopbackInvite } from '../src/invite.js';

test('invite parsing never silently normalizes encoded, duplicate or malformed routing tokens', () => {
  for (const query of ['room=ab12cd', 'room=AB12CD&room=AB12CD', 'room=AB12CD&%72oom=EF34GH', 'room=%41B12CD', '%72oom=AB12CD', 'room=AB12CD+', 'room=AB12CD%00', 'room=', 'room=AB12C', 'room=AB12CD7']) {
    assert.equal(inviteCode(new URL(`https://study.example/?${query}`)), null, query);
  }
  assert.equal(inviteCode(new URL('https://study.example/?room=AB12CD&code=auth-callback')), 'AB12CD');
  assert.equal(roomInvite('AB12CD', 'https://study.example'), 'https://study.example/?room=AB12CD');
  assert.equal(loopbackInvite('127.0.0.1'), true);
  assert.equal(loopbackInvite('study.example'), false);
  assert.throws(() => roomInvite('ab12cd', 'https://study.example'));
});
