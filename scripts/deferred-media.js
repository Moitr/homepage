'use strict';

const { deferExternalImages } = require('../tools/lib/deferred-media');

hexo.extend.filter.register('after_render:html', (html) => (
  deferExternalImages(html, hexo.config.url || 'http://localhost')
), 20);
