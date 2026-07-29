import { readFileSync, writeFileSync } from 'fs';
const LOGO = readFileSync(new URL('./logo-datauri.txt', import.meta.url),'utf8').trim();
const rows = JSON.parse(readFileSync(new URL('./competitors.json', import.meta.url)));
// 3 comparaisons chocs : plus gros € + plus gros % + une ronde
const pick = [
  rows.find(r=>r.root==='DCG200'),   // -577€
  rows.find(r=>r.root==='DCB184'),   // -54%
  rows.find(r=>r.root==='DCP580'),   // rabot -287€
];
const e0=n=>Math.round(n).toLocaleString('fr-FR')+' €';
const cards = pick.map(r=>`
  <div class="c">
    <div class="cn">${r.title.replace(/ \(.*/,'').replace('— ','')}</div>
    <div class="cp"><span class="them">${e0(r.localAvg)}</span><span class="arr">→</span><span class="us">${e0(r.mine)}</span><span class="sv">−${r.savePct}%</span></div>
  </div>`).join('');
const html = `<div class="sq">
  <img class="logo" src="${LOGO}" alt="">
  <div class="kick">PRIX DEWALT · GUADELOUPE</div>
  <h1>Les mêmes outils.<br><em>Jusqu'à −54% moins cher.</em></h1>
  <div class="cards">${cards}</div>
  <div class="foot"><b>−40% en moyenne</b> face aux magasins de Jarry · <b>pirates-tools.com</b></div>
</div>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#15171c}
.sq{width:1080px;height:1080px;background:radial-gradient(120% 90% at 50% 0%,#232732 0%,#15171c 60%);color:#f2f3f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:64px 60px;display:flex;flex-direction:column;align-items:center;text-align:center;font-variant-numeric:tabular-nums}
.logo{width:150px;height:auto;filter:drop-shadow(0 6px 20px rgba(0,0,0,.5));margin-bottom:18px}
.kick{background:#FEBD17;color:#191b1f;font-weight:800;font-size:20px;letter-spacing:.1em;padding:8px 20px;border-radius:999px;margin-bottom:26px}
h1{font-size:66px;line-height:1.05;font-weight:900;letter-spacing:-.02em;margin-bottom:40px}
h1 em{font-style:normal;color:#FEBD17}
.cards{display:flex;flex-direction:column;gap:18px;width:100%;margin-bottom:36px}
.c{background:#1c1f26;border:1px solid #2a2e37;border-left:6px solid #FEBD17;border-radius:16px;padding:22px 26px;text-align:left}
.cn{font-size:26px;font-weight:800;margin-bottom:10px}
.cp{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:900}
.them{color:#ff6a54;text-decoration:line-through;text-decoration-thickness:3px}
.arr{color:#9aa2ad;font-size:26px}
.us{color:#fff}
.sv{margin-left:auto;background:#41c98a;color:#08130d;font-size:26px;padding:4px 14px;border-radius:10px}
.foot{font-size:24px;color:#c8ccd2;margin-top:auto}
.foot b{color:#FEBD17}
</style>`;
writeFileSync(new URL('./square.html', import.meta.url), html);
console.log('ok');
