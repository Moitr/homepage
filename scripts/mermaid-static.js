'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { compactLinearFlowchart, replaceMermaidFences } = require('../tools/lib/mermaid-static');

const BROWSER_PATHS = [
  process.env.BROWSER_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const MERMAID_SCRIPT = path.join(path.dirname(require.resolve('mermaid')), 'mermaid.min.js');
const THEMES = {
  light: {
    background: '#f5f6f8',
    primaryColor: '#ffffff',
    primaryTextColor: '#202328',
    primaryBorderColor: '#d7dbe1',
    lineColor: '#737982',
    secondaryColor: '#f5f6f8',
    tertiaryColor: '#ffffff',
    clusterBkg: '#f5f6f8',
    clusterBorder: '#d7dbe1',
    edgeLabelBackground: '#f5f6f8',
    fontSize: '15px'
  },
  dark: {
    background: '#1b1e23',
    primaryColor: '#24282f',
    primaryTextColor: '#e5e7eb',
    primaryBorderColor: '#454b55',
    lineColor: '#a1a7b0',
    secondaryColor: '#20242a',
    tertiaryColor: '#24282f',
    clusterBkg: '#20242a',
    clusterBorder: '#454b55',
    edgeLabelBackground: '#20242a',
    fontSize: '15px'
  }
};

let browserPromise;
let pagePromise;
let renderQueue = Promise.resolve();

function browserExecutable() {
  const executable = BROWSER_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error('No Chromium browser was found for static Mermaid rendering. Set BROWSER_PATH.');
  }
  return executable;
}

async function renderPage() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      executablePath: browserExecutable(),
      headless: true,
      args: ['--disable-dev-shm-usage']
    });
  }
  if (!pagePromise) {
    pagePromise = browserPromise.then(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      await page.setContent('<!doctype html><html><body></body></html>');
      await page.addScriptTag({ path: MERMAID_SCRIPT });
      return page;
    });
  }
  return pagePromise;
}

async function renderTheme(page, source, id, themeVariables) {
  return page.evaluate(async ({ diagramSource, diagramId, variables }) => {
    document.body.innerHTML = '<main id="mermaid-render-root"></main>';
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'Inter, Arial, sans-serif',
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true
      },
      themeVariables: variables
    });
    const result = await window.mermaid.render(
      diagramId,
      diagramSource,
      document.getElementById('mermaid-render-root')
    );
    return result.svg;
  }, {
    diagramSource: source,
    diagramId: id,
    variables: themeVariables
  });
}

function svgAspectRatio(svg) {
  const match = String(svg).match(/viewBox="(?:[-\d.]+[ ,]+){2}([\d.]+)[ ,]+([\d.]+)"/i);
  if (!match) return 1;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : 1;
}

function compactWideFlowchart(source) {
  return compactLinearFlowchart(source) || String(source).replace(
    /^(\s*(?:flowchart|graph)\s+)(?:LR|RL)\b/im,
    '$1TD'
  );
}

function diagramLayout(svg) {
  const ratio = svgAspectRatio(svg);
  if (ratio < 0.78) return 'tall';
  if (ratio > 2.8) return 'wide';
  return 'balanced';
}

function renderDiagram(source, identity) {
  const task = renderQueue.then(async () => {
    const page = await renderPage();
    let renderedSource = source;
    let lightSvg = await renderTheme(page, renderedSource, `mermaid-${identity.hash}-${identity.index}-light`, THEMES.light);
    if (svgAspectRatio(lightSvg) > 4) {
      const compactSource = compactWideFlowchart(source);
      if (compactSource !== source) {
        renderedSource = compactSource;
        lightSvg = await renderTheme(page, renderedSource, `mermaid-${identity.hash}-${identity.index}-compact-light`, THEMES.light);
      }
    }
    const darkSvg = await renderTheme(page, renderedSource, `mermaid-${identity.hash}-${identity.index}-dark`, THEMES.dark);
    return { lightSvg, darkSvg, layout: diagramLayout(lightSvg) };
  });
  renderQueue = task.catch(() => {});
  return task;
}

async function closeRenderer() {
  await renderQueue;
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
  }
  browserPromise = null;
  pagePromise = null;
  renderQueue = Promise.resolve();
}

hexo.extend.filter.register('before_post_render', async (data) => {
  if (!/^[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*mermaid\b/im.test(data.content || '')) return data;
  try {
    data.content = await replaceMermaidFences(data.content, renderDiagram);
    return data;
  } catch (error) {
    await closeRenderer().catch(() => {});
    const source = data.source || data.path || data.title || 'unknown post';
    throw new Error(`Unable to render Mermaid in ${source}: ${error.message}`);
  }
}, 0);

hexo.extend.filter.register('after_generate', closeRenderer, 100);
