const { RACINE, MODELES, POSTERS, travail } = require('./_socle.cjs');
// Explorer rotX × rotY pour trouver la pose "debout" d'un outil horizontal.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=playwright();
const T=__dirname+'/_3dtest/node_modules/three', M=MODELES, OUT=__dirname+'/orient';
const MIME={'.js':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const H=`<!doctype html><body style="margin:0"><script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script><canvas id=c width=560 height=560></canvas>
<script type=module>
import*as THREE from'three';import{GLTFLoader}from'/three/examples/jsm/loaders/GLTFLoader.js';import{DRACOLoader}from'/three/examples/jsm/loaders/DRACOLoader.js';
const q=new URLSearchParams(location.search);const glb=q.get('glb');const rx=parseFloat(q.get('rx'))*Math.PI/180;const ry=parseFloat(q.get('ry'))*Math.PI/180;
const cv=document.getElementById('c');const Rr=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true,preserveDrawingBuffer:true});
Rr.setSize(560,560,false);Rr.setClearColor(0,0);Rr.outputColorSpace=THREE.SRGBColorSpace;Rr.toneMapping=THREE.ACESFilmicToneMapping;Rr.toneMappingExposure=1.1;
const s=new THREE.Scene();const cam=new THREE.PerspectiveCamera(28,1,.01,50000);
s.add(new THREE.AmbientLight(0xffffff,1.2));const k=new THREE.DirectionalLight(0xffffff,2.4);k.position.set(4,6,5);s.add(k);const f=new THREE.DirectionalLight(0xffffff,1);f.position.set(-5,2,-1);s.add(f);const rl=new THREE.DirectionalLight(0xffffff,1.4);rl.position.set(-1,3,-6);s.add(rl);
const d=new DRACOLoader();d.setDecoderPath('/three/examples/jsm/libs/draco/');const Lo=new GLTFLoader();Lo.setDRACOLoader(d);
Lo.load('/models/'+encodeURIComponent(glb),(g)=>{const o=g.scene;o.rotation.set(rx,ry,0);const b=new THREE.Box3().setFromObject(o);const c=b.getCenter(new THREE.Vector3()),sz=b.getSize(new THREE.Vector3());o.position.sub(c);s.add(o);const md=Math.max(sz.x,sz.y,sz.z);const dist=md/(2*Math.tan(THREE.MathUtils.degToRad(14)))*1.15;cam.position.set(.5*dist,.32*dist,.92*dist);cam.lookAt(0,0,0);Rr.render(s,cam);requestAnimationFrame(()=>{Rr.render(s,cam);window.__png=cv.toDataURL('image/png');window.__done=1;});},undefined,(e)=>{window.__error=String(e&&e.message||e);});
</script>`;
const srv=http.createServer((rq,res)=>{const u=decodeURIComponent(rq.url.split('?')[0]);if(u=='/r'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(H);}let fi;if(u.startsWith('/three/'))fi=path.join(T,u.slice(7));else if(u.startsWith('/models/'))fi=path.join(M,u.slice(8));else{res.writeHead(404);return res.end();}if(!fs.existsSync(fi)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':MIME[path.extname(fi)]||'application/octet-stream'});res.end(fs.readFileSync(fi));});
const glb=process.argv[2];
(async()=>{await new Promise(r=>srv.listen(0,r));const base='http://localhost:'+srv.address().port;
const br=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await(await br.newContext({viewport:{width:560,height:560}})).newPage();
for(const rx of [90,-90]) for(const ry of [0,90,180,270]){await pg.goto(base+'/r?glb='+encodeURIComponent(glb)+'&rx='+rx+'&ry='+ry,{waitUntil:'domcontentloaded'});await pg.waitForFunction('window.__done||window.__error',{timeout:25000});const err=await pg.evaluate(()=>window.__error);if(err){console.log('ERR',rx,ry,err);continue;}const du=await pg.evaluate(()=>window.__png);fs.writeFileSync(OUT+'/g_'+rx+'_'+ry+'.png',Buffer.from(du.split(',')[1],'base64'));process.stdout.write(`${rx}/${ry} `);}
console.log('\nOK');await br.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
