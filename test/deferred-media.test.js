'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('cheerio');
const {
  deferExternalImages,
  externalUrl
} = require('../tools/lib/deferred-media');

test('external URL detection compares resource and site origins', () => {
  assert.equal(externalUrl('https://oss.moitr.ren/image.jpg', 'https://moitr.cc'), true);
  assert.equal(externalUrl('/image.jpg', 'https://moitr.cc'), false);
  assert.equal(externalUrl('https://moitr.cc/image.jpg', 'https://moitr.cc'), false);
  assert.equal(externalUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yw=', 'https://moitr.cc'), false);
});

test('external images are deferred while local images keep their source', () => {
  const html = `<!doctype html><html><body>
    <p><img src="https://oss.moitr.ren/photo.jpg" srcset="https://oss.moitr.ren/photo@2x.jpg 2x" alt="Remote"></p>
    <img src="/images/local.jpg" alt="Local">
    <span class="friend-avatar"><span>X</span><img src="https://example.com/avatar.jpg" alt=""></span>
  </body></html>`;
  const output = deferExternalImages(html, 'https://moitr.cc');
  const $ = load(output);
  const remote = $('img[alt="Remote"]');
  const local = $('img[alt="Local"]');
  const avatar = $('.friend-avatar img');

  assert.equal(remote.attr('src'), undefined);
  assert.equal(remote.attr('data-deferred-src'), 'https://oss.moitr.ren/photo.jpg');
  assert.equal(remote.attr('data-deferred-srcset'), 'https://oss.moitr.ren/photo@2x.jpg 2x');
  assert.equal(remote.parent().is('[data-deferred-image-shell]'), true);
  assert.equal(local.attr('src'), '/images/local.jpg');
  assert.equal(local.attr('data-deferred-src'), undefined);
  assert.equal(avatar.attr('src'), undefined);
  assert.equal(avatar.parent().is('[data-deferred-image-shell]'), true);
  assert.match(output, /^<!DOCTYPE html>/i);
});
