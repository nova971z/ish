const { RACINE, MODELES, POSTERS, travail } = require('./_socle.cjs');
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=playwright();
const T=__dirname+'/_3dtest/node_modules/three', M=MODELES, OUT=__dirname+'/objs';
const MIME={'.js':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const H=`<!doctype html><body style="margin:0"><script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script><canvas id=c width=900 height=900></canvas>
<script type=module>
import*as THREE from'three';import{GLTFLoader}from'/three/examples/jsm/loaders/GLTFLoader.js';import{DRACOLoader}from'/three/examples/jsm/loaders/DRACOLoader.js';
const q=new URLSearchParams(location.search);const glb=q.get('glb');const a=q.get('a').split(',').map(Number);const ry=parseFloat(q.get('ry')||'0');
const cv=document.getElementById('c');const Rr=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true,preserveDrawingBuffer:true});
Rr.setSize(900,900,false);Rr.setClearColor(0,0);Rr.outputColorSpace=THREE.SRGBColorSpace;Rr.toneMapping=THREE.ACESFilmicToneMapping;Rr.toneMappingExposure=1.0;
const s=new THREE.Scene();const cam=new THREE.PerspectiveCamera(28,1,.01,50000);
s.add(new THREE.AmbientLight(0xffffff,1.15));const k=new THREE.DirectionalLight(0xffffff,2.2);k.position.set(4,6,5);s.add(k);const f=new THREE.DirectionalLight(0xffffff,1);f.position.set(-5,2,-1);s.add(f);const rl=new THREE.DirectionalLight(0xffffff,1.3);rl.position.set(-1,3,-6);s.add(rl);
const d=new DRACOLoader();d.setDecoderPath('/three/examples/jsm/libs/draco/');const Lo=new GLTFLoader();Lo.setDRACOLoader(d);
Lo.load('/models/'+encodeURIComponent(glb),(g)=>{const o=g.scene;if(ry)o.rotation.y=ry;const b=new THREE.Box3().setFromObject(o);const c=b.getCenter(new THREE.Vector3()),sz=b.getSize(new THREE.Vector3());o.position.sub(c);s.add(o);const md=Math.max(sz.x,sz.y,sz.z);const dist=md/(2*Math.tan(THREE.MathUtils.degToRad(14)))*1.1;cam.position.set(a[0]*dist,a[1]*dist,a[2]*dist);cam.lookAt(0,0,0);Rr.render(s,cam);requestAnimationFrame(()=>{Rr.render(s,cam);window.__png=cv.toDataURL('image/png');window.__done=1;});},undefined,(e)=>{window.__error=String(e&&e.message||e);});
</script>`;
const srv=http.createServer((rq,res)=>{const u=decodeURIComponent(rq.url.split('?')[0]);if(u=='/r'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(H);}let fi;if(u.startsWith('/three/'))fi=path.join(T,u.slice(7));else if(u.startsWith('/models/'))fi=path.join(M,u.slice(8));else{res.writeHead(404);return res.end();}if(!fs.existsSync(fi)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':MIME[path.extname(fi)]||'application/octet-stream'});res.end(fs.readFileSync(fi));});
const jobs=[
 ['dcf894n.glb','tool_894','.8,.42,.7',Math.PI/2],
 ['dcd796.glb','tool_796','.8,.42,.7',Math.PI/2],
 ['DCF850N.glb','tool_850','.8,.42,.7',0],
];
(async()=>{await new Promise(r=>srv.listen(0,r));const base='http://localhost:'+srv.address().port;
const br=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await(await br.newContext({viewport:{width:900,height:900}})).newPage();
for(const [glb,name,a,ry] of jobs){await pg.goto(base+'/r?glb='+encodeURIComponent(glb)+'&a='+a+'&ry='+ry,{waitUntil:'domcontentloaded'});await pg.waitForFunction('window.__done||window.__error',{timeout:25000});const err=await pg.evaluate(()=>window.__error);if(err){console.log('ERR',name,err);continue;}const du=await pg.evaluate(()=>window.__png);fs.writeFileSync(OUT+'/'+name+'.png',Buffer.from(du.split(',')[1],'base64'));process.stdout.write(name+' ');}
console.log('\nOK');await br.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
