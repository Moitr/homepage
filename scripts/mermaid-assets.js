'use strict';

const fs = require('node:fs');
const path = require('node:path');

const mermaidDist = path.dirname(require.resolve('mermaid'));
const mermaidEntry = path.join(mermaidDist, 'mermaid.esm.min.mjs');
const mermaidChunks = path.join(mermaidDist, 'chunks', 'mermaid.esm.min');

function asset(source, destination) {
  return {
    path: destination,
    data: () => fs.createReadStream(source)
  };
}

hexo.extend.generator.register('mermaid-assets', (locals) => {
  const hasMermaid = locals.posts.toArray().some((post) => (
    /<code class="[^"]*\bmermaid\b/.test(post.content || '')
  ));
  if (!hasMermaid) return [];

  const routes = [asset(mermaidEntry, 'js/vendor/mermaid/mermaid.esm.min.mjs')];
  for (const file of fs.readdirSync(mermaidChunks)) {
    if (!file.endsWith('.mjs')) continue;
    routes.push(asset(
      path.join(mermaidChunks, file),
      `js/vendor/mermaid/chunks/mermaid.esm.min/${file}`
    ));
  }
  return routes;
});
