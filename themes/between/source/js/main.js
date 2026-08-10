(function () {
  var root = document.documentElement;
  var themeButtons = document.querySelectorAll('[data-theme-toggle]');
  var menuButton = document.querySelector('[data-menu-toggle]');
  var mobileMenu = document.getElementById('mobile-menu');
  var searchInput = document.querySelector('[data-post-search]');
  var typingGreeting = document.querySelector('[data-typing-greeting]');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.addEventListener('pageshow', function () {
    root.classList.remove('is-leaving');
  });

  function updateThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var isDark = root.classList.contains('dark');
    var highlightLight = document.getElementById('highlight-light-theme');
    var highlightDark = document.getElementById('highlight-dark-theme');
    if (meta) meta.setAttribute('content', root.classList.contains('dark') ? '#090a0b' : '#ffffff');
    if (highlightLight) highlightLight.media = isDark ? 'not all' : 'all';
    if (highlightDark) highlightDark.media = isDark ? 'all' : 'not all';
  }

  themeButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var isDark = root.classList.toggle('dark');
      localStorage.setItem('color-theme', isDark ? 'dark' : 'light');
      updateThemeColor();
    });
  });

  updateThemeColor();

  if (typingGreeting) {
    var phrases = [];

    try {
      phrases = JSON.parse(typingGreeting.dataset.phrases || '[]');
    } catch (error) {
      phrases = [];
    }

    function fitMobileGreeting(phrase) {
      var heading = typingGreeting.closest('h1');
      if (!heading) return;

      heading.style.removeProperty('font-size');
      if (window.innerWidth > 767 || !phrases.length) return;

      var originalText = typingGreeting.textContent;
      var fontSize = parseFloat(window.getComputedStyle(heading).fontSize);
      var availableWidth = heading.clientWidth;
      typingGreeting.textContent = phrase || originalText;

      while (fontSize > 24 && heading.scrollWidth > availableWidth) {
        fontSize -= 1;
        heading.style.fontSize = fontSize + 'px';
      }

      typingGreeting.textContent = originalText;
    }

    fitMobileGreeting();
    window.addEventListener('resize', function () {
      fitMobileGreeting(phrases[phraseIndex] || phrases[0]);
    });

    if (!reducedMotion && phrases.length > 1) {
      var phraseIndex = 0;
      var characters = Array.from(phrases[phraseIndex]);
      var characterIndex = characters.length;
      var deleting = true;

      function typeNextCharacter() {
        characters = Array.from(phrases[phraseIndex]);

        if (deleting) {
          characterIndex -= 1;
          typingGreeting.textContent = characters.slice(0, characterIndex).join('');

          if (characterIndex === 0) {
            deleting = false;
            phraseIndex = (phraseIndex + 1) % phrases.length;
            fitMobileGreeting(phrases[phraseIndex]);
            window.setTimeout(typeNextCharacter, 320);
            return;
          }

          window.setTimeout(typeNextCharacter, 42);
          return;
        }

        characters = Array.from(phrases[phraseIndex]);
        characterIndex += 1;
        typingGreeting.textContent = characters.slice(0, characterIndex).join('');

        if (characterIndex === characters.length) {
          deleting = true;
          window.setTimeout(typeNextCharacter, 1800);
          return;
        }

        window.setTimeout(typeNextCharacter, 88);
      }

      window.setTimeout(typeNextCharacter, 1800);
    }
  }

  if (menuButton && mobileMenu) {
    var menuCloseTimer;

    function finishMenuClose() {
      mobileMenu.hidden = true;
      mobileMenu.setAttribute('aria-hidden', 'true');
      root.classList.remove('menu-open');
    }

    function closeMenu(immediate) {
      window.clearTimeout(menuCloseTimer);
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open navigation');
      mobileMenu.classList.remove('is-open');

      if (immediate) finishMenuClose();
      else menuCloseTimer = window.setTimeout(finishMenuClose, 260);
    }

    function openMenu() {
      window.clearTimeout(menuCloseTimer);
      mobileMenu.hidden = false;
      mobileMenu.setAttribute('aria-hidden', 'false');
      menuButton.setAttribute('aria-expanded', 'true');
      menuButton.setAttribute('aria-label', 'Close navigation');
      root.classList.add('menu-open');
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          mobileMenu.classList.add('is-open');
        });
      });
    }

    menuButton.addEventListener('click', function () {
      var expanded = menuButton.getAttribute('aria-expanded') === 'true';
      if (expanded) closeMenu(false);
      else openMenu();
    });

    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        closeMenu(false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') closeMenu(false);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 767 && !mobileMenu.hidden) closeMenu(true);
    });
  }

  document.querySelectorAll('.article-content > pre > code').forEach(function (code) {
    var block = code.parentElement;
    var copyButton = document.createElement('button');
    var copyIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var copiedIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
    copyButton.className = 'code-copy';
    copyButton.type = 'button';
    copyButton.innerHTML = copyIcon;
    copyButton.setAttribute('aria-label', 'Copy code');
    copyButton.setAttribute('title', 'Copy code');

    copyButton.addEventListener('click', function () {
      var copyAction;

      if (navigator.clipboard) {
        copyAction = navigator.clipboard.writeText(code.textContent);
      } else {
        var textarea = document.createElement('textarea');
        textarea.value = code.textContent;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copyAction = document.execCommand('copy')
          ? Promise.resolve()
          : Promise.reject(new Error('Copy failed'));
        textarea.remove();
      }

      Promise.resolve(copyAction).then(function () {
        copyButton.innerHTML = copiedIcon;
        copyButton.classList.add('is-copied');
        copyButton.setAttribute('aria-label', 'Code copied');
        copyButton.setAttribute('title', 'Code copied');
        window.setTimeout(function () {
          copyButton.innerHTML = copyIcon;
          copyButton.classList.remove('is-copied');
          copyButton.setAttribute('aria-label', 'Copy code');
          copyButton.setAttribute('title', 'Copy code');
        }, 1200);
      }).catch(function () {});
    });

    block.appendChild(copyButton);
  });

  document.querySelectorAll('[data-share]').forEach(function (button) {
    button.addEventListener('click', function () {
      var shareData = { title: document.title, url: window.location.href };
      var shareAction;

      if (navigator.share) shareAction = navigator.share(shareData);
      else if (navigator.clipboard) shareAction = navigator.clipboard.writeText(shareData.url);
      else shareAction = Promise.reject(new Error('Sharing is not supported'));

      Promise.resolve(shareAction).then(function () {
        button.classList.add('is-copied');
        window.setTimeout(function () { button.classList.remove('is-copied'); }, 800);
      }).catch(function () {});
    });
  });

  document.querySelectorAll('[data-onchain-expand]').forEach(function (button) {
    button.addEventListener('click', function () {
      var wrapper = button.closest('.onchain-value-wrap');
      if (!wrapper) return;

      var expanded = wrapper.classList.toggle('is-expanded');
      var field = button.dataset.label || 'address';
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-label', (expanded ? 'Collapse ' : 'Show full ') + field);
      button.setAttribute('title', (expanded ? 'Collapse ' : 'Show full ') + field);
    });
  });

  var latestBlockValue = document.querySelector('[data-latest-block]');
  if (latestBlockValue) {
    var latestBlockTimer;
    var latestBlockRequest;
    var blockNumberElement = latestBlockValue.querySelector('[data-block-number]');
    var blockTicker = latestBlockValue.querySelector('.block-ticker');
    var liveWrapper = latestBlockValue.closest('.onchain-value-wrap');

    function renderLatestBlock(blockNumber) {
      var nextValue = String(blockNumber);
      var currentElement = latestBlockValue.querySelector('[data-block-number]');
      var currentValue = currentElement ? currentElement.textContent.trim() : '';

      if (nextValue === currentValue || !currentElement) return;

      if (reducedMotion) {
        currentElement.textContent = nextValue;
        return;
      }

      var nextElement = document.createElement('span');
      nextElement.dataset.blockNumber = '';
      nextElement.className = 'is-entering';
      nextElement.textContent = nextValue;
      blockTicker.appendChild(nextElement);

      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          currentElement.classList.add('is-leaving');
          nextElement.classList.remove('is-entering');
        });
      });

      window.setTimeout(function () {
        currentElement.remove();
      }, 340);
    }

    function scheduleLatestBlock(delay) {
      window.clearTimeout(latestBlockTimer);
      latestBlockTimer = window.setTimeout(refreshLatestBlock, delay);
    }

    function refreshLatestBlock() {
      if (document.hidden) {
        scheduleLatestBlock(4000);
        return;
      }

      latestBlockRequest = new AbortController();
      var requestTimeout = window.setTimeout(function () {
        latestBlockRequest.abort();
      }, 5000);

      fetch(latestBlockValue.dataset.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal: latestBlockRequest.signal
      }).then(function (response) {
        if (!response.ok) throw new Error('Polygon RPC request failed');
        return response.json();
      }).then(function (payload) {
        if (!payload.result) throw new Error('Polygon RPC returned no block number');
        renderLatestBlock(parseInt(payload.result, 16));
        if (liveWrapper) liveWrapper.classList.add('is-live');
      }).catch(function () {
        if (liveWrapper) liveWrapper.classList.remove('is-live');
      }).finally(function () {
        window.clearTimeout(requestTimeout);
        scheduleLatestBlock(4000);
      });
    }

    function queueLatestBlockRefresh() {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(refreshLatestBlock, { timeout: 1200 });
      } else {
        window.setTimeout(refreshLatestBlock, 0);
      }
    }

    if (blockNumberElement) {
      if (document.readyState === 'complete') queueLatestBlockRefresh();
      else window.addEventListener('load', queueLatestBlockRefresh, { once: true });
    }
  }

  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.article-toc a'));
  if (tocLinks.length) {
    tocLinks[0].classList.add('is-active');

    if ('IntersectionObserver' in window) {
      var tocById = {};
      tocLinks.forEach(function (link) {
        var id = decodeURIComponent(link.hash.slice(1));
        if (id) tocById[id] = link;
      });

      var headingObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || !tocById[entry.target.id]) return;
          tocLinks.forEach(function (link) { link.classList.remove('is-active'); });
          tocById[entry.target.id].classList.add('is-active');
        });
      }, { rootMargin: '-18% 0px -72% 0px' });

      Object.keys(tocById).forEach(function (id) {
        var heading = document.getElementById(id);
        if (heading) headingObserver.observe(heading);
      });
    }
  }

  if (searchInput) {
    var groups = Array.prototype.slice.call(document.querySelectorAll('[data-post-group]'));
    var emptyState = document.querySelector('[data-empty-search]');

    searchInput.addEventListener('input', function () {
      var query = searchInput.value.trim().toLowerCase();
      var visibleCount = 0;

      groups.forEach(function (group) {
        var rows = Array.prototype.slice.call(group.querySelectorAll('[data-search-value]'));
        var groupCount = 0;

        rows.forEach(function (row) {
          var visible = !query || row.dataset.searchValue.indexOf(query) !== -1;
          row.hidden = !visible;
          if (visible) groupCount += 1;
        });

        group.hidden = groupCount === 0;
        visibleCount += groupCount;
      });

      if (emptyState) emptyState.hidden = visibleCount !== 0;
    });
  }

  if (!reducedMotion) {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      if (!link || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target || link.hasAttribute('download')) return;

      var destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (root.classList.contains('is-leaving')) return;

      event.preventDefault();
      root.classList.add('is-leaving');
      window.setTimeout(function () {
        window.location.href = destination.href;
      }, 160);
    });
  }
}());
