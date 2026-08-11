'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FRIEND_LINKS_ENDPOINT,
  compileFriendLinksArchive,
  deterministicFriendLinksContract,
  friendLinksPayload,
  normalizeFriendLinks
} = require('../tools/lib/friend-links-onchain');

const approved = {
  id: '150157413511598080',
  name: ' 星灯 ',
  url: 'https://eruchitand.top',
  avatar: 'https://oss.moitr.ren/img/friends/eruchitand.top.jpg',
  description: ' 传颂之物 ',
  type: 0,
  state: 0,
  email: null,
  hide: false,
  created_at: '2026-06-20T08:31:57.171Z'
};

test('friend links include only approved public entries in stable order', () => {
  const response = { data: [
    { ...approved, id: '20', name: 'Second' },
    { ...approved, id: '3', name: 'First', type: '0', state: '0' },
    { ...approved, id: '4', state: 1 },
    { ...approved, id: '5', type: 1 },
    { ...approved, id: '6', hide: true }
  ] };
  const links = normalizeFriendLinks(response);

  assert.deepEqual(links.map((link) => link.id), ['3', '20']);
  assert.equal(links[0].url, 'https://eruchitand.top/');
  assert.equal(links[0].hide, false);
  assert.equal(links[0].created_at, '2026-06-20T08:31:57.171Z');
});

test('friend links payload is deterministic and preserves the public API fields', () => {
  const first = friendLinksPayload({ data: [approved, { ...approved, id: '2', name: 'Another' }] });
  const second = friendLinksPayload({ data: [{ ...approved, id: '2', name: 'Another' }, approved] });
  const parsed = JSON.parse(first.json);

  assert.equal(first.json, second.json);
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(parsed.source, FRIEND_LINKS_ENDPOINT);
  assert.deepEqual(Object.keys(parsed.data[0]), [
    'id', 'name', 'url', 'avatar', 'description', 'type', 'state', 'email', 'hide', 'created_at'
  ]);
  assert.match(first.contentHash, /^0x[0-9a-f]{64}$/);
});

test('friend links contract compiles with a stable deterministic address', () => {
  const compiled = compileFriendLinksArchive();
  const owner = '0x0000000000000000000000000000000000001234';
  const first = deterministicFriendLinksContract(owner, compiled.bytecode);
  const second = deterministicFriendLinksContract(owner, compiled.bytecode);
  const functions = compiled.abi.filter((item) => item.type === 'function').map((item) => item.name);

  assert.equal(first.address, second.address);
  assert.match(compiled.bytecode, /^0x[0-9a-f]+$/i);
  assert.ok(functions.includes('publish'));
  assert.ok(functions.includes('data'));
});
