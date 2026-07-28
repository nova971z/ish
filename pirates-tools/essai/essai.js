/* essai.js — mesure, sur l'appareil et la connexion de l'utilisateur, le coût
   du découpage du catalogue. Aucun effet sur le site : lecture seule.

   ⚠️ Le Service Worker met les .json et les images en cache. Une deuxième
   mesure serait donc instantanée et MENSONGÈRE. On ajoute une adresse unique
   à chaque essai (?u=…) : l'URL n'a jamais été vue, donc rien n'est en cache
   et on mesure un vrai premier chargement. */
(function () {
  'use strict';

  var HERO = '../images/posters/dhs680z-hero.webp';
  var CATALOGUE = '../products.json';
  var CARTES = 'cartes.json';
  var FICHE = 'fiche-makita-dhs680z.json';

  function unique(url) {
    return url + (url.indexOf('?') < 0 ? '?' : '&') + 'u=' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function charger(url) {
    return fetch(unique(url), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + url);
      return r.json();
    });
  }

  function image(url) {
    return new Promise(function (ok, ko) {
      var i = new Image();
      i.onload = function () { ok(i); };
      i.onerror = function () { ko(new Error('image indisponible : ' + url)); };
      i.src = unique(url);
    });
  }

  function chrono(faire) {
    var t = performance.now();
    return faire().then(function (r) { return { ms: Math.round(performance.now() - t), r: r }; });
  }

  function poser(id, ms) {
    document.getElementById(id).textContent = ms + ' ms';
  }

  var etat = document.getElementById('etat');
  function dire(t) { etat.textContent = t; }

  function lancer() {
    var bouton = document.getElementById('go');
    bouton.disabled = true;
    ['v-avant', 'v-apres', 'v-a', 'v-b', 'v-c'].forEach(function (id) {
      document.getElementById(id).textContent = '…';
    });
    document.getElementById('g-ouverture').textContent = '';
    document.getElementById('g-fiche').textContent = '';
    document.getElementById('apercu').innerHTML = '';

    var res = {};

    dire('1/5 — catalogue entier (comme aujourd\'hui)…');
    chrono(function () { return charger(CATALOGUE); })
      .then(function (x) { res.avant = x.ms; poser('v-avant', x.ms);
        dire('2/5 — cartes seules…');
        return chrono(function () { return charger(CARTES); }); })
      .then(function (x) { res.apres = x.ms; poser('v-apres', x.ms);
        dire('3/5 — fiche : l\'image seule…');
        return chrono(function () { return image(HERO); }); })
      .then(function (x) { res.a = x.ms; poser('v-a', x.ms);
        dire('4/5 — fiche : données puis image…');
        return chrono(function () {
          return charger(FICHE).then(function (f) { return image('../' + (f.heroImg || 'images/posters/dhs680z-hero.webp')); });
        }); })
      .then(function (x) { res.b = x.ms; poser('v-b', x.ms);
        dire('5/5 — fiche : données et image ensemble…');
        return chrono(function () { return Promise.all([charger(FICHE), image(HERO)]); }); })
      .then(function (x) {
        res.c = x.ms; poser('v-c', x.ms);

        var gagne = res.avant - res.apres;
        document.getElementById('g-ouverture').textContent =
          '→ La boutique s\'ouvre ' + gagne + ' ms plus tôt, soit '
          + Math.round((1 - res.apres / res.avant) * 100) + ' % de moins à télécharger.';

        var ecart = res.c - res.a;
        document.getElementById('g-fiche').textContent =
          '→ Bien fait (C), la fiche coûte ' + (ecart <= 0 ? 'zéro milliseconde de plus'
            : ecart + ' ms de plus') + ' qu\'aujourd\'hui. Mal fait (B), elle coûte '
          + (res.b - res.a) + ' ms de plus — c\'est un aller-retour réseau perdu.';

        var img = x.r && x.r[1];
        if (img) {
          document.getElementById('apercu').appendChild(img);
          var p = document.createElement('p');
          p.className = 'expl';
          p.textContent = 'Reçue en ' + img.naturalWidth + ' × ' + img.naturalHeight + ' pixels.';
          document.getElementById('apercu').appendChild(p);
        }
        dire('Terminé. Relance pour un second avis — le réseau varie.');
        bouton.disabled = false;
      })
      .catch(function (e) {
        dire('Échec : ' + (e && e.message ? e.message : e));
        bouton.disabled = false;
      });
  }

  document.getElementById('go').addEventListener('click', lancer);
})();
