'use strict';

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMasonry(content) {
  const images = [];
  const leftovers = [];
  for (const line of content.split('\n')) {
    const match = line.trim().match(/^!\[([^\]]*)\]\((\S+?)(?:\s+["'].*["'])?\)$/);
    if (!match) {
      if (line.trim()) leftovers.push(line);
      continue;
    }
    images.push(`<img src="${escapeAttribute(match[2])}" alt="${escapeAttribute(match[1])}">`);
  }
  if (!images.length) return content;

  const gallery = `<div class="article-gallery">\n${images.join('\n')}\n</div>`;
  return leftovers.length ? `${gallery}\n\n${leftovers.join('\n')}` : gallery;
}

function renderCallout(content) {
  return content.split('\n').map((line) => line ? `> ${line}` : '>').join('\n');
}

function renderCoreMarkdown(markdown) {
  return String(markdown || '').replace(
    /^:::\s*([a-z][\w-]*)(?:\s+\{[^\n]*\})?\s*\n([\s\S]*?)^:::\s*$/gim,
    (block, type, content) => {
      if (type.toLowerCase() === 'masonry') return renderMasonry(content.trim());
      if (type.toLowerCase() === 'success') return renderCallout(content.trim());
      return block;
    }
  );
}

module.exports = {
  renderCoreMarkdown,
  renderMasonry
};
