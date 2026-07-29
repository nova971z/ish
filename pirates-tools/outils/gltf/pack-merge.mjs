import { createRequire } from 'node:module';
const { RACINE, MODELES, POSTERS, travail } = createRequire(import.meta.url)('../_socle.cjs');
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco, mergeDocuments, textureCompress, weld, simplify } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const M=MODELES;
const io=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
function quatY(a){return [0, Math.sin(a/2), 0, Math.cos(a/2)];}
// composants : [fichier, taille réelle max (mm), rotationY]
const comps=[
 ['dcf887n.glb', 180, 0,        'tool'],
 ['dcb1104.glb', 150, 0,        'charger'],
 ['dcb184.glb',  85,  Math.PI/2,'bat1'],
 ['dcb184.glb',  85,  Math.PI/2,'bat2'],
 ['Tstack.glb',  400, 0,        'case'], // de FACE ; taille réduite un peu (430→400) sur retour user
];
// on repart d'un doc propre : recrée
import { Document } from '@gltf-transform/core';
const doc=new Document(); const scene=doc.createScene('pack');
const placed={};
for(const [file,realMax,rotY,name] of comps){
  const cdoc=await io.read(M+'/'+file);
  const before=new Set(doc.getRoot().listScenes());
  mergeDocuments(doc, cdoc);
  const ns=doc.getRoot().listScenes().find(s=>!before.has(s));
  const wrap=doc.createNode(name);
  ns.listChildren().forEach(ch=>{ ns.removeChild(ch); wrap.addChild(ch); });
  scene.addChild(wrap);
  ns.dispose();
  // échelle depuis les bounds bruts
  let b=getBounds(wrap); let sz=[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]];
  const scale=realMax/Math.max(...sz);
  wrap.setRotation(quatY(rotY)); wrap.setScale([scale,scale,scale]);
  b=getBounds(wrap); sz=[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]];
  placed[name]={wrap, w:sz[0], h:sz[1], dp:sz[2], cx:(b.min[0]+b.max[0])/2, cz:(b.min[2]+b.max[2])/2, minY:b.min[1]};
}
const P=placed, GAP=30;
// Caméra PDP ≈ avant-droit (azimut 25°) : +Z vers la caméra, +X à droite.
// Composition « pack shot » : la VISSEUSE (produit principal) au premier plan
// avant-droit = héros ; le coffret de face, reculé et décalé à gauche =
// arrière-plan ; chargeur + 2 batteries en plan intermédiaire/avant-gauche.
const pos={
 case:   [ -P.case.w*0.10, -P.case.dp*0.42 ],
 tool:   [  P.case.w*0.42,  P.case.dp*0.72 ],
 // rangée avant d'accessoires, RAPPROCHÉE de la visseuse (décalée vers la
 // droite + resserrée) tout en restant étalée pour qu'aucun n'en cache un autre
 charger:[ -P.case.w*0.20,  P.case.dp*0.54 ],
 bat1:   [  P.case.w*0.02,  P.case.dp*0.58 ],
 bat2:   [  P.case.w*0.02 + P.bat1.w + 16, P.case.dp*0.56 ],
};
for(const [name,[tx,tz]] of Object.entries(pos)){const p=P[name];p.wrap.setTranslation([tx-p.cx, -p.minY, tz-p.cz]);}
// Dump du PLAN AU SOL (gabarit réutilisable) : centre X/Z + emprise w×dp de
// chaque composant, en mm. Sert à générer la carte quadrillée versionnée.
import { writeFileSync } from 'node:fs';
const layout={ note:'DCF887P2 — plan au sol validé (mm). +Z vers la caméra PDP, +X à droite. Caméra ≈ azimut 25°.',
  case_realMax:400, components:{} };
for(const [name,[tx,tz]] of Object.entries(pos)){const p=P[name];layout.components[name]={cx:Math.round(tx),cz:Math.round(tz),w:Math.round(p.w),dp:Math.round(p.dp)};}
writeFileSync(travail() + '/pack-layout.json', JSON.stringify(layout,null,2));
// Décimation du maillage (1,19 M verts → cible ~0,4x) : ramène le poids sous le
// plafond 3 Mo. error 0,1 % = imperceptible sur un pack vu de loin.
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.001 }),
  prune(),
  draco(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512,512] })
);
// un seul buffer (contrainte GLB)
const buf=doc.getRoot().listBuffers()[0];
doc.getRoot().listAccessors().forEach(a=>a.setBuffer(buf));
doc.getRoot().listBuffers().slice(1).forEach(b=>b.dispose());
await io.write(travail() + '/pack-merged.glb', doc);
console.log('OK merge + draco');
