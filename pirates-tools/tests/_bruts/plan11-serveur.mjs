// PLAN 11 — contrôles SERVEUR : notification des livreurs (email + SMS).
import lib from '/home/user/ish/pirates-tools/api/_lib/courses.js';
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };

console.log('━━ A. Normalisation des numéros (E.164) ━━');
T('0690 12 34 56 → +590690123456', lib.telE164('0690 12 34 56') === '+590690123456', lib.telE164('0690 12 34 56'));
T('0590.12.34.56 → +590590123456', lib.telE164('0590.12.34.56') === '+590590123456', lib.telE164('0590.12.34.56'));
T('Déjà en +590… → inchangé', lib.telE164('+590690123456') === '+590690123456');
T('Texte libre → refusé', lib.telE164('appelle-moi') === '');
T('Vide → refusé', lib.telE164('') === '');
T('Trop court → refusé', lib.telE164('+33') === '', JSON.stringify(lib.telE164('+33')));
T('Trop long → refusé', lib.telE164('+5906901234567890123') === '');
T('9 chiffres sans indicatif → refusé (jamais de numéro inventé)', lib.telE164('690123456') === '');

console.log('\n━━ B. Le canal SMS est INERTE tant qu\'il n\'est pas configuré ━━');
delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_FROM;
let appels = 0;
const vraiFetch = global.fetch;
global.fetch = (...a) => { appels++; return vraiFetch(...a); };
const r1 = await lib.sendSms('0690123456', 'test');
T('Sans clé : aucun envoi, aucune erreur', r1 === false);
T('Sans clé : AUCUN appel réseau (pas de coût, pas de fuite)', appels === 0, appels + ' appel(s)');

console.log('\n━━ C. Destinataires : uniquement les livreurs VALIDÉS ━━');
const faux = (docs) => ({
  collection: () => ({
    where: (champ, op, val) => ({
      limit: () => ({
        get: async () => ({
          forEach: (f) => docs.filter(d => d[champ] === val).forEach(d => f({ data: () => d }))
        })
      })
    })
  })
});
const docs = [
  { kycStatus: 'valide', email: 'a@x.fr', phone: '0690111111' },
  { kycStatus: 'en_attente', email: 'b@x.fr', phone: '0690222222' },
  { kycStatus: 'valide', email: 'c@x.fr', phone: '' },
  { kycStatus: 'refuse', email: 'd@x.fr', phone: '0690444444' },
  { kycStatus: 'valide', email: '', phone: '' }
];
const dests = await lib.destinatairesLivreurs(faux(docs), 50);
T('Seuls les dossiers VALIDÉS sont retenus', dests.length === 2, JSON.stringify(dests.map(d => d.email)));
T('Aucun dossier en attente', !dests.find(d => d.email === 'b@x.fr'));
T('Aucun dossier refusé', !dests.find(d => d.email === 'd@x.fr'));
T('Un validé sans email NI téléphone est écarté', !dests.find(d => !d.email && !d.phone));
T('Un validé sans téléphone reste joignable par email', !!dests.find(d => d.email === 'c@x.fr' && !d.phone));

console.log('\n━━ D. Robustesse : une base indisponible ne casse pas la demande ━━');
const casse = { collection: () => { throw new Error('firestore down'); } };
const d2 = await lib.destinatairesLivreurs(casse, 50);
T('Firestore en panne → liste vide, aucune exception', Array.isArray(d2) && d2.length === 0);
const d3 = await lib.destinatairesLivreurs(null, 50);
T('Sans base → liste vide, aucune exception', Array.isArray(d3) && d3.length === 0);

console.log('\n' + (fail ? '❌' : '✅') + ` ${pass}/${pass + fail} assertions serveur`);
process.exit(fail ? 1 : 0);
