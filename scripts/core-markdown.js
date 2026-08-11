'use strict';

const { renderCoreMarkdown } = require('../tools/lib/core-markdown');

hexo.extend.filter.register('before_post_render', (data) => {
  if (data.managed) data.content = renderCoreMarkdown(data.content);
  return data;
});
