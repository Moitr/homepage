'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageEntry = require.resolve('swup');
const swupBundle = path.join(path.dirname(packageEntry), 'Swup.umd.js');

hexo.extend.generator.register('swup-assets', () => [{
  path: 'js/vendor/swup/swup.umd.js',
  data: () => fs.readFileSync(swupBundle, 'utf8')
}]);
