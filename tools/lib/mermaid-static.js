'use strict';

const crypto = require('node:crypto');

const MERMAID_FENCE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*mermaid[^\r\n]*\r?\n([\s\S]*?)^[ \t]{0,3}\1[ \t]*$/gim;
const SIMPLE_EDGE = /^\s*([A-Za-z_][\w-]*)(\[[^\n]*\])?\s*(-->)(?:\|([^|]*)\|)?\s*([A-Za-z_][\w-]*)(\[[^\n]*\])?\s*$/;

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function diagramLabel(source) {
  const type = String(source).trim().split(/\s+/)[0].replace(/[^a-z0-9-]/gi, '');
  return type ? `Mermaid ${type} diagram` : 'Mermaid diagram';
}

function staticDiagramMarkup(source, lightSvg, darkSvg, layout = 'balanced') {
  const label = escapeAttribute(diagramLabel(source));
  const layoutClass = /^[-a-z]+$/.test(layout) ? layout : 'balanced';
  return [
    `<figure class="mermaid-diagram mermaid-static mermaid-layout-${layoutClass}" role="img" aria-label="${label}">`,
    `  <div class="mermaid-theme mermaid-theme-light" aria-hidden="true">${lightSvg}</div>`,
    `  <div class="mermaid-theme mermaid-theme-dark" aria-hidden="true">${darkSvg}</div>`,
    '</figure>'
  ].join('\n');
}

function compactLinearFlowchart(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const header = lines.shift();
  const headerMatch = header && header.match(/^\s*(flowchart|graph)\s+(LR|RL)\s*$/i);
  if (!headerMatch) return null;

  const definitions = new Map();
  const edges = [];
  for (const line of lines.filter((value) => value.trim())) {
    const match = line.match(SIMPLE_EDGE);
    if (!match) return null;
    const [, from, fromDefinition, arrow, label, to, toDefinition] = match;
    if (fromDefinition) definitions.set(from, `${from}${fromDefinition}`);
    if (toDefinition) definitions.set(to, `${to}${toDefinition}`);
    edges.push({
      from,
      to,
      connector: `${arrow}${label === undefined ? '' : `|${label}|`}`
    });
  }
  if (edges.length < 3) return null;

  const nodes = [edges[0].from];
  for (const edge of edges) {
    if (edge.from !== nodes[nodes.length - 1]) return null;
    nodes.push(edge.to);
  }

  const direction = headerMatch[2].toUpperCase();
  const groups = [];
  const output = ['flowchart TB'];
  for (let start = 0; start < nodes.length; start += 2) {
    const group = `mermaid_row_${groups.length + 1}`;
    groups.push(group);
    output.push(`subgraph ${group}[" "]`, `direction ${direction}`);
    const first = definitions.get(nodes[start]) || nodes[start];
    if (start + 1 < nodes.length) {
      const second = definitions.get(nodes[start + 1]) || nodes[start + 1];
      output.push(`${first} ${edges[start].connector} ${second}`);
    } else {
      output.push(first);
    }
    output.push('end');
  }

  for (let index = 0; index < groups.length - 1; index += 1) {
    output.push(`${groups[index]} ${edges[(index * 2) + 1].connector} ${groups[index + 1]}`);
  }
  for (const group of groups) {
    output.push(`style ${group} fill:transparent,stroke:transparent`);
  }
  return output.join('\n');
}

async function replaceMermaidFences(markdown, renderDiagram) {
  const sourceText = String(markdown || '');
  const matches = Array.from(sourceText.matchAll(MERMAID_FENCE));
  if (!matches.length) return sourceText;

  let cursor = 0;
  let output = '';
  for (const [index, match] of matches.entries()) {
    const source = match[2].replace(/\r\n?/g, '\n').trim();
    if (!source) throw new Error(`Mermaid diagram ${index + 1} is empty.`);
    const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
    const rendered = await renderDiagram(source, { index, hash });
    if (!rendered || !rendered.lightSvg || !rendered.darkSvg) {
      throw new Error(`Mermaid diagram ${index + 1} did not produce both themes.`);
    }
    output += sourceText.slice(cursor, match.index);
    output += staticDiagramMarkup(source, rendered.lightSvg, rendered.darkSvg, rendered.layout);
    cursor = match.index + match[0].length;
  }
  return output + sourceText.slice(cursor);
}

module.exports = {
  compactLinearFlowchart,
  replaceMermaidFences,
  staticDiagramMarkup
};
