'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const SITE_URL = String(process.env.SITE_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');
const BROWSER_PATHS = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

function browserPath() {
  const executable = BROWSER_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error('No supported local Chromium browser was found. Set BROWSER_PATH.');
  return executable;
}

async function assertPjax(page) {
  await page.waitForFunction(() => Boolean(window.siteSwup));
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);
}

async function assertTransitionFinished(page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-changing'));
}

async function assertContentEntrance(page, selector) {
  assert.equal(await page.locator(selector).first().evaluate((element) => (
    element.classList.contains('page-enter-item') &&
    getComputedStyle(element).animationName === 'page-content-rise'
  )), true);
}

async function assertDirectionalEntrance(page, selector, animationName) {
  assert.equal(await page.locator(selector).first().evaluate((element, expected) => (
    element.classList.contains('page-enter-item') &&
    getComputedStyle(element).animationName === expected
  ), animationName), true);
}

async function desktopNavigation(browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${SITE_URL}/`, { waitUntil: 'networkidle' });
  await assertPjax(page);

  await page.locator('.desktop-nav .nav-link[href="/friends/"]').hover();
  await page.locator('.desktop-nav .nav-link[href="/friends/"]').click();
  await page.waitForURL('**/friends/');
  await page.locator('.friends-shell').waitFor();
  assert.ok(await page.locator('.friend-card').count() > 0);
  await assertContentEntrance(page, '.friends-header h1');
  await assertTransitionFinished(page);
  await assertPjax(page);

  await page.goBack();
  await page.waitForURL(`${SITE_URL}/`);
  await page.locator('.about-hero').waitFor();
  await assertTransitionFinished(page);

  await page.locator('.desktop-nav .nav-link[href="/blog/"]').hover();
  await page.waitForTimeout(150);
  await page.locator('.desktop-nav .nav-link[href="/blog/"]').click();
  await page.waitForURL('**/blog/');
  await page.locator('.blog-shell').waitFor();
  await assertContentEntrance(page, '.post-group');
  await assertPjax(page);

  await page.locator('.post-row a[href="/archives/4/"]').hover();
  await page.locator('.post-row a[href="/archives/4/"]').click();
  await page.waitForURL('**/archives/4/');
  await page.locator('.article-shell').waitFor();
  await assertDirectionalEntrance(page, '.article-header h1', 'article-content-pop');
  assert.equal(
    (await page.locator('.article-header-topline .article-back').textContent()).replace(/\s+/g, ' ').trim(),
    '← Back to Blogs'
  );
  assert.equal(await page.locator('.article-footer a').count(), 0);
  await page.locator('.mermaid-diagram svg').waitFor({ timeout: 20_000 });
  await assertPjax(page);

  await page.goBack();
  await page.waitForURL('**/blog/');
  await page.locator('.blog-shell').waitFor();
  await assertDirectionalEntrance(page, '.post-group', 'page-content-return');
  await assertPjax(page);

  await page.locator('.post-row a[href="/archives/4/"]').click();
  await page.waitForURL('**/archives/4/');
  await page.locator('.article-back').click();
  await page.waitForURL('**/blog/');
  await page.locator('.blog-shell').waitFor();
  await assertDirectionalEntrance(page, '.post-group', 'page-content-return');
  await context.close();
}

async function mobileNavigation(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await page.goto(`${SITE_URL}/`, { waitUntil: 'networkidle' });
  await assertPjax(page);

  await page.locator('[data-menu-toggle]').click();
  await page.locator('#mobile-menu.is-open').waitFor();
  await page.locator('#mobile-menu a[href="/friends/"]').click();
  await page.waitForURL('**/friends/');
  await page.locator('.friends-shell').waitFor();
  assert.ok(await page.locator('.friend-card').count() > 0);
  await assertContentEntrance(page, '.friends-header h1');
  assert.equal(await page.locator('#mobile-menu').getAttribute('aria-hidden'), 'true');
  await assertTransitionFinished(page);
  await assertPjax(page);

  await page.goBack();
  await page.waitForURL(`${SITE_URL}/`);
  await page.locator('.about-hero').waitFor();
  await assertTransitionFinished(page);

  await page.locator('[data-menu-toggle]').click();
  await page.locator('#mobile-menu.is-open').waitFor();
  await page.locator('#mobile-menu a[href="/blog/"]').click();
  await page.waitForURL('**/blog/');
  await page.locator('.blog-shell').waitFor();
  assert.equal(await page.locator('#mobile-menu').getAttribute('aria-hidden'), 'true');
  await assertPjax(page);

  await page.goBack();
  await page.waitForURL(`${SITE_URL}/`);
  await page.locator('.about-hero').waitFor();
  assert.ok(await page.locator('#main-content').evaluate((element) => element.getBoundingClientRect().height > 100));
  await assertPjax(page);

  await page.goForward();
  await page.waitForURL('**/blog/');
  await page.locator('.blog-shell').waitFor();
  await assertPjax(page);
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  try {
    await desktopNavigation(browser);
    await mobileNavigation(browser);
  } finally {
    await browser.close();
  }
  console.log('Desktop and mobile PJAX navigation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
