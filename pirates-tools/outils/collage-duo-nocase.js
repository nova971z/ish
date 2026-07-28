// Poster duo SANS COFFRET — compo de la photo réf : 2 outils en haut,
// 2 batteries en bas-gauche (empilées), chargeur en bas-droite.
// args: <toolLImg> <toolRImg> <outWebpName>
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const OBJS=__dirname+'/objs';
const [toolL,toolR,outName]=process.argv.slice(2);
// [cx,cy,width] dans l'espace 800x800 ; bat & tools par hauteur/base
const LAYOUT={
  toolL:{img:toolL, cx:250, bottom:500, h:440},   // outil haut-gauche (le plus gros)
  toolR:{img:toolR, cx:595, bottom:505, h:355},   // outil haut-droite
  bat1: {img:'bat_r90', cx:150, cy:585, w:250},   // batterie haut de pile
  bat2: {img:'bat_r90', cx:215, cy:688, w:250},   // batterie bas de pile (décalée)
  charger:{img:'charger', cx:575, cy:632, w:300},
};
const HTML=`<!doctype html><body style="margin:0"><canvas id=c width=800 height=800></canvas>
<script>
const L=${JSON.stringify(LAYOUT)};
const cv=document.getElementById('c'),X=cv.getContext('2d');
function trim(img){const t=document.createElement('canvas');t.width=img.width;t.height=img.height;const tx=t.getContext('2d');tx.drawImage(img,0,0);const d=tx.getImageData(0,0,t.width,t.height).data;let x0=t.width,y0=t.height,x1=0,y1=0;for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){if(d[(y*t.width+x)*4+3]>16){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}return {t,x0,y0,w:x1-x0+1,h:y1-y0+1};}
function load(src){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});}
async function drawH(key){const o=L[key];const img=await load('/o/'+o.img+'.png');const c=trim(img);const scale=o.h/c.h;const w=c.w*scale,h=o.h;X.drawImage(c.t,c.x0,c.y0,c.w,c.h, o.cx-w/2, o.bottom-h, w, h);}
async function drawW(key){const o=L[key];const img=await load('/o/'+o.img+'.png');const c=trim(img);const scale=o.w/c.w,h=c.h*scale;X.drawImage(c.t,c.x0,c.y0,c.w,c.h, o.cx-o.w/2, o.cy-h/2, o.w, h);}
(async()=>{
 await drawW('charger'); await drawW('bat1'); await drawW('bat2'); // accessoires derrière
 await drawH('toolL'); await drawH('toolR');                       // outils au-dessus
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
