// Builder pack 2 OUTILS — côte à côte au premier plan. Accessoires (chargeur +
// 2 batteries + coffret) VERROUILLÉS au mapping DCF887P2. Les 2 outils sont
// posés côte à côte devant la rangée d'accessoires, chacun à SON orientation
// validée (chuck gauche, logo DEWALT face). Garde anti-chevauchement : outils vs
// accessoires ET outils entre eux. Plante si chevauchement.
// Args: <t1File> <t1Max> <t1Rot> <t2File> <t2Max> <t2Rot> <outPath>
import { NodeIO, getBounds, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco, mergeDocuments, textureCompress, weld, simplify } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
await MeshoptSimplifier.ready;
const M='/home/user/ish/pirates-tools/models/products';
// Args par outil : <file> <max> <rotY> <rotX>. rotX permet de mettre DEBOUT un
// outil modélisé à l'horizontale (ex. meuleuse). rotX=0 pour les outils droits.
const [t1F,t1M,t1Ry,t1Rx, t2F,t2M,t2Ry,t2Rx, outPath]=process.argv.slice(2);
// MAPPING VERROUILLÉ (accessoires)
const MAP={ case:{cx:-40,cz:-122}, charger:{cx:-80,cz:157}, bat1:{cx:8,cz:168}, bat2:{cx:84,cz:162} };
const io=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const D=a=>a*Math.PI/180;
// Quaternion pour une rotation d'Euler ordre XYZ (rz=0) — identique à
// three.js o.rotation.set(rx,ry,0) utilisé pour choisir la pose à l'œil.
function quatXY(rx,ry){const s1=Math.sin(rx/2),c1=Math.cos(rx/2),s2=Math.sin(ry/2),c2=Math.cos(ry/2);return [s1*c2, c1*s2, s1*s2, c1*c2];}
const comps=[
 [t1F, Number(t1M), quatXY(D(+t1Rx),D(+t1Ry)), 'toolR'], // outil de DROITE
 [t2F, Number(t2M), quatXY(D(+t2Rx),D(+t2Ry)), 'toolL'], // outil de GAUCHE
 ['dcb1104.glb',150, quatXY(0,0),        'charger'],
 ['dcb184.glb', 85,  quatXY(0,Math.PI/2),'bat1'],
 ['dcb184.glb', 85,  quatXY(0,Math.PI/2),'bat2'],
 ['Tstack.glb', 400, quatXY(0,0),        'case'],
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
for(const k of ['case','charger','bat1','bat2']){ P[k].tx=MAP[k].cx; P[k].tz=MAP[k].cz; }
// 2 outils côte à côte, en ZONE AVANT-DROITE (comme les packs 1-outil), à DROITE
// des batteries → chargeur + 2 batteries restent VISIBLES à gauche.
const GACC=48, gap=(process.env.GAP!==undefined?Number(process.env.GAP):-20), zt=209; // gap réglable (peut être négatif : imbrication mandrin/vide)
P.toolL.tz=zt; P.toolR.tz=zt;
P.toolL.tx = P.bat2.tx + P.bat2.w/2 + GACC + P.toolL.w/2;   // décalé à droite des batteries
P.toolR.tx = P.toolL.tx + P.toolL.w/2 + gap + P.toolR.w/2;

// Décalage horizontal du CLUSTER AVANT (chargeur + 2 batteries + 2 outils),
// coffret fixe. SHIFT<0 = vers la gauche.
const SHIFT = process.env.SHIFT!==undefined ? Number(process.env.SHIFT) : -50;
for(const k of ['charger','bat1','bat2','toolL','toolR']) P[k].tx += SHIFT;
for(const p of [P.case,P.charger,P.bat1,P.bat2,P.toolL,P.toolR]) p.wrap.setTranslation([p.tx-p.cx,-p.minY,p.tz-p.cz]);

const CLR=8;
const box=p=>({x0:p.tx-p.w/2,x1:p.tx+p.w/2,z0:p.tz-p.dp/2,z1:p.tz+p.dp/2});
const clearance=(a,b)=>{const A=box(a),B=box(b);return Math.max(Math.max(B.x0-A.x1,A.x0-B.x1),Math.max(B.z0-A.z1,A.z0-B.z1));};
const problems=[];
// STRICT : outils vs accessoires (jamais de chevauchement).
for(const t of ['toolL','toolR']) for(const k of ['case','charger','bat1','bat2']){const cl=clearance(P[t],P[k]);if(cl<CLR)problems.push(`${t}×${k}: ${cl.toFixed(1)}mm`);}
// SOUPLE : entre les 2 outils, l'imbrication mandrin/vide est permise → on
// n'échoue pas, on log la clairance des BOÎTES (la vérif réelle = rendu).
{const cl=clearance(P.toolL,P.toolR);console.log('  clairance boîtes toolL×toolR = '+cl.toFixed(1)+'mm (gap='+gap+')');}
const layout={t1:t1F,t2:t2F,components:{}};
for(const k of Object.keys(P)){const p=P[k];layout.components[k]={cx:Math.round(p.tx),cz:Math.round(p.tz),w:Math.round(p.w),dp:Math.round(p.dp)};}
writeFileSync('/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/pack-layout2.json',JSON.stringify(layout,null,2));
if(problems.length){console.error('❌ CHEVAUCHEMENT — build refusé :\n  '+problems.join('\n  '));process.exit(2);}
console.log('✓ 0 chevauchement (2 outils côte à côte, accessoires au mapping)');
// 2 outils = ~2× maillage → décimation plus forte (0.22) pour rester < 3 Mo.
await doc.transform(dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:0.22,error:0.001}),prune(),draco(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}));
const buf=doc.getRoot().listBuffers()[0];
doc.getRoot().listAccessors().forEach(a=>a.setBuffer(buf));
doc.getRoot().listBuffers().slice(1).forEach(b=>b.dispose());
await io.write(outPath,doc);
console.log('OK',outPath.split('/').pop());
