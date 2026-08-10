import mermaid from './vendor/mermaid/mermaid.esm.min.mjs';

const root = document.documentElement;
const codeBlocks = Array.from(document.querySelectorAll('.article-content pre > code.mermaid'));

if (codeBlocks.length) {
  let currentDark = root.classList.contains('dark');
  let rendering = false;
  let rerenderRequested = false;
  const entries = codeBlocks.map((code) => ({
    source: code.textContent.trim(),
    original: code.parentElement,
    figure: null,
    container: null
  }));

  function color(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function initialize() {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: getComputedStyle(document.body).fontFamily,
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true
      },
      themeVariables: {
        background: color('--soft'),
        primaryColor: color('--bg'),
        primaryTextColor: color('--text'),
        primaryBorderColor: color('--line'),
        lineColor: color('--muted'),
        secondaryColor: color('--soft'),
        tertiaryColor: color('--bg'),
        clusterBkg: color('--soft'),
        clusterBorder: color('--line'),
        edgeLabelBackground: color('--soft'),
        fontSize: '15px'
      }
    });
  }

  async function render() {
    if (rendering) {
      rerenderRequested = true;
      return;
    }

    rendering = true;
    initialize();
    for (const entry of entries) {
      entry.container.removeAttribute('data-processed');
      entry.container.textContent = entry.source;
    }

    try {
      await mermaid.run({ nodes: entries.map((entry) => entry.container) });
    } catch (error) {
      for (const entry of entries) {
        if (entry.figure && entry.figure.isConnected) entry.figure.replaceWith(entry.original);
      }
      console.error('Unable to render Mermaid diagram.', error);
    } finally {
      rendering = false;
      if (rerenderRequested) {
        rerenderRequested = false;
        render();
      }
    }
  }

  initialize();
  Promise.all(entries.map((entry) => mermaid.parse(entry.source))).then(() => {
    for (const entry of entries) {
      const figure = document.createElement('figure');
      const container = document.createElement('div');
      figure.className = 'mermaid-diagram';
      container.className = 'mermaid';
      container.textContent = entry.source;
      figure.appendChild(container);
      entry.original.replaceWith(figure);
      entry.figure = figure;
      entry.container = container;
    }

    render();

    new MutationObserver(() => {
      const nextDark = root.classList.contains('dark');
      if (nextDark === currentDark) return;
      currentDark = nextDark;
      render();
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
  }).catch((error) => {
    console.error('Invalid Mermaid diagram.', error);
  });
}
