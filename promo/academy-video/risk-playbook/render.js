// Render frames [start,end) of video.html at 30 fps into frames/NNNNN.jpg
const { chromium } = require('playwright-core');
const fs = require('fs');
const [start, end, fps = 30] = process.argv.slice(2).map(Number);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-canvas-noise', '--disable-features=CanvasNoise'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.goto('file://' + __dirname + '/' + (process.env.PAGE || 'video.html') + (process.env.HASH || '#render'));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.evaluate(() => window.__init());
  const total = await page.evaluate(() => window.__total);
  const last = Math.min(end, Math.round(total * fps));
  fs.mkdirSync(__dirname + '/' + (process.env.OUT || 'frames'), { recursive: true });
  // fast-forward without drawing
  for (let f = 0; f < start; f++) await page.evaluate(d => window.__step(d, false), f === 0 ? 0 : 1 / fps);
  const t0 = Date.now();
  for (let f = start; f < last; f++) {
    await page.evaluate(d => window.__step(d, true), f === 0 ? 0 : 1 / fps);
    await page.screenshot({ path: `${__dirname}/${process.env.OUT || "frames"}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    if ((f - start) % 60 === 0) console.log(`frame ${f}/${last} ${((Date.now() - t0) / Math.max(1, f - start + 1)).toFixed(0)} ms/frame`);
  }
  if (last >= Math.round(total * fps)) fs.writeFileSync(__dirname + '/' + (process.env.OUT || 'frames') + '-events.json', JSON.stringify(await page.evaluate(() => window.__events)));
  console.log('DONE', start, last);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
