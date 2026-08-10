/* audit/banc-makita-611.js — LE PARSEUR CONTRE LES 611 FICHES, EN VASE CLOS.
   ─────────────────────────────────────────────────────────────────────────
   Ordre de l'user, 10/08/2026 : « mets ton parseur dans un environnement
   isolé, simule absolument toutes les actions avec les 611 produits Makita,
   et ne t'arrête jamais tant que tu n'as pas fait reconnaître 100 % ».

   ⛔ CE QUE LE ZIP CONTIENT, ET CE QU'IL NE CONTIENT PAS. Ce sont les
   RÉPONSES du serveur, pas le texte des pages : l'étape de lecture a déjà eu
   lieu. Ce banc rejoue donc TOUT CE QUI VIENT APRÈS — la chaîne
   d'appariement — sur ce que le parseur a réellement extrait :
     · `unknown` : les références LUES qu'aucune fiche n'a réclamées, avec le
       prix, le contenu (batteries/chargeur/coffret) et le classement ;
     · `sansRef` : les titres dont aucune référence n'a pu être tirée ;
     · `applied` : les fiches dont le prix a bougé — donc reconnues.
   ⛔ Une fiche dont la référence n'est dans AUCUNE de ces listes n'existe pas
   dans le relevé : aucun algorithme ne l'inventera. Le banc le DIT, il ne le
   contourne pas.

   ⛔ IL NE MODIFIE RIEN. Il lit, il compte, il NOMME les causes. */
'use strict';

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const pp = require(path.join(RACINE, 'api/_lib/price-parse.js'));
const nomen = require(path.join(RACINE, 'api/_lib/nomenclature.js'));

const DOSSIER_ZIP = process.argv[2];
if (!DOSSIER_ZIP) {
  console.error('usage : node audit/banc-makita-611.js <dossier des reponses> [MARQUE]');
  process.exit(2);
}
const MARQUE = (process.argv[3] || 'MAKITA').toUpperCase();

function lireReponses(dir) {
  const out = [];
  (function marcher(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith('__')) marcher(p); }
      else if (e.name.endsWith('.json')) {
        try { out.push(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (err) { /* illisible */ }
      }
    });
  })(dir);
  return out;
}

const pages = lireReponses(DOSSIER_ZIP).filter((j) => String(j.brand || '').toUpperCase() === MARQUE);
if (!pages.length) { console.error('aucune réponse ' + MARQUE + ' dans ' + DOSSIER_ZIP); process.exit(2); }

/* ── LE MATÉRIAU : ce que le parseur a lu sur les pages ───────────────────── */
/* Annonces avec référence, dédoublonnées ; on garde le MOINS CHER comme la
   production — le coût retenu ne doit jamais dépendre de l'ordre des pages. */
const parRef = new Map();
pages.forEach((j) => (j.unknown || []).forEach((u) => {
  const k = String(u.sku || '').toUpperCase();
  if (!k) return;
  const vu = parRef.get(k);
  if (!vu || (u.srcTTC > 0 && u.srcTTC < vu.srcTTC)) parRef.set(k, u);
}));
const parTitre = new Map();
pages.forEach((j) => (j.sansRef || []).forEach((s) => {
  const t = String(s.titre || '').trim();
  if (!t) return;
  const vu = parTitre.get(t);
  if (!vu || (s.prix > 0 && s.prix < vu.prix)) parTitre.set(t, s);
}));
const appliquees = new Set();
pages.forEach((j) => (j.applied || []).forEach((a) => appliquees.add(String(a.sku || '').toUpperCase())));

const catalogue = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'))
  .filter((p) => String(p.brand || '').toUpperCase() === MARQUE);

/* Les annonces remises dans la forme qu'attend la chaîne d'appariement.
   ⚠️ `car` est RECONSTRUIT depuis la forme compacte de la réponse : c'est
   exactement ce que le serveur avait lu, rien de plus, rien d'inventé. */
function annoncesAvecRef() {
  const out = [];
  parRef.forEach((u, ref) => {
    out.push({
      titre: MARQUE + ' ' + ref, name: MARQUE + ' ' + ref,
      prix: u.srcTTC, price: u.srcTTC, sku: ref,
      car: {
        sku: ref,
        nbBatteries: (typeof u.nBat === 'number') ? u.nBat : undefined,
        chargeur: u.chg ? true : undefined,
        coffret: (u.cof && u.cof !== 'AUCUN') ? u.cof : undefined,
        famille: u.fam || null, type: u.typ || null
      }
    });
  });
  return out;
}
function annoncesSansRef() {
  const out = [];
  parTitre.forEach((s, titre) => out.push({ titre: titre, prix: s.prix, price: s.prix }));
  return out;
}

module.exports = { pages, parRef, parTitre, appliquees, catalogue, pp, nomen, MARQUE,
  annoncesAvecRef, annoncesSansRef };

/* ══ LA SIMULATION ════════════════════════════════════════════════════════ */
if (require.main === module) {
  const parSku = {};
  catalogue.forEach((p) => { if (p.sku) parSku[String(p.sku).toUpperCase()] = p; });

  const trouvees = new Set();
  const par = {};                       // fiche -> quelle règle l'a ramenée
  const noter = (sku, regle) => {
    const k = String(sku || '').toUpperCase();
    if (!k || !parSku[k] || trouvees.has(k)) return;
    trouvees.add(k); par[k] = regle;
  };

  /* ① EXACT — la référence lue EST une référence du catalogue. Ces annonces
     ne sont plus dans `unknown` (elles ont été appariées côté serveur) : on
     les retrouve par les prix appliqués et par le compte de références
     distinctes. Le banc les rétablit pour ne pas les compter deux fois. */
  appliquees.forEach((s) => noter(s, 'exact (prix appliqué)'));
  parRef.forEach((u, ref) => { if (parSku[ref]) noter(ref, 'exact'); });

  const avecRef = annoncesAvecRef();
  const sansRef = annoncesSansRef();

  /* ② RECOLLAGE — la référence est éclatée par des espaces dans un titre. */
  const recolle = pp.apparierParRefRecollee(sansRef, catalogue, MARQUE);
  recolle.items.forEach((it) => noter(it.sku, 'référence recollée'));

  /* ③ CONFIGURATION — racine nue + contenu énoncé + une seule fiche compatible. */
  const parConfig = pp.apparierParConfiguration(avecRef, catalogue, MARQUE);
  parConfig.items.forEach((it) => noter(it.sku, 'configuration'));

  /* ④ NOM SOUPLE — pour les fiches qui portent `srcNom`. */
  const souple = pp.apparierParNomSouple(recolle.restants || sansRef, catalogue, MARQUE);
  souple.items.forEach((it) => noter(it.sku, 'nom souple'));

  /* ── OÙ SONT LES AUTRES ─────────────────────────────────────────────────── */
  const compacte = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const titresCompacts = [];
  parTitre.forEach((s, t) => titresCompacts.push(compacte(t)));

  const restantes = catalogue.filter((p) => !trouvees.has(String(p.sku).toUpperCase()));
  const causes = { dansUnTitre: [], racineSeule: [], aucuneTrace: [] };
  restantes.forEach((p) => {
    const sku = String(p.sku).toUpperCase();
    const c = compacte(sku);
    const l = nomen.lireSuffixeMakita(sku);
    const racine = l ? l.racine : sku;
    if (c.length >= 5 && titresCompacts.some((t) => t.indexOf(c) !== -1)) causes.dansUnTitre.push(p);
    else if (racine !== sku && parRef.has(racine)) causes.racineSeule.push(p);
    else causes.aucuneTrace.push(p);
  });

  const pct = (n) => (n / catalogue.length * 100).toFixed(1) + ' %';
  console.log('══ BANC ' + MARQUE + ' — ' + pages.length + ' réponses, chaîne d\'appariement rejouée ══');
  console.log('fiches au catalogue            : ' + catalogue.length);
  console.log('références lues sans fiche     : ' + parRef.size);
  console.log('titres sans référence lisible  : ' + parTitre.size);
  console.log('');
  console.log('RECONNUES PAR LE BANC          : ' + trouvees.size + '  (' + pct(trouvees.size) + ')');
  const parRegle = {};
  Object.keys(par).forEach((k) => { parRegle[par[k]] = (parRegle[par[k]] || 0) + 1; });
  Object.keys(parRegle).sort().forEach((r) => console.log('   · ' + r + ' : ' + parRegle[r]));
  console.log('');
  console.log('NON RECONNUES                  : ' + restantes.length + '  (' + pct(restantes.length) + ')');
  console.log('   · référence présente dans un TITRE rejeté : ' + causes.dansUnTitre.length);
  console.log('   · seule la RACINE est sur les pages       : ' + causes.racineSeule.length);
  console.log('   · AUCUNE trace dans le relevé             : ' + causes.aucuneTrace.length);
  console.log('');
  console.log('titres rejetés qui portent une réf : '
    + causes.dansUnTitre.slice(0, 10).map((p) => p.sku).join(', '));
  console.log('racines seules                     : '
    + causes.racineSeule.slice(0, 10).map((p) => p.sku).join(', '));
  console.log('aucune trace                       : '
    + causes.aucuneTrace.slice(0, 10).map((p) => p.sku).join(', '));

  if (process.env.BANC_CSV) {
    const cel = (v) => {
      const s = String(v == null ? '' : v);
      return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const L = ['reference;titre;prix_du_site_eur;etat;cause'];
    catalogue.slice().sort((a, b) => String(a.sku).localeCompare(String(b.sku))).forEach((p) => {
      const sku = String(p.sku).toUpperCase();
      const etat = trouvees.has(sku) ? 'RECONNUE' : 'NON RECONNUE';
      const cause = trouvees.has(sku) ? par[sku]
        : (causes.dansUnTitre.indexOf(p) !== -1 ? 'reference dans un titre rejete'
          : (causes.racineSeule.indexOf(p) !== -1 ? 'seule la racine est sur les pages'
            : 'aucune trace dans le releve'));
      L.push([cel(p.sku), cel(p.title || p.name || ''),
        cel(p.price == null ? '' : String(p.price).replace('.', ',')),
        cel(etat), cel(cause)].join(';'));
    });
    fs.writeFileSync(process.env.BANC_CSV, '﻿' + L.join('\r\n') + '\r\n', 'utf8');
    console.log('\ntableau écrit : ' + process.env.BANC_CSV + ' (' + (L.length - 1) + ' lignes)');
  }
}
