// Builder générique de pack 3D — GARDE-FOUS :
//  1) ACCESSOIRES VERROUILLÉS AU MAPPING : chargeur + 2 batteries + coffret sont
//     les MÊMES objets sur tous les packs → placés aux coordonnées EXACTES du
//     mapping validé DCF887P2 (jamais recalculés).
//  2) OUTIL HÉROS : placé à la position mapping (168,209) ; ne se décale (vers la
//     droite, au minimum) QUE s'il est plus gros et chevaucherait un accessoire.
//  3) ANTI-CHEVAUCHEMENT : le build PLANTE si deux emprises se touchent.
//  Orientation de l'outil : passée en arg (déterminée par rendu 4×90°, doit
//  matcher la RÉFÉRENCE DCF887 : chuck à gauche + logo DEWALT face, jamais le dos
//  ni un logo miroir).
// Args: <toolFile> <toolMax(mm)> <rotYdeg> <outPath>
import { NodeIO, getBounds, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco, mergeDocuments, textureCompress, weld, simplify } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
await MeshoptSimplifier.ready;
const M='/home/user/ish/pirates-tools/models/products';
// Args: <toolFile> <toolMax> <rotYdeg> [rotXdeg] <outPath>
// rotXdeg optionnel (défaut 0) — pour redresser un outil au pitch tordu.
const _a=process.argv.slice(2);
let toolFile, toolMaxS, toolRotDegS, toolRotXDegS, outPath;
if(_a.length>=5){ [toolFile,toolMaxS,toolRotDegS,toolRotXDegS,outPath]=_a; }
else { [toolFile,toolMaxS,toolRotDegS,outPath]=_a; toolRotXDegS='0'; }
const toolMax=Number(toolMaxS), toolRotY=Number(toolRotDegS)*Math.PI/180, toolRotX=Number(toolRotXDegS)*Math.PI/180;

// ── MAPPING VERROUILLÉ (coordonnées validées DCF887P2, mm) ──
// Voir pirates-tools/docs/PACK-3D-LAYOUT.md. Ne PAS modifier sans revalidation.
const MAP = {
  case:    { cx: -40,  cz: -122 },
  charger: { cx: -80,  cz: 157  },
  bat1:    { cx: 8,    cz: 168  },
  bat2:    { cx: 84,   cz: 162  },
  tool:    { cx: 168,  cz: 209  }, // position par défaut de l'outil héros
};

const io=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
function quatY(a){return [0, Math.sin(a/2), 0, Math.cos(a/2)];}
// Euler XYZ (rz=0) → quaternion (identique à three.js o.rotation.set(rx,ry,0)).
function quatXY(rx,ry){const s1=Math.sin(rx/2),c1=Math.cos(rx/2),s2=Math.sin(ry/2),c2=Math.cos(ry/2);return [s1*c2,c1*s2,s1*s2,c1*c2];}
// QUAT env (x,y,z,w) = pose EXACTE figée (ex. inclinaison choisie à l'œil) ;
// sinon rotation Euler rotX/rotY.
const toolQuat = process.env.QUAT ? process.env.QUAT.split(',').map(Number) : quatXY(toolRotX,toolRotY);
const comps=[
 [toolFile,      toolMax, toolQuat, 'tool'],
 ['dcb1104.glb', 150,     quatY(0),         'charger'],
 ['dcb184.glb',  85,      quatY(Math.PI/2), 'bat1'],
 ['dcb184.glb',  85,      quatY(Math.PI/2), 'bat2'],
 ['Tstack.glb',  400,     quatY(0),         'case'],
];
const doc=new Document(); const scene=doc.createScene('pack');
const P={};
for(const [file,realMax,quat,name] of comps){
  const cdoc=await io.read(M+'/'+file);
  const before=new Set(doc.getRoot().listScenes());
  mergeDocuments(doc, cdoc);
  const ns=doc.getRoot().listScenes().find(s=>!before.has(s));
  const wrap=doc.createNode(name);
  ns.listChildren().forEach(ch=>{ ns.removeChild(ch); wrap.addChild(ch); });
  scene.addChild(wrap);
  ns.dispose();
  let b=getBounds(wrap); let sz=[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]];
  const scale=realMax/Math.max(...sz);
  wrap.setRotation(quat); wrap.setScale([scale,scale,scale]);
  b=getBounds(wrap); sz=[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]];
  P[name]={wrap, w:sz[0], h:sz[1], dp:sz[2], cx:(b.min[0]+b.max[0])/2, cz:(b.min[2]+b.max[2])/2, minY:b.min[1]};
}

// accessoires + coffret : positions EXACTES du mapping.
for(const k of ['case','charger','bat1','bat2']){ P[k].tx=MAP[k].cx; P[k].tz=MAP[k].cz; }
// outil : position mapping par défaut (+ décalage manuel optionnel TOOLDX,
// pour éloigner un outil dont l'emprise mord sur les batteries).
const TOOLDX = process.env.TOOLDX!==undefined ? Number(process.env.TOOLDX) : 0;
P.tool.tx=MAP.tool.cx+TOOLDX; P.tool.tz=MAP.tool.cz;

const CLR=8;
const box = p => ({x0:p.tx-p.w/2, x1:p.tx+p.w/2, z0:p.tz-p.dp/2, z1:p.tz+p.dp/2});
const clearance=(a,b)=>{const A=box(a),B=box(b);const gx=Math.max(B.x0-A.x1,A.x0-B.x1),gz=Math.max(B.z0-A.z1,A.z0-B.z1);return Math.max(gx,gz);};
// AUTO-NUDGE minimal : si l'outil (plus gros) chevauche un accessoire/coffret,
// on le décale vers la DROITE par pas de 1 mm jusqu'à clairance CLR. Le mapping
// des accessoires reste intact ; seul l'outil bouge, au strict minimum.
let nudged=0;
const others=['case','charger','bat1','bat2'].map(k=>P[k]);
while(others.some(o=>clearance(P.tool,o)<CLR) && nudged<600){ P.tool.tx+=1; nudged++; }

for(const p of [P.case,P.charger,P.bat1,P.bat2,P.tool]) p.wrap.setTranslation([p.tx-p.cx, -p.minY, p.tz-p.cz]);

// GARDE FINALE : l'OUTIL ne doit chevaucher AUCUN accessoire/coffret. Les
// accessoires entre eux sont figés au mapping validé (DCF887P2, approuvé) — on
// ne les re-juge pas. Plante si l'outil touche quoi que ce soit.
const keys=['case','charger','bat1','bat2','tool']; const problems=[];
for(const k of ['case','charger','bat1','bat2']){
  const cl=clearance(P.tool,P[k]);
  if(cl<CLR) problems.push(`tool×${k} : clairance ${cl.toFixed(1)}mm`);
}
const layout={ tool:toolFile, rotYdeg:Number(toolRotDegS), toolNudge:nudged, note:'plan au sol (mm), +Z vers caméra', components:{} };
for(const k of keys){const p=P[k];layout.components[k]={cx:Math.round(p.tx),cz:Math.round(p.tz),w:Math.round(p.w),dp:Math.round(p.dp)};}
writeFileSync('/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/pack-layout.json', JSON.stringify(layout,null,2));
if(problems.length){ console.error('❌ CHEVAUCHEMENT — build refusé :\n  '+problems.join('\n  ')); process.exit(2); }
console.log(`✓ 0 chevauchement | accessoires au mapping | outil décalé de ${nudged}mm vers la droite`);

await doc.transform(
  dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.001 }),
  prune(), draco(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512,512] })
);
const buf=doc.getRoot().listBuffers()[0];
doc.getRoot().listAccessors().forEach(a=>a.setBuffer(buf));
doc.getRoot().listBuffers().slice(1).forEach(b=>b.dispose());
await io.write(outPath, doc);
console.log('OK', outPath.split('/').pop());
