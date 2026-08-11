'use strict';

const { load } = require('cheerio');

function externalUrl(value, siteUrl) {
  try {
    const site = new URL(siteUrl);
    const resource = new URL(value, site);
    return (resource.protocol === 'http:' || resource.protocol === 'https:') && resource.origin !== site.origin;
  } catch (error) {
    return false;
  }
}

function deferExternalImages(html, siteUrl) {
  if (typeof html !== 'string' || !html.includes('<img')) return html;
  const $ = load(html, { decodeEntities: false });

  $('img[src]').each((index, element) => {
    const image = $(element);
    const source = String(image.attr('src') || '').trim();
    if (!source || !externalUrl(source, siteUrl)) return;

    image.attr('data-deferred-src', source);
    image.removeAttr('src');
    const sourceSet = image.attr('srcset');
    if (sourceSet) {
      image.attr('data-deferred-srcset', sourceSet);
      image.removeAttr('srcset');
    }
    image.attr('loading', 'lazy');
    image.attr('decoding', 'async');
    image.attr('fetchpriority', 'low');
    image.attr('data-deferred-image', '');
    image.addClass('deferred-image');

    const friendAvatar = image.parent('.friend-avatar');
    if (friendAvatar.length) {
      friendAvatar.addClass('deferred-image-shell');
      friendAvatar.attr('data-deferred-image-shell', '');
      return;
    }

    image.wrap('<span class="deferred-image-shell" data-deferred-image-shell></span>');
  });

  return $.html();
}

module.exports = {
  deferExternalImages,
  externalUrl
};
