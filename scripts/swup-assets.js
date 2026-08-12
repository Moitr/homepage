'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageEntry = require.resolve('swup');
const swupBundle = path.join(path.dirname(packageEntry), 'Swup.umd.js');
const themeScripts = [
  swupBundle,
  path.join(hexo.theme_dir, 'source', 'js', 'main.js'),
  path.join(hexo.theme_dir, 'source', 'js', 'pjax.js')
];

hexo.extend.generator.register('swup-assets', () => [{
  path: 'js/app.js',
  data: () => themeScripts.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
}]);

hexo.extend.filter.register('after_generate', () => {
  hexo.route.remove('js/main.js');
  hexo.route.remove('js/pjax.js');
});
