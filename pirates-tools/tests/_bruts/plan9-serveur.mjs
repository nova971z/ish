// PLAN 9 — contrôles SERVEUR de la nouvelle chaîne de l'accord (28/07/2026).
// Le serveur est l'autorité : l'interface n'est jamais la sécurité.
import lib from '/home/user/ish/pirates-tools/api/_lib/courses.js';
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };

console.log('━━ A. La COURSE porte les conditions du client ━━');
const who = { uid: 'u1', email: 'a@b.c' };
const dem = lib.buildRequest({
  lat: 16.0578, lng: -61.7639, address: 'Vieux-Habitants',
  date: '2026-08-01', when: 'heure', hour: '09:30',
  lieu: 'Portail bleu, dépôt sous l\'auvent',
  notes: 'Appeler 10 min avant, chien dans la cour',
  lines: [{ key: 'quincaillerie-0001', qty: 2 }]
}, who);
T('La demande est acceptée (zone valide)', !!dem, dem ? 'zone ' + dem.zone : 'null');
T('Le point de dépôt est ENREGISTRÉ avec la demande', dem.lieu === 'Portail bleu, dépôt sous l\'auvent', dem.lieu);
T('Les précisions sont ENREGISTRÉES avec la demande', /chien dans la cour/.test(dem.notes || ''), dem.notes);
T('La date et le créneau aussi', dem.date === '2026-08-01' && dem.when === 'heure' && dem.hour === '09:30',
  dem.date + ' ' + dem.when + ' ' + dem.hour);
T('AUCUN prix n\'est enregistré à la commande', dem.prix === undefined, JSON.stringify(dem.prix));
T('Le point de dépôt est borné à 200 caractères',
  lib.buildRequest({ lat: 16.0578, lng: -61.7639, lieu: 'x'.repeat(500) }, who).lieu.length === 200);
T('Les précisions sont bornées à 500 caractères',
  lib.buildRequest({ lat: 16.0578, lng: -61.7639, notes: 'y'.repeat(900) }, who).notes.length === 500);

console.log('\n━━ B. L\'ACCORD ne prend QUE le prix du corps ━━');
const course = { date: '2026-08-01', hour: '09:30', when: 'heure', lieu: 'Portail bleu', notes: 'Chien' };
const a = lib.sanitizeAccord({
  prix: 35,
  // Tentative d'injection : tous ces champs doivent être IGNORÉS.
  paiement: 'virement', date: '1999-01-01', hour: '03:00',
  lieu: 'ADRESSE PIRATÉE', notes: 'NOTES PIRATÉES', when: 'matin'
}, course, 'especes');
T('Le prix du livreur est retenu', a.prix === 35, String(a.prix));
T('Le mode de règlement vient du PROFIL, pas du corps', a.paiement === 'especes', a.paiement);
T('La date vient de la COURSE, pas du corps', a.date === '2026-08-01', a.date);
T('L\'heure vient de la COURSE', a.hour === '09:30', a.hour);
T('Le créneau vient de la COURSE', a.when === 'heure', a.when);
T('Le point de dépôt vient de la COURSE (injection ignorée)', a.lieu === 'Portail bleu', a.lieu);
T('Les précisions viennent de la COURSE (injection ignorée)', a.notes === 'Chien', a.notes);

console.log('\n━━ C. Garde-fous de saisie du prix ━━');
T('Prix absent → refusé', lib.sanitizeAccord({}, course, 'especes') === null);
T('Prix 0 → refusé', lib.sanitizeAccord({ prix: 0 }, course, 'especes') === null);
T('Prix négatif → refusé', lib.sanitizeAccord({ prix: -10 }, course, 'especes') === null);
T('Prix 2001 → refusé (garde-fou anti-faute de frappe)', lib.sanitizeAccord({ prix: 2001 }, course, 'especes') === null);
T('Prix 1 → accepté (borne basse)', (lib.sanitizeAccord({ prix: 1 }, course, 'especes') || {}).prix === 1);
T('Prix 2000 → accepté (borne haute)', (lib.sanitizeAccord({ prix: 2000 }, course, 'especes') || {}).prix === 2000);
T('Prix texte → refusé', lib.sanitizeAccord({ prix: 'gratuit' }, course, 'especes') === null);

console.log('\n━━ D. Mode de règlement du livreur ━━');
T('« virement » accepté', lib.sanitizePaiement('virement') === 'virement');
T('« especes » accepté', lib.sanitizePaiement('especes') === 'especes');
T('Valeur inventée refusée', lib.sanitizePaiement('bitcoin') === '');
T('Vide refusé', lib.sanitizePaiement('') === '');
T('Profil vide → l\'accord retombe sur « especes », jamais sur rien',
  (lib.sanitizeAccord({ prix: 20 }, course, '') || {}).paiement === 'especes');
T('Profil corrompu → même repli sûr',
  (lib.sanitizeAccord({ prix: 20 }, course, 'paypal') || {}).paiement === 'especes');

console.log('\n━━ E. Rétrocompatibilité (courses déposées avant ce changement) ━━');
const vieille = { date: '', hour: '', when: undefined, lieu: undefined, notes: undefined };
const av = lib.sanitizeAccord({ prix: 40 }, vieille, 'virement');
T('Une course sans lieu/notes reste négociable', !!av && av.prix === 40);
T('Aucun « undefined » ne fuit dans l\'accord',
  av && av.lieu === '' && av.notes === '' && av.date === '' && av.hour === '', JSON.stringify(av));
T('Créneau absent → repli « matin » (jamais undefined)', av.when === 'matin', av.when);
T('Le résumé texte reste lisible', /Prix proposé par le livreur : 40 €/.test(lib.accordSummary(av)), lib.accordSummary(av));

console.log('\n' + (fail ? '❌' : '✅') + ` ${pass}/${pass + fail} assertions serveur`);
process.exit(fail ? 1 : 0);
