const { RACINE, MODELES, POSTERS, travail } = require('./_socle.cjs');
// Render a single GLB at 4 Y-rotations from the fixed PDP camera (E ≈ 25/72),
// to identify the "hero" facing of the tool and the face of the case.
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = playwright();
const THREE_DIR='three';
const MODELS=MODELES;
const OUT=travail() + '/orient';
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.js':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const HTML=`<!doctype html><html><body style="margin:0">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script>
<canvas id="c" width="700" height="700"></canvas>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '/three/examples/jsm/loaders/DRACOLoader.js';
const q=new URLSearchParams(location.search); const glb=q.get('glb'); const ry=Number(q.get('ry'))*Math.PI/180;
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setSize(700,700,false); renderer.setClearColor(0,0);
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15;
const scene=new THREE.Scene(); const camera=new THREE.PerspectiveCamera(28,1,0.01,10000);
scene.add(new THREE.AmbientLight(0xffffff,1.2));
const k=new THREE.DirectionalLight(0xffffff,2.6);k.position.set(4,6,5);scene.add(k);
const f=new THREE.DirectionalLight(0xffffff,1.1);f.position.set(-5,2,-1);scene.add(f);
const r=new THREE.DirectionalLight(0xffffff,1.5);r.position.set(-1,3,-6);scene.add(r);
const draco=new DRACOLoader();draco.setDecoderPath('/three/examples/jsm/libs/draco/');
const loader=new GLTFLoader();loader.setDRACOLoader(draco);
loader.load('/models/'+glb,(g)=>{
  const o=g.scene; o.rotation.y=ry;
  const box=new THREE.Box3().setFromObject(o); const size=box.getSize(new THREE.Vector3()), c=box.getCenter(new THREE.Vector3());
  o.position.sub(c); scene.add(o);
  const maxDim=Math.max(size.x,size.y,size.z); const dist=maxDim/(2*Math.tan(THREE.MathUtils.degToRad(14)))*1.15;
  camera.position.set(0.5*dist,0.32*dist,0.92*dist); camera.lookAt(0,0,0);
  renderer.render(scene,camera); requestAnimationFrame(()=>{renderer.render(scene,camera);window.__done=true;});
},undefined,(e)=>{window.__error=String(e&&e.message||e);});
</script></body></html>`;
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);if(u==='/r.html'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(HTML);}let file;if(u.startsWith('/three/'))file=path.join(THREE_DIR,u.slice(7));else if(u.startsWith('/models/'))file=path.join(MODELS,u.slice(8));else{res.writeHead(404);return res.end();}if(!fs.existsSync(file)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));});
const glb=process.argv[2]||'_tmp_tool.glb'; const tag=process.argv[3]||'tool';
async function run(){
  await new Promise(r=>server.listen(0,r)); const base=`http://localhost:${server.address().port}`;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const page=await (await browser.newContext({viewport:{width:700,height:700}})).newPage();
  for(const ry of [0,90,180,270]){
    await page.goto(base+'/r.html?glb='+glb+'&ry='+ry,{waitUntil:'domcontentloaded'});
    await page.waitForFunction('window.__done||window.__error',{timeout:20000});
    const err=await page.evaluate('window.__error||""'); if(err) console.log('ERR',ry,err);
    await page.$('#c').then(el=>el.screenshot({path:path.join(OUT,tag+'_'+ry+'.png'),omitBackground:true}));
    console.log('rendu',tag,ry);
  }
  await browser.close(); server.close();
}
run().catch(e=>{console.error(e);process.exit(1);});
