'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shuffledCopy, shuffledForBuild } = require('../tools/lib/friend-links-page');

test('page shuffle changes display order without mutating canonical friend links', () => {
  const links = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  const original = links.slice();
  const randomValues = [0, 0, 0];
  const shuffled = shuffledCopy(links, () => randomValues.shift());

  assert.deepEqual(links, original);
  assert.notDeepEqual(shuffled, original);
  assert.deepEqual(shuffled.map((link) => link.id).sort(), original.map((link) => link.id));
});

test('consecutive builds visibly rotate the first friend link', () => {
  const links = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const firstBuild = shuffledForBuild(links, '100');
  const nextBuild = shuffledForBuild(links, '101');

  assert.notEqual(firstBuild[0].id, nextBuild[0].id);
  assert.deepEqual(firstBuild.map((link) => link.id).sort(), ['1', '2', '3']);
  assert.deepEqual(nextBuild.map((link) => link.id).sort(), ['1', '2', '3']);
  assert.deepEqual(shuffledForBuild(links, '101'), nextBuild);
});
