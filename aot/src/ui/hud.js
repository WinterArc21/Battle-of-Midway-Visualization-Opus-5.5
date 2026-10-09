// Wings of Freedom HUD: a DOM overlay above the WebGL canvas (owner: hud agent).
// Owns its CSS (injected once as a <style> element) and the Google Fonts link. No three.js dependency.
// update(s) runs every frame: it only writes to the DOM when a displayed value actually changed.

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900'
  + '&family=Inter:ital,wght@0,500;0,700;0,900;1,700;1,900&display=swap';

const CSS = `
.wof-root{--olive:#2f3a24;--olive-d:#171d12;--leather:#5b3d24;--leather-d:#2a1c10;--brass:#c9a25a;--brass-d:#7d6128;
  --parch:#efe6cf;--parch-d:#b7ab8c;--red:#d2402e;--cyan:#62ecff;--yellow:#ffd54a;
  --serif:Cinzel,Georgia,"Times New Roman",serif;--sans:Inter,"Segoe UI","Helvetica Neue",Arial,sans-serif;
  position:fixed;inset:0;z-index:10;pointer-events:none;overflow:hidden;font-family:var(--sans);color:var(--parch);
  -webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.wof-root *{box-sizing:border-box}
.wof-root button{font:inherit;margin:0}
.wof-game{position:absolute;inset:0;pointer-events:none;transition:opacity .4s}
.wof-root.hud-off .wof-game{opacity:0}

.wof-panel,.wof-card{background:linear-gradient(180deg,rgba(54,66,41,.86),rgba(24,30,20,.88));
  border:1px solid var(--leather);border-radius:6px;
  box-shadow:inset 0 0 0 1px rgba(201,162,90,.2),inset 0 1px 0 rgba(255,255,255,.07),0 6px 18px rgba(0,0,0,.45)}
.wof-label{font-family:var(--serif);font-weight:700;font-size:11px;letter-spacing:.2em;color:var(--brass);text-shadow:0 1px 2px #000;white-space:nowrap}
.wof-bar{position:relative;overflow:hidden;background:rgba(10,8,5,.75);border:1.5px solid var(--leather-d);border-radius:3px;
  box-shadow:inset 0 2px 4px rgba(0,0,0,.75),0 0 0 1px rgba(201,162,90,.22)}
.wof-bar-fill{position:absolute;left:0;top:0;bottom:0;right:0;transform-origin:0 50%;transform:scaleX(1)}

/* top-left: crest + HP */
.wof-tl{position:absolute;left:16px;top:14px;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px)}
.wof-crest{width:46px;height:50px;flex:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))}
.wof-tl .wof-label{width:22px}
.wof-hp{width:230px;height:16px}
.wof-hp .wof-bar-fill{background:linear-gradient(180deg,#f27a5c,#b3291c 55%,#6a1209)}
.wof-tl[data-low="1"] .wof-hp{animation:wof-blink .45s ease-in-out infinite alternate}

/* bottom-left: gas canisters + blades */
.wof-bl{position:absolute;left:16px;bottom:16px;padding:10px 14px;display:flex;flex-direction:column;gap:9px;width:330px;max-width:calc(100vw - 32px)}
.wof-row2{display:flex;align-items:center;gap:10px}
.wof-row2 > .wof-label{width:56px;flex:none}
.wof-canisters{display:flex;gap:6px;flex:1;min-width:0}
.wof-canister{position:relative;flex:1;height:20px;border-radius:10px;overflow:hidden;background:rgba(8,6,3,.8);
  border:1.5px solid #6f4d2c;box-shadow:inset 0 3px 5px rgba(0,0,0,.75),0 0 0 1px rgba(201,162,90,.18)}
.wof-canister .wof-bar-fill{left:0;right:0}
.wof-canister::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(90deg,transparent 0 15px,rgba(0,0,0,.4) 15px 17px)}
.wof-canister-fill.g{background:linear-gradient(180deg,#d7f2a8,#7fb34e 50%,#3d6a20)}
.wof-canister-fill.a{background:linear-gradient(180deg,#ffe596,#e8ac3a 55%,#a46c15)}
.wof-canister-fill.r{background:linear-gradient(180deg,#ffa08c,#d4452f 55%,#7d1d12)}
.wof-canisters.pulse .wof-canister-fill{animation:wof-blink .5s ease-in-out infinite alternate}
.wof-blade{flex:1;height:10px;min-width:0}
.wof-blade .wof-bar-fill{background:linear-gradient(90deg,#8d8779,#ece5cf 70%,#fbf7ea)}
.wof-blade.low .wof-bar-fill{background:linear-gradient(90deg,#6e1e13,#e0603a)}
.wof-spare{font-weight:700;font-size:13px;white-space:nowrap;min-width:48px;text-align:right;text-shadow:0 1px 2px #000;font-variant-numeric:tabular-nums}
.wof-spare i{font-style:normal;color:var(--brass);margin-right:4px}
@keyframes wof-blink{from{opacity:1}to{opacity:.3}}

/* centre: crosshair, hooks, nape markers */
.wof-cross{position:fixed;left:50%;top:50%;width:0;height:0}
.wof-ring{position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;
  border:1.5px solid rgba(255,255,255,.9);box-shadow:0 0 6px rgba(255,255,255,.45),inset 0 0 3px rgba(0,0,0,.35);
  transition:opacity .12s,border-color .12s,box-shadow .12s}
.wof-dot{position:absolute;left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%;background:#fff;
  box-shadow:0 0 3px #000;transition:opacity .12s}
.wof-cross[data-valid="0"] .wof-ring{opacity:0}
.wof-cross[data-valid="0"] .wof-dot{opacity:.4}
.wof-cross[data-valid="1"] .wof-ring{opacity:1}
.wof-cross[data-valid="1"] .wof-ring{border-color:#fff;box-shadow:0 0 9px rgba(255,255,255,.75),inset 0 0 3px rgba(0,0,0,.3)}
.wof-x,.wof-lock{position:absolute;left:-30px;top:-30px;width:60px;height:60px;overflow:visible;pointer-events:none;
  opacity:0;transition:opacity .12s}
.wof-cross[data-valid="0"] .wof-x{opacity:1}
.wof-cross[data-lock="1"] .wof-lock{opacity:1}
.wof-dist{position:absolute;left:-40px;top:20px;width:80px;text-align:center;font-weight:600;font-size:11px;letter-spacing:.04em;
  font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 1px 3px #000,0 0 2px #000}
.wof-hook{position:absolute;top:-13px;width:16px;height:34px;color:rgba(205,205,195,.45);transition:color .08s,filter .08s}
.wof-hook[data-side="0"]{left:-64px}
.wof-hook[data-side="1"]{left:48px}
.wof-hook svg{position:absolute;left:0;top:0;width:16px;height:20px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;transition:transform .08s}
.wof-hook span{position:absolute;left:-4px;right:-4px;top:23px;text-align:center;font-weight:700;font-size:10px;letter-spacing:.1em;color:inherit;text-shadow:0 1px 2px #000}
.wof-hook[data-state="flying"]{color:var(--yellow)}
.wof-hook[data-state="attached"]{color:var(--cyan);filter:drop-shadow(0 0 4px rgba(98,236,255,.95))}
.wof-hook[data-state="attached"] svg{transform:scale(1.2)}
.wof-napes{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.wof-nape{position:absolute;left:0;top:0;width:10px;height:10px;background:#e2352a;border:1.5px solid #ffe3d6;
  box-shadow:0 0 7px rgba(255,40,30,.95),0 0 2px #000;will-change:transform}

/* bottom-right: speed, kills, score, combo */
.wof-br{position:absolute;right:16px;bottom:16px;padding:10px 16px 10px;text-align:right;min-width:184px}
.wof-combo{min-height:24px;font-family:var(--serif);font-weight:900;font-size:19px;letter-spacing:.12em;color:var(--brass);
  text-shadow:0 0 10px rgba(201,162,90,.55),0 2px 2px #000;opacity:0;transition:opacity .2s}
.wof-combo.on{opacity:1}
.wof-speed-row{display:flex;align-items:baseline;justify-content:flex-end}
.wof-speed{font-weight:900;font-style:italic;font-size:56px;line-height:.95;letter-spacing:-.02em;font-variant-numeric:tabular-nums;
  text-shadow:0 2px 0 rgba(0,0,0,.55),0 0 14px rgba(0,0,0,.6)}
.wof-unit{font-family:var(--serif);font-weight:700;font-size:12px;letter-spacing:.22em;color:var(--brass);margin-left:8px;text-shadow:0 1px 2px #000}
.wof-stat{display:flex;justify-content:space-between;align-items:baseline;gap:18px;margin-top:6px}
.wof-stat span{font-family:var(--serif);font-size:11px;letter-spacing:.2em;color:var(--parch-d)}
.wof-stat b{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px #000}

/* top-centre objective and toast */
.wof-obj{position:absolute;left:50%;top:14px;transform:translateX(-50%);max-width:calc(100vw - 32px);padding:6px 16px;
  font-family:var(--serif);font-weight:700;font-size:13px;letter-spacing:.16em;text-transform:uppercase;text-align:center;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .3s}
.wof-obj.on{opacity:1}
.wof-toast{position:absolute;left:50%;top:66px;transform:translate(-50%,-6px);padding:9px 20px;max-width:calc(100vw - 32px);
  font-family:var(--serif);font-weight:700;font-size:16px;letter-spacing:.06em;text-align:center;border-radius:4px;
  opacity:0;transition:opacity .25s,transform .25s;box-shadow:0 6px 16px rgba(0,0,0,.5)}
.wof-toast.on{opacity:1;transform:translate(-50%,0)}
.wof-toast.info{background:linear-gradient(180deg,rgba(54,66,41,.94),rgba(24,30,20,.94));border:1px solid var(--brass-d);color:var(--parch)}
.wof-toast.warn{background:linear-gradient(180deg,rgba(158,40,26,.95),rgba(92,16,10,.95));border:1px solid #ff8a72;color:#fff1e6}
.wof-toast.warn.on{animation:wof-shake .4s}
@keyframes wof-shake{0%,100%{transform:translate(-50%,0)}25%{transform:translate(calc(-50% - 6px),0)}75%{transform:translate(calc(-50% + 6px),0)}}

/* cinematic big message */
.wof-big{position:absolute;left:0;right:0;top:27%;text-align:center;opacity:0;transition:opacity .7s}
.wof-big.on{opacity:1}
.wof-big span{display:inline-block;max-width:94vw;padding-left:.2em;text-wrap:balance;font-family:var(--serif);font-weight:900;line-height:1.15;
  font-size:clamp(20px,4vw,56px);letter-spacing:.2em;color:var(--parch);
  text-shadow:0 3px 0 rgba(0,0,0,.55),0 0 24px rgba(0,0,0,.85),0 0 40px rgba(201,162,90,.35)}
.wof-big i{display:block;height:2px;margin:12px auto 0;width:min(40vw,420px);transform:scaleX(0);
  background:linear-gradient(90deg,transparent,var(--brass),transparent);box-shadow:0 0 8px rgba(201,162,90,.6)}
.wof-big.on span{animation:wof-big-in .9s cubic-bezier(.2,.7,.2,1) both}
.wof-big.on i{animation:wof-line .9s .2s ease-out both}
@keyframes wof-big-in{from{letter-spacing:.6em;opacity:0;transform:scale(1.08)}to{letter-spacing:.2em;opacity:1;transform:scale(1)}}
@keyframes wof-line{to{transform:scaleX(1)}}

/* AoTTG-style damage numbers */
.wof-dmgs{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.wof-dmg{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font-weight:900;font-style:italic;font-size:34px;line-height:1;
  color:#fff8e8;white-space:nowrap;font-variant-numeric:tabular-nums;will-change:transform,opacity;
  text-shadow:-2px -2px 0 #14100b,2px -2px 0 #14100b,-2px 2px 0 #14100b,2px 2px 0 #14100b,0 3px 0 #14100b,0 0 10px rgba(0,0,0,.6);
  animation:wof-dmg 1.2s cubic-bezier(.2,.8,.3,1) forwards}
.wof-dmg.kill{font-size:58px;color:#ffd24a;
  text-shadow:-2px -2px 0 #14100b,2px -2px 0 #14100b,-2px 2px 0 #14100b,2px 2px 0 #14100b,0 4px 0 #14100b,0 0 14px rgba(230,50,30,.95)}
@keyframes wof-dmg{
  0%{opacity:0;transform:translate(-50%,-50%) scale(.35)}
  14%{opacity:1;transform:translate(-50%,-50%) scale(1.22)}
  26%{opacity:1;transform:translate(-50%,-50%) scale(1)}
  70%{opacity:1;transform:translate(-50%,calc(-50% - 26px)) scale(1)}
  100%{opacity:0;transform:translate(-50%,calc(-50% - 70px)) scale(.92)}}

/* full-screen screens: title, pause, death */
.wof-screen{position:absolute;inset:0;overflow-x:hidden;overflow-y:auto;pointer-events:none;opacity:0;visibility:hidden;
  transition:opacity .4s,visibility .4s;-webkit-overflow-scrolling:touch}
.wof-screen.on{opacity:1;visibility:visible;pointer-events:auto}
.wof-screen-in{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:28px 16px}
.wof-menu{background:radial-gradient(ellipse 70% 62% at 50% 44%,rgba(8,10,6,.12),rgba(6,8,5,.66) 70%,rgba(3,4,2,.93) 100%)}
.wof-pause{background:rgba(6,8,5,.6);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
.wof-death{background:radial-gradient(ellipse 80% 70% at 50% 45%,rgba(78,8,4,.3),rgba(12,2,2,.92) 75%)}

.wof-title{margin:0;text-align:center;font-family:var(--serif);font-weight:900;font-size:clamp(34px,7.4vw,88px);line-height:1;
  letter-spacing:.08em;color:var(--parch);text-shadow:0 3px 0 #1a120a,0 0 28px rgba(201,162,90,.45),0 0 2px #000}
.wof-subtitle{margin-top:14px;text-align:center;font-family:var(--serif);font-weight:500;font-size:clamp(11px,1.8vw,15px);
  letter-spacing:.26em;text-transform:uppercase;color:var(--brass);text-shadow:0 1px 2px #000}
.wof-divider{position:relative;width:min(420px,80vw);height:14px;margin:10px 0 0}
.wof-divider::before{content:"";position:absolute;left:0;right:0;top:6px;height:1px;background:linear-gradient(90deg,transparent,var(--brass),transparent)}
.wof-divider::after{content:"";position:absolute;left:50%;top:1px;width:9px;height:9px;margin-left:-4.5px;background:var(--brass);
  transform:rotate(45deg);box-shadow:0 0 8px rgba(201,162,90,.7)}
.wof-menu-btns{display:flex;flex-wrap:wrap;gap:18px;justify-content:center}
.wof-btn{pointer-events:auto;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:250px;
  padding:14px 26px 13px;border-radius:4px;border:2px solid var(--brass);color:var(--parch);font-family:var(--serif);
  background:linear-gradient(180deg,#5a6e40 0%,#323f25 55%,#1c2415 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -2px 0 rgba(0,0,0,.4),0 0 0 1px #0d0a06,0 8px 20px rgba(0,0,0,.55);
  transition:transform .12s,box-shadow .2s,filter .2s}
.wof-btn b{font-weight:900;font-size:20px;letter-spacing:.18em;text-shadow:0 2px 0 #0d0a06}
.wof-btn small{font-family:var(--sans);font-size:12px;letter-spacing:.06em;color:var(--parch-d)}
.wof-btn:hover{transform:translateY(-2px);filter:brightness(1.12);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -2px 0 rgba(0,0,0,.4),0 0 0 1px #0d0a06,0 0 24px rgba(201,162,90,.5)}
.wof-btn:active{transform:translateY(1px)}
.wof-btn:focus{outline:none}
.wof-btn:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}

.wof-card{width:min(760px,100%);padding:20px 24px 22px;display:flex;flex-direction:column;align-items:center}
.wof-card-title{font-family:var(--serif);font-weight:700;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--brass);
  text-align:center;margin-bottom:12px;text-shadow:0 1px 2px #000}
.wof-keys{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 28px}
.wof-row{display:flex;align-items:center;gap:12px;font-size:14px;line-height:1.25;min-width:0}
.wof-row .k{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px;min-width:158px;flex:none;text-align:right}
.wof-row .d{flex:1;min-width:0;color:var(--parch)}
.wof-row small{color:var(--parch-d);font-size:12px;font-style:italic}
kbd{display:inline-block;min-width:26px;padding:2px 7px;text-align:center;font-family:var(--sans);font-weight:700;font-size:12px;
  letter-spacing:.02em;color:#f6ecd2;background:linear-gradient(180deg,#43321c,#1d140a);border:1px solid #8a6a3a;
  border-bottom-width:2px;border-radius:4px;box-shadow:0 1px 0 #000}
.wof-note{margin:14px 0 0;text-align:center;font-family:var(--serif);font-style:italic;font-size:12px;letter-spacing:.05em;color:var(--parch-d)}

.wof-h2,.wof-death-title{margin:0;text-align:center;font-family:var(--serif);font-weight:900;text-transform:uppercase;line-height:1.05;color:#efe3c6;
  text-shadow:0 3px 0 #120806,0 0 26px rgba(190,30,20,.7),0 0 2px #000}
.wof-h2{font-size:clamp(30px,5.4vw,58px);letter-spacing:.2em;padding-left:.2em}
.wof-death-title{font-size:clamp(28px,4.9vw,56px);letter-spacing:.05em;white-space:nowrap}
.wof-death-card{align-items:center;padding:30px 24px 28px}
.wof-death-stats{width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:22px 0 24px}
.wof-death-stats div{text-align:center;padding:10px 6px;border:1px solid var(--leather);border-radius:4px;background:rgba(0,0,0,.28)}
.wof-death-stats span{display:block;font-family:var(--serif);font-size:11px;letter-spacing:.24em;color:var(--brass)}
.wof-death-stats b{display:block;margin-top:4px;font-size:clamp(20px,3.2vw,28px);font-weight:800;font-variant-numeric:tabular-nums}
.wof-pause-card{gap:0}
.wof-pause-card .wof-btn{margin:20px 0 22px}
.wof-retry{margin-top:22px}

@media (max-width:700px){
  .wof-obj{top:64px;max-width:calc(100vw - 20px);font-size:11px;letter-spacing:.12em;padding:5px 12px;line-height:1.35;white-space:normal;text-overflow:clip}
  .wof-toast{top:126px;font-size:14px;max-width:calc(100vw - 20px)}
  .wof-keys{grid-template-columns:minmax(0,1fr)}
  .wof-row .k{min-width:128px}
  .wof-hp{width:min(180px,44vw)}
  .wof-tl{gap:8px}
  .wof-crest{width:38px;height:42px}
  .wof-bl{width:calc(100vw - 20px);max-width:none;padding:8px 10px;gap:7px;left:10px;bottom:10px}
  .wof-row2 > .wof-label{width:auto;min-width:62px;letter-spacing:.14em}
  .wof-canisters{gap:4px}
  .wof-canister{min-width:0}
  .wof-blade{min-width:40px}
  .wof-spare{min-width:36px}
  .wof-br{right:10px;bottom:86px;min-width:0;padding:6px 12px}
  .wof-speed{font-size:40px}
  .wof-stat span{font-size:10px;letter-spacing:.12em}
  .wof-btn{min-width:min(250px,80vw)}
  .wof-death-stats{gap:8px}
}
`;

const TEMPLATE = `
<div class="wof-game">
  <div class="wof-tl" data-low="0">
    <svg class="wof-crest" viewBox="0 0 48 52" aria-hidden="true">
      <path d="M24 1.5 L45 8.5 V25 C45 38 36 46.5 24 50.5 C12 46.5 3 38 3 25 V8.5 Z" fill="#26321d" stroke="#c9a25a" stroke-width="2"/>
      <path d="M24 6 L41 11.5 V25 C41 35 34 42 24 46 C14 42 7 35 7 25 V11.5 Z" fill="none" stroke="#c9a25a" stroke-width="0.8" opacity=".55"/>
      <path d="M24.5 42 C25.5 33 31 23 41 14.5 C40.2 19.5 39.6 22.4 38.6 24.6 C41.2 24.2 43 24.4 44.6 25.4 C42.6 27.8 40.5 30.2 38.2 32.2 C39.4 32.4 41 32.8 42.4 33.8 C39.6 36.8 35.5 39.6 30 41.2 Z" fill="#f4f0e2" stroke="#1a140c" stroke-width="0.6" stroke-linejoin="round"/>
      <path d="M23.5 42 C22.5 33 17 23 7 14.5 C7.8 19.5 8.4 22.4 9.4 24.6 C6.8 24.2 5 24.4 3.4 25.4 C5.4 27.8 7.5 30.2 9.8 32.2 C8.6 32.4 7 32.8 5.6 33.8 C8.4 36.8 12.5 39.6 18 41.2 Z" fill="#2f6fb2" stroke="#0d1a2c" stroke-width="0.6" stroke-linejoin="round"/>
      <circle cx="24" cy="42" r="1.8" fill="#c9a25a"/>
    </svg>
    <span class="wof-label">HP</span>
    <div class="wof-bar wof-hp"><div class="wof-bar-fill"></div></div>
  </div>

  <div class="wof-obj wof-panel"></div>
  <div class="wof-toast info"></div>

  <div class="wof-bl wof-panel">
    <div class="wof-row2">
      <span class="wof-label">GAS</span>
      <div class="wof-canisters">
        <div class="wof-canister"><div class="wof-bar-fill wof-canister-fill g"></div></div>
        <div class="wof-canister"><div class="wof-bar-fill wof-canister-fill g"></div></div>
      </div>
    </div>
    <div class="wof-row2">
      <span class="wof-label">BLADES</span>
      <div class="wof-bar wof-blade"><div class="wof-bar-fill"></div></div>
      <span class="wof-spare"><i>&#x25AE;</i>&times;<b>0</b></span>
    </div>
  </div>

  <div class="wof-cross" data-valid="1" data-lock="0">
    <div class="wof-ring"></div>
    <div class="wof-dot"></div>
    <svg class="wof-x" viewBox="-30 -30 60 60" aria-hidden="true">
      <path d="M-7 -7 L7 7 M7 -7 L-7 7" stroke="#d2402e" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
    </svg>
    <svg class="wof-lock" viewBox="-30 -30 60 60" aria-hidden="true">
      <path d="M-18 -10 V-18 H-10 M18 -10 V-18 H10 M-18 10 V18 H-10 M18 10 V18 H10" fill="none" stroke="#ff4a3a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="wof-dist"></div>
    <div class="wof-hook" data-side="0" data-state="idle">
      <svg viewBox="0 0 16 20"><path d="M12 2 L4 10 L12 18"/></svg><span>Q</span>
    </div>
    <div class="wof-hook" data-side="1" data-state="idle">
      <svg viewBox="0 0 16 20"><path d="M4 2 L12 10 L4 18"/></svg><span>E</span>
    </div>
  </div>
  <div class="wof-napes"></div>

  <div class="wof-br wof-panel">
    <div class="wof-combo"></div>
    <div class="wof-speed-row"><span class="wof-speed">0</span><span class="wof-unit">KM/H</span></div>
    <div class="wof-stat"><span>KILLS</span><b data-k="kills">0</b></div>
    <div class="wof-stat"><span>SCORE</span><b data-k="score">0</b></div>
  </div>

  <div class="wof-dmgs"></div>
  <div class="wof-big"><span></span><i></i></div>
</div>

<div class="wof-screen wof-menu">
  <div class="wof-screen-in">
    <h1 class="wof-title">WINGS OF FREEDOM</h1>
    <div class="wof-subtitle">An unofficial Attack on Titan fan game &middot; not affiliated with the creators or publishers</div>
    <div class="wof-divider"></div>
    <div class="wof-menu-btns">
      <button class="wof-btn" data-mode="expedition"><b>EXPEDITION</b><small>Fight the titans</small></button>
      <button class="wof-btn" data-mode="free"><b>FREE FLIGHT</b><small>No titans, just fly</small></button>
    </div>
    <div class="wof-card wof-panel">
      <div class="wof-card-title">Controls</div>
      <div class="wof-keys" data-keys></div>
      <p class="wof-note">Requires mouse + keyboard; click to capture the mouse.</p>
    </div>
  </div>
</div>

<div class="wof-screen wof-pause">
  <div class="wof-screen-in">
    <div class="wof-card wof-panel wof-pause-card">
      <h2 class="wof-h2">Paused</h2>
      <button class="wof-btn wof-resume"><b>RESUME</b></button>
      <div class="wof-card-title">Controls</div>
      <div class="wof-keys" data-keys></div>
    </div>
  </div>
</div>

<div class="wof-screen wof-death">
  <div class="wof-screen-in">
    <div class="wof-card wof-panel wof-death-card">
      <h1 class="wof-death-title">YOU WERE EATEN</h1>
      <div class="wof-death-stats">
        <div><span>KILLS</span><b data-d="kills">0</b></div>
        <div><span>SCORE</span><b data-d="score">0</b></div>
        <div><span>TIME</span><b data-d="time">0:00</b></div>
      </div>
      <button class="wof-btn wof-retry"><b>RETURN TO THE WALL</b></button>
    </div>
  </div>
</div>
`;

// Control reference: a grid of key rows, shared by the title screen and the pause screen.
const CONTROL_ROWS = `
  <div class="wof-row"><span class="k"><kbd>Mouse</kbd></span><span class="d">Look</span></div>
  <div class="wof-row"><span class="k"><kbd>Q</kbd> <kbd>E</kbd> <small>hold</small></span><span class="d">Left / right hook</span></div>
  <div class="wof-row"><span class="k"><kbd>Right mouse</kbd> <small>hold</small></span><span class="d">Both hooks</span></div>
  <div class="wof-row"><span class="k"><kbd>Space</kbd> <small>hold</small></span><span class="d">Gas boost / reel faster</span></div>
  <div class="wof-row"><span class="k"><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></span><span class="d">Steer / run</span></div>
  <div class="wof-row"><span class="k"><kbd>Shift</kbd></span><span class="d">Gas dash</span></div>
  <div class="wof-row"><span class="k"><kbd>Left mouse</kbd></span><span class="d">Slash <small>hold while hooked to a titan = spin attack</small></span></div>
  <div class="wof-row"><span class="k"><kbd>R</kbd></span><span class="d">Swap blades</span></div>
  <div class="wof-row"><span class="k"><kbd>Ctrl</kbd></span><span class="d">Jump / let go</span></div>
  <div class="wof-row"><span class="k"><kbd>Esc</kbd></span><span class="d">Pause</span></div>
  <div class="wof-row"><span class="k"><kbd>M</kbd></span><span class="d">Mute</span></div>`;

let _cssInjected = false;
function injectStyles() {
  if (_cssInjected) return;
  _cssInjected = true;
  try {
    if (!document.getElementById('wof-hud-fonts')) {
      const link = document.createElement('link');
      link.id = 'wof-hud-fonts';
      link.rel = 'stylesheet';
      link.href = FONT_HREF;
      document.head.appendChild(link);
    }
    const style = document.createElement('style');
    style.id = 'wof-hud-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  } catch (e) { /* no document head: nothing to style */ }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** Number to a 0..1 fraction, quantised to 1/500 so tiny drifts do not touch the DOM. */
function frac(v, fallback) {
  const x = Number(v);
  if (!Number.isFinite(x)) return fallback;
  return Math.round(clamp(x, 0, 1) * 500) / 500;
}
function fmtTime(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return typeof t === 'string' ? t : '--:--';
  const m = Math.floor(n / 60), s = Math.floor(n % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

export class Hud {
  constructor(game) {
    this.game = game;
    this._c = {};                      // last written values, so update() can skip unchanged ones
    this._t = { toast: 0, big: 0 };    // message timers
    this._napes = [];                  // pool of nape marker elements
    this._onStart = null;
    this._onResume = null;
    this._onRetry = null;

    injectStyles();
    const root = document.createElement('div');
    root.className = 'wof-root';
    root.innerHTML = TEMPLATE;
    root.querySelectorAll('[data-keys]').forEach((n) => { n.innerHTML = CONTROL_ROWS; });
    document.body.appendChild(root);
    this.root = root;

    const q = (sel) => root.querySelector(sel);
    const all = (sel) => Array.from(root.querySelectorAll(sel));
    this.el = {
      tl: q('.wof-tl'),
      hpFill: q('.wof-hp .wof-bar-fill'),
      gasWrap: q('.wof-canisters'),
      gasFill: all('.wof-canister-fill'),
      blade: q('.wof-blade'),
      bladeFill: q('.wof-blade .wof-bar-fill'),
      spare: q('.wof-spare b'),
      cross: q('.wof-cross'),
      dist: q('.wof-dist'),
      hooks: all('.wof-hook'),
      napeLayer: q('.wof-napes'),
      speed: q('.wof-speed'),
      combo: q('.wof-combo'),
      kills: q('[data-k="kills"]'),
      score: q('[data-k="score"]'),
      obj: q('.wof-obj'),
      toast: q('.wof-toast'),
      big: q('.wof-big'),
      dmgs: q('.wof-dmgs'),
      menu: q('.wof-menu'),
      pause: q('.wof-pause'),
      death: q('.wof-death'),
      deathTitle: q('.wof-death-title'),
      deathKills: q('[data-d="kills"]'),
      deathScore: q('[data-d="score"]'),
      deathTime: q('[data-d="time"]'),
    };

    // Menu buttons: start a mode. Clicking blurs the button so a later Space/Enter cannot re-click it.
    this.el.menu.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-mode]');
      if (!b) return;
      b.blur();
      const mode = b.getAttribute('data-mode');
      this.hideMenu();
      if (this._onStart) this._onStart(mode);
    });
    q('.wof-resume').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.hidePause();
      if (this._onResume) this._onResume();
    });
    q('.wof-retry').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.hideDeath();
      if (this._onRetry) this._onRetry();
    });
  }

  /** Per-frame HUD refresh. s: see ARCHITECTURE.md. Only changed values touch the DOM. */
  update(s) {
    if (!s) return;
    const c = this._c, el = this.el;

    const hp = frac(s.hp, 1);
    if (c.hp !== hp) {
      c.hp = hp;
      el.hpFill.style.transform = 'scaleX(' + hp + ')';
      el.tl.setAttribute('data-low', hp < 0.3 ? '1' : '0');
    }

    const gas = frac(s.gas, 0);
    if (c.gas !== gas) {
      c.gas = gas;
      // Two canisters: the first covers the upper half of the tank, the second the lower half.
      el.gasFill[0].style.transform = 'scaleX(' + clamp(gas * 2, 0, 1) + ')';
      el.gasFill[1].style.transform = 'scaleX(' + clamp(gas * 2 - 1, 0, 1) + ')';
      const level = gas < 0.2 ? 'r' : gas < 0.5 ? 'a' : 'g';
      if (c.gasLevel !== level) {
        c.gasLevel = level;
        for (const f of el.gasFill) f.className = 'wof-bar-fill wof-canister-fill ' + level;
      }
      el.gasWrap.classList.toggle('pulse', gas < 0.2);
    }

    const blade = frac(s.blade, 1);
    if (c.blade !== blade) {
      c.blade = blade;
      el.bladeFill.style.transform = 'scaleX(' + blade + ')';
      el.blade.classList.toggle('low', blade < 0.25);
    }

    const spare = Math.max(0, Math.floor(Number(s.bladesSpare) || 0));
    if (c.spare !== spare) { c.spare = spare; el.spare.textContent = spare; }

    const kmh = Math.round(Math.max(0, Number(s.speed) || 0) * 3.6);
    if (c.kmh !== kmh) { c.kmh = kmh; el.speed.textContent = kmh; }

    const kills = Math.max(0, Math.floor(Number(s.kills) || 0));
    if (c.kills !== kills) { c.kills = kills; el.kills.textContent = kills; }

    const score = Math.max(0, Math.round(Number(s.score) || 0));
    if (c.score !== score) { c.score = score; el.score.textContent = score.toLocaleString('en-US'); }

    const combo = Math.max(0, Math.floor(Number(s.combo) || 0));
    if (c.combo !== combo) {
      const prev = c.combo || 0;
      c.combo = combo;
      el.combo.textContent = combo > 1 ? '×' + combo + ' COMBO' : '';
      el.combo.classList.toggle('on', combo > 1);
      if (combo > prev && combo > 1) this._pop(el.combo);
    }

    const obj = s.objective ? String(s.objective) : '';
    if (c.obj !== obj) {
      c.obj = obj;
      el.obj.textContent = obj;
      el.obj.classList.toggle('on', obj.length > 0);
    }

    const hooks = s.hooks || [];
    for (let i = 0; i < 2; i++) {
      const st = (hooks[i] && hooks[i].state) || 'idle';
      if (c['hook' + i] !== st) {
        c['hook' + i] = st;
        el.hooks[i].setAttribute('data-state', st);
      }
    }

    const aim = s.aim || {};
    const valid = !!aim.valid;
    const lock = !!aim.lockTitan;
    const aimKey = (valid ? 1 : 0) + (lock ? 2 : 0);
    if (c.aim !== aimKey) {
      c.aim = aimKey;
      el.cross.setAttribute('data-valid', valid ? '1' : '0');
      el.cross.setAttribute('data-lock', lock ? '1' : '0');
    }
    const dist = valid ? Math.round(Math.max(0, Number(aim.distance) || 0)) : -1;
    if (c.dist !== dist) {
      c.dist = dist;
      el.dist.textContent = dist >= 0 ? dist + ' m' : '';
    }

    const marks = s.napeMarkers || [];
    let used = 0;
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (!m || !m.visible) continue;
      const node = this._nape(used++);
      const x = Math.round(m.x), y = Math.round(m.y);
      if (node._x !== x || node._y !== y) {
        node._x = x;
        node._y = y;
        node.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 5) + 'px) rotate(45deg)';
      }
      if (!node._on) { node._on = true; node.style.display = 'block'; }
    }
    for (let i = used; i < this._napes.length; i++) {
      const node = this._napes[i];
      if (node._on) { node._on = false; node.style.display = 'none'; }
    }
  }

  /** Big bold italic damage number that pops at screen (x, y) px, then floats up and fades (~1.2 s). */
  damageNumber(value, screenX, screenY, kill) {
    const layer = this.el.dmgs;
    while (layer.childElementCount > 40) layer.firstElementChild.remove();
    const d = document.createElement('div');
    d.className = kill ? 'wof-dmg kill' : 'wof-dmg';
    d.textContent = String(Math.round(Number(value) || 0));
    d.style.left = Math.round(screenX) + 'px';
    d.style.top = Math.round(screenY) + 'px';
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  /** Centre-top toast (info / warn), or a huge cinematic line in the middle of the screen (big). */
  message(text, seconds = 2.5, style = 'info') {
    const dur = Math.max(0.3, Number(seconds) || 2.5) * 1000;
    if (style === 'big') {
      const el = this.el.big;
      el.firstElementChild.textContent = String(text);
      el.classList.remove('on');
      void el.offsetWidth; // restart the entrance animation
      el.classList.add('on');
      clearTimeout(this._t.big);
      this._t.big = setTimeout(() => el.classList.remove('on'), dur);
      return;
    }
    const el = this.el.toast;
    el.textContent = String(text);
    el.classList.remove('on', 'info', 'warn');
    void el.offsetWidth;
    el.classList.add(style === 'warn' ? 'warn' : 'info', 'on');
    clearTimeout(this._t.toast);
    this._t.toast = setTimeout(() => el.classList.remove('on'), dur);
  }

  /** Title screen. onStart(mode) is called with 'expedition' or 'free'. */
  showMenu(onStart) {
    this._onStart = onStart || null;
    this.el.menu.classList.add('on');
    this._syncHud();
  }

  hideMenu() {
    this.el.menu.classList.remove('on');
    this._syncHud();
  }

  /** Death screen. stats: { cause, kills, score, time (seconds) }. onRetry() after "RETURN TO THE WALL". */
  showDeath(stats, onRetry) {
    const st = stats || {};
    this._onRetry = onRetry || null;
    this.el.deathTitle.textContent = st.cause ? String(st.cause) : 'YOU WERE EATEN';
    this.el.deathKills.textContent = Math.max(0, Math.floor(Number(st.kills) || 0));
    this.el.deathScore.textContent = Math.max(0, Math.round(Number(st.score) || 0)).toLocaleString('en-US');
    this.el.deathTime.textContent = fmtTime(st.time);
    this.el.pause.classList.remove('on');
    this.el.death.classList.add('on');
    this._syncHud();
  }

  hideDeath() {
    this.el.death.classList.remove('on');
    this._syncHud();
  }

  /** Pause screen. onResume() after the RESUME button. */
  showPause(onResume) {
    this._onResume = onResume || null;
    this.el.pause.classList.add('on');
    this._syncHud();
  }

  hidePause() {
    this.el.pause.classList.remove('on');
    this._syncHud();
  }

  // ---- internals ----

  /** The in-game HUD is hidden behind the title, pause and death screens. */
  _syncHud() {
    const off = this.el.menu.classList.contains('on')
      || this.el.pause.classList.contains('on')
      || this.el.death.classList.contains('on');
    this.root.classList.toggle('hud-off', off);
  }

  _nape(i) {
    while (this._napes.length <= i) {
      const node = document.createElement('div');
      node.className = 'wof-nape';
      node.style.display = 'none';
      this.el.napeLayer.appendChild(node);
      this._napes.push(node);
    }
    return this._napes[i];
  }

  _pop(node) {
    if (typeof node.animate !== 'function') return;
    node.animate(
      [{ transform: 'scale(1.5)', filter: 'brightness(1.7)' }, { transform: 'scale(1)', filter: 'brightness(1)' }],
      { duration: 340, easing: 'ease-out' });
  }
}
