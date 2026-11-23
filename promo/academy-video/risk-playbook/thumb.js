// YouTube thumbnail: Trump and CZ as giant puppeteers pulling the strings of the tiny serious investor over shark water.
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
    // dark stage, red (left) and gold (right) glows behind the giants, a crashing chart line
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1152; const g = c.getContext('2d');
    g.fillStyle = '#07080d'; g.fillRect(0, 0, 2048, 1152);
    let gr = g.createRadialGradient(420, 380, 0, 420, 380, 900); gr.addColorStop(0, 'rgba(220,20,40,.95)'); gr.addColorStop(1, 'rgba(220,20,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 2048, 1152);
    gr = g.createRadialGradient(1630, 380, 0, 1630, 380, 900); gr.addColorStop(0, 'rgba(255,196,40,.95)'); gr.addColorStop(1, 'rgba(255,196,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 2048, 1152);
    g.globalAlpha = .1; g.fillStyle = '#000'; for (let y = 0; y < 1152; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < 2048; x += 18) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill() } g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 18; g.lineJoin = 'round'; g.beginPath();
    [[0, 300], [300, 260], [560, 340], [820, 300], [1000, 520], [1180, 470], [1350, 760], [1560, 700], [1760, 1000], [2048, 1152]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(26, 14.6), new THREE.MeshBasicMaterial({ map: tex, color: '#9a9a9a' })); bg.position.set(X, 3.2, Z - 6.5); scene.add(bg);
    // the giants
    const R = chars.rex, T = chars.trump, C = chars.cz;
    place(T, X - 2.0, Z - 3.0, .6); T.root.scale.setScalar(2.05); place(C, X + 2.0, Z - 3.0, -.6); C.root.scale.setScalar(2.05);
    T.setFace('tsmug'); T.phone.visible = false; T.armR.rotation.x = -1.55; T.armR.rotation.z = -.15; T.armL.rotation.x = -.5; T.armL.rotation.z = .1; T.neck.rotation.x = .3; T.neck.rotation.y = .15;
    C.setFace('czsmile'); C.phone.visible = false; C.armR.rotation.x = -.5; C.armR.rotation.z = -.1; C.armL.rotation.x = -1.55; C.armL.rotation.z = .15; C.neck.rotation.x = .3; C.neck.rotation.y = -.15;
    // the puppet: lifted off the ground, limp legs, arms yanked up
    place(R, X, Z + .5); R.root.scale.setScalar(.8); R.root.position.y = .35; R.setFace('scream'); if (R.sweat) R.sweat.forEach(d => d.visible = true);
    R.armR.rotation.z = 2.3; R.armL.rotation.z = -2.3; R.armR.rotation.x = -.2; R.armL.rotation.x = -.2; R.legL.rotation.x = .35; R.legR.rotation.x = -.25; R.body.rotation.z = .06; R.neck.rotation.z = -.1;
    // red water and the shark fin below him
    const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: '#7a0710', emissive: '#5a0008', emissiveIntensity: .6, roughness: .2, metalness: .3 })); water.rotation.x = -Math.PI / 2; water.position.set(X, .25, Z + .5); scene.add(water);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(.32, .75, 4), new THREE.MeshStandardMaterial({ color: '#5d6b7c', roughness: .4 })); fin.scale.z = .25; fin.position.set(X + .85, .55, Z + 1.2); fin.rotation.z = -.35;
    scene.updateMatrixWorld(true);
    // strings from the giants' hands to the puppet
    const sm = new THREE.MeshBasicMaterial({ color: '#f4f0e6' });
    const string = (a, b) => { const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, d.length(), 6), sm); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); scene.add(m) };
    const hand = (c, side) => (side > 0 ? c.armR : c.armL).localToWorld(new THREE.Vector3(side * .18, -.92, .16));
    const head = R.neck.localToWorld(new THREE.Vector3(0, .75, 0));
    // wooden marionette controls held up by the giants, strings dropping onto the puppet
    const wood = new THREE.MeshStandardMaterial({ color: '#d89a52', emissive: '#5a3410', emissiveIntensity: .5, roughness: .5 });
    const control = (p, tilt) => { const gC = new THREE.Group(); gC.position.copy(p).add(new THREE.Vector3(0, .25, 0)); gC.rotation.set(.35, 0, tilt);
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.1, .09, .09), wood), b = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, .7), wood); gC.add(a, b); scene.add(gC); gC.updateMatrixWorld(true);
      return [gC.localToWorld(new THREE.Vector3(-.55, 0, 0)), gC.localToWorld(new THREE.Vector3(.55, 0, 0)), gC.localToWorld(new THREE.Vector3(0, 0, .35))] };
    const tc = control(hand(T, 1), -.25), cc = control(hand(C, -1), .25);
    string(tc[1], hand(R, -1)); string(tc[2], head); string(tc[0], R.legL.localToWorld(new THREE.Vector3(0, -.5, .1)));
    string(cc[0], hand(R, 1)); string(cc[2], head); string(cc[1], R.legR.localToWorld(new THREE.Vector3(0, -.5, .1)));
    // light
    hemiL.intensity = .14; hemiL.visible = true; sunL.intensity = 0; V3.insL.intensity = 0;
    const key = new THREE.SpotLight('#fff3e6', .75, 16, .55, .7, 1); key.position.set(X, 4.6, Z + 4.5); key.target.position.set(X, 1.4, Z); scene.add(key, key.target);
    const tk = new THREE.SpotLight('#ffe9d6', .55, 16, .6, .7, 1); tk.position.set(X - 1.0, 6.0, Z + 3.5); tk.target.position.set(X - 2.0, 4.4, Z - 3.0); scene.add(tk, tk.target);
    const ck = new THREE.SpotLight('#ffe9d6', .55, 16, .6, .7, 1); ck.position.set(X + 1.0, 6.0, Z + 3.5); ck.target.position.set(X + 2.0, 4.4, Z - 3.0); scene.add(ck, ck.target);
    const rl = new THREE.PointLight('#ff2a3a', 1.0, 9); rl.position.set(X - 3.6, 3.6, Z - 3.2); scene.add(rl);
    const yl = new THREE.PointLight('#ffc23a', 1.0, 9); yl.position.set(X + 3.6, 3.6, Z - 3.2); scene.add(yl);
    Object.assign(FX, { sat: 1.18, con: 1.18, vig: .55, ab: .0015, warm: .05, flash: 0, rw: 0 });
    const u = gradePass.uniforms; u.uSat.value = FX.sat; u.uCon.value = FX.con; u.uVig.value = FX.vig; u.uAb.value = FX.ab; u.uWarm.value = FX.warm; u.uFlash.value = 0; u.uRw.value = 0;
    camera.fov = 50; camera.position.set(X, 2.0, Z + 5.2); camera.lookAt(X, 2.75, Z - 1.0); camera.updateProjectionMatrix();
    bloomPass.strength = .22; bloomPass.threshold = .9;
    composer.render();
    const ov = document.createElement('div'); ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:Montserrat,Arial Black,sans-serif;font-weight:900';
    const st = (s) => `-webkit-text-stroke:${s}px #000;paint-order:stroke fill;`;
    ov.innerHTML = `
      <div style="position:absolute;left:0;right:0;bottom:34px;text-align:center;line-height:.92;transform:rotate(-2deg)">
        <div style="font-size:118px;color:#fff;${st(14)}text-shadow:10px 10px 0 #000">WHO’S PULLING</div>
        <div style="font-size:150px;color:#ffd23f;${st(16)}text-shadow:12px 12px 0 #000">YOUR STRINGS?</div></div>`;
    document.querySelector('.screen').appendChild(ov);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname + '/thumb_raw.png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  await browser.close(); console.log('thumb ok');
})().catch(e => { console.error('FAIL', e); process.exit(1) });
