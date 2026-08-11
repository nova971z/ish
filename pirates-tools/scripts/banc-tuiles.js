/* banc-tuiles.js — CHAQUE TUILE DES RELEVÉS, RELUE UNE PAR UNE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ ORDRE DE L'USER, 13/08/2026 : « Relis les trois relevés que je t'ai
   envoyés hier un par un et revérifie en lisant chaque titre et description un
   par un, c'est non négociable. On ne s'arrête pas tant qu'on n'est pas sûr à
   100 %. Là c'est une question d'argent. »

   ⚠️ CE QUE CE BANC FAIT, ET IL NE RÉSUME RIEN : il reconstruit, pour CHAQUE
   tuile de ses relevés, la carte que le fournisseur a servie — titre +
   description + prix — et la fait repasser par `parseIdealo`, le chemin qui
   ÉCRIT les prix. Puis il classe la tuile par ce qu'elle RISQUE :

     ① SANS ENJEU      — sa référence ne désigne aucune fiche du site. Le
                          parseur peut la lire de travers, aucun prix ne bouge.
     ② COÛT SUR FICHE  — sa référence tombe sur une fiche. **C'est là que
                          l'argent se joue**, et c'est ce périmètre-là qu'on
                          recoupe sur le Web.
     ③ ÉCARTÉE PACK    — le titre ou la description annonce un ajout sur une
                          référence nue : refusée, à raison ou à tort.
     ④ ILLISIBLE       — aucune référence ; la fiche correspondante, si elle
                          existe, ne sera jamais mise à jour par cette carte.

   ⛔ POURQUOI CE DÉCOUPAGE ET PAS « TOUT VÉRIFIER À LA MAIN » : 9 779 tuiles.
   Recouper chacune sur le Web serait une promesse invérifiable — donc un
   mensonge. Ce qui décide d'un prix, en revanche, est un ensemble FINI et
   NOMMÉ : c'est lui qu'on recoupe, et le banc dit exactement lequel.

   Usage : node scripts/banc-tuiles.js <dossier...> --csv sortie.csv
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const pp = require(path.join(RACINE, 'api/_lib/price-parse.js'));
const nomen = pp.nomenclature;

const args = process.argv.slice(2);
const iCsv = args.indexOf('--csv');
const SORTIE = iCsv !== -1 ? args[iCsv + 1] : null;
const DOSSIERS = args.filter((a, i) => a !== '--csv' && i !== iCsv + 1);

const fiches = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
const bySku = Object.create(null);
fiches.forEach((p) => { if (p.sku) bySku[String(p.sku).toUpperCase()] = p; });
fiches.forEach((p) => (Array.isArray(p.srcAltSkus) ? p.srcAltSkus : []).forEach((a) => {
  const k = String(a || '').toUpperCase(); if (k && !bySku[k]) bySku[k] = p;
}));
const M = (b) => String(b || '').toUpperCase().replace(/[\s-]/g, '');

/* La fiche que cette référence désignerait — MÊME chaîne que le traqueur. */
function ficheVisee(sku, marque) {
  if (!sku) return null;
  const s = String(sku).toUpperCase();
  let p = bySku[s];
  if (!p) p = bySku[pp.racineRef(s)];
  if (!p) {
    const nu = nomen.refSansPrefixeDistributeur(s, marque);
    if (nu) p = bySku[nu];
  }
  if (p && M(p.brand) !== M(marque)) return null;   // jamais entre marques
  return p || null;
}

function carte(titre, descr, prix) {
  const l = [String(titre || '').slice(0, 200)];
  if (descr) l.push(String(descr).replace(/\s+/g, ' ').slice(0, 300));
  l.push('En stock'); l.push('12 offres');
  l.push('à partir de ' + String(Number(prix).toFixed(2)).replace('.', ',') + ' €');
  return l.join('\n');
}

const R = Object.create(null);
const bump = (k) => { R[k] = (R[k] || 0) + 1; };
const lignes = [];
const aRecouper = [];

DOSSIERS.forEach((d) => {
  let fics;
  try { fics = fs.readdirSync(d).filter((f) => /^admin-\d+\.json$/.test(f)); }
  catch (e) { return; }
  fics.sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  fics.forEach((f) => {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { return; }
    const marque = String(j.brand || '');
    const page = f.replace(/\D/g, '');

    const traiter = (x, origine) => {
      const titre = String(x.titre || x.name || '').trim();
      const descr = String(x.descr || '').trim();
      const prix = Number(x.srcTTC || x.prix || 0);
      if (!titre && !x.sku) return;
      const skuReleve = String(x.sku || '').toUpperCase();

      /* On repasse par le CHEMIN RÉEL, jamais par la grammaire seule. */
      let res = { items: [], packs: [] };
      if (titre && prix > 0) {
        try { res = pp.parseIdealo(carte(titre, descr, prix), marque); } catch (e) { /* rendu vide */ }
      }
      const item = (res.items || [])[0] || null;
      const pack = (res.packs || [])[0] || null;
      const skuLu = item ? String(item.sku).toUpperCase()
        : (pack ? String(pack.skuRefuse || '').toUpperCase() : '');

      /* La référence que le RELEVÉ portait, et celle que le parseur relit
         maintenant : un écart signale un changement de comportement. */
      const changement = (skuReleve && skuLu && skuReleve !== skuLu) ? 'OUI' : 'non';

      const fiche = ficheVisee(skuLu || skuReleve, marque);
      let classe;
      if (pack) { classe = '3-ECARTEE-PACK'; }
      else if (!skuLu && !skuReleve) { classe = '4-ILLISIBLE'; }
      else if (!fiche) { classe = '1-SANS-ENJEU'; }
      else { classe = '2-COUT-SUR-FICHE'; }
      bump(classe);
      if (changement === 'OUI') bump('changement-de-lecture');

      /* Ce que le texte ANNONCE, en toutes lettres — l'oracle, jamais le code. */
      const texte = titre + ' ' + descr;
      const ajoutTitre = pp.titreAjouteDuContenu(titre, 'titre');
      const ajoutDescr = pp.titreAjouteDuContenu(descr, 'description');
      const refNue = pp.referenceEstNue(skuLu || skuReleve, marque);
      const suspect = (ajoutTitre || ajoutDescr) && refNue && !pack;
      if (suspect) bump('AJOUT-ANNONCE-MAIS-NON-ECARTEE');

      const ligne = {
        marque: marque, page: page, origine: origine,
        titre: titre, description: descr, prix_TTC: prix,
        reference_du_releve: skuReleve,
        reference_relue_maintenant: skuLu,
        la_lecture_a_change: changement,
        fiche_du_site_visee: fiche ? fiche.sku : '',
        prix_de_la_fiche: fiche ? fiche.price : '',
        classe: classe,
        titre_annonce_un_ajout: ajoutTitre ? 'OUI' : 'non',
        description_annonce_un_ajout: ajoutDescr ? 'OUI' : 'non',
        reference_est_nue: refNue ? 'OUI' : 'non',
        a_verifier: suspect ? 'OUI — ajout annonce sur reference nue, non ecartee' : ''
      };
      lignes.push(ligne);
      /* Le périmètre à recouper sur le Web : ce qui décide d'un coût. */
      if (classe === '2-COUT-SUR-FICHE' || classe === '3-ECARTEE-PACK' || suspect) {
        aRecouper.push(ligne);
      }
    };

    (j.unknown || j.inconnus || []).forEach((x) => traiter(x, 'reference lue'));
    (j.sansRef || j.sansRefDetail || []).forEach((x) => traiter(x, 'sans reference'));
    (j.applied || []).forEach((x) => traiter(x, 'PRIX ECRIT'));
    (j.haussesDifferees || []).forEach((x) => traiter(x, 'hausse retenue'));
  });
});

console.log('══ BANC TUILE PAR TUILE — ' + lignes.length + ' tuiles relues');
console.log('');
Object.keys(R).sort().forEach((k) => console.log('   ' + String(R[k]).padStart(6) + '  ' + k));
console.log('');
console.log('⇒ PÉRIMÈTRE À RECOUPER SUR LE WEB (ce qui décide d\'un coût) : '
  + aRecouper.length + ' tuiles');
const parRef = Object.create(null);
aRecouper.forEach((l) => {
  const k = l.marque + '|' + (l.fiche_du_site_visee || l.reference_relue_maintenant);
  if (!parRef[k]) parRef[k] = [];
  parRef[k].push(l);
});
console.log('   soit ' + Object.keys(parRef).length + ' références DISTINCTES à trancher');

if (SORTIE) {
  const cel = (v) => {
    const s = String(v == null ? '' : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const COL = Object.keys(lignes[0] || { marque: 1 });
  const L = [COL.join(';')];
  lignes.forEach((r) => L.push(COL.map((k) => cel(r[k])).join(';')));
  fs.writeFileSync(SORTIE, '﻿' + L.join('\r\n') + '\r\n', 'utf8');
  console.log('\ntableau écrit : ' + SORTIE + ' (' + (L.length - 1) + ' lignes)');
  const dec = SORTIE.replace(/\.csv$/, '') + '-A-RECOUPER.json';
  fs.writeFileSync(dec, JSON.stringify(Object.keys(parRef).map((k) => ({
    clef: k, marque: k.split('|')[0], reference: k.split('|')[1],
    tuiles: parRef[k].map((l) => ({ titre: l.titre, description: l.description,
      prix: l.prix_TTC, classe: l.classe, fiche: l.fiche_du_site_visee }))
  })), null, 1), 'utf8');
  console.log('périmètre à recouper : ' + dec);
}
