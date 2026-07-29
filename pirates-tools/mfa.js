/* =========================================================
   mfa.js — DOUBLE AUTHENTIFICATION par application (TOTP).

   POURQUOI UN FICHIER À PART, chargé à la demande : la double
   authentification ne concerne que deux moments — le réglage dans « Mon
   compte », et le défi qui interrompt une connexion. Les 99 % de visites qui
   ne font ni l'un ni l'autre ne doivent pas en télécharger une seule ligne.
   Même principe que la 3D et le Storage. (Et app.js est à son plafond de
   poids : y entasser ce code aurait dégradé chaque visite pour une
   fonctionnalité que presque personne ne déclenche.)

   PRÉ-REQUIS CÔTÉ GOOGLE (fait le 28/07/2026) : Identity Platform activé et
   TOTP activé par API — mfa.state ENABLED **et** totpProviderConfig ENABLED.
   Le SMS reste volontairement désactivé.

   ⚠️ RÈGLE DE FIREBASE : l'enrôlement et le retrait exigent une connexion
   RÉCENTE. D'où la ré-authentification par mot de passe systématique avant
   toute opération — ce n'est pas une précaution de confort, c'est le serveur
   qui l'impose (auth/requires-recent-login).

   🔓 EN CAS DE VERROUILLAGE (téléphone perdu, application effacée) : la porte
   de sortie est `scripts/mfa-unlock.js`, qui retire les facteurs avec l'Admin
   SDK, de l'extérieur du site. Elle a été écrite AVANT cette interface.
   ========================================================= */
(function () {
  'use strict';

  // Nom affiché du facteur dans le compte Firebase. Uniquement informatif.
  var NOM_FACTEUR = 'Application d\'authentification';
  var EDITEUR = 'Pirates Tools';

  // Messages d'échec en clair. Un refus de second facteur qui ne s'explique
  // pas, c'est un utilisateur qui se croit piraté — ou qui abandonne.
  function lisible(e) {
    var c = (e && e.code) || '';
    if (c === 'auth/invalid-verification-code' || c === 'auth/invalid-code'
      || /INVALID_(TOTP_)?CODE|INVALID_MFA_PENDING_CREDENTIAL/i.test(String(e && e.message))) {
      return 'Code incorrect ou expiré. Le code change toutes les 30 secondes — '
        + 'regarde ton application et retape-le entièrement.';
    }
    if (c === 'auth/wrong-password' || c === 'auth/invalid-credential') {
      return 'Mot de passe incorrect.';
    }
    if (c === 'auth/requires-recent-login') {
      return 'Reconnecte-toi puis recommence : cette opération demande une connexion récente.';
    }
    if (c === 'auth/too-many-requests') {
      return 'Trop d\'essais. Attends quelques minutes avant de réessayer.';
    }
    if (c === 'auth/unsupported-first-factor' || /MFA_NOT_ENABLED|OPERATION_NOT_ALLOWED/i.test(String(e && e.message))) {
      return 'La double authentification n\'est pas disponible sur ce projet.';
    }
    if (c === 'auth/unverified-email' || /UNVERIFIED_EMAIL/i.test(String(e && e.message))) {
      return 'Vérifie d\'abord ton adresse e-mail : c\'est une condition imposée par Google '
        + 'pour activer la double authentification.';
    }
    return (e && e.message) ? String(e.message).replace(/^Firebase:\s*/, '') : 'Opération impossible.';
  }

  // Facteurs déjà inscrits sur le compte. Tableau vide = pas de 2FA.
  function facteurs(fb, user) {
    try { return (fb.multiFactor(user).enrolledFactors || []).slice(); }
    catch (_) { return []; }
  }

  // Ré-authentification par mot de passe (exigée par Firebase, cf. en-tête).
  function reauth(fb, user, motDePasse) {
    var cred = fb.EmailAuthProvider.credential(user.email, motDePasse);
    return fb.reauthenticateWithCredential(user, cred);
  }

  // ÉTAPE 1 de l'enrôlement : produit le secret, l'URL à scanner et la clé à
  // recopier. On rend TOUJOURS la clé en texte : un QR illisible (écran sale,
  // appareil photo capricieux) ne doit pas être un cul-de-sac.
  function preparer(fb, user, motDePasse) {
    return reauth(fb, user, motDePasse)
      .then(function () { return fb.multiFactor(user).getSession(); })
      .then(function (session) { return fb.TotpMultiFactorGenerator.generateSecret(session); })
      .then(function (secret) {
        return {
          secret: secret,
          url: secret.generateQrCodeUrl(user.email || EDITEUR, EDITEUR),
          cle: secret.secretKey
        };
      });
  }

  // ÉTAPE 2 : le code à 6 chiffres prouve que l'application est bien réglée.
  // Sans cette preuve, on inscrirait un facteur que l'utilisateur ne peut pas
  // produire — c'est-à-dire qu'on l'enfermerait dehors nous-mêmes.
  function confirmer(fb, user, secret, code) {
    var a = fb.TotpMultiFactorGenerator.assertionForEnrollment(secret, String(code || '').trim());
    return fb.multiFactor(user).enroll(a, NOM_FACTEUR);
  }

  // Retrait : mot de passe redemandé, puis on enlève TOUS les facteurs TOTP.
  function retirer(fb, user, motDePasse) {
    return reauth(fb, user, motDePasse).then(function () {
      var liste = facteurs(fb, user);
      if (!liste.length) return true;
      // En série : `unenroll` renumérote la liste à chaque appel.
      return liste.reduce(function (chaine, f) {
        return chaine.then(function () { return fb.multiFactor(user).unenroll(f); });
      }, Promise.resolve()).then(function () { return true; });
    });
  }

  // Le DÉFI : appelé quand une connexion s'interrompt sur
  // `auth/multi-factor-auth-required`. `err` porte tout ce qu'il faut pour la
  // reprendre — on ne redemande donc jamais le mot de passe.
  function estDefi(err) {
    return !!(err && err.code === 'auth/multi-factor-auth-required');
  }
  function resoudre(fb, err, code) {
    var resolver = fb.getMultiFactorResolver(fb.auth, err);
    var hints = resolver.hints || [];
    var hint = null;
    for (var i = 0; i < hints.length; i++) {
      if (hints[i].factorId === 'totp') { hint = hints[i]; break; }
    }
    if (!hint) return Promise.reject(new Error('Aucune application d\'authentification n\'est inscrite sur ce compte.'));
    var a = fb.TotpMultiFactorGenerator.assertionForSignIn(hint.uid, String(code || '').trim());
    return resolver.resolveSignIn(a);
  }

  // ══ INTERFACE (montée dans « Mon compte ») ═══════════════════════════════
  // `ctx` apporte tout ce que le module ne connaît pas : le SDK, l'utilisateur,
  // l'échappement HTML, les messages flottants et le générateur de QR LOCAL.
  var CTX = null;

  /* ⚠️ ON LIT L'ÉTAT VIVANT, PAS LA COPIE CAPTURÉE AU MONTAGE.
     `CTX.user.multiFactor.enrolledFactors` est une photographie prise à
     l'ouverture de la page : après un enrôlement réussi elle vaut encore
     « aucun facteur ». Le panneau se redessinait donc à l'identique et
     remontrait le formulaire, exactement comme si rien ne s'était passé.
     Constaté par l'user le 29/07/2026 — il a cru que ça n'avait pas marché.
     `fb.multiFactor(user)` interroge l'état courant. */
  function actif() {
    if (!CTX || !CTX.user) return false;
    try {
      var live = CTX.fb && CTX.fb.multiFactor && CTX.fb.multiFactor(CTX.user);
      if (live && live.enrolledFactors) return live.enrolledFactors.length > 0;
    } catch (_) { /* on retombe sur la copie plutôt que de casser l'affichage */ }
    var mf = CTX.user.multiFactor;
    return !!(mf && mf.enrolledFactors && mf.enrolledFactors.length);
  }

  /* Recharge le compte AVANT de redessiner. Sans ça, même l'état vivant peut
     traîner d'un cycle. On n'échoue jamais là-dessus : au pire on redessine
     avec ce qu'on a. */
  function rafraichirPuis(rendre) {
    var u = CTX && CTX.user;
    if (u && typeof u.reload === 'function') {
      u.reload().then(rendre).catch(rendre);
    } else { rendre(); }
  }

  function badge() {
    var b = document.getElementById('mfaBadge');
    if (!b) return;
    var on = actif();
    b.textContent = on ? '✅ Activée' : 'Désactivée';
    b.style.background = on ? 'rgba(52,211,153,.15)' : 'rgba(255,255,255,.08)';
    b.style.color = on ? '#6ee7b7' : 'var(--muted, #9aa4b2)';
  }

  function monter(ctx) {
    CTX = ctx;
    badge();
    var b = document.getElementById('mfaOpen');
    if (b) b.onclick = function () { panneau(); };
  }

  function panneauHTML() {
    var e = CTX.escape;
    if (actif()) {
      return '<div class="lv-note lv-note--ok">🔐 <strong>Ta double authentification est active.</strong> '
        + 'À chaque connexion, un code à 6 chiffres te sera demandé après ton mot de passe.</div>'
        + '<p class="lv-hint">⚠️ Téléphone perdu ? Tu ne pourras plus te connecter seul : '
        + 'écris à contact@pirates-tools.com, on débloquera ton compte après vérification.</p>'
        + '<label class="lv-field"><span>Confirme ton mot de passe pour désactiver</span>'
        + '<input type="password" id="mfaPwd" autocomplete="current-password"></label>'
        + '<div class="lv-cta"><button type="button" class="btn btn--danger" id="mfaOff">Désactiver</button>'
        + '<span class="lv-cta__note" id="mfaSt" aria-live="polite"></span></div>';
    }
    if (!CTX.user.emailVerified) {
      // Condition imposée par GOOGLE, pas par nous : sans adresse vérifiée
      // l'enrôlement échouerait. Autant le dire avant de faire perdre du temps.
      return '<div class="lv-note lv-note--warn">✉️ <strong>Vérifie d\'abord ton adresse e-mail.</strong> '
        + 'Google l\'exige avant d\'activer la double authentification. Le lien t\'a été envoyé — '
        + 'tu peux le redemander depuis le bandeau en haut de cette page.</div>';
    }
    return '<p class="lv-hint">Il te faut une application comme <strong>Google Authenticator</strong> '
      + '(gratuite). Étape 1 : confirme ton mot de passe.</p>'
      + '<label class="lv-field"><span>Ton mot de passe</span>'
      + '<input type="password" id="mfaPwd" autocomplete="current-password"></label>'
      + '<div class="lv-cta"><button type="button" class="btn primary" id="mfaGo">Continuer</button>'
      + '<span class="lv-cta__note" id="mfaSt" aria-live="polite"></span></div>'
      + '<div id="mfaStep2" hidden></div>';
  }

  function panneau() {
    var hote = document.getElementById('mfaBody');
    if (!hote || !CTX || !CTX.user) return;
    hote.innerHTML = panneauHTML();
    var st = document.getElementById('mfaSt');
    var pwd = document.getElementById('mfaPwd');
    var go = document.getElementById('mfaGo');
    var off = document.getElementById('mfaOff');
    if (go) go.onclick = function () { etape2(go, pwd, st); };
    if (off) off.onclick = function () { desactiver(off, pwd, st); };
  }

  // Étape 1 → 2 : secret obtenu, QR affiché (généré EN LOCAL, jamais par un
  // service tiers) ET clé en toutes lettres — un QR illisible ne doit pas
  // être un cul-de-sac.
  function etape2(btn, pwd, st) {
    if (!pwd || !pwd.value) { if (st) st.textContent = 'Saisis ton mot de passe.'; return; }
    btn.disabled = true;
    if (st) st.textContent = 'Vérification…';
    preparer(CTX.fb, CTX.user, pwd.value).then(function (p) {
      btn.disabled = false;
      if (st) st.textContent = '';
      var box = document.getElementById('mfaStep2');
      if (!box) return;
      box.hidden = false;
      // DEUX VOIES À ÉGALITÉ, la clé D'ABORD (décision user 28/07/2026 : « je
      // n'ai pas de téléphone, tout est sur mon iPad »). Un appareil ne peut
      // pas scanner son propre écran : pour lui, la saisie manuelle n'est pas
      // un repli, c'est LE chemin. Le QR passe donc en second, replié.
      box.innerHTML = '<h4 class="lv-panel__t">Étape 2 — enregistre la clé</h4>'
        + '<div class="lv-handcode">'
        /* ⚠️ CLASSE DÉDIÉE, PAS `lv-handcode__num`. Celle-là est taillée pour un
           code de livraison à 6 chiffres (1,9 rem + 0,35 em d'interlettrage).
           Une clé TOTP fait 32 caractères : à cette taille elle sort de l'écran
           d'un iPad et rien ne l'autorise à passer à la ligne. Constaté par
           l'user le 29/07/2026. Réutiliser un style « qui ressemble » sans
           regarder ce qu'il contiendra, c'est ça que ça donne. */
        + '<div class="lv-handcode__row"><span class="lv-handcode__key">Ta clé</span>'
        + '<strong class="mfa-cle" id="mfaCle">' + CTX.escape(p.cle) + '</strong></div>'
        + '<div class="lv-cta"><button type="button" class="btn" id="mfaCopy">📋 Copier la clé</button>'
        + '<span class="lv-cta__note" id="mfaCopySt" aria-live="polite"></span></div></div>'
        + '<p class="lv-hint">Dans ton application : <strong>+</strong> → '
        + '<strong>« Saisir une clé de configuration »</strong> → colle la clé, '
        + 'type <strong>« Basé sur le temps »</strong>.</p>'
        + '<details class="lv-histo" style="margin:.6rem 0"><summary class="lv-histo__sum">'
        + '<span class="lv-h2">📷 Ou scanner un QR (depuis un autre appareil)</span></summary>'
        + '<div class="lv-handcode__qr" id="mfaQR" style="padding:1rem">…</div></details>'
        + '<label class="lv-field"><span>Étape 3 — recopie le code affiché par l\'application</span>'
        + '<input type="text" id="mfaCode" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code"></label>'
        + '<div class="lv-cta"><button type="button" class="btn primary" id="mfaConfirm">Activer</button>'
        + '<span class="lv-cta__note" id="mfaSt2" aria-live="polite"></span></div>';
      copier(p.cle);
      CTX.qr(p.url).then(function (url) {
        var q = document.getElementById('mfaQR');
        if (!q) return;
        q.innerHTML = url ? '<img src="' + url + '" alt="QR à scanner">'
          : '<p class="lv-hint">QR indisponible — utilise la clé ci-dessous.</p>';
      }).catch(function () {
        var q = document.getElementById('mfaQR');
        if (q) q.innerHTML = '<p class="lv-hint">QR indisponible — utilise la clé ci-dessous.</p>';
      });
      var c = document.getElementById('mfaConfirm');
      if (c) c.onclick = function () { activer(c, p.secret); };
    }).catch(function (e) {
      btn.disabled = false;
      if (st) st.textContent = '❌ ' + lisible(e);
    });
  }

  // Copie de la clé. Sur une tablette, sélectionner un texte à la main est
  // pénible et source d'erreur (un caractère oublié = code toujours refusé).
  // Repli si le presse-papiers est refusé : on SÉLECTIONNE la clé pour que
  // « Copier » du menu système suffise — jamais de bouton sans effet.
  function copier(cle) {
    var b = document.getElementById('mfaCopy');
    var st = document.getElementById('mfaCopySt');
    if (!b) return;
    b.onclick = function () {
      var ok = function () { if (st) st.textContent = '✅ Clé copiée'; };
      var replier = function () {
        var el = document.getElementById('mfaCle');
        if (el && window.getSelection && document.createRange) {
          var r = document.createRange(); r.selectNodeContents(el);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          if (st) st.textContent = 'Clé sélectionnée — touche « Copier ».';
        } else if (st) st.textContent = 'Recopie la clé ci-dessus.';
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(String(cle)).then(ok).catch(replier);
        } else { replier(); }
      } catch (_) { replier(); }
    };
  }

  function activer(btn, secret) {
    var code = (document.getElementById('mfaCode') || {}).value || '';
    var st = document.getElementById('mfaSt2');
    if (!/^\d{6}$/.test(String(code).trim())) { if (st) st.textContent = 'Le code fait 6 chiffres.'; return; }
    btn.disabled = true;
    if (st) st.textContent = 'Activation…';
    confirmer(CTX.fb, CTX.user, secret, code).then(function () {
      CTX.toast('🔐 Double authentification activée', 'success');
      rafraichirPuis(function () { badge(); panneau(); });
    }).catch(function (e) {
      btn.disabled = false;
      if (st) st.textContent = '❌ ' + lisible(e);
    });
  }

  function desactiver(btn, pwd, st) {
    if (!pwd || !pwd.value) { if (st) st.textContent = 'Saisis ton mot de passe.'; return; }
    btn.disabled = true;
    if (st) st.textContent = 'Désactivation…';
    retirer(CTX.fb, CTX.user, pwd.value).then(function () {
      CTX.toast('Double authentification désactivée', 'success');
      rafraichirPuis(function () { badge(); panneau(); });
    }).catch(function (e) {
      btn.disabled = false;
      if (st) st.textContent = '❌ ' + lisible(e);
    });
  }

  // ══ DÉFI À LA CONNEXION ══════════════════════════════════════════════════
  // La connexion n'a pas échoué, elle est SUSPENDUE : on montre le champ du
  // code, et `err` suffit à la reprendre — le mot de passe n'est jamais
  // redemandé. `onOk` rend la main à app.js une fois l'identité complète.
  function defi(ctx, err, onOk) {
    CTX = ctx;
    var box = document.getElementById('loginMfa');
    var champ = document.getElementById('loginMfaCode');
    var go = document.getElementById('loginMfaGo');
    var msg = document.getElementById('loginMfaErr');
    var submit = document.getElementById('loginSubmit');
    if (!box || !go) { ctx.toast('Double authentification requise — recharge la page.', 'error'); return; }
    if (submit) submit.hidden = true;
    box.hidden = false;
    if (champ) { champ.value = ''; champ.focus(); }
    go.onclick = function () {
      var code = (champ && champ.value) || '';
      if (!/^\d{6}$/.test(String(code).trim())) { if (msg) msg.textContent = 'Le code fait 6 chiffres.'; return; }
      go.disabled = true;
      if (msg) msg.textContent = '';
      resoudre(ctx.fb, err, code).then(function (cred) {
        box.hidden = true;
        if (submit) submit.hidden = false;
        onOk(cred);
      }).catch(function (e) {
        go.disabled = false;
        if (msg) msg.textContent = lisible(e);
      });
    };
  }

  window.PT_MFA = {
    monter: monter,
    defi: defi,
    facteurs: facteurs,
    preparer: preparer,
    confirmer: confirmer,
    retirer: retirer,
    estDefi: estDefi,
    resoudre: resoudre,
    lisible: lisible
  };
})();
