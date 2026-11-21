// Step the whole film without drawing and save the cue log (scenes, narration, sound effects).
const { chromium } = require('playwright-core'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.goto('file://' + __dirname + '/' + (process.env.PAGE || 'video4.html') + (process.env.HASH || '#render'));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.evaluate(() => window.__init());
  const n = await page.evaluate(() => { const T = window.__total, f = 24; window.__step(0, false); for (let i = 1; i < Math.round(T * f); i++) window.__step(1 / f, false); return window.__events.length });
  fs.writeFileSync(__dirname + '/' + (process.env.OUT || 'test') + '-events.json', JSON.stringify(await page.evaluate(() => window.__events)));
  console.log('events', n); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1) });
