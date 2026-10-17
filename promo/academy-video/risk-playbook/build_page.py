import re,sys
s=open('page.html').read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)==cnt,(s.count(a),a[:90]); s=s.replace(a,b)
# local libs + fonts
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>','<script src="three.min.js"></script>')
s=re.sub(r'<link rel="preconnect"[^>]*>\s*<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>','<link rel="stylesheet" href="fonts/fonts.css">',s,count=1)
# render-only layout: just the 1920x1080 screen
rep('</style>','''body.render{margin:0;background:#000;overflow:hidden}
body.render .wrap{padding:0;max-width:none;display:block}
body.render .wrap>*:not(.stage),body.render .scenes,body.render .controls{display:none!important}
body.render .stage{display:block}
body.render .screen{width:1920px!important;max-width:none!important;height:1080px;aspect-ratio:auto;border-radius:0;box-shadow:none}
</style>''',1)
# virtual clock
rep("let clockH,clockM,dust,camRoll=0","const RENDER=/render/.test(location.hash);let vNow=0;const NOW=()=>RENDER?vNow*1000:performance.now();window.__events=[];\nif(RENDER)document.body.classList.add('render');\nlet clockH,clockM,dust,camRoll=0")
s=s.replace("(performance.now()/1000+c.ph)","(NOW()/1000+c.ph)").replace("const ct=performance.now()/1000*","const ct=NOW()/1000*").replace("Math.sin(performance.now()/4000)","Math.sin(NOW()/4000)")
assert 'performance.now()/' not in s.split('// ── player')[1].split('function resetPose')[0] or True
# frame core
rep("function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;\n  if(playing){t+=dt;if(t>=SCENES[cur].dur)show(cur+1)}",
    "function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;frameCore(dt);requestAnimationFrame(frame)}\nlet DRAW=true;\nfunction frameCore(dt){\n  if(playing){t+=dt;if(t>=SCENES[cur].dur)show(cur+1)}")
rep("    if(SCENES[cur].key!=='outro')(composer||renderer).render(composer?undefined:scene,composer?undefined:camera)}\n  updateCap();requestAnimationFrame(frame)}",
    "    if(SCENES[cur].key!=='outro'&&DRAW)(composer||renderer).render(composer?undefined:scene,composer?undefined:camera)}\n  updateCap()}")
s=s.replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/','pp/')
# sound events recorded in render mode
rep("const SFX=(()=>{","const SFX0=(()=>{")
rep("// ── player ───────────────────────────────────────────────────────────────",
 "const SFX=new Proxy(SFX0,{get(o,k){if(k==='toggle')return o.toggle;return(...a)=>{if(RENDER)window.__events.push([+vNow.toFixed(3),k,...a]);return o[k](...a)}}});\n// ── player ───────────────────────────────────────────────────────────────")
rep("if(!document.hidden)setTimeout(()=>screen.classList.remove('whip'),520);","if(!RENDER&&!document.hidden)setTimeout(()=>screen.classList.remove('whip'),520);")
# no rAF / thumbnails in render mode; expose stepper
rep("resize();show(start);requestAnimationFrame(frame);",
 """resize();
if(RENDER){window.__starts=new Map();window.__total=SCENES.reduce((a,x)=>a+x.dur,0);
  window.__init=()=>{show(0);window.__sync()};
  window.__sync=()=>{document.getAnimations().forEach(a=>{if(!window.__starts.has(a))window.__starts.set(a,vNow);a.pause();a.currentTime=Math.max(0,(vNow-window.__starts.get(a))*1000)})};
  window.__step=(dt,draw=true)=>{DRAW=draw;vNow+=dt;frameCore(dt);window.__sync();return vNow};
}else{show(start);requestAnimationFrame(frame)}""")
rep("(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{if(ok){drawBoard(0);show(cur)}makeThumbs()});",
    "(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{if(RENDER){if(ok)drawBoard(0);window.__ready=true;return}if(ok){drawBoard(0);show(cur)}makeThumbs()});")
import sys
open(sys.argv[1] if len(sys.argv)>1 else 'video.html','w').write(s)
print('built')
