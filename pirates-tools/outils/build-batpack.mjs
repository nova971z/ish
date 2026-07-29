import { createRequire } from 'node:module';
const { RACINE, MODELES, POSTERS, travail } = createRequire(import.meta.url)('./_socle.cjs');
import { Document, getBounds } from '@gltf-transform/core';
import { dedup, prune, draco, mergeDocuments } from '@gltf-transform/functions';
import { makeIO } from './io.mjs';

const io = await makeIO();
const base = RACINE + '/models/products/';
const R90 = [0, 0.70710678, 0, 0.70710678];
const RID = [0, 0, 0, 1];
const DX = 60;   // décalage de TOUT le groupe batteries pour dégager le chargeur

const CHARGER = { glb:'dcb118.glb', T:[-78.6,0,186.6], R:RID, S:151.9523 };
const BAT = (x,z)=>({ glb:'dcb548.glb', T:[x+DX,0,z], R:R90, S:85.9258 });
const BAT1 = BAT(8.0,168.3), BAT2 = BAT(83.8,162.5), BAT3 = BAT(159.6,156.7);

function worldAABB(doc, wrapName){
  // bounds du sous-arbre d'un wrapper = getBounds sur une scène ne filtre pas ;
  // on relit après build via getBounds global. Ici on approx via bounds scene.
}

async function build(components, out){
  const target = new Document();
  const scene = target.createScene('pack');
  const wraps = {};
  for (const c of components){
    const src = await io.read(base+c.glb);
    const srcRoots = src.getRoot().listScenes()[0].listChildren();
    const map = mergeDocuments(target, src);
    const wrap = target.createNode(c.name).setTranslation(c.T).setRotation(c.R).setScale([c.S,c.S,c.S]);
    for (const sr of srcRoots){ const tr = map.get(sr); if (tr) wrap.addChild(tr); }
    scene.addChild(wrap); wraps[c.name]=wrap;
  }
  const bufs = target.getRoot().listBuffers();
  for (const acc of target.getRoot().listAccessors()) acc.setBuffer(bufs[0]);
  for (let i=1;i<bufs.length;i++) bufs[i].dispose();
  for (const s of target.getRoot().listScenes()){ if (s!==scene) s.dispose(); }
  target.getRoot().setDefaultScene(scene);

  // Clairance : AABB par wrapper (scene à un seul wrapper à la fois)
  function aabbOf(name){
    const tmp = new Document(); // pas fiable pour sous-arbre ; on calcule à la main
    return null;
  }
  await target.transform(dedup(), prune(), draco());
  await io.write(out, target);
  const b = getBounds(scene);
  const fs = await import('fs');
  console.log(out.split('/').pop(), '| dims', [b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]].map(x=>x.toFixed(0)).join(' x '), '|', (fs.statSync(out).size/1e6).toFixed(2)+'Mo');
}

await build([{...CHARGER,name:'charger'},{...BAT1,name:'bat1'},{...BAT2,name:'bat2'}], base+'dcb118-2bat-pack.glb');
await build([{...CHARGER,name:'charger'},{...BAT1,name:'bat1'},{...BAT2,name:'bat2'},{...BAT3,name:'bat3'}], base+'dcb118-3bat-pack.glb');
