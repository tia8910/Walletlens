// YouTube thumbnail: Trump (100% TARIFFS) vs CZ ("4") with the serious investor screaming at −50%, staged in the 3D set.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.goto('file://' + __dirname + '/' + (process.env.PAGE || 'video.html') + '#render');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.evaluate(() => window.__init());
  await page.evaluate(() => { window.__step(1 / 24, false); });
  await page.evaluate(() => {
    const X = INS.x, Z = INS.z;
    show(SCENES.findIndex(s => s.key === 'c_post'));
    screen.classList.remove('whip'); document.getAnimations().forEach(a => a.finish && a.cancel()); Object.values(chars).forEach(resetChar); holo.visible = false; phone3d.visible = false;
    ['cap', 'rules', 'tcard', 'chapter'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none' });
    document.getElementById('lbt').style.height = '0'; document.getElementById('lbb').style.height = '0';
    // split backdrop: tariff red | CZ yellow, with a crashing chart line across it
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1152; const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 1100, 1152); gr.addColorStop(0, '#5c0610'); gr.addColorStop(1, '#c4121f'); g.fillStyle = gr; g.fillRect(0, 0, 2048, 1152);
    g.beginPath(); g.moveTo(1180, 0); g.lineTo(2048, 0); g.lineTo(2048, 1152); g.lineTo(860, 1152); g.closePath();
    gr = g.createLinearGradient(900, 0, 2048, 1152); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(1, '#d99a00'); g.fillStyle = gr; g.fill();
    g.globalAlpha = .12; g.fillStyle = '#000'; for (let y = 0; y < 1152; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < 2048; x += 18) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill() } g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 22; g.lineJoin = 'round'; g.beginPath();
    [[0, 260], [260, 230], [480, 300], [700, 250], [900, 420], [1080, 380], [1240, 700], [1420, 640], [1600, 980], [2048, 1152]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(13, 7.3), new THREE.MeshBasicMaterial({ map: tex, color: '#8a8a8a' })); bg.position.set(X, 2.2, Z - 4.2); scene.add(bg);
    // cast
    const R = chars.rex, T = chars.trump, C = chars.cz;
    place(R, X, Z - .55); place(T, X - 1.75, Z - .2, .5); place(C, X + 1.75, Z - .2, -.5);
    R.setFace('scream'); R.armR.rotation.z = 2.7; R.armL.rotation.z = -2.7; R.armR.rotation.x = -.3; R.armL.rotation.x = -.3; R.neck.rotation.x = -.12; if (R.sweat) R.sweat.forEach(d => d.visible = true);
    T.setFace('tshout'); T.phone.visible = true; T.armR.rotation.x = -1.55; T.armR.rotation.z = -.35; T.armL.rotation.x = -.4; T.neck.rotation.y = .25;
    C.setFace('czsmile'); C.phone.visible = true; C.armR.rotation.x = -1.9; C.armR.rotation.z = .2; C.neck.rotation.y = -.2;
    // light: soft front, red rim from the left, gold rim from the right
    hemiL.intensity = .18; hemiL.visible = true; sunL.intensity = 0; V3.insL.intensity = 0;
    const key = new THREE.SpotLight('#fff3e6', .65, 14, .6, .7, 1); key.position.set(X + .4, 4.2, Z + 4.5); key.target.position.set(X, 1.8, Z - .6); scene.add(key, key.target);
    const rl = new THREE.PointLight('#ff3b3b', .9, 7); rl.position.set(X - 3.2, 2.8, Z - 1.6); scene.add(rl);
    const yl = new THREE.PointLight('#ffc23a', .9, 7); yl.position.set(X + 3.2, 2.8, Z - 1.6); scene.add(yl);
    Object.assign(FX, { sat: 1.18, con: 1.15, vig: .38, ab: .0015, warm: .1, flash: 0, rw: 0 });
    const u = gradePass.uniforms; u.uSat.value = FX.sat; u.uCon.value = FX.con; u.uVig.value = FX.vig; u.uAb.value = FX.ab; u.uWarm.value = FX.warm; u.uFlash.value = 0; u.uRw.value = 0;
    camera.fov = 39; camera.position.set(X, 2.0, Z + 4.1); camera.lookAt(X, 2.32, Z - .5); camera.updateProjectionMatrix();
    bloomPass.strength = .18; bloomPass.threshold = .92;
    composer.render();
    // thumbnail text
    const ov = document.createElement('div'); ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:Montserrat,Arial Black,sans-serif;font-weight:900';
    const st = (s) => `-webkit-text-stroke:${s}px #000;paint-order:stroke fill;`;
    ov.innerHTML = `
      <div style="position:absolute;left:330px;top:30px;transform:rotate(-6deg);background:#fff;border:10px solid #000;border-radius:28px;padding:10px 30px 16px;box-shadow:12px 12px 0 #000">
        <div style="font-size:96px;line-height:.95;color:#d0141c;letter-spacing:-2px">100%</div><div style="font-size:66px;line-height:1;color:#111">TARIFFS!</div></div>
      <div style="position:absolute;right:330px;top:-30px;transform:rotate(10deg);font-size:300px;line-height:1;color:#ffd23f;${st(18)}text-shadow:0 0 50px rgba(255,210,63,.9),14px 14px 0 #000">4</div>
      <div style="position:absolute;left:0;right:0;bottom:28px;text-align:center;font-size:250px;line-height:1;color:#ff2a2a;letter-spacing:-6px;${st(16)}text-shadow:14px 14px 0 #000">−50%</div>`;
    document.querySelector('.screen').appendChild(ov);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname + '/thumb_raw.png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  await browser.close(); console.log('thumb ok');
})().catch(e => { console.error('FAIL', e); process.exit(1) });
