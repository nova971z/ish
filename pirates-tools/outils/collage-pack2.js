// Poster pack 2 OUTILS = collage 2D. Coffret + chargeur + 2 batteries aux MÊMES
// slots que le poster DCF887P2 ; 2 outils côte à côte à droite (gabarit hauteur).
// args: <toolLImg> <toolRImg> <outWebpName>
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const OBJS=__dirname+'/objs';
const [toolL,toolR,outName]=process.argv.slice(2);
const RECTS={ case:[262,268,432], charger:[272,500,222], bat1:[128,632,208], bat2:[300,668,208] };
// 2 outils : hauteur commune, base commune, côte à côte (léger chevauchement OK)
const TOOLS={ h:412, bottom:728, L:{img:toolL,cx:470}, R:{img:toolR,cx:672} };
const LAYERS=[['case','case'],['charger','charger'],['bat1','bat_r90'],['bat2','bat_r90']];
const HTML=`<!doctype html><body style="margin:0"><canvas id=c width=800 height=800></canvas>
<script>
const RECTS=${JSON.stringify(RECTS)};const LAYERS=${JSON.stringify(LAYERS)};const TOOLS=${JSON.stringify(TOOLS)};
const cv=document.getElementById('c'),X=cv.getContext('2d');
function trim(img){const t=document.createElement('canvas');t.width=img.width;t.height=img.height;const tx=t.getContext('2d');tx.drawImage(img,0,0);const d=tx.getImageData(0,0,t.width,t.height).data;let x0=t.width,y0=t.height,x1=0,y1=0;for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){if(d[(y*t.width+x)*4+3]>16){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}return {t,x0,y0,w:x1-x0+1,h:y1-y0+1};}
function load(src){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});}
(async()=>{
 for(const [key,file] of LAYERS){const img=await load('/o/'+file+'.png');const c=trim(img);const [cx,cy,w]=RECTS[key];const scale=w/c.w;const h=c.h*scale;X.drawImage(c.t,c.x0,c.y0,c.w,c.h, cx-w/2, cy-h/2, w, h);}
 for(const T of [TOOLS.L,TOOLS.R]){const img=await load('/o/'+T.img+'.png');const c=trim(img);const scale=TOOLS.h/c.h;const w=c.w*scale,h=TOOLS.h;X.drawImage(c.t,c.x0,c.y0,c.w,c.h, T.cx-w/2, TOOLS.bottom-h, w, h);}
 window.__webp=cv.toDataURL('image/webp',0.92);window.__done=1;
})();
</script></body>`;
const srv=http.createServer((q,res)=>{const u=decodeURIComponent(q.url.split('?')[0]);
 if(u=='/clean'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(HTML);}
 if(u.startsWith('/o/')){const fi=path.join(OBJS,u.slice(3));if(!fs.existsSync(fi)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':'image/png'});return res.end(fs.readFileSync(fi));}
 res.writeHead(404);res.end();});
(async()=>{await new Promise(r=>srv.listen(0,r));const base='http://localhost:'+srv.address().port;
const b=await chromium.launch({args:['--no-sandbox']});const p=await(await b.newContext({viewport:{width:800,height:800}})).newPage();
await p.goto(base+'/clean',{waitUntil:'domcontentloaded'});await p.waitForFunction('window.__done',{timeout:15000});
const du=await p.evaluate(()=>window.__webp);
fs.writeFileSync('/home/user/ish/pirates-tools/images/posters/'+outName,Buffer.from(du.split(',')[1],'base64'));
console.log('OK',outName);await b.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
