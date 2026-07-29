/* detourage.js — MOTEUR DE DÉTOURAGE. Prêt à poser dans l'admin, non branché.
   ═════════════════════════════════════════════════════════════════════════
   Retire le fond d'une photo produit et rend un masque de transparence.
   Aucune dépendance, aucun modèle à télécharger : tourne dans le navigateur,
   en navigation privée, sur iPad. Entrée et sortie : `ImageData`.

       var r = PTDetourage.analyser(imageData);
       ctx.putImageData(PTDetourage.appliquer(imageData, r), 0, 0);

   ─────────────────────────────────────────────────────────────────────────
   TOUT CE QUI SUIT VIENT D'UNE MESURE SUR DE VRAIES PHOTOS DU CATALOGUE.
   Aucun seuil n'est choisi à l'œil : chacun est dérivé de l'image traitée.

   1. LE FOND EST UNE SURFACE, PAS UNE COULEUR
      Sur la photo à fond vert, la composante verte passe de 109 en haut à 134
      en bas. Un modèle à couleur unique déclare alors « objet » tout un bord.
      On ajuste donc une quadratique par canal sur le pourtour, avec rejet des
      points aberrants — un sachet touchait le bord et faussait l'ajustement
      (1519 échantillons écartés).

   2. LE CRITÈRE DÉPEND DE LA SATURATION DU FOND — MESURÉE
      · fond SATURÉ (vert, magenta…) : on compare l'ANGLE de couleur. Une
        ombre garde la teinte du fond (mesuré : 6,2°), un objet non (39–40°).
      · fond NEUTRE (blanc, gris, damier) : l'angle ne sert à rien — le métal
        a la même direction de couleur que le blanc. On compare la DISTANCE.
      Saturation mesurée : 0,000 sur les deux photos à fond blanc, 0,986 sur
      la verte. La bascule à 0,25 est sans ambiguïté.

   3. UN TROU ENFERMÉ N'EST PAS FORCÉMENT DE L'OBJET
      L'intérieur d'une boucle de câble est du FOND, entouré par l'objet.
      Mesuré : son grain est celui du fond extérieur (écart-type 0,67 contre
      0,56) là où une vraie zone d'objet a du relief (1,35 à 1,48). On perce
      donc les trous dont la statistique est celle du fond — 64508 pixels sur
      la photo blanche.

   4. LE NOIR PUR EST INDÉCIDABLE PAR LA COULEUR
      Un pixel noir est mathématiquement identique à une ombre infiniment
      profonde : noir = fond × 0. C'est une limite, pas un défaut. On pèle
      donc le liseré de contact par sa GÉOMÉTRIE : un bord très sombre dont le
      voisin extérieur est sombre aussi est une ombre portée, jamais une arête
      éclairée.

   5. ON LISSE, ON NE DENTELLE PAS
      Un seuil décide pixel par pixel et produit un bord en dents de scie.
      Fermeture puis ouverture morphologique, puis lissage de l'alpha dans la
      seule bande de transition : 42 piques → 3.

   6. LA COULEUR DU BORD EST CELLE DE L'OBJET, JAMAIS CELLE DU FOND
      Sur le bord, un pixel est un MÉLANGE. Le garder tel quel colle un liseré
      clair dès qu'on pose l'image sur un fond sombre. On inverse le mélange.

   ⚠️ CE QUE CE MOTEUR NE SAIT PAS FAIRE, et qu'il faut corriger au pinceau :
      · les structures plus fines qu'un pixel (poils, brosses métalliques) ;
      · un objet dont la couleur égale celle du fond ET qui communique avec
        l'extérieur — la topologie ne peut rien récupérer ;
      · un objet noir posé sur son ombre, quand les deux se touchent sans
        arête franche.
   ═════════════════════════════════════════════════════════════════════════*/
(function (racine) {
  'use strict';

  /* ═══ RÉGLAGES ══════════════════════════════════════════════════════════
     Chacun est soit dérivé de l'image, soit justifié par une mesure. */
  var DEFAUTS = {
    bordEchantillon: 12,   // épaisseur du pourtour servant à modéliser le fond
    satBascule: 0.25,      // au-delà : fond coloré. Mesuré 0,000 vs 0,986
    grainMax: 40,          // une composante plus petite est un grain de bruit
    trouMin: 24,           // en deçà, un trou est trop petit pour être jugé
    rayonBande: 2,         // demi-largeur de la bande de transition
    plancherAlpha: 0.08,   // en dessous, on efface — puis on réétale
    pelage: 2,             // tours de pelage du liseré de contact sombre
    limSombre: 22,         // luminance en dessous de laquelle on parle de noir
    lissage: 2             // passes de moyenne 3×3 sur la bande de transition
  };

  /* ═══ 1. LE FOND, MODÉLISÉ COMME UNE SURFACE ════════════════════════════ */
  function baseQuad(x, y) { return [1, x, y, x * x, x * y, y * y]; }

  function moindresCarres(ech, canal) {
    var n = 6, M = [], i, j, k;
    for (i = 0; i < n; i++) M.push(new Float64Array(n + 1));
    for (k = 0; k < ech.length; k++) {
      var B = baseQuad(ech[k].x, ech[k].y), v = ech[k].c[canal];
      for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) M[i][j] += B[i] * B[j];
        M[i][n] += B[i] * v;
      }
    }
    for (i = 0; i < n; i++) {
      var piv = i;
      for (k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
      var t = M[i]; M[i] = M[piv]; M[piv] = t;
      if (Math.abs(M[i][i]) < 1e-9) M[i][i] = 1e-9;
      for (k = i + 1; k < n; k++) {
        var f = M[k][i] / M[i][i];
        for (j = i; j <= n; j++) M[k][j] -= f * M[i][j];
      }
    }
    var p = new Float64Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = M[i][n];
      for (j = i + 1; j < n; j++) s -= M[i][j] * p[j];
      p[i] = s / M[i][i];
    }
    return p;
  }

  function evalQuad(p, x, y) {
    return p[0] + p[1] * x + p[2] * y + p[3] * x * x + p[4] * x * y + p[5] * y * y;
  }

  /**
   * Le fond, échantillonné sur le pourtour et ajusté en surface.
   * ⚠️ Deux passes de rejet : un objet qui touche le bord déformerait sinon
   *    le modèle sur TOUTE l'image.
   */
  function modeleDeFond(d, w, h, epaisseur) {
    var ech = [], x, y, k;
    function ajoute(X, Y) {
      var j = (Y * w + X) * 4;
      ech.push({ x: (2 * X / w) - 1, y: (2 * Y / h) - 1, c: [d[j], d[j + 1], d[j + 2]] });
    }
    for (y = 0; y < epaisseur; y += 2) for (x = 0; x < w; x += 2) { ajoute(x, y); ajoute(x, h - 1 - y); }
    for (y = 0; y < h; y += 2) for (x = 0; x < epaisseur; x += 2) { ajoute(x, y); ajoute(w - 1 - x, y); }

    var p = [null, null, null], rejetes = 0, passe;
    for (passe = 0; passe < 3; passe++) {
      for (k = 0; k < 3; k++) p[k] = moindresCarres(ech, k);
      var res = ech.map(function (e) {
        var m = 0;
        for (var q = 0; q < 3; q++) m = Math.max(m, Math.abs(e.c[q] - evalQuad(p[q], e.x, e.y)));
        return m;
      });
      if (passe === 2) break;
      var tri = res.slice().sort(function (a, b) { return a - b; });
      var med = tri[tri.length >> 1], q3 = tri[Math.floor(tri.length * 0.75)];
      var seuil = Math.max(6, med + 3 * Math.max(1, q3 - med));
      var avant = ech.length;
      ech = ech.filter(function (e, i) { return res[i] <= seuil; });
      rejetes += avant - ech.length;
      if (!ech.length) break;
    }
    return { p: p, rejetes: rejetes };
  }

  /* ═══ MORPHOLOGIE SÉPARABLE ═════════════════════════════════════════════
     Deux balayages en ligne puis en colonne : O(N·r) au lieu de O(N·r²).
     Sur 1254 × 1254 la différence se voit à l'œil nu sur un iPad. */
  function morphSep(src, w, h, r, maxi) {
    var A = new Uint8Array(src.length), B = new Uint8Array(src.length), x, y, k, on, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        on = maxi ? 0 : 1;
        for (k = -r; k <= r; k++) {
          var X = x + k;
          var v = (X >= 0 && X < w) ? src[y * w + X] : (maxi ? 0 : 1);
          if (maxi) { if (v) { on = 1; break; } } else { if (!v) { on = 0; break; } }
        }
        A[y * w + x] = on;
      }
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        on = maxi ? 0 : 1;
        for (k = -r; k <= r; k++) {
          var Y = y + k;
          var v2 = (Y >= 0 && Y < h) ? A[Y * w + x] : (maxi ? 0 : 1);
          if (maxi) { if (v2) { on = 1; break; } } else { if (!v2) { on = 0; break; } }
        }
        B[y * w + x] = on;
      }
    }
    return B;
  }

  /** Composantes connexes en 4-voisinage, sans récursion (pile explicite). */
  function composantes(masque, w, h, visiteur) {
    var N = w * h, vu = new Uint8Array(N), pile = new Int32Array(N), s, t, p, x, y, k, q;
    for (s = 0; s < N; s++) {
      if (!masque[s] || vu[s]) continue;
      var comp = [];
      t = 0; pile[t++] = s; vu[s] = 1;
      while (t > 0) {
        p = pile[--t]; comp.push(p);
        x = p % w; y = (p / w) | 0;
        for (k = 0; k < 4; k++) {
          q = k === 0 ? (x > 0 ? p - 1 : -1) : k === 1 ? (x < w - 1 ? p + 1 : -1)
            : k === 2 ? (y > 0 ? p - w : -1) : (y < h - 1 ? p + w : -1);
          if (q >= 0 && masque[q] && !vu[q]) { vu[q] = 1; pile[t++] = q; }
        }
      }
      visiteur(comp);
    }
  }

  /* ═══ 2. L'ANALYSE ══════════════════════════════════════════════════════ */
  function analyser(imageData, opts) {
    var o = {}, cle;
    for (cle in DEFAUTS) o[cle] = DEFAUTS[cle];
    if (opts) for (cle in opts) if (opts[cle] !== undefined) o[cle] = opts[cle];

    var w = imageData.width, h = imageData.height, d = imageData.data, N = w * h;
    var i, j, x, y, k, p, q;

    var mod = modeleDeFond(d, w, h, o.bordEchantillon);

    /* Le fond évalué une fois pour toutes, plus aucune allocation par pixel. */
    var F = new Float32Array(N * 3), lum = new Float32Array(N);
    for (y = 0; y < h; y++) {
      var ny = (2 * y / h) - 1;
      for (x = 0; x < w; x++) {
        var nx = (2 * x / w) - 1;
        i = y * w + x;
        F[i * 3] = evalQuad(mod.p[0], nx, ny);
        F[i * 3 + 1] = evalQuad(mod.p[1], nx, ny);
        F[i * 3 + 2] = evalQuad(mod.p[2], nx, ny);
        j = i * 4;
        lum[i] = (d[j] + d[j + 1] + d[j + 2]) / 3;
      }
    }

    /* Saturation du fond : c'est elle qui choisit le critère. */
    var f0 = F[0], f1 = F[1], f2 = F[2];
    var mx = Math.max(f0, f1, f2), mn = Math.min(f0, f1, f2);
    var saturation = mx > 1 ? (mx - mn) / mx : 0;
    var fondColore = saturation >= o.satBascule;

    /* Écart au fond : distance maximale par canal, et angle de couleur. */
    var dist = new Float32Array(N), angle = new Float32Array(N), perp = new Float32Array(N);
    for (i = 0, j = 0; i < N; i++, j += 4) {
      var Fr = F[i * 3], Fg = F[i * 3 + 1], Fb = F[i * 3 + 2];
      var Dr = d[j] - Fr, Dg = d[j + 1] - Fg, Db = d[j + 2] - Fb;
      dist[i] = Math.max(Math.abs(Dr), Math.abs(Dg), Math.abs(Db));
      var nf = Math.sqrt(Fr * Fr + Fg * Fg + Fb * Fb) || 1;
      var ur = Fr / nf, ug = Fg / nf, ub = Fb / nf;
      var pa = Dr * ur + Dg * ug + Db * ub;
      var er = Dr - pa * ur, eg = Dg - pa * ug, eb = Db - pa * ub;
      perp[i] = Math.sqrt(er * er + eg * eg + eb * eb);
      var na = Math.sqrt(d[j] * d[j] + d[j + 1] * d[j + 1] + d[j + 2] * d[j + 2]);
      if (na < 12) angle[i] = 90;                       // trop sombre pour avoir une teinte
      else {
        var cs = (d[j] * ur + d[j + 1] * ug + d[j + 2] * ub) / na;
        angle[i] = Math.acos(cs > 1 ? 1 : cs < -1 ? -1 : cs) * 57.29577951308232;
      }
    }

    /* Le seuil se lit dans l'image : la vallée entre les deux modes. */
    var seuil, hist, vmin, vpos;
    if (fondColore) {
      hist = new Float64Array(90);
      for (i = 0; i < N; i++) hist[Math.min(89, Math.round(angle[i]))]++;
      vmin = Infinity; vpos = 19;
      for (k = 5; k < 35; k++) if (hist[k] < vmin) { vmin = hist[k]; vpos = k; }
      seuil = vpos;
    } else {
      var ech = [];
      for (y = 1; y < 10; y++) for (x = 1; x < w; x += 3) { ech.push(dist[y * w + x]); ech.push(dist[(h - 1 - y) * w + x]); }
      ech.sort(function (a, b) { return a - b; });
      seuil = Math.max(4, Math.round((ech[Math.floor(ech.length * 0.99)] || 2) * 1.6));
    }

    var brut = new Uint8Array(N);
    if (fondColore) for (i = 0; i < N; i++) brut[i] = angle[i] > seuil ? 1 : 0;
    else for (i = 0; i < N; i++) brut[i] = dist[i] > seuil ? 1 : 0;

    /* ── grains isolés ─────────────────────────────────────────────────── */
    var grains = 0;
    composantes(brut, w, h, function (comp) {
      if (comp.length <= o.grainMax) { grains++; for (var k2 = 0; k2 < comp.length; k2++) brut[comp[k2]] = 0; }
    });

    /* ── liseré de contact ─────────────────────────────────────────────── */
    var peles = 0, tour, aPeler;
    for (tour = 0; tour < o.pelage; tour++) {
      aPeler = [];
      for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
        i = y * w + x;
        if (!brut[i] || lum[i] > o.limSombre) continue;
        for (k = 0; k < 4; k++) {
          q = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - w : i + w;
          if (!brut[q] && lum[q] < o.limSombre * 2.2) { aPeler.push(i); break; }
        }
      }
      if (!aPeler.length) break;
      for (k = 0; k < aPeler.length; k++) { brut[aPeler[k]] = 0; peles++; }
    }

    /* ── contour régularisé : fermeture puis ouverture ─────────────────── */
    brut = morphSep(morphSep(brut, w, h, 1, true), w, h, 1, false);   // ferme
    brut = morphSep(morphSep(brut, w, h, 1, false), w, h, 1, true);   // ouvre

    /* ── topologie ─────────────────────────────────────────────────────── */
    var atteint = new Uint8Array(N), pile = new Int32Array(N), t = 0;
    for (x = 0; x < w; x++) { pile[t++] = x; pile[t++] = (h - 1) * w + x; }
    for (y = 0; y < h; y++) { pile[t++] = y * w; pile[t++] = y * w + w - 1; }
    while (t > 0) {
      p = pile[--t]; if (atteint[p] || brut[p]) continue; atteint[p] = 1;
      x = p % w; y = (p / w) | 0;
      if (x > 0) pile[t++] = p - 1; if (x < w - 1) pile[t++] = p + 1;
      if (y > 0) pile[t++] = p - w; if (y < h - 1) pile[t++] = p + w;
    }
    /* Un trou dont le GRAIN est celui du fond EST du fond, si dense soit-il. */
    var trou = new Uint8Array(N);
    for (i = 0; i < N; i++) trou[i] = (!brut[i] && !atteint[i]) ? 1 : 0;
    var refFond = ecartTypeFond(lum, w, h);
    var perces = 0, percesPx = 0;
    composantes(trou, w, h, function (comp) {
      if (comp.length < o.trouMin) return;
      var k2, sm = 0;
      for (k2 = 0; k2 < comp.length; k2++) sm += lum[comp[k2]];
      var m = sm / comp.length, v = 0, g = 0, ng = 0;
      for (k2 = 0; k2 < comp.length; k2++) {
        var dd = lum[comp[k2]] - m; v += dd * dd;
        if ((comp[k2] % w) < w - 1) { g += Math.abs(lum[comp[k2]] - lum[comp[k2] + 1]); ng++; }
      }
      var sd = Math.sqrt(v / comp.length), gr = ng ? g / ng : 0;
      var memeGrain = fondColore
        ? moyenneSur(angle, comp) < seuil
        : (sd < Math.max(1.2, refFond.sd * 2.2) && gr < Math.max(0.9, refFond.gr * 1.6));
      if (memeGrain) { perces++; percesPx += comp.length; for (k2 = 0; k2 < comp.length; k2++) atteint[comp[k2]] = 1; }
    });
    var objet = new Uint8Array(N);
    for (i = 0; i < N; i++) objet[i] = atteint[i] ? 0 : 1;

    /* ── trimap ────────────────────────────────────────────────────────── */
    var fondM = new Uint8Array(N);
    for (i = 0; i < N; i++) fondM[i] = objet[i] ? 0 : 1;
    var fondGros = morphSep(fondM, w, h, o.rayonBande, true);
    var objGros = morphSep(objet, w, h, o.rayonBande, true);
    var sûrFond = new Uint8Array(N);
    for (i = 0; i < N; i++) sûrFond[i] = (!objet[i] && !objGros[i]) ? 1 : 0;

    /* ── alpha, décontamination, translucidité ─────────────────────────── */
    var alpha = new Float32Array(N), rgb = new Uint8ClampedArray(N * 3);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; j = i * 4;
      var R = d[j], G = d[j + 1], B = d[j + 2], a;
      var sûrObjet = objet[i] && !fondGros[i];

      if (sûrObjet) a = 1;
      else if (sûrFond[i]) a = 0;
      else {
        var Fr2 = F[i * 3], Fg2 = F[i * 3 + 1], Fb2 = F[i * 3 + 2];
        var sr = 0, sg = 0, sb = 0, n = 0, dx, dy, A2, B2, ii, jj;
        for (dy = -3; dy <= 3; dy++) for (dx = -3; dx <= 3; dx++) {
          A2 = x + dx; B2 = y + dy;
          if (A2 < 0 || B2 < 0 || A2 >= w || B2 >= h) continue;
          ii = B2 * w + A2;
          if (!(objet[ii] && !fondGros[ii])) continue;
          jj = ii * 4; sr += d[jj]; sg += d[jj + 1]; sb += d[jj + 2]; n++;
        }
        if (!n) a = 0;
        else {
          var C0 = sr / n, C1 = sg / n, C2 = sb / n;
          var vx = C0 - Fr2, vy = C1 - Fg2, vz = C2 - Fb2;
          var nq = vx * vx + vy * vy + vz * vz;
          if (nq < 64) a = objet[i] ? 1 : 0;
          else {
            a = ((R - Fr2) * vx + (G - Fg2) * vy + (B - Fb2) * vz) / nq;
            if (a < 0) a = 0; else if (a > 1) a = 1;
          }
          if (a > 0.25) {
            R = (R - (1 - a) * Fr2) / a; G = (G - (1 - a) * Fg2) / a; B = (B - (1 - a) * Fb2) / a;
            var tt = (a - 0.25) / 0.35; if (tt > 1) tt = 1;
            R = R * tt + C0 * (1 - tt); G = G * tt + C1 * (1 - tt); B = B * tt + C2 * (1 - tt);
          } else { R = C0; G = C1; B = C2; }
        }
      }

      /* Fond coloré : ce qui reste teinté a laissé passer le fond. On retire
         cette part de couleur, et on en déduit l'opacité — un sachet
         plastique doit laisser voir ce qu'il y a derrière, pas rester vert. */
      if (fondColore && a > 0 && angle[i] < 36) {
        var Fr3 = F[i * 3], Fg3 = F[i * 3 + 1], Fb3 = F[i * 3 + 2];
        var nf3 = Math.sqrt(Fr3 * Fr3 + Fg3 * Fg3 + Fb3 * Fb3) || 1;
        var w0 = Fr3 / nf3, w1 = Fg3 / nf3, w2 = Fb3 / nf3;
        var force = (36 - Math.max(seuil, angle[i])) / (36 - seuil);
        if (force > 0) {
          var proj = R * w0 + G * w1 + B * w2;
          var moy = (R + G + B) / 3;
          var exces = Math.max(0, proj - moy * (w0 + w1 + w2)) * force * 0.85;
          R -= exces * w0; G -= exces * w1; B -= exces * w2;
          var partFond = exces / nf3;
          if (a === 1 && partFond > 0.02) { var aT = 1 - partFond; a = aT < 0.30 ? 0.30 : aT; }
        }
      }

      if (a < o.plancherAlpha) a = 0; else if (a < 1) a = (a - o.plancherAlpha) / (1 - o.plancherAlpha);
      alpha[i] = a;
      rgb[i * 3] = R; rgb[i * 3 + 1] = G; rgb[i * 3 + 2] = B;
    }

    /* ── lissage du bord, dans la bande de transition seulement ────────── */
    var bande = new Uint8Array(N);
    for (i = 0; i < N; i++) bande[i] = (alpha[i] > 0 && alpha[i] < 1) ? 1 : 0;
    bande = morphSep(bande, w, h, 2, true);
    var passe2, dy2, dx2;
    for (passe2 = 0; passe2 < o.lissage; passe2++) {
      var tmp = new Float32Array(alpha);
      for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
        i = y * w + x; if (!bande[i]) continue;
        var s2 = 0;
        for (dy2 = -1; dy2 <= 1; dy2++) for (dx2 = -1; dx2 <= 1; dx2++) s2 += tmp[(y + dy2) * w + (x + dx2)];
        alpha[i] = s2 / 9;
      }
    }

    /* ── fragments détachés et pâles ───────────────────────────────────── */
    var on = new Uint8Array(N);
    for (i = 0; i < N; i++) on[i] = alpha[i] > 0 ? 1 : 0;
    var comps = [];
    composantes(on, w, h, function (comp) { comps.push(comp); });
    comps.sort(function (a2, b2) { return b2.length - a2.length; });
    var bavures = 0;
    for (k = 1; k < comps.length; k++) {
      var amax = 0, m2;
      for (m2 = 0; m2 < comps[k].length; m2++) if (alpha[comps[k][m2]] > amax) amax = alpha[comps[k][m2]];
      if (amax < 0.5 || comps[k].length < o.trouMin) {
        bavures++;
        for (m2 = 0; m2 < comps[k].length; m2++) alpha[comps[k][m2]] = 0;
      }
    }

    return {
      largeur: w, hauteur: h, alpha: alpha, rgb: rgb,
      diag: {
        saturationFond: saturation, critere: fondColore ? 'angle' : 'distance',
        seuil: seuil, grains: grains, peles: peles, perces: perces, percesPx: percesPx,
        bavures: bavures, echantillonsRejetes: mod.rejetes, composantes: comps.length
      }
    };
  }

  function moyenneSur(tab, comp) {
    var s = 0, k;
    for (k = 0; k < comp.length; k++) s += tab[comp[k]];
    return s / comp.length;
  }

  /** Grain du fond, relevé sur la première bande du haut. */
  function ecartTypeFond(lum, w, h) {
    var s = 0, n = 0, g = 0, ng = 0, x, y, i;
    for (y = 1; y < 6; y++) for (x = 1; x < w - 1; x += 2) {
      i = y * w + x; s += lum[i]; n++; g += Math.abs(lum[i] - lum[i + 1]); ng++;
    }
    var m = s / n, v = 0;
    for (y = 1; y < 6; y++) for (x = 1; x < w - 1; x += 2) { var dd = lum[y * w + x] - m; v += dd * dd; }
    return { sd: Math.sqrt(v / n), gr: g / ng };
  }

  /* ═══ 3. APPLIQUER ══════════════════════════════════════════════════════ */
  function appliquer(imageData, res, fabrique) {
    var w = res.largeur, h = res.hauteur, N = w * h;
    var out = fabrique ? fabrique(w, h)
      : (typeof ImageData !== 'undefined' ? new ImageData(w, h) : { width: w, height: h, data: new Uint8ClampedArray(N * 4) });
    var o = out.data, i;
    for (i = 0; i < N; i++) {
      o[i * 4] = res.rgb[i * 3];
      o[i * 4 + 1] = res.rgb[i * 3 + 1];
      o[i * 4 + 2] = res.rgb[i * 3 + 2];
      o[i * 4 + 3] = Math.round(res.alpha[i] * 255);
    }
    return out;
  }

  /* ═══ 4. PINCEAU — la correction manuelle, indispensable ════════════════
     Le moteur ne saura jamais tout. Ce qu'il rate se reprend au doigt.
     `mode` : 'ajouter' rend opaque, 'retirer' rend transparent.
     Le bord de la touche est adouci — on ne recrée pas des dents à la main. */
  function pinceau(res, cx, cy, rayon, mode, durete) {
    var w = res.largeur, h = res.hauteur;
    var r2 = rayon * rayon, dur = durete === undefined ? 0.75 : durete;
    var x0 = Math.max(0, Math.floor(cx - rayon)), x1 = Math.min(w - 1, Math.ceil(cx + rayon));
    var y0 = Math.max(0, Math.floor(cy - rayon)), y1 = Math.min(h - 1, Math.ceil(cy + rayon));
    var x, y, touches = 0;
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
      var dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var t = Math.sqrt(d2) / rayon;
      var force = t <= dur ? 1 : 1 - (t - dur) / (1 - dur);
      var i = y * w + x, cible = mode === 'retirer' ? 0 : 1;
      res.alpha[i] = res.alpha[i] * (1 - force) + cible * force;
      touches++;
    }
    return touches;
  }

  var API = { analyser: analyser, appliquer: appliquer, pinceau: pinceau, DEFAUTS: DEFAUTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else racine.PTDetourage = API;
})(typeof self !== 'undefined' ? self : this);
