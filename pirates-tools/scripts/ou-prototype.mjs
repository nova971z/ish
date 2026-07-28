// Preuve : un repère NOMMÉ garde son identité ; son numéro est RECALCULÉ.
import { readFileSync } from 'node:fs';
const [, , fichier, repere] = process.argv;
const lignes = readFileSync(fichier, 'utf8').split('\n');
const i = lignes.findIndex(l => l.includes('@zone ' + repere));
console.log(i < 0 ? 'introuvable' : `${fichier.split('/').pop()}:${i + 1}`);
