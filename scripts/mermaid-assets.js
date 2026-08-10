'use strict';

const fs = require('node:fs');
const path = require('node:path');

const mermaidDist = path.dirname(require.resolve('mermaid'));
const mermaidEntry = path.join(mermaidDist, 'mermaid.esm.min.mjs');
const mermaidChunks = path.join(mermaidDist, 'chunks', 'mermaid.esm.min');

function javascriptAsset(source, destination) {
  return {
    path: destination,
    data: () => fs.readFileSync(source, 'utf8').replaceAll('.mjs', '.js')
  };
}

hexo.extend.generator.register('mermaid-assets', (locals) => {
  const hasMermaid = locals.posts.toArray().some((post) => (
    /<code class="[^"]*\bmermaid\b/.test(post.content || '')
  ));
  if (!hasMermaid) return [];

  const routes = [javascriptAsset(mermaidEntry, 'js/vendor/mermaid/mermaid.esm.min.js')];
  for (const file of fs.readdirSync(mermaidChunks)) {
    if (!file.endsWith('.mjs')) continue;
    routes.push(javascriptAsset(
      path.join(mermaidChunks, file),
      `js/vendor/mermaid/chunks/mermaid.esm.min/${file.replace(/\.mjs$/, '.js')}`
    ));
  }
  return routes;
});
