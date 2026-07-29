import { createRequire } from 'node:module';
const { RACINE, MODELES, POSTERS, travail } = createRequire(import.meta.url)('../_socle.cjs');
// Optimise les 2 packs batteries DCB118 (4,2 Mo > plafond 3 Mo) avec le MÊME
// pipeline que les packs validés : dedup + weld + simplify meshopt 0.3 +
// draco + textures WebP 512².
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, textureCompress, draco } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { statSync } from 'fs';

const ROOT=RACINE + '/models/products/';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
await MeshoptSimplifier.ready;
for (const f of ['dcb118-2bat-pack.glb','dcb118-3bat-pack.glb']) {
  const doc = await io.read(ROOT+f);
  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.001 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512,512] }),
    draco()
  );
  const out = ROOT+f.replace('.glb','-opt.glb');
  await io.write(out, doc);
  console.log(f, (statSync(ROOT+f).size/1048576).toFixed(2)+' Mo ->', (statSync(out).size/1048576).toFixed(2)+' Mo');
}
