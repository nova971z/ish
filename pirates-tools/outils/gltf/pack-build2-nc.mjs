// Builder pack 2 OUTILS SANS COFFRET (compo photo réf) : 2 outils debout en
// ARRIÈRE côte à côte, batteries (gauche) + chargeur (droite) en rangée AVANT.
// Args par outil : <file> <max> <rotY> <rotX>. + outPath.
import { NodeIO, getBounds, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco, mergeDocuments, textureCompress, weld, simplify } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
await MeshoptSimplifier.ready;
const M='/home/user/ish/pirates-tools/models/products';
const [t1F,t1M,t1Ry,t1Rx, t2F,t2M,t2Ry,t2Rx, outPath]=process.argv.slice(2);
const io=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const D=a=>a*Math.PI/180;
function quatXY(rx,ry){const s1=Math.sin(rx/2),c1=Math.cos(rx/2),s2=Math.sin(ry/2),c2=Math.cos(ry/2);return [s1*c2,c1*s2,s1*s2,c1*c2];}
const comps=[
 [t1F, Number(t1M), quatXY(D(+t1Rx),D(+t1Ry)), 'toolR'],
 [t2F, Number(t2M), quatXY(D(+t2Rx),D(+t2Ry)), 'toolL'],
 ['dcb1104.glb',150, quatXY(0,0),        'charger'],
 ['dcb184.glb', 85,  quatXY(0,Math.PI/2),'bat1'],
 ['dcb184.glb', 85,  quatXY(0,Math.PI/2),'bat2'],
];
const doc=new Document(); const scene=doc.createScene('pack'); const P={};
for(const [file,realMax,quat,name] of comps){
  const cdoc=await io.read(M+'/'+file);
  const before=new Set(doc.getRoot().listScenes());
  mergeDocuments(doc, cdoc);
  const ns=doc.getRoot().listScenes().find(s=>!before.has(s));
  const wrap=doc.createNode(name);
  ns.listChildren().forEach(ch=>{ ns.removeChild(ch); wrap.addChild(ch); });
  scene.addChild(wrap); ns.dispose();
  let b=getBounds(wrap); let sz=[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]];
  const scale=realMax/Math.max(...sz);
  wrap.setRotation(quat); wrap.setScale([scale,scale,scale]);
  b=getBounds(wrap); sz=[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]];
  P[name]={wrap,w:sz[0],h:sz[1],dp:sz[2],cx:(b.min[0]+b.max[0])/2,cz:(b.min[2]+b.max[2])/2,minY:b.min[1]};
}
// rangée AVANT : 2 batteries à gauche, chargeur à droite (compo photo)
const zF=150, G=20;
P.bat1.tx=-100;                                   P.bat1.tz=zF;
P.bat2.tx=P.bat1.tx+P.bat1.w/2+G+P.bat2.w/2;      P.bat2.tz=zF;
P.charger.tx=P.bat2.tx+P.bat2.w/2+2*G+P.charger.w/2; P.charger.tz=zF;
// 2 outils debout, ARRIÈRE, côte à côte, centrés sur l'ensemble en X
const gap=-10;
const totalW=P.toolL.w+gap+P.toolR.w;
const accCx=(P.bat1.tx-P.bat1.w/2 + P.charger.tx+P.charger.w/2)/2;
const accBack=Math.min(P.bat1.tz,P.bat2.tz,P.charger.tz) - Math.max(P.bat1.dp,P.bat2.dp,P.charger.dp)/2;
const TZB=process.env.TZB!==undefined?Number(process.env.TZB):40;   // recul supplémentaire des outils
const TSHIFT=process.env.TSHIFT!==undefined?Number(process.env.TSHIFT):-70; // décalage outils vers la gauche
const zb=accBack - G - Math.max(P.toolL.dp,P.toolR.dp)/2 - 10 - TZB;
P.toolL.tz=zb; P.toolR.tz=zb;
P.toolL.tx=accCx-totalW/2+P.toolL.w/2 + TSHIFT;
P.toolR.tx=P.toolL.tx+P.toolL.w/2+gap+P.toolR.w/2;
for(const p of [P.charger,P.bat1,P.bat2,P.toolL,P.toolR]) p.wrap.setTranslation([p.tx-p.cx,-p.minY,p.tz-p.cz]);
// garde : outils vs accessoires (strict)
const CLR=8;
const box=p=>({x0:p.tx-p.w/2,x1:p.tx+p.w/2,z0:p.tz-p.dp/2,z1:p.tz+p.dp/2});
const clr=(a,b)=>{const A=box(a),B=box(b);return Math.max(Math.max(B.x0-A.x1,A.x0-B.x1),Math.max(B.z0-A.z1,A.z0-B.z1));};
const pb=[];for(const t of ['toolL','toolR'])for(const k of ['charger','bat1','bat2']){if(clr(P[t],P[k])<CLR)pb.push(`${t}×${k}:${clr(P[t],P[k]).toFixed(1)}`);}
if(pb.length){console.error('❌ chevauchement:\n '+pb.join('\n '));process.exit(2);}
console.log('✓ 0 chevauchement (sans coffret)');
await doc.transform(dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:0.28,error:0.001}),prune(),draco(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}));
const buf=doc.getRoot().listBuffers()[0];
doc.getRoot().listAccessors().forEach(a=>a.setBuffer(buf));
doc.getRoot().listBuffers().slice(1).forEach(b=>b.dispose());
await io.write(outPath,doc);
console.log('OK',outPath.split('/').pop());
