(function () {
  var root = document.documentElement;
  var themeButtons = document.querySelectorAll('[data-theme-toggle]');
  var menuButton = document.querySelector('[data-menu-toggle]');
  var mobileMenu = document.getElementById('mobile-menu');
  var searchInput = document.querySelector('[data-post-search]');
  var typingGreeting = document.querySelector('[data-typing-greeting]');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pageCleanups = [];

  function registerPageCleanup(cleanup) {
    pageCleanups.push(cleanup);
  }

  window.sitePageCleanup = function () {
    pageCleanups.splice(0).forEach(function (cleanup) { cleanup(); });
    window.sitePageCleanup = null;
  };

  function restorePageVisibility() {
    root.classList.remove('is-leaving');
  }

  window.addEventListener('pageshow', function (event) {
    var navigationEntry = window.performance && window.performance.getEntriesByType
      ? window.performance.getEntriesByType('navigation')[0]
      : null;

    restorePageVisibility();
    root.classList.toggle('is-history-return', Boolean(
      event.persisted || (navigationEntry && navigationEntry.type === 'back_forward')
    ));
  });

  window.addEventListener('pagehide', function () {
    restorePageVisibility();
    root.classList.add('is-history-return');
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) restorePageVisibility();
  });

  function updateThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', root.classList.contains('dark') ? '#090a0b' : '#ffffff');
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
    var greetingTimer;
    var greetingStopped = false;

    try {
      phrases = JSON.parse(typingGreeting.dataset.phrases || '[]');
    } catch (error) {
      phrases = [];
    }

    function greetingIsVisible() {
      var heading = typingGreeting.closest('h1');
      if (!heading) return false;
      var rect = heading.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= window.innerHeight;
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
    function resizeGreeting() {
      if (!greetingIsVisible()) return;
      fitMobileGreeting(phrases[phraseIndex] || phrases[0]);
    }
    window.addEventListener('resize', resizeGreeting);
    registerPageCleanup(function () {
      greetingStopped = true;
      window.clearTimeout(greetingTimer);
      window.removeEventListener('resize', resizeGreeting);
    });

    if (!reducedMotion && phrases.length > 1) {
      var phraseIndex = 0;
      var characters = Array.from(phrases[phraseIndex]);
      var characterIndex = characters.length;
      var deleting = true;

      function scheduleGreeting(delay) {
        greetingTimer = window.setTimeout(typeNextCharacter, delay);
      }

      function typeNextCharacter() {
        if (greetingStopped) return;
        if (!greetingIsVisible()) {
          scheduleGreeting(400);
          return;
        }

        characters = Array.from(phrases[phraseIndex]);

        if (deleting) {
          characterIndex -= 1;
          typingGreeting.textContent = characters.slice(0, characterIndex).join('');

          if (characterIndex === 0) {
            deleting = false;
            phraseIndex = (phraseIndex + 1) % phrases.length;
            fitMobileGreeting(phrases[phraseIndex]);
            scheduleGreeting(320);
            return;
          }

          scheduleGreeting(42);
          return;
        }

        characters = Array.from(phrases[phraseIndex]);
        characterIndex += 1;
        typingGreeting.textContent = characters.slice(0, characterIndex).join('');

        if (characterIndex === characters.length) {
          deleting = true;
          scheduleGreeting(1800);
          return;
        }

        scheduleGreeting(88);
      }

      scheduleGreeting(1800);
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

  var deferredImages = Array.prototype.slice.call(document.querySelectorAll('[data-deferred-image]'));
  if (deferredImages.length) {
    function loadDeferredImage(image) {
      if (image.dataset.deferredState) return;
      var shell = image.closest('[data-deferred-image-shell]');
      image.dataset.deferredState = 'loading';
      image.hidden = false;
      if (shell) {
        shell.classList.add('is-loading');
        shell.setAttribute('aria-busy', 'true');
      }

      function finishLoadedImage() {
        if (image.dataset.deferredState !== 'loading') return;
        image.dataset.deferredState = 'decoding';

        function revealImage() {
          if (image.dataset.deferredState !== 'decoding') return;
          image.dataset.deferredState = 'loaded';
          if (shell) {
            shell.classList.remove('is-loading');
            shell.classList.add('is-loaded');
            shell.setAttribute('aria-busy', 'false');
          }
        }

        if (image.decode) image.decode().catch(function () {}).then(revealImage);
        else revealImage();
      }

      function finishFailedImage() {
        if (image.dataset.deferredState === 'loaded' || image.dataset.deferredState === 'error') return;
        image.dataset.deferredState = 'error';
        image.hidden = true;
        if (shell) {
          shell.classList.remove('is-loading');
          shell.classList.add('is-error');
          shell.setAttribute('aria-busy', 'false');
        }
      }

      image.addEventListener('load', finishLoadedImage, { once: true });
      image.addEventListener('error', finishFailedImage, { once: true });
      if (image.dataset.deferredSrcset) image.srcset = image.dataset.deferredSrcset;
      image.src = image.dataset.deferredSrc;

      if (image.complete) {
        if (image.naturalWidth > 0) finishLoadedImage();
        else finishFailedImage();
      }
    }

    function startDeferredImages() {
      if (!('IntersectionObserver' in window)) {
        deferredImages.forEach(loadDeferredImage);
        return;
      }

      var imageObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          imageObserver.unobserve(entry.target);
          loadDeferredImage(entry.target);
        });
      }, { rootMargin: '360px 0px' });
      deferredImages.forEach(function (image) { imageObserver.observe(image); });
      registerPageCleanup(function () { imageObserver.disconnect(); });
    }

    function queueDeferredImages() {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(startDeferredImages, { timeout: 700 });
      } else {
        window.setTimeout(startDeferredImages, 0);
      }
    }

    if (document.readyState === 'complete') queueDeferredImages();
    else window.addEventListener('load', queueDeferredImages, { once: true });
  }

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
    var latestBlockStopped = false;
    var firstBlockRequest = true;
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
      if (latestBlockStopped) return;
      window.clearTimeout(latestBlockTimer);
      latestBlockTimer = window.setTimeout(refreshLatestBlock, delay);
    }

    function refreshLatestBlock() {
      if (latestBlockStopped) return;
      if (document.hidden) {
        scheduleLatestBlock(4000);
        return;
      }

      latestBlockRequest = new AbortController();
      if (firstBlockRequest && liveWrapper) liveWrapper.classList.add('is-block-loading');
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
        if (firstBlockRequest && liveWrapper) liveWrapper.classList.remove('is-block-loading');
        firstBlockRequest = false;
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
    registerPageCleanup(function () {
      latestBlockStopped = true;
      window.clearTimeout(latestBlockTimer);
      if (latestBlockRequest) latestBlockRequest.abort();
    });
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
      registerPageCleanup(function () { headingObserver.disconnect(); });
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

}());

if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', function () {
    var register = function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); };
    if ('requestIdleCallback' in window) window.requestIdleCallback(register, { timeout: 5000 });
    else window.setTimeout(register, 1500);
  }, { once: true });
}
