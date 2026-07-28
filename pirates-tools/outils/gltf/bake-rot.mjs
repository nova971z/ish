// Bake une rotation (quaternion) dans un GLB : reparent la scène sous un node
// wrapper qui porte la rotation, puis ré-écrit. args: <inGlb> <x,y,z,w> <outGlb>
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const [inGlb, quatS, outGlb] = process.argv.slice(2);
const q = quatS.split(',').map(Number);
const io = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(inGlb);
const scene = doc.getRoot().listScenes()[0];
const wrap = doc.createNode('rot').setRotation(q);
for (const child of scene.listChildren()) { scene.removeChild(child); wrap.addChild(child); }
scene.addChild(wrap);
await io.write(outGlb, doc);
console.log('OK baked', outGlb.split('/').pop());
