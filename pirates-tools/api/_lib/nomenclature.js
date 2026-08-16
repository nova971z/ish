/* ══════════════════════════════════════════════════════════════════════════
   NOMENCLATURE DE L'OUTILLAGE, DE LA QUINCAILLERIE ET DES EPI
   ─────────────────────────────────────────────────────────────────────────
   Écrit le 03/08/2026 sur demande de l'user : « tu vas faire une grosse
   recherche sur Internet de comment sont nommés les outillages, la
   quincaillerie et les équipements de protection […] et tu vas devoir créer
   un document massif et parfaitement rangé avec une chronologie en entonnoir
   pour que ton parseur ne se trompe pas. »

   ⛔ CE FICHIER EST UNE DONNÉE, PAS UNE LOGIQUE. Il ne lit rien, n'écrit
   rien, ne calcule aucun prix. `price-parse.js` s'en sert pour reconnaître
   ce qu'un titre fournisseur désigne. La séparation est délibérée : un
   vocabulaire grossit tous les mois, un parseur ne doit pas être réécrit
   pour autant. ⚠️ Aucune lecture de fichier au chargement (règle des portes
   mortes) : tout est littéral.

   ══ L'ENTONNOIR, ET POURQUOI IL EXISTE ═══════════════════════════════════

     niveau 1  FAMILLE   — machine · consommable · energie · rangement · epi
     niveau 2  RAYON     — ex. « lame-circulaire », « chaussure », « foret »
     niveau 3  TYPE      — le nom canonique + toutes ses écritures réelles
     niveau 4  MESURES   — ce qu'on a le DROIT de chercher dans ce rayon

   Le niveau 4 est le cœur du dispositif. Sans lui, un extracteur cherche
   TOUT partout : il lit « 43 » dans « pointure 43 » et se demande si c'est
   un voltage, il voit « S3 » sur une chaussure et croit à une référence.
   Chaque rayon déclare donc les seules mesures qui ont un sens chez lui —
   une chaussure n'a pas de voltage, une lame n'a pas de batterie, un
   pantalon n'a ni ampères-heures ni alésage. Ce qui n'est pas déclaré n'est
   pas cherché : c'est là, et seulement là, que l'entonnoir travaille.

   ⚠️ L'ORDRE DES SYNONYMES NE COMPTE PAS, leur LONGUEUR si. Le type retenu
   est celui dont l'écriture reconnue est la plus longue : « lame de scie
   circulaire » (23 signes) l'emporte sur « scie » (4). Un ordre fixe se
   tromperait forcément sur l'un des titres — mesuré le 03/08 sur son
   catalogue avec « Rainureuse à double disque Ø180 mm en coffret », qui
   contient trois termes de trois familles différentes.

   ══ SOURCES CONSULTÉES LE 03/08/2026 ═════════════════════════════════════
   ⛔ Rien ici n'est une source de droit : les normes sont DÉSIGNÉES pour
   être vérifiées, jamais citées comme opposables (protocole §8).

     · Références et suffixes DeWALT ...... support.dewalt.com · dewalt.fr
     · Gammes DeWALT (XR/FlexVolt/…) ...... dewalt.co.uk/systems
     · Lames de scie circulaire ........... manomano.fr · blog.berner.eu
     · Forets et emmanchements ............ hellertools.fr · bricozor.com
     · Disques abrasifs — EN 12413 ........ fepa-abrasives.org (dépliant PDF)
     · Grains d'abrasif — FEPA 42-1:2006 .. carross.eu · lecoinducarrossier.fr
     · Embouts de vissage ................. infos.wurth.fr · bricozor.com
     · Chaussures — EN ISO 20345:2022 ..... s24.fr · officina.shop
     · Gants — EN 388 / EN ISO 21420 ...... mer.fr · protection-des-mains.com
     · Tête — EN 397 / EN 12492 / EN 812 .. abisco.fr · modyf.fr
     · Respiratoire — EN 149 (FFP1-3) ..... inrs.fr · modyf.fr
     · Haute visibilité — EN ISO 20471 .... js-fournitures.fr
     · Vêtements de travail BTP ........... kraftworkwear.com · thaf.fr
     · Visserie et fixations .............. quincaillerie-aixoise.fr
   ══════════════════════════════════════════════════════════════════════ */

'use strict';

/* ── NIVEAU 1 ─ FAMILLES ─────────────────────────────────────────────────
   Cinq, et pas une de plus. Elles ne décrivent pas un rayon de magasin :
   elles décrivent CE QUI FAIT LE PRIX. Une machine se compare par sa
   puissance et son lot ; un consommable par ses cotes ; un EPI par sa
   taille et sa norme. Mélanger les trois, c'est comparer n'importe quoi. */
var FAMILLES = {
  machine:     'Machine — outil motorisé, filaire ou sur batterie',
  consommable: 'Consommable et accessoire — ce qui s\'use, se coupe, se rachète',
  energie:     'Énergie — batteries, chargeurs, stations',
  rangement:   'Rangement — coffrets, valises, chariots, servantes',
  epi:         'Équipement de protection individuelle et vêtement de travail'
};

/* ── NIVEAU 4 (déclaré d'abord, cité par le niveau 2) ────────────────────
   Le dictionnaire des mesures. La clé est le champ rendu par l'extracteur.
   ⚠️ `ambigu: true` marque une mesure dont le titre ne dit PAS ce qu'elle
   mesure — elle est relevée, jamais interprétée. */
var MESURES = {
  voltage:        { unite: 'V',   note: 'tension de l\'outil, ≤ 60 V sur batterie' },
  voltageSecteur: { unite: 'V',   note: '≥ 100 V — le secteur, jamais l\'outil' },
  ah:             { unite: 'Ah',  note: 'capacité de la plus grosse batterie annoncée' },
  nbBatteries:    { unite: '',    note: '0 si « outil nu » — une information, pas un vide' },
  watts:          { unite: 'W',   note: 'puissance absorbée, machines filaires' },
  nbOutils:       { unite: '',    note: 'machines d\'un combo' },
  serie:          { unite: '',    note: 'gamme batterie — commande la compatibilité' },
  brushless:      { unite: '',    note: 'moteur sans charbon' },
  poidsKg:        { unite: 'kg',  note: '' },
  bars:           { unite: 'bar', note: 'pression, nettoyeurs et compresseurs' },
  litres:         { unite: 'L',   note: 'cuve, réservoir, contenance' },
  diametreMm:     { unite: 'mm',  note: 'UNIQUEMENT si Ø explicite ou mot « diamètre »' },
  alesageMm:      { unite: 'mm',  note: 'trou central — deux lames de même Ø ne se montent pas si l\'alésage diffère' },
  dimensionsMm:   { unite: 'mm',  note: 'cotes composées « 30x43 », « 6x57x93 »' },
  cotesMm:        { unite: 'mm',  ambigu: true, note: 'une cote nue : présente, de nature non dite' },
  longueurMm:     { unite: 'mm',  note: 'longueur explicite ou exprimée en cm' },
  longueurM:      { unite: 'm',   note: 'bobines de fil, rallonges, tuyaux' },
  pouces:         { unite: '"',   note: 'carré conducteur, filetage' },
  nbDents:        { unite: '',    note: 'denture d\'une lame' },
  denture:        { unite: '',    note: 'géométrie : ATB, TCG, plate, négative' },
  grain:          { unite: '',    note: 'FEPA : P40 grossier → P2500 finition' },
  nuance:         { unite: '',    note: 'HSS-Co, BiM, carbure, diamant — double parfois le prix' },
  matiere:        { unite: '',    note: 'matériau travaillé : bois, métal, béton…' },
  emmanchement:   { unite: '',    note: 'SDS-plus, SDS-max, queue T, hexagonal…' },
  empreinte:      { unite: '',    note: 'PZ, PH, TX, HEX, carré…' },
  formeDisque:    { unite: '',    note: 'EN 12413 : type 27, 41, 42' },
  nbPieces:       { unite: '',    note: 'contenu d\'un lot' },
  conditionnement:{ unite: '',    note: 'coffret, lot, pack, boîte' },
  pourMachine:    { unite: '',    note: 'machine de destination — JAMAIS l\'article lui-même' },
  taille:         { unite: '',    note: 'vêtement : S…5XL ou 38…64' },
  pointure:       { unite: '',    note: 'chaussure : 35 à 52' },
  tailleGant:     { unite: '',    note: 'gant : 6 à 12' },
  normeEpi:       { unite: '',    note: 'S1P, S3S, FFP2, EN 388… — vérifiée en ligne, jamais de mémoire' },
  couleur:        { unite: '',    note: '' }
};

/* Jeux de mesures partagés — écrits une fois, cités par les rayons. */
var M_LOT     = ['nbPieces', 'conditionnement', 'pourMachine', 'poidsKg', 'couleur'];
var M_MACHINE = ['voltage', 'voltageSecteur', 'ah', 'nbBatteries', 'nbOutils', 'serie',
  'brushless', 'watts', 'poidsKg', 'cotesMm', 'conditionnement', 'nbPieces', 'couleur'];
var M_EPI     = ['taille', 'normeEpi', 'couleur', 'nbPieces', 'conditionnement'];

/* ── NIVEAU 2 ─ RAYONS ───────────────────────────────────────────────────
   Un rayon = une famille + la liste EXHAUSTIVE des mesures qui y ont un
   sens. ⛔ Ce qui n'est pas listé n'est pas cherché. */
var RAYONS = {
  // ═══ MACHINES ═══════════════════════════════════════════════════════
  'percage':      { famille: 'machine', libelle: 'Perçage et vissage',
                    mesures: M_MACHINE.concat(['emmanchement', 'diametreMm']) },
  'vissage-choc': { famille: 'machine', libelle: 'Vissage et boulonnage à chocs',
                    mesures: M_MACHINE.concat(['pouces', 'emmanchement']) },
  'perforation':  { famille: 'machine', libelle: 'Perforation et démolition',
                    mesures: M_MACHINE.concat(['emmanchement']) },
  'meulage':      { famille: 'machine', libelle: 'Meulage, tronçonnage, polissage',
                    mesures: M_MACHINE.concat(['diametreMm']) },
  'sciage':       { famille: 'machine', libelle: 'Sciage',
                    mesures: M_MACHINE.concat(['diametreMm', 'longueurMm']) },
  'bois':         { famille: 'machine', libelle: 'Travail du bois',
                    mesures: M_MACHINE.concat(['diametreMm', 'longueurMm']) },
  'fixation':     { famille: 'machine', libelle: 'Clouage, agrafage, rivetage',
                    mesures: M_MACHINE.concat(['longueurMm']) },
  'aspiration':   { famille: 'machine', libelle: 'Aspiration et soufflage',
                    mesures: M_MACHINE.concat(['litres']) },
  'jardin':       { famille: 'machine', libelle: 'Jardin et espaces verts',
                    mesures: M_MACHINE.concat(['longueurMm', 'diametreMm', 'litres']) },
  'chantier':     { famille: 'machine', libelle: 'Énergie et fluides de chantier',
                    mesures: M_MACHINE.concat(['bars', 'litres']) },
  'mesure':       { famille: 'machine', libelle: 'Mesure, détection, éclairage',
                    mesures: M_MACHINE.concat(['longueurM']) },
  'confort':      { famille: 'machine', libelle: 'Confort de chantier',
                    mesures: M_MACHINE.concat(['litres']) },
  'combo':        { famille: 'machine', libelle: 'Lots de plusieurs machines',
                    mesures: M_MACHINE },

  // ═══ CONSOMMABLES ═══════════════════════════════════════════════════
  'lame-circulaire':  { famille: 'consommable', libelle: 'Lames de scie circulaire',
                        mesures: M_LOT.concat(['diametreMm', 'alesageMm', 'nbDents', 'denture', 'matiere', 'nuance']) },
  'lame-alternative': { famille: 'consommable', libelle: 'Lames de scie sabre, sauteuse, ruban',
                        mesures: M_LOT.concat(['longueurMm', 'dimensionsMm', 'nbDents', 'matiere', 'nuance', 'emmanchement', 'diametreMm']) },
  'lame-oscillante':  { famille: 'consommable', libelle: 'Lames pour outil multifonctions',
                        mesures: M_LOT.concat(['dimensionsMm', 'diametreMm', 'matiere', 'nuance', 'emmanchement']) },
  'foret':            { famille: 'consommable', libelle: 'Forets, mèches, trépans',
                        mesures: M_LOT.concat(['diametreMm', 'dimensionsMm', 'longueurMm', 'matiere', 'nuance', 'emmanchement']) },
  'fraise':           { famille: 'consommable', libelle: 'Fraises de défonceuse',
                        mesures: M_LOT.concat(['diametreMm', 'dimensionsMm', 'nuance', 'emmanchement']) },
  'disque':           { famille: 'consommable', libelle: 'Disques de meuleuse',
                        mesures: M_LOT.concat(['diametreMm', 'alesageMm', 'formeDisque', 'grain', 'matiere', 'nuance', 'cotesMm']) },
  'abrasif':          { famille: 'consommable', libelle: 'Abrasifs de ponçage',
                        mesures: M_LOT.concat(['diametreMm', 'dimensionsMm', 'grain', 'matiere']) },
  'vissage-embout':   { famille: 'consommable', libelle: 'Embouts, douilles, clés',
                        mesures: M_LOT.concat(['empreinte', 'longueurMm', 'pouces', 'emmanchement', 'dimensionsMm', 'cotesMm']) },
  'burin':            { famille: 'consommable', libelle: 'Burins, pointes, pelles',
                        mesures: M_LOT.concat(['longueurMm', 'dimensionsMm', 'emmanchement', 'cotesMm']) },
  'visserie':         { famille: 'consommable', libelle: 'Visserie, boulonnerie, fixations',
                        mesures: M_LOT.concat(['diametreMm', 'longueurMm', 'empreinte', 'matiere', 'dimensionsMm']) },
  'chaine':           { famille: 'consommable', libelle: 'Chaînes, guides, fils de coupe',
                        mesures: M_LOT.concat(['longueurMm', 'longueurM', 'diametreMm', 'nbDents']) },
  'filtration':       { famille: 'consommable', libelle: 'Filtres, sacs, tuyaux',
                        mesures: M_LOT.concat(['litres', 'dimensionsMm', 'diametreMm', 'longueurM']) },
  'accessoire':       { famille: 'consommable', libelle: 'Accessoires et pièces',
                        mesures: M_LOT.concat(['diametreMm', 'dimensionsMm', 'longueurMm', 'emmanchement', 'cotesMm']) },

  // ═══ ÉNERGIE ════════════════════════════════════════════════════════
  'batterie': { famille: 'energie', libelle: 'Batteries',
                mesures: ['voltage', 'ah', 'serie', 'nbBatteries', 'nbPieces', 'conditionnement', 'poidsKg'] },
  'chargeur': { famille: 'energie', libelle: 'Chargeurs et stations',
                mesures: ['voltage', 'voltageSecteur', 'serie', 'nbPieces', 'conditionnement', 'poidsKg', 'watts'] },

  // ═══ RANGEMENT ══════════════════════════════════════════════════════
  'coffret':  { famille: 'rangement', libelle: 'Coffrets et valises',
                mesures: ['dimensionsMm', 'litres', 'nbPieces', 'conditionnement', 'poidsKg', 'couleur', 'cotesMm'] },
  'mobilier': { famille: 'rangement', libelle: 'Chariots, servantes, établis',
                mesures: ['dimensionsMm', 'nbPieces', 'poidsKg', 'couleur', 'cotesMm'] },
  'portage':  { famille: 'rangement', libelle: 'Sacs, ceintures, porte-outils',
                mesures: ['dimensionsMm', 'nbPieces', 'poidsKg', 'couleur'] },

  // ═══ EPI ════════════════════════════════════════════════════════════
  'chaussure':    { famille: 'epi', libelle: 'Chaussures et bottes de sécurité',
                    mesures: M_EPI.concat(['pointure']) },
  'vetement':     { famille: 'epi', libelle: 'Vêtements de travail',
                    mesures: M_EPI },
  'main':         { famille: 'epi', libelle: 'Protection des mains',
                    mesures: M_EPI.concat(['tailleGant']) },
  'tete':         { famille: 'epi', libelle: 'Protection de la tête et du visage',
                    mesures: M_EPI },
  'auditif':      { famille: 'epi', libelle: 'Protection auditive',
                    mesures: M_EPI },
  'respiratoire': { famille: 'epi', libelle: 'Protection respiratoire',
                    mesures: M_EPI },
  'hauteur':      { famille: 'epi', libelle: 'Travail en hauteur',
                    mesures: M_EPI.concat(['longueurM', 'poidsKg']) },
  'genou':        { famille: 'epi', libelle: 'Protection des genoux',
                    mesures: M_EPI }
};

/* ── NIVEAU 3 ─ TYPES ────────────────────────────────────────────────────
   [rayon, nom canonique, [toutes les écritures rencontrées]]
   ⚠️ Le pluriel est couvert automatiquement (le parseur ajoute `s?` à chaque
   mot) et les accents sont ignorés des deux côtés : inutile d'écrire
   « elagueuse » à côté d'« élagueuse ». */
var TYPES = [
  // ═══ MACHINES — PERÇAGE ET VISSAGE ══════════════════════════════════
  ['percage', 'perceuse-visseuse', ['perceuse-visseuse', 'perceuse visseuse', 'perceuse/visseuse', 'taladro atornillador', 'drill driver', 'cordless drill driver']],
  ['percage', 'perceuse à percussion', ['perceuse à percussion', 'perceuse percussion', 'perceuse à choc', 'taladro percutor', 'hammer drill', 'percussion drill']],
  ['percage', 'perceuse d\'angle', ['perceuse d\'angle', 'perceuse angulaire']],
  ['percage', 'perceuse à colonne', ['perceuse à colonne', 'perceuse d\'établi']],
  ['percage', 'perceuse', ['perceuse', 'drill', 'taladro', 'bohrmaschine']],
  ['percage', 'visseuse à placo', ['visseuse à placo', 'visseuse plaquiste', 'visseuse à bande', 'visseuse cloison', 'atornillador para pladur', 'drywall screwdriver', 'drywall screwgun']],
  ['percage', 'visseuse', ['visseuse', 'tournevis électrique', 'screwdriver', 'atornillador', 'screwdriver drill']],
  ['percage', 'carotteuse', ['carotteuse', 'carotteuse à eau', 'carotteuse diamant', 'perforadora de diamante', 'core drill', 'diamond core drill']],
  ['percage', 'taraudeuse', ['taraudeuse']],
  /* ⚠️ « Diamètre de l'hélice 160 mm, M14 » : idealo décrit le malaxeur par
     son OUTIL, pas par son nom. Mesuré sur sa page — la fiche sortait sans
     type pour cette seule raison. */
  ['percage', 'malaxeur', ['malaxeur', 'mélangeur', 'agitateur', 'mezclador', 'paddle mixer', 'mixer',
    'hélice de malaxage', 'hélice']],
  ['percage', 'tarière', ['tarière', 'tarière de sol']],

  // ═══ MACHINES — VISSAGE À CHOCS ═════════════════════════════════════
  ['vissage-choc', 'visseuse à chocs', ['visseuse à chocs', 'visseuse à choc', 'visseuse à impulsions', 'impact driver', 'atornillador de impacto']],
  ['vissage-choc', 'clé à chocs', ['clé à chocs', 'clé à choc', 'boulonneuse à chocs', 'impact wrench', 'llave de impacto']],
  ['vissage-choc', 'boulonneuse', ['boulonneuse', 'déboulonneuse']],
  ['vissage-choc', 'cliquet', ['cliquet', 'clé à cliquet', 'carraca', 'ratchet', 'cordless ratchet']],

  // ═══ MACHINES — PERFORATION ET DÉMOLITION ═══════════════════════════
  ['perforation', 'marteau perforateur', ['marteau perforateur', 'marteau perforateur burineur',
    'marteau combiné', 'perforateur burineur', 'martillo electroneumático', 'martillo perforador', 'martillo combinado', 'rotary hammer', 'combi hammer', 'sds hammer']],
  ['perforation', 'marteau de démolition', ['marteau de démolition', 'marteau piqueur', 'brise-béton',
    'demolition hammer', 'martillo demoledor', 'martillo de demolición', 'breaker', 'pavement breaker']],
  ['perforation', 'perforateur', ['perforateur', 'perfo', 'rotary hammer', 'perforador']],
  ['perforation', 'burineur', ['burineur', 'marteau burineur', 'cincelador', 'chipping hammer']],

  // ═══ MACHINES — MEULAGE, TRONÇONNAGE, POLISSAGE ═════════════════════
  ['meulage', 'meuleuse d\'angle', ['meuleuse d\'angle', 'meuleuse angulaire', 'disqueuse d\'angle', 'angle grinder', 'amoladora angular']],
  ['meulage', 'meuleuse droite', ['meuleuse droite', 'meuleuse crayon']],
  ['meulage', 'meuleuse', ['meuleuse', 'disqueuse', 'meuleuse compacte', 'amoladora', 'grinder']],
  ['meulage', 'découpeuse', ['découpeuse', 'découpeuse thermique', 'tronçonneuse à disque', 'cut-off saw', 'cortadora', 'tronzadora', 'cut off saw', 'cutter']],
  ['meulage', 'polisseuse', ['polisseuse', 'lustreuse', 'pulidora', 'polisher']],
  ['meulage', 'surfaceuse', ['surfaceuse', 'surfaceuse à béton', 'ponceuse à béton', 'rénovateur de surface', 'fresadora de hormigón', 'concrete grinder', 'surface planer']],
  ['meulage', 'rainureuse', ['rainureuse', 'rainureuse à disque', 'saigneuse', 'rozadora', 'wall chaser']],
  ['meulage', 'grignoteuse', ['grignoteuse', 'nibbler', 'roedora']],
  ['meulage', 'cisaille', ['cisaille', 'cisaille à tôle', 'cizalla', 'shear', 'metal shear']],
  ['meulage', 'lime à bande', ['lime à bande', 'lime électrique']],
  ['meulage', 'ébavureuse', ['ébavureuse', 'ébarbeuse']],

  // ═══ MACHINES — SCIAGE ══════════════════════════════════════════════
  ['sciage', 'scie circulaire', ['scie circulaire', 'scie circulaire portative', 'circular saw', 'sierra circular']],
  ['sciage', 'scie plongeante', ['scie plongeante', 'scie sur rail', 'sierra de incisión', 'plunge saw', 'track saw']],
  ['sciage', 'scie sabre', ['scie sabre', 'scie alligator', 'scie récipro', 'reciprocating saw', 'sierra sable', 'recip saw']],
  ['sciage', 'scie sauteuse', ['scie sauteuse', 'jigsaw', 'sierra de calar', 'jig saw']],
  ['sciage', 'scie à onglet', ['scie à onglet', 'scie radiale', 'scie à coupe d\'onglet', 'mitre saw', 'ingletadora', 'sierra ingletadora', 'miter saw']],
  ['sciage', 'scie sur table', ['scie sur table', 'scie de table', 'scie stationnaire',
    'scie circulaire stationnaire', 'scie d\'établi', 'sierra de mesa', 'table saw']],
  ['sciage', 'scie à ruban', ['scie à ruban', 'band saw', 'sierra de cinta', 'bandsaw']],
  ['sciage', 'scie à matériaux', ['scie à matériaux', 'scie de maçon', 'scie à carrelage', 'coupe-carreaux']],
  ['sciage', 'scie à diamant', ['scie à diamant', 'scie diamant', 'sierra de diamante', 'diamond saw']],
  ['sciage', 'scie égoïne', ['scie égoïne', 'scie à main']],
  /* ⚠️ Le terme NU en dernier recours. Il a été oublié au premier jet et
     4 machines de son catalogue sont sorties sans type pour cette seule
     raison — « Scie pour matériaux isolants », « Scie semi-stationnaire »… */
  ['sciage', 'scie', ['scie', 'sierra', 'saw']],

  // ═══ MACHINES — TRAVAIL DU BOIS ═════════════════════════════════════
  ['bois', 'défonceuse', ['défonceuse', 'défonceuse plongeante', 'router', 'fresadora', 'plunge router']],
  ['bois', 'affleureuse', ['affleureuse', 'défonceuse affleureuse', 'trim router', 'fresadora de perfilar', 'palm router']],
  ['bois', 'raboteuse', ['raboteuse', 'raboteuse dégauchisseuse', 'cepilladora', 'thicknesser', 'thickness planer']],
  ['bois', 'dégauchisseuse', ['dégauchisseuse', 'regruesadora', 'jointer', 'planer jointer']],
  ['bois', 'rabot', ['rabot', 'rabot électrique', 'cepillo', 'cepillo eléctrico', 'planer']],
  ['bois', 'ponceuse', ['ponceuse', 'ponceuse orbitale', 'ponceuse excentrique', 'ponceuse vibrante',
    'ponceuse à bande', 'ponceuse delta', 'ponceuse girafe', 'ponceuse multifonction', 'ponceuse de plâtre', 'lijadora', 'sander', 'orbital sander', 'belt sander', 'random orbit sander']],
  ['bois', 'lamelleuse', ['lamelleuse', 'fraiseuse à lamelles', 'biscuit jointer', 'engalletadora']],
  ['bois', 'mortaiseuse', ['mortaiseuse', 'mortaiseuse à chaîne', 'mortajadora', 'chain mortiser']],
  ['bois', 'plaqueuse de chants', ['plaqueuse de chants', 'plaqueuse']],
  ['bois', 'fraiseuse', ['fraiseuse', 'fraiseuse domino', 'fraiseuse pour placo', 'fraiseuse à rainurer']],
  ['bois', 'toupie', ['toupie', 'toupie à bois']],
  ['bois', 'outil multifonctions', ['outil multifonctions', 'outil multifonction', 'multi-cutter',
    'multicutter', 'outil oscillant', 'multitool', 'herramienta multifunción', 'multi tool', 'oscillating tool', 'oscillating multi tool']],

  // ═══ MACHINES — CLOUAGE, AGRAFAGE, RIVETAGE ═════════════════════════
  ['fixation', 'cloueur de charpente', ['cloueur de charpente', 'cloueuse de charpente', 'clavadora de estructuras', 'framing nailer']],
  ['fixation', 'cloueur de finition', ['cloueur de finition', 'cloueuse de finition', 'cloueur à brads', 'clavadora de acabado', 'finish nailer', 'brad nailer']],
  ['fixation', 'cloueur', ['cloueur', 'cloueuse', 'nailer', 'cloueur à gaz', 'clavadora', 'nail gun']],
  ['fixation', 'agrafeuse', ['agrafeuse', 'agrafeur', 'stapler', 'grapadora', 'staple gun']],
  ['fixation', 'riveteuse', ['riveteuse', 'pistolet à riveter', 'remachadora', 'riveter', 'rivet tool', 'rivet gun']],
  ['fixation', 'pistolet à mastic', ['pistolet à mastic', 'pistolet à colle', 'pistolet extrudeur',
    'pistolet à cartouche', 'pistola de silicona', 'caulk gun', 'adhesive gun']],
  ['fixation', 'cercleuse', ['cercleuse', 'appareil de cerclage']],

  // ═══ MACHINES — ASPIRATION ET SOUFFLAGE ═════════════════════════════
  ['aspiration', 'aspirateur', ['aspirateur', 'aspirateur de chantier', 'aspirateur eau et poussière',
    'aspirateur dorsal', 'extracteur de poussière', 'aspirador', 'aspiradora', 'vacuum', 'dust extractor', 'wet dry vacuum']],
  ['aspiration', 'souffleur', ['souffleur', 'souffleur de feuilles', 'aspirateur souffleur', 'soplador', 'blower', 'leaf blower']],
  ['aspiration', 'système d\'aspiration', ['système d\'aspiration', 'système de collecte',
    'collecteur de poussière', 'kit d\'aspiration']],

  // ═══ MACHINES — JARDIN ══════════════════════════════════════════════
  ['jardin', 'tronçonneuse', ['tronçonneuse', 'tronçonneuse à chaîne', 'chainsaw', 'motosierra', 'chain saw']],
  ['jardin', 'élagueuse sur perche', ['élagueuse sur perche', 'perche élagueuse', 'ébrancheur sur perche', 'podadora de altura', 'pole saw', 'pole pruner']],
  ['jardin', 'élagueuse', ['élagueuse']],
  ['jardin', 'sécateur sur perche', ['sécateur sur perche']],
  ['jardin', 'sécateur', ['sécateur', 'sécateur électrique', 'tijera de podar', 'pruner', 'secateur']],
  ['jardin', 'débroussailleuse', ['débroussailleuse', 'coupe-herbe', 'desbrozadora', 'brushcutter', 'brush cutter']],
  ['jardin', 'coupe-bordure', ['coupe-bordure', 'rotofil', 'cortabordes', 'recortadora', 'string trimmer', 'line trimmer', 'grass trimmer']],
  ['jardin', 'taille-haie', ['taille-haie', 'taille haie', 'taille-haies', 'cortasetos', 'hedge trimmer']],
  ['jardin', 'tondeuse', ['tondeuse', 'tondeuse à gazon', 'robot tondeuse', 'cortacésped', 'lawn mower', 'mower']],
  ['jardin', 'scarificateur', ['scarificateur', 'aérateur de pelouse']],
  ['jardin', 'motobineuse', ['motobineuse', 'motoculteur']],
  ['jardin', 'broyeur', ['broyeur', 'broyeur de végétaux']],
  ['jardin', 'pulvérisateur', ['pulvérisateur', 'atomiseur']],

  // ═══ MACHINES — CHANTIER, ÉNERGIE, FLUIDES ══════════════════════════
  ['chantier', 'nettoyeur haute pression', ['nettoyeur haute pression', 'nettoyeur haute-pression',
    'laveur haute pression', 'hidrolimpiadora', 'limpiadora de alta presión', 'pressure washer', 'power washer']],
  ['chantier', 'nettoyeur', ['nettoyeur', 'laveur', 'limpiadora', 'washer']],
  ['chantier', 'compresseur', ['compresseur', 'compresseur d\'air', 'compresor', 'air compressor', 'compressor']],
  ['chantier', 'groupe électrogène', ['groupe électrogène', 'générateur', 'génératrice', 'generador', 'grupo electrógeno', 'generator']],
  ['chantier', 'poste à souder', ['poste à souder', 'poste de soudure', 'soudeuse', 'soldadora', 'welder', 'welding machine']],
  ['chantier', 'vibrateur', ['vibrateur', 'aiguille vibrante', 'vibreur à béton', 'vibrador de hormigón', 'concrete vibrator']],
  ['chantier', 'pompe à graisse', ['pompe à graisse', 'graisseur']],
  ['chantier', 'pompe', ['pompe', 'pompe submersible', 'pompe à eau', 'pompe vide-cave', 'bomba', 'pump', 'submersible pump']],
  ['chantier', 'gonfleur', ['gonfleur', 'compresseur portatif', 'inflador', 'inflator', 'tyre inflator']],
  ['chantier', 'décapeur thermique', ['décapeur thermique', 'pistolet à air chaud', 'décapeur', 'pistola de calor', 'heat gun']],
  ['chantier', 'treuil', ['treuil', 'palan', 'palan électrique']],
  ['chantier', 'ventouse à vide', ['ventouse à vide', 'ventouse à vide d\'air', 'lève-plaque à ventouse', 'ventosa', 'vacuum lifter', 'suction cup lifter']],
  ['chantier', 'borne de recharge', ['borne de recharge', 'borne de charge', 'wallbox',
    'punto de recarga', 'charging station', 'ev charger']],
  ['chantier', 'station d\'alimentation', ['système d\'alimentation', 'station d\'alimentation',
    'station électrique', 'powerstation']],

  // ═══ MACHINES — MESURE, DÉTECTION, ÉCLAIRAGE ════════════════════════
  ['mesure', 'niveau laser', ['niveau laser', 'laser rotatif', 'laser croix', 'laser lignes', 'laser', 'nivel láser', 'laser level', 'rotary laser', 'line laser', 'cross line laser']],
  ['mesure', 'télémètre laser', ['télémètre laser', 'télémètre', 'mesureur de distance', 'medidor láser', 'telémetro láser', 'laser distance measure', 'laser measure']],
  ['mesure', 'détecteur', ['détecteur', 'détecteur de métaux', 'détecteur de matériaux', 'scanner mural', 'detector', 'stud detector', 'wall scanner']],
  ['mesure', 'caméra d\'inspection', ['caméra d\'inspection', 'endoscope']],
  ['mesure', 'caméra thermique', ['caméra thermique', 'thermomètre infrarouge']],
  ['mesure', 'projecteur', ['projecteur', 'projecteur de chantier', 'phare de chantier', 'foco', 'proyector', 'work light', 'area light', 'floodlight']],
  ['mesure', 'lampe', ['lampe', 'lampe torche', 'baladeuse', 'lampe frontale', 'linterna', 'light', 'torch', 'flashlight', 'head torch']],
  ['mesure', 'niveau', ['niveau', 'niveau à bulle', 'règle de maçon']],
  ['mesure', 'système sans fil', ['système sans fil', 'module bluetooth', 'récepteur bluetooth']],

  // ═══ MACHINES — CONFORT DE CHANTIER ═════════════════════════════════
  ['confort', 'radio de chantier', ['radio de chantier', 'radio', 'enceinte bluetooth', 'enceinte', 'radio de obra', 'jobsite radio', 'site radio', 'bluetooth speaker']],
  ['confort', 'glacière', ['glacière', 'glacière réchaud', 'réfrigérateur portable', 'nevera', 'cooler', 'cool box']],
  ['confort', 'ventilateur', ['ventilateur', 'brasseur d\'air', 'ventilador', 'fan', 'jobsite fan']],
  ['confort', 'chauffage', ['chauffage', 'chauffage de chantier', 'canon à air chaud']],
  ['confort', 'bouilloire', ['bouilloire']],
  ['confort', 'four micro-ondes', ['four micro-ondes', 'micro-ondes', 'micro ondes']],
  ['confort', 'cafetière', ['cafetière', 'machine à café']],

  // ═══ MACHINES — COMBOS ══════════════════════════════════════════════
  ['combo', 'pack d\'outils', ['combopack', 'combo pack', 'pack d\'outils', 'pack outils',
    'kit d\'outils', 'ensemble d\'outils', 'lot de machines', 'pack machines',
    'kit de herramientas', 'combo kit', 'tool kit', 'twin pack', 'power tool kit']],

  // ═══ CONSOMMABLES — LAMES ═══════════════════════════════════════════
  ['lame-circulaire', 'lame de scie circulaire', ['lame de scie circulaire', 'lame circulaire',
    'lame de scie stationnaire', 'lame de scie à onglet', 'lame carbure', 'disque de scie', 'hoja de sierra circular', 'circular saw blade']],
  ['lame-alternative', 'lame de scie sabre', ['lame de scie sabre', 'lame de scie récipro', 'lame sabre', 'hoja de sierra sable', 'reciprocating saw blade']],
  ['lame-alternative', 'lame de scie sauteuse', ['lame de scie sauteuse', 'lame sauteuse', 'hoja de sierra de calar', 'jigsaw blade']],
  ['lame-alternative', 'lame de scie à ruban', ['lame de scie à ruban', 'lame de ruban']],
  ['lame-alternative', 'scie-cloche', ['scie-cloche', 'scie cloche', 'trépan cloche', 'holesaw', 'sierra de corona', 'hole saw']],
  ['lame-alternative', 'lame de scie', ['lame de scie', 'lame']],
  ['lame-oscillante', 'lame pour outil multifonctions', ['lame pour multi-cutter', 'lame multi-cutter',
    'lame oscillante', 'lame starlock', 'lame e-cut']],

  // ═══ CONSOMMABLES — FORETS ET MÈCHES ════════════════════════════════
  ['foret', 'foret multi-matériaux', ['foret multi-matériaux', 'mèche multi-matériaux', 'foret universel']],
  ['foret', 'foret béton', ['foret béton', 'foret à béton', 'mèche béton', 'broca para hormigón', 'masonry bit', 'concrete bit']],
  ['foret', 'foret métal', ['foret métal', 'foret à métaux', 'foret acier', 'mèche métal', 'broca para metal', 'metal drill bit', 'hss bit']],
  ['foret', 'foret à bois', ['foret à bois', 'mèche à bois', 'mèche plate', 'mèche hélicoïdale',
    'mèche à trois pointes', 'foret bois', 'broca para madera', 'wood drill bit', 'auger bit']],
  ['foret', 'foret étagé', ['foret étagé', 'foret conique', 'foret à étages']],
  ['foret', 'couronne diamantée', ['couronne diamantée', 'couronne de carottage', 'trépan diamant']],
  ['foret', 'taraud', ['taraud', 'filière']],
  ['foret', 'foret', ['foret', 'mèche', 'trépan', 'drill bit', 'broca']],

  // ═══ CONSOMMABLES — FRAISES ═════════════════════════════════════════
  ['fraise', 'fraise de défonceuse', ['fraise de défonceuse', 'fraise à défoncer', 'fraise droite',
    'fraise à affleurer', 'fraise à moulurer', 'fraise à feuillure', 'fraise à languetter',
    'fraise à abouter', 'fraise multi-profils', 'fraise quart de rond', 'fresa', 'router bit', 'router cutter']],
  ['fraise', 'fraise', ['fraise', 'fraise carbure']],

  // ═══ CONSOMMABLES — DISQUES ═════════════════════════════════════════
  ['disque', 'disque à tronçonner', ['disque à tronçonner', 'disque de tronçonnage', 'disque à couper', 'disco de corte', 'cutting disc', 'cut off wheel']],
  ['disque', 'disque à ébarber', ['disque à ébarber', 'disque de meulage', 'meule à ébarber', 'disco de desbaste', 'grinding disc']],
  ['disque', 'disque à lamelles', ['disque à lamelles', 'disque lamelle', 'flap disc', 'disco de láminas']],
  ['disque', 'disque diamant', ['disque diamant', 'disque diamanté', 'disco de diamante', 'diamond blade', 'diamond disc']],
  ['disque', 'plateau de surfaçage', ['plateau de surfaçage', 'plateau de ponçage', 'plateau support']],
  ['disque', 'brosse métallique', ['brosse métallique', 'brosse coupe', 'brosse circulaire', 'brosse']],
  ['disque', 'disque', ['disque', 'meule']],

  // ═══ CONSOMMABLES — ABRASIFS ════════════════════════════════════════
  ['abrasif', 'disque abrasif', ['disque abrasif', 'disque velcro', 'disque de ponçage',
    'disque auto-agrippant']],
  ['abrasif', 'bande abrasive', ['bande abrasive', 'bande de ponçage']],
  ['abrasif', 'feuille abrasive', ['feuille abrasive', 'papier abrasif', 'papier de verre',
    'triangle abrasif', 'patin abrasif', 'toile abrasive']],
  ['abrasif', 'éponge abrasive', ['éponge abrasive', 'bloc de ponçage', 'cale à poncer']],

  // ═══ CONSOMMABLES — EMBOUTS, DOUILLES, CLÉS ═════════════════════════
  ['vissage-embout', 'embout de vissage', ['embout de vissage', 'embout de tournevis',
    'embout torsion', 'embout impact', 'bit de vissage', 'embout', 'punta de atornillar', 'screwdriver bit', 'driver bit', 'impact bit']],
  ['vissage-embout', 'porte-embout', ['porte-embout', 'porte embout', 'adaptateur d\'embout']],
  ['vissage-embout', 'douille à chocs', ['douille à chocs', 'douille impact', 'douille à choc', 'vaso de impacto', 'impact socket']],
  ['vissage-embout', 'douille', ['douille', 'douille longue', 'douille courte', 'vaso', 'socket']],
  ['vissage-embout', 'clé mixte', ['clé mixte', 'clé plate', 'clé à pipe', 'clé allen', 'clé mâle',
    'jeu de clés']],
  ['vissage-embout', 'rallonge de douille', ['rallonge de douille', 'cardan', 'rallonge']],

  // ═══ CONSOMMABLES — BURINS ══════════════════════════════════════════
  ['burin', 'burin plat', ['burin plat', 'burin large', 'burin bêche']],
  ['burin', 'burin pointu', ['burin pointu', 'pointerolle', 'pointe']],
  ['burin', 'burin', ['burin', 'ciseau à brique']],
  ['burin', 'pelle', ['pelle', 'pelle à béton', 'aiguille de burinage']],

  // ═══ CONSOMMABLES — VISSERIE ET FIXATIONS ═══════════════════════════
  ['visserie', 'vis à bande', ['vis à bande', 'vis en bande', 'vis pour visseuse à bande']],
  ['visserie', 'vis autoperceuse', ['vis autoperceuse', 'vis autoforeuse', 'vis tôle']],
  ['visserie', 'vis à bois', ['vis à bois', 'vis bois', 'vis à tête fraisée', 'vis terrasse']],
  ['visserie', 'vis', ['vis', 'visserie', 'tornillo', 'tornillos', 'screw', 'screws']],
  ['visserie', 'tirefond', ['tirefond', 'tire-fond']],
  ['visserie', 'boulon', ['boulon', 'boulonnerie', 'goujon']],
  ['visserie', 'écrou', ['écrou', 'écrou autobloquant', 'écrou papillon', 'écrou borgne']],
  ['visserie', 'rondelle', ['rondelle', 'rondelle plate', 'rondelle éventail']],
  ['visserie', 'cheville', ['cheville', 'cheville à frapper', 'cheville nylon', 'cheville métallique',
    'cheville chimique', 'cheville à expansion', 'cheville molly', 'taco', 'anchor', 'wall plug']],
  ['visserie', 'clou', ['clou', 'clouterie', 'pointe de charpente', 'brad', 'clavo', 'clavos', 'nail', 'nails']],
  ['visserie', 'agrafe', ['agrafe', 'grapa', 'grapas', 'staple', 'staples']],
  ['visserie', 'rivet', ['rivet', 'rivet aveugle']],
  ['visserie', 'équerre', ['équerre', 'sabot de charpente', 'connecteur métallique']],

  // ═══ CONSOMMABLES — CHAÎNES ET FILS ═════════════════════════════════
  ['chaine', 'chaîne de tronçonneuse', ['chaîne de tronçonneuse', 'chaîne tronçonneuse', 'chaîne de coupe', 'cadena de motosierra', 'saw chain', 'chainsaw chain']],
  ['chaine', 'guide-chaîne', ['guide-chaîne', 'guide chaîne', 'guide de tronçonneuse', 'espada', 'guide bar', 'chainsaw bar']],
  ['chaine', 'fil de débroussailleuse', ['fil de débroussailleuse', 'fil de coupe', 'recharge de fil',
    'bobine avec fil', 'bobine de fil', 'tête fil', 'hilo de corte', 'trimmer line', 'strimmer line']],

  // ═══ CONSOMMABLES — FILTRATION ══════════════════════════════════════
  ['filtration', 'filtre', ['filtre', 'filtre hepa', 'cartouche filtrante', 'filtre à air', 'filtro', 'filter', 'hepa filter']],
  ['filtration', 'sac aspirateur', ['sac aspirateur', 'sac à poussière', 'sac filtre', 'sac de collecte', 'bolsa de aspirador', 'dust bag', 'vacuum bag']],
  ['filtration', 'tuyau d\'aspiration', ['tuyau d\'aspiration', 'flexible d\'aspiration', 'tuyau']],

  // ═══ CONSOMMABLES — ACCESSOIRES ET PIÈCES ═══════════════════════════
  ['accessoire', 'rail de guidage', ['rail de guidage', 'rail de scie', 'guide parallèle', 'rail']],
  ['accessoire', 'serre-joint', ['serre-joint', 'serre joint', 'presse à serrer', 'sergent']],
  ['accessoire', 'trépied', ['trépied', 'pied télescopique', 'mât']],
  ['accessoire', 'piètement', ['piètement', 'support de scie', 'table de sciage']],
  ['accessoire', 'adaptateur', ['adaptateur', 'connexion', 'raccord', 'mandrin', 'renvoi d\'angle']],
  ['accessoire', 'joint d\'étanchéité', ['joint d\'étanchéité', 'kit de joints', 'joint']],
  ['accessoire', 'charbon', ['charbon', 'balai de charbon', 'jeu de charbons']],
  ['accessoire', 'courroie', ['courroie', 'galet', 'roulement']],
  ['accessoire', 'accessoire', ['accessoire', 'pièce de rechange', 'pièce détachée',
    'pièce de vissage', 'pièce', 'extension']],

  // ═══ ÉNERGIE ════════════════════════════════════════════════════════
  ['batterie', 'batterie', ['batterie', 'accu', 'pack batterie', 'batterie li-ion', 'batterie lithium', 'batería', 'baterías', 'battery', 'battery pack', 'akku']],
  ['chargeur', 'chargeur', ['chargeur', 'chargeur rapide', 'chargeur double', 'station de charge',
    'chargeur de voiture', 'cargador', 'charger', 'fast charger', 'dual charger']],
  ['chargeur', 'adaptateur secteur', ['adaptateur secteur', 'convertisseur', 'onduleur']],

  // ═══ RANGEMENT ══════════════════════════════════════════════════════
  ['coffret', 'coffret modulaire', ['t-stak', 'tstak', 'toughsystem', 'tough system', 'makpac',
    'systainer', 'l-boxx', 'module de rangement', 'set organisateur', 'organisateur']],
  ['coffret', 'coffret', ['coffret', 'coffret de transport', 'mallette', 'malette', 'valise',
    'caisse à outils', 'boîte à outils', 'maletín', 'maleta', 'caja de herramientas', 'tool case', 'tool box', 'carry case', 'kit box']],
  ['mobilier', 'servante', ['servante', 'servante d\'atelier', 'carro de taller', 'tool chest', 'roller cabinet']],
  ['mobilier', 'chariot', ['chariot', 'trolley', 'diable', 'carro', 'cart']],
  ['mobilier', 'établi', ['établi', 'table de travail', 'tréteau']],
  ['mobilier', 'armoire à outils', ['armoire à outils', 'armoire', 'casier']],
  ['portage', 'sac à outils', ['sac à outils', 'sac de transport', 'sacoche', 'sac à dos porte-outils', 'bolsa de herramientas', 'tool bag', 'backpack']],
  ['portage', 'ceinture porte-outils', ['ceinture porte-outils', 'porte-outils', 'baudrier porte-outils',
    'sac à clous', 'bretelles']],

  // ═══ EPI — PIEDS ════════════════════════════════════════════════════
  ['chaussure', 'chaussure de sécurité', ['chaussure de sécurité', 'basket de sécurité', 'brodequin',
    'chaussure basse de sécurité', 'chaussure haute de sécurité', 'chaussure montante', 'chaussure', 'calzado de seguridad', 'zapato de seguridad', 'safety shoe', 'safety boot', 'safety trainer']],
  ['chaussure', 'botte de sécurité', ['botte de sécurité', 'botte pvc', 'cuissarde', 'waders', 'botte', 'bota de seguridad', 'wellington', 'rigger boot']],
  ['chaussure', 'sur-chaussure', ['sur-chaussure', 'surchaussure', 'couvre-chaussure']],
  ['chaussure', 'semelle', ['semelle', 'semelle intérieure', 'semelle anti-perforation']],

  // ═══ EPI — VÊTEMENTS ════════════════════════════════════════════════
  ['vetement', 'pantalon de travail', ['pantalon de travail', 'pantalon multipoches',
    'pantalon à genouillères', 'pantalon', 'pantalón de trabajo', 'work trouser', 'work pant', 'holster trouser']],
  ['vetement', 'short de travail', ['short de travail', 'bermuda', 'short']],
  ['vetement', 'salopette', ['salopette', 'cotte à bretelles', 'cotte de travail', 'bleu de travail']],
  ['vetement', 'combinaison', ['combinaison', 'combinaison jetable', 'combinaison de peinture']],
  ['vetement', 'veste de travail', ['veste de travail', 'blouson de travail', 'blouson', 'veste', 'chaqueta de trabajo', 'work jacket', 'jacket']],
  ['vetement', 'parka', ['parka', 'parka de travail', 'doudoune', 'veste hiver']],
  ['vetement', 'softshell', ['softshell', 'veste softshell', 'coupe-vent']],
  ['vetement', 'polaire', ['polaire', 'veste polaire', 'sweat polaire']],
  ['vetement', 'sweat', ['sweat', 'sweat-shirt', 'sweat à capuche', 'hoodie']],
  ['vetement', 'polo', ['polo', 'polo de travail']],
  ['vetement', 't-shirt', ['t-shirt', 'tee-shirt', 'tshirt', 'maillot']],
  ['vetement', 'chemise', ['chemise', 'chemisette']],
  ['vetement', 'gilet haute visibilité', ['gilet haute visibilité', 'gilet de signalisation', 'chasuble']],
  ['vetement', 'gilet', ['gilet', 'gilet multipoches', 'gilet sans manches']],
  ['vetement', 'veste de pluie', ['veste de pluie', 'imperméable', 'ciré', 'poncho']],
  ['vetement', 'tablier', ['tablier', 'tablier de soudeur']],
  ['vetement', 'bonnet', ['bonnet', 'casquette', 'cagoule', 'tour de cou']],
  ['vetement', 'chaussette', ['chaussette', 'chaussettes de travail']],

  // ═══ EPI — MAINS ════════════════════════════════════════════════════
  ['main', 'gant de protection', ['gant de protection', 'gant anti-coupure', 'gant enduit',
    'gant nitrile', 'gant cuir', 'gant anti-vibration', 'gant jetable', 'gant de manutention',
    'gant thermique', 'gant de soudeur', 'gant', 'guante', 'guantes', 'glove', 'gloves', 'work glove']],
  ['main', 'manchette', ['manchette', 'manchette anti-coupure']],

  // ═══ EPI — TÊTE ET VISAGE ═══════════════════════════════════════════
  ['tete', 'casque de chantier', ['casque de chantier', 'casque de protection', 'casque de sécurité', 'casco', 'casco de obra', 'hard hat', 'safety helmet']],
  ['tete', 'casquette anti-heurt', ['casquette anti-heurt', 'casquette de sécurité']],
  ['tete', 'lunettes de protection', ['lunettes de protection', 'lunette de protection',
    'lunettes de sécurité', 'sur-lunettes', 'lunettes-masque', 'lunette', 'gafas de protección', 'gafas de seguridad', 'safety glasses', 'safety goggles']],
  ['tete', 'écran facial', ['écran facial', 'visière de protection', 'écran de protection', 'visière']],
  ['tete', 'masque de soudeur', ['masque de soudeur', 'cagoule de soudage', 'masque de soudage']],

  // ═══ EPI — AUDITIF ══════════════════════════════════════════════════
  ['auditif', 'casque anti-bruit', ['casque anti-bruit', 'casque antibruit', 'coquille anti-bruit',
    'casque de protection auditive', 'protection auditive', 'orejeras', 'ear defender', 'ear muff', 'hearing protection']],
  ['auditif', 'bouchon d\'oreille', ['bouchon d\'oreille', 'bouchon anti-bruit', 'protection auditive jetable']],

  // ═══ EPI — RESPIRATOIRE ═════════════════════════════════════════════
  ['respiratoire', 'masque respiratoire', ['masque respiratoire', 'masque ffp', 'demi-masque',
    'masque à cartouche', 'masque anti-poussière', 'masque jetable', 'masque', 'mascarilla', 'respirator', 'dust mask', 'face mask']],
  ['respiratoire', 'cartouche respiratoire', ['cartouche respiratoire', 'filtre respiratoire']],

  // ═══ EPI — HAUTEUR ══════════════════════════════════════════════════
  ['hauteur', 'harnais antichute', ['harnais antichute', 'harnais de sécurité', 'harnais', 'arnés', 'arnés anticaídas', 'safety harness', 'fall arrest harness']],
  ['hauteur', 'longe antichute', ['longe antichute', 'absorbeur d\'énergie', 'stop-chute', 'antichute', 'longe']],
  ['hauteur', 'ligne de vie', ['ligne de vie', 'point d\'ancrage', 'ancrage']],

  // ═══ EPI — GENOUX ═══════════════════════════════════════════════════
  ['genou', 'genouillère', ['genouillère', 'coussin de genoux', 'protège-genoux', 'rodillera', 'knee pad', 'knee pads']]
];

/* ══ TABLES DE DÉCODAGE ═══════════════════════════════════════════════════
   Ce qui suit ne sert pas à TYPER un article, mais à COMPRENDRE ce que son
   titre annonce. Toutes vérifiées le 03/08/2026, sources en tête de fichier. */

/* ── SUFFIXES DE RÉFÉRENCE DeWALT ────────────────────────────────────────
   Source : support.dewalt.com, croisée avec la règle déjà gravée par l'user
   le 02/08 (D-74), qu'elle confirme.
   ⛔ CE QUE ÇA VAUT EN ARGENT : le suffixe dit EXACTEMENT ce qu'il y a dans
   la boîte. DCD805N et DCD805P2 sont la MÊME machine — l'une nue, l'autre
   avec deux batteries 5,0 Ah. Écrire le prix de la seconde sur la première
   ferait perdre le prix de deux batteries à chaque vente. */

/* ══ LETTRES DE BATTERIE DeWALT — TABLE COMPLÈTE ════════════════════════════
   ⛔ DEMANDE DE L'USER, 04/08/2026 : « est-ce que la connaissance des
   références avec batterie et chargeur sont connues ? sinon cherche sur le
   Web et intègre-les — il faut absolument connaître TOUTES les références de
   pack avec batterie qui existent. »

   SOURCES, cherchées le 04/08/2026 et concordantes sur les capacités :
     · toolguyd.com/dewalt-model-numbers-explained
     · slicehardware.com — Understanding DEWALT Model Numbers
     · housedigest.com — What Your DeWalt Tool's Model Number Really Means
   Recoupées avec la capture d'écran de l'user (32 kits DCK…), qui confirme
   E = POWERSTACK compacte 1,7 Ah et H = POWERSTACK 5,0 Ah.

   ⛔⛔ CE QUE ÇA VAUT EN ARGENT. La lettre dit combien d'ampères-heures il y a
   dans la boîte, et le chiffre COMBIEN de batteries. Confondre `P2` (2×5,0 Ah)
   avec `D1` (1×2,0 Ah), c'est offrir trois batteries à chaque vente.

   ⚠️ AMBIGUÏTÉ RÉELLE DU « T », et elle est piégeuse : `T2` est une batterie
   FLEXVOLT 6 Ah, mais un `T` FINAL sans chiffre est le coffret TSTAK. C'est le
   CHIFFRE qui tranche — jamais la lettre seule. */
var BATTERIES_DEWALT = {
  C: { ah: 1.5, gamme: 'XR' },
  D: { ah: 2.0, gamme: 'XR' },
  F: { ah: 2.0, gamme: 'XR' },
  E: { ah: 1.7, gamme: 'POWERSTACK' },
  G: { ah: 3.0, gamme: 'XR' },
  L: { ah: 3.0, gamme: 'XR' },
  M: { ah: 4.0, gamme: 'XR' },
  Q: { ah: 4.0, gamme: 'XR' },
  H: { ah: 5.0, gamme: 'POWERSTACK' },
  P: { ah: 5.0, gamme: 'XR' },
  R: { ah: 6.0, gamme: 'XR' },
  T: { ah: 6.0, gamme: 'FLEXVOLT' },
  W: { ah: 8.0, gamme: 'XR' },
  X: { ah: 9.0, gamme: 'FLEXVOLT' },
  U: { ah: 10.0, gamme: 'XR' },
  Y: { ah: 12.0, gamme: 'FLEXVOLT' },
  Z: { ah: 15.0, gamme: 'FLEXVOLT' }
};

/* Lettres SANS chiffre : elles ne comptent aucune batterie. */
var MARQUEURS_DEWALT = {
  N: { nu: true,  note: 'machine nue, sans batterie ni chargeur' },
  T: { coffret: 'TSTAK', note: 'livré en coffret TSTAK (T FINAL, sans chiffre)' },
  M: { editionLimitee: true, note: 'édition limitée McLaren — vu sur DCK2223MP2T et DCK200MP2T' },
  G: { note: 'faisceau VERT sur un laser (DCE079D1G) — ailleurs, sens non établi' },
  /* ⛔ « R » = FAISCEAU ROUGE, symétrique exact du « G » ci-dessus. SOURCÉ le
     16/08/2026 (recherche Web, enfin possible) : la fiche du DCE079D1R
     s'intitule « Laser rotatif faisceau ROUGE », celle du DCE079D1G « faisceau
     vert ». Même famille, même position, sens opposé.
     ⚠️ Aucune affirmation sur le CONTENU de la boîte : une couleur de faisceau
     n'est ni une batterie ni un coffret. On l'inscrit pour qu'elle cesse d'être
     « inconnue » — une lettre inconnue laisse la garde aveugle. */
  R: { note: 'faisceau ROUGE sur un laser (DCE079D1R, symétrique de G) — '
    + 'ailleurs sens non établi ; ne dit RIEN du contenu de la boîte' },
  /* ⛔ « L » = CLASSE DE POUSSIÈRE L sur un aspirateur. SOURCÉ le 16/08/2026 :
     la page officielle du DWV901L-QS s'intitule « Aspirateur eau et poussières
     30L - **Classe L** », et le DCV584L est vendu partout comme « Classe L ».
     ⚠️ C'est une NORME, pas un conditionnement — elle ne dit rien de ce qu'il y
     a dans la boîte, et c'est justement pour ça qu'elle doit être connue :
     sinon la lettre tombe dans `inconnus` et la fiche paraît illisible. */
  L: { note: 'classe de poussière L (aspirateurs DWV901L, DCV584L) — une NORME, '
    + 'pas un conditionnement ; ne dit RIEN du contenu de la boîte' },
  /* ⛔⛔ « K » = COFFRET — MESURÉ SUR LE CATALOGUE, PAS SOURCÉ CHEZ LE
     FABRICANT, ET C'EST DIT (16/08/2026).
     ⚠️ Ma session ne joint AUCUN site externe (`dewalt.fr`, `dewalt.co.uk`,
     `wikipedia` → curl 000, mesuré) : la nomenclature officielle est hors de
     portée, et je ne l'invente pas. Méthode employée : celle de l'autre marque
     — on COMPTE sur nos propres fiches.
     ⛔ CE QUI EST MESURÉ, exactement : 30 fiches MACHINE portent un « K » que
     la table ne lisait pas ; **4 de leurs titres écrivent explicitement
     « (coffret) »**, et **AUCUN ne dit le contraire** — les 26 autres se
     taisent. Les quatre explicites sont des outils FILAIRES (710 W, 800 W,
     600 W) : aucune batterie en jeu, donc aucune ambiguïté sur ce que le K
     décrit. Quatre confirmations, zéro contradiction : mince pour affirmer,
     assez pour DISTINGUER.
     ⛔ POURQUOI ON L'AJOUTE QUAND MÊME — LE SENS DE L'ERREUR, ET IL EST
     INVERSE DE M-28. Sans lui, `D25033K` et `D25033` rendaient la MÊME
     signature « NU » : coffret et machine nue étaient interchangeables pour
     l'appariement, et la garde titre↔fiche ne voyait aucune contradiction.
     Avec lui, les deux se DISTINGUENT ; si le K voulait dire autre chose,
     l'effet serait un REFUS de trop — jamais un prix de coffret écrit sur une
     fiche nue. On choisit l'erreur qui ne coûte pas d'argent.
     ⚠️ Coffret rendu GÉNÉRIQUE, jamais « TSTAK » : les titres ne disent pas
     quelle boîte, et nommer la marque de la boîte serait exactement
     l'invention que ces lignes évitent. */
  K: { coffret: 'COFFRET', note: 'coffret — mesuré sur 30 fiches machine du '
    + 'catalogue : 4 titres disent « (coffret) », 0 dit le contraire. NON '
    + 'sourcé chez le fabricant (aucun site joignable) ; sens de l\'erreur '
    + 'choisi : distinguer plutôt que confondre.' }
};

/* ⛔⛔ UN LECTEUR, PAS UNE LISTE. Les références combinent les codes :
   `P1D1` = une 5,0 Ah ET une 2,0 Ah, `MP2T` = McLaren + 2×5,0 Ah + TSTAK,
   `E2T` = 2×1,7 Ah POWERSTACK + TSTAK. Une table figée n'aurait jamais
   couvert ces assemblages ; on LIT la suite de codes.
   ⚠️ Ce qui n'est pas reconnu est RENDU dans `inconnus` — jamais deviné, et
   jamais avalé en silence : c'est ce qui permettra d'agrandir la table sur
   des faits plutôt que sur des suppositions. */
function lireSuffixeDewalt(sku) {
  var s = String(sku || '').trim().toUpperCase();
  var res = { nbBatteries: 0, batteries: [], ah: null, coffret: null,
    nu: false, editionLimitee: false, inconnus: [], suffixe: '' };
  if (!s) return res;
  /* La région se retire d'abord — elle ne dit rien du contenu de la boîte. */
  var sansRegion = s.replace(/-[A-Z0-9]{1,3}$/, '');
  var m = sansRegion.match(/^[A-Z]+\d+(?:-\d+)*/);
  if (!m) return res;
  var reste = sansRegion.slice(m[0].length);
  res.suffixe = reste;
  /* ⛔⛔ « B » SEUL = MACHINE NUE (bare tool). SOURCÉ le 16/08/2026 : le site du
     fabricant intitule le DCE100B « Cordless Compact Jobsite Blower (**Tool
     Only**) » et le DCS353B « Bare Tool Only » — c'est la nomenclature de sa
     gamme nord-américaine (20V MAX), présente dans notre catalogue à côté de
     l'européenne (XR 18V).
     ⛔ ET C'EST UN CAS DE SUFFIXE ENTIER, JAMAIS UNE LETTRE DU LECTEUR. Mis
     dans la table des marqueurs, ce « B » ferait de `DFS9150B1G` — une boîte
     d'AGRAFES — une « machine nue » : exactement la faute payée le 07/08/2026
     quand un FORET ressortait `nu: true`. Le drapeau part sur les fiches
     produit ; l'écrire sur un consommable est une bêtise visible par le client.
     ⇒ On ne l'accepte donc que si le suffixe vaut EXACTEMENT « B », ce qui est
     la forme des deux références sourcées. Ailleurs, le « B » reste inconnu et
     le dit. */
  /* ⛔⛔ UN SÉPARATEUR ORPHELIN EN FIN DE SUFFIXE FAISAIT RENAÎTRE UNE BATTERIE
     FANTÔME. Mesuré le 16/08/2026, et c'est la garde d'argent elle-même qui le
     provoquait : `titreContreditFiche` retire le marquage régional avec
     `.replace(/(XJ|QW|XE|GB|LX|QS)$/,'')` — sur `DCE089NG18-XJ`, ça laisse
     `DCE089NG18-`. Le tiret survivant empêche la règle de tension de
     reconnaître « 18 » en FIN de suffixe : le lecteur retombe sur « G » + « 1 »
     et rend **1 batterie de 3 Ah** là où la source dit « Bare Unit ».
     ⇒ Effet mesuré : la fiche cessait d'être « sans batterie » aux yeux de la
     garde, qui laissait donc PASSER une tuile de kit sur une machine NUE.
     ⛔ On nettoie ICI, dans le lecteur, jamais chez l'appelant : le même
     découpage existe à plusieurs endroits, et corriger un seul appelant
     laisserait les autres exposés. Un lecteur robuste vaut mieux que trois
     appelants disciplinés. */
  reste = reste.replace(/[\s\-_.]+$/, '');
  res.suffixe = reste;
  if (reste === 'B') {
    res.nu = true;
    return res;
  }
  var i = 0;
  while (i < reste.length) {
    var lettre = reste[i];
    var chiffre = reste[i + 1];
    /* ⛔⛔ UNE TENSION EN FIN DE SUFFIXE N'EST PAS UN CODE DE BATTERIE — ET
       CELLE-CI FAISAIT NAÎTRE UNE BATTERIE QUI N'EXISTE PAS.
       Mesuré le 16/08/2026 : `DCE089NG18` ressortait « 1 batterie de 3 Ah »
       parce que le lecteur voyait « G » suivi de « 1 » et lisait un code de
       batterie XR 3 Ah. Or la SOURCE dit l'inverse — « DCE089 NG18 3 x 360°
       Green MultiLine Laser 12/18V **Bare Unit** », « sans batterie ni
       chargeur », « Machine seule ». Le suffixe se lit N (nue) + G (vert) +
       **18 (la tension)**.
       ⛔ Sens de l'erreur : une batterie inventée sur une machine NUE fait
       accepter un prix de kit sur une fiche nue — coût trop haut, donc prix
       trop haut (J4) — et fait refuser la vraie tuile nue. Les deux à la fois.
       ⚠️ Le test porte sur TOUT ce qui reste après la lettre, et la liste des
       tensions est FERMÉE : « P2 » reste deux batteries de 5 Ah, « G1 » suivi
       d'autre chose reste un code de batterie. */
    if (/^(12|18|54|108)$/.test(reste.slice(i + 1))) {
      if (MARQUEURS_DEWALT[lettre]) {
        var mkv = MARQUEURS_DEWALT[lettre];
        if (mkv.nu) res.nu = true;
        if (mkv.coffret) res.coffret = mkv.coffret;
        if (mkv.editionLimitee) res.editionLimitee = true;
      } else {
        res.inconnus.push(lettre);
      }
      res.voltage = parseInt(reste.slice(i + 1), 10);
      i = reste.length;
      continue;
    }
    if (chiffre >= '0' && chiffre <= '9' && BATTERIES_DEWALT[lettre]) {
      var n = parseInt(chiffre, 10);
      res.batteries.push({ nb: n, ah: BATTERIES_DEWALT[lettre].ah,
        gamme: BATTERIES_DEWALT[lettre].gamme });
      res.nbBatteries += n;
      i += 2;
      continue;
    }
    if (MARQUEURS_DEWALT[lettre]) {
      var mk = MARQUEURS_DEWALT[lettre];
      if (mk.nu) res.nu = true;
      if (mk.coffret) res.coffret = mk.coffret;
      if (mk.editionLimitee) res.editionLimitee = true;
      i += 1;
      continue;
    }
    /* ⛔⛔ UN VOLTAGE EN FIN DE SUFFIXE N'EST PAS UN NOMBRE DE BATTERIES.
       SOURCÉ le 16/08/2026 : « DCE089**NG18**-XJ — DCE089 NG18 3 x 360° Green
       MultiLine Laser **12/18V** Bare Unit », et partout ailleurs « sans
       batterie ni chargeur » / « Machine seule ». Le suffixe se lit donc
       N (nue) + G (vert) + **18 = la tension**, pas un contenu de boîte.
       ⛔ SANS CETTE LIGNE, le « 8 » tombait dans `inconnus` et quatre lasers
       paraissaient illisibles alors que leur référence dit tout : machine nue.
       ⚠️ Liste FERMÉE aux tensions réelles de la gamme (12, 18, 54, 108) et
       seulement en FIN de suffixe : « 18 » ailleurs pourrait compter autre
       chose, et deviner coûterait un contenu de boîte inventé. */
    if (/^(12|18|54|108)$/.test(reste.slice(i))) {
      res.voltage = parseInt(reste.slice(i), 10);
      i = reste.length;
      continue;
    }
    res.inconnus.push(lettre);
    i += 1;
  }
  /* Une seule capacité dans la boîte : on la remonte, c'est la plus utile. */
  if (res.batteries.length === 1) res.ah = res.batteries[0].ah;
  /* ⛔ UN SUFFIXE VIDE NE DIT RIEN — ET SURTOUT PAS « NUE ».
     Défaut mesuré le 07/08/2026 : `lireSuffixeDewalt('DT1473-QZ')` rendait
     `nu: true` avec un suffixe VIDE, à cause d'une ligne qui disait « aucune
     batterie et aucun suffixe ⇒ c'est une machine nue ». Or DT1473-QZ est un
     FORET : « machine nue, sans batterie ni chargeur » n'a aucun sens pour un
     consommable. Et sur une machine dont la référence n'encode pas sa
     configuration, c'est une affirmation sans source.
     ⚠️ Ça compte parce que ce drapeau part sur les FICHES PRODUITS : l'écrire
     sur un foret est une bêtise visible par le client, et sur une machine
     livrée en coffret, une promesse fausse. C'était une DÉDUCTION déguisée en
     lecture. `nu` ne vaut désormais true que si le marqueur N est ÉCRIT ;
     sinon il reste false, et l'absence se lit « la référence n'en dit rien ».
     ⚠️ Le chemin du PRIX n'est pas concerné : `signatureDepuisReference` ne
     lit que `nbBatteries`, jamais ce drapeau (vérifié par grep avant de
     toucher). */
  return res;
}

var SUFFIXES_DEWALT = {
  N:  { nbBatteries: 0, note: 'machine NUE, sans batterie ni chargeur' },
  NT: { nbBatteries: 0, coffret: 'TSTAK', note: 'machine nue livrée en coffret TSTAK' },
  C1: { nbBatteries: 1, ah: 1.5 }, C2: { nbBatteries: 2, ah: 1.5 },
  D1: { nbBatteries: 1, ah: 2.0 }, D2: { nbBatteries: 2, ah: 2.0 },
  E1: { nbBatteries: 1, ah: 1.7 }, E2: { nbBatteries: 2, ah: 1.7 },
  L1: { nbBatteries: 1, ah: 3.0 }, L2: { nbBatteries: 2, ah: 3.0 },
  M1: { nbBatteries: 1, ah: 4.0 }, M2: { nbBatteries: 2, ah: 4.0 },
  P1: { nbBatteries: 1, ah: 5.0 }, P2: { nbBatteries: 2, ah: 5.0 },
  H1: { nbBatteries: 1, ah: 5.0 }, H2: { nbBatteries: 2, ah: 5.0 },
  T1: { nbBatteries: 1, ah: 6.0 }, T2: { nbBatteries: 2, ah: 6.0 },
  X1: { nbBatteries: 1, ah: 9.0 }, X2: { nbBatteries: 2, ah: 9.0 },
  Y1: { nbBatteries: 1, ah: 12.0 }, Y2: { nbBatteries: 2, ah: 12.0 }
};
/* ── SUFFIXES DE RÉFÉRENCE MAKITA ───────────────────────────────────────
   ⛔⛔ MESURÉE SUR SES 611 FICHES, JAMAIS DE MÉMOIRE (09/08/2026). Chaque
   entrée vient d'un comptage sur le catalogue réel : le suffixe, le nombre de
   fiches qui le portent, et ce que leurs titres annoncent. Une table de
   suffixes citée de mémoire serait une invention — et celle-ci décide de
   l'argent.

   ⛔ POURQUOI ELLE VAUT DE L'ARGENT. Le comparateur écrit souvent la référence
   NUE (« MAKITA DHS680 ») là où la fiche porte son conditionnement
   (« DHS680Z » = machine seule, « DHS680RTJ » = 2 batteries 5 Ah + coffret).
   Mesuré sur son balayage : la racine `DHS680` désigne **cinq** fiches
   différentes du catalogue. Écrire le prix de la version nue sur celle du kit
   — ou l'inverse — c'est un coût faux, donc un prix faux.
   Cas mesuré : `DUC256PT2` est vendue 754,13 € et le comparateur montre
   `DUC256` à 352,18 €. Rapprocher les deux ferait vendre à perte.

   ⚠️ CE QUE CETTE TABLE PERMET, ET RIEN DE PLUS : vérifier qu'une annonce et
   une fiche décrivent la MÊME configuration. Elle n'autorise jamais à deviner
   un conditionnement que l'annonce n'énonce pas.

   Relevé (suffixe · fiches · batteries dominantes · Ah · part avec coffret) :
     Z 115·0  ZJ 60·0/95%  ZK 7·0/71%  GZ 15·0  GZ01 7·0  DZ 7·0  DZJ 4·0/100%
     RTJ 59·2×5,0/61%  RFJ 43·2×3,0/74%  RGJ 7·2×6,0/86%  RT 7·1×5,0
     PT2 6·2×5,0  TJ 6·2×5,0  RFE 5·2×3,0  RTE 4·2×5,0                       */
var SUFFIXES_MAKITA = {
  Z:    { nbBatteries: 0, note: 'machine seule' },
  ZJ:   { nbBatteries: 0, coffret: 'MAKPAC', note: 'machine seule en coffret' },
  ZK:   { nbBatteries: 0, coffret: 'MAKPAC', note: 'machine seule en coffret' },
  DZ:   { nbBatteries: 0, note: 'machine seule (gamme 10,8/12 V)' },
  DZJ:  { nbBatteries: 0, coffret: 'MAKPAC', note: 'machine seule en coffret (10,8/12 V)' },
  GZ:   { nbBatteries: 0, note: 'machine seule (gamme 40 V)' },
  GZ01: { nbBatteries: 0, note: 'machine seule (gamme 40 V)' },
  RT:   { nbBatteries: 1, ah: 5.0 },
  RTJ:  { nbBatteries: 2, ah: 5.0, coffret: 'MAKPAC' },
  RTE:  { nbBatteries: 2, ah: 5.0, coffret: 'MALLETTE' },
  PT2:  { nbBatteries: 2, ah: 5.0 },
  TJ:   { nbBatteries: 2, ah: 5.0, coffret: 'MAKPAC' },
  RFJ:  { nbBatteries: 2, ah: 3.0, coffret: 'MAKPAC' },
  RFE:  { nbBatteries: 2, ah: 3.0, coffret: 'MALLETTE' },
  RGJ:  { nbBatteries: 2, ah: 6.0, coffret: 'MAKPAC' },
  /* ── Longue traîne : 1 à 2 fiches chacun, et TOUS mesurés sur le titre de
     ces fiches-là (batteries et Ah lus, jamais supposés). Les suffixes dont
     le titre ne dit RIEN de leur contenu ne figurent pas ici : les ajouter
     « au jugé » ferait exactement le défaut que cette table empêche. */
  PT2J:  { nbBatteries: 2, ah: 5.0, coffret: 'MAKPAC' },
  RTJX2: { nbBatteries: 2, ah: 5.0, coffret: 'MAKPAC' },
  T2X1:  { nbBatteries: 2, ah: 5.0 },
  PG2J:  { nbBatteries: 2, ah: 6.0, coffret: 'MAKPAC' },
  RF2:   { nbBatteries: 2, ah: 3.0 },
  SFE:   { nbBatteries: 2, ah: 3.0, coffret: 'MAKPAC' },
  RF3J:  { nbBatteries: 3, ah: 3.0, coffret: 'MAKPAC' },
  RT1J:  { nbBatteries: 1, ah: 5.0, coffret: 'MAKPAC' },
  SF:    { nbBatteries: 1, ah: 3.0 },
  Y1J:   { nbBatteries: 1, ah: 1.5, coffret: 'MAKPAC' },
  DSAW:  { nbBatteries: 1, ah: 2.0 },
  ZJX2:  { nbBatteries: 0 },
  ZKU1:  { nbBatteries: 0, coffret: 'MAKPAC' },
  SZ:    { nbBatteries: 0 }
};

/* Rend { racine, suffixe, config } ou null. `config` est l'entrée de la table
   ci-dessus — absente quand le suffixe n'y figure pas : on ne DEVINE pas un
   conditionnement, on dit qu'on ne le connaît pas. */
/* ══ LA GRAMMAIRE DES SUFFIXES MAKITA — DÉCOMPOSABLE, PAS UNE LISTE ═════════
   ⛔⛔ CE QUI MANQUAIT, ET L'USER L'A DIT : la table du 09/08 comptait 29
   entrées apprises sur SES fiches. Une liste finie ne couvre jamais un
   catalogue vivant — il faut la GRAMMAIRE. Elle existe, et elle se lit :
   un suffixe Makita s'écrit **[chargeur][batterie][coffret]**.

   ⚠️ TROIS SOURCES CONCORDANTES, comme pour l'autre marque :
     ① toolbrothers (FR et AT) — codes de chargeur, codes de batterie, « J = Makpac » ;
     ② acmetools / superarbor / encyclopedia.tools — « Z = outil nu », T = 2×5,0,
        F = 2×3,0, G = 2×6,0, et le « 1 » qui fait passer à UNE batterie ;
     ③ SES 611 FICHES, qui écrivent le contenu dans leur titre — le seul juge
        qui ne se discute pas. Mesuré : **323 concordances sur 336 titres
        testables, soit 96,1 %**, et **426 suffixes décomposés sur 488 (87,3 %)**.

   ⛔ CE QUE LES SOURCES EN LIGNE N'ONT PAS DIT, ET QUE SES FICHES ONT APPRIS :
     · un CHIFFRE collé après la lettre de batterie donne le NOMBRE réel —
       `PT4J` = 4 batteries, `RF3J` = 3, `RTJ3` = 3 ;
     · un `Z` FINAL vaut aussi « outil nu » (`SZ`) ;
     · `RT` seul vaut **1×5,0** chez lui alors que la grammaire donnerait 2 —
       exception mesurée sur trois fiches, gardée telle quelle.
   ⛔ La table explicite reste PRIORITAIRE sur la grammaire : une valeur
   mesurée bat toujours une valeur déduite.
   ⚠️ Ce qui reste INCONNU est rendu `null` — jamais deviné : les inventer, ce
   serait écrire un coût de kit sur un outil nu, donc un prix de vente faux.

   ══ CE QUE LA RECHERCHE DU 10/08/2026 A AJOUTÉ (ordre de l'user : « tu dois
   connaître le référencement Makita à 100 % ») ═══════════════════════════════
   Quatre lettres qui restaient dehors sont rentrées, chacune avec DEUX
   sources au moins, et une cinquième a été démontrée FAUSSE :

   · `E` FINAL = LE COFFRET, pas une batterie. Une première source (recherche
     « Makita E suffix ») annonçait « E = Extra, deux batteries ». Le
     recoupement l'a TUÉE : toolbrothers.de écrit « RFE = 2x 3,0Ah Akku,
     Ladegerät DC18RC, Systemkoffer » — or le `F` porte DÉJÀ les deux
     batteries, donc le `E` ne peut pas les porter aussi ; et la fiche
     marchande de `DHP490WVE` liste « 1 coffret plastique ». `E` occupe donc
     la MÊME case que `J` : le contenant. C'est exactement l'erreur qu'un
     recoupement doit attraper — une source seule l'aurait fait entrer.
   · `X` + CHIFFRE = LOT D'ACCESSOIRES, jamais des batteries. Prouvé par SA
     fiche `TM30DSMJX5` : « Outil multifonctions 10,8V (2x 4,0 Ah) +
     accessoires en coffret » — le `SMJ` dit déjà tout le contenu énergétique,
     le `X5` ne peut désigner que les accessoires.
   · `W` = livré AVEC batterie et chargeur (ancienne écriture Makita : le
     manuel officiel couvre « model 6221D » ET « model 6221DW »). On en tire
     `avecEnergie`, JAMAIS un nombre : `DF001DW` est vendu avec UNE batterie,
     `DHP490WVE` avec DEUX. Compter serait inventer.
   · `WVE` en entier = 2×2,0 Ah + chargeur + coffret plastique — mesuré sur
     les pages marchandes de `DHP490WVE` (idealo.fr, guedo-outillage.fr,
     sanitino.fr, cotebrico.fr : « 2 batteries 2,0 Ah Li-Ion, chargeur »).
     Entrée d'exception, parce que le `V` seul reste inexpliqué.
   ⛔ CE QUI RESTE DEHORS, ET POURQUOI : `C` (contrôle électronique — une
   CARACTÉRISTIQUE de la machine, jamais un conditionnement), `G` final
   (gamme 40 V XGT), `L`, `S`, `N`, `B`, `F`, `R`, `P` seuls sur une machine
   filaire (ce sont des variantes de MODÈLE, pas des codes d'ensemble). Ces
   lettres-là ne doivent RIEN produire : c'est la garde d'argent ci-dessous. */
var MAKITA_CHARGEUR = { R: 'DC18RC', P: 'DC18RD', S: 'DC10SA', N: 'DC18RE' };
var MAKITA_BATTERIE = {
  H1: [1, 1.3], H: [2, 1.3], Y1: [1, 1.5], Y: [2, 1.5],
  A1: [1, 2], A: [2, 2], F1: [1, 3], F: [2, 3],
  M1: [1, 4], M: [2, 4], T1: [1, 5], T: [2, 5], G1: [1, 6], G: [2, 6]
};
/* Exceptions MESURÉES sur ses fiches — elles priment sur la grammaire. */
/* ⚠️ `RT` et `RF` NUS valent UNE batterie chez lui, là où la grammaire en
   donnerait deux — mesuré sur six de ses fiches (`DJR187RT`, `DLM330RT`,
   `DJR186RT`, `DUS054RF`, `DCL184RF`, `DUB186RFX1`). Leurs formes en coffret
   (`RTJ`, `RFJ`) valent bien DEUX : c'est le J qui marque l'ensemble complet. */
/* ⚠️ `WVE` : le `V` seul n'est expliqué par aucune source. On n'invente pas de
   règle pour lui — on inscrit le contenu MESURÉ du seul suffixe où il paraît. */
var MAKITA_EXCEPTIONS = {
  RT: { nbBatteries: 1, ah: 5 },
  RF: { nbBatteries: 1, ah: 3 },
  WVE: { nbBatteries: 2, ah: 2, coffret: 'MALLETTE' }
};

/* ⛔⛔ `estSansFil` — LA GARDE QUI A ARRÊTÉ SEPT FAUX PRIX. Mesuré le
   10/08/2026 sur ses 611 fiches : `HR2811FT` (perforateur FILAIRE 800 W),
   `HR2670FT`, `HR1841FJ`, `JR3051TK`, `VC4210MX`, `RP2302FC07`, `RP2303FC07`
   sortaient tous « 2 batteries » — parce qu'une lettre de batterie suivie
   d'un coffret suffisait à conclure. Sur une machine filaire, ce `F` et ce
   `T` appartiennent au NOM DU MODÈLE. Lire un kit là où il n'y a qu'une
   machine, c'est écrire un coût de kit dans un prix de vente.
   ⚠️ Toutes les lectures JUSTES de cette forme sans chargeur — `DLX2145TJ`,
   `DCE090T2X1`, `DLM480CT2`, `DBO180Y1J`, `DFS452TJX2` — sont sur des
   références SANS FIL, qui s'écrivent toutes `D` + lettre. La coupure est
   nette dans SA donnée : 17 justes sans fil, 7 fausses filaires. */
function decomposerSuffixeMakita(suffixe, estSansFil) {
  var s = String(suffixe || '').toUpperCase();
  if (!s) return null;
  if (Object.prototype.hasOwnProperty.call(MAKITA_EXCEPTIONS, s)) {
    var ex = MAKITA_EXCEPTIONS[s];
    var cfgEx = { nbBatteries: ex.nbBatteries, ah: ex.ah };
    if (ex.coffret) cfgEx.coffret = ex.coffret;
    return cfgEx;
  }
  /* ══ LA GAMME 40 V XGT EST UNE AUTRE GRAMMAIRE ═════════════════════════════
     ⛔ Elle me manquait, et c'est elle qui bloquait `DK0124G201`. Là où la
     gamme 18 V écrit [chargeur][batterie][coffret], la gamme 40 V écrit
     `G` (la GAMME) puis la capacité puis un code de conditionnement à trois
     chiffres. Recoupé sur la fiche officielle de la marque en Malaisie
     (`GA013GM201 / GD201 / GZ`) et chez un revendeur de Singapour pour
     `TW001G` : **`GM201` = 2 × 4,0 Ah + chargeur rapide · `GD201` = 2 × 2,5 Ah
     + chargeur rapide · `GZ` = outil nu**. Le premier des trois chiffres est
     le NOMBRE de batteries.
     ⚠️ Vérifié sur sa fiche `DK0124G201` : huit revendeurs (klium.com,
     jardiland.fr, cotebrico.fr, maxoutil.com, bati-avenue.com, toolnation.com,
     comptoirdespros.com, magasin-ek.com) annoncent tous **2 batteries 4,0 Ah
     + chargeur** — et le code dit bien « 2 ». La capacité, elle, n'est PAS
     dans ce code-là : on ne l'invente pas. */
  var mXGT = s.match(/^G([DM]?)([1-9])01$/);
  if (mXGT) {
    var cfgXGT = { nbBatteries: parseInt(mXGT[2], 10) };
    if (mXGT[1] === 'D') cfgXGT.ah = 2.5;
    else if (mXGT[1] === 'M') cfgXGT.ah = 4;
    return cfgXGT;
  }
  /* ⛔ L'EXCEPTION NE SE PROPAGE PAS AU-DELÀ DE SA FORME EXACTE — ET LE
     RECOUPEMENT A PROUVÉ QUE LE CODE LUI-MÊME EST AMBIGU, pas ma lecture :
     `DUB186RFX1` = **1 batterie** de 3,0 Ah (idealo.fr, racetools.fr,
     gammvert.fr, gpasplus.com) et `DHP482RFX9` = **2 batteries** de 3,0 Ah
     (cotebrico.fr, castorama.fr, amazon.fr, manomano.fr, kamody.fr,
     walmart.com). Même `RF`, deux contenus : la marque n'est pas cohérente
     avec elle-même, et AUCUNE règle ne peut satisfaire les deux.
     On garde donc la grammaire (deux) dès qu'un lot est accroché, parce que
     le SENS DE L'ERREUR n'est pas neutre : surestimer le contenu fait entrer
     un coût trop HAUT — on vend trop cher, on ne vend pas à perte.
     Sous-estimer ferait l'inverse. Entre deux inconnues, on prend celle qui
     ne ruine pas. Et le filet reste posé en aval : l'appariement compare ce
     que l'ANNONCE énonce, donc un écart produit un REFUS de rapprochement,
     jamais un prix faux. */
  var lot = false;
  var mxt = s.match(/X(\d{0,2})$/);
  if (mxt && s.length > mxt[0].length) { lot = true; s = s.slice(0, -mxt[0].length); }
  var nb = null, ah = null, coffret = null, accessoires = lot, avecEnergie = false;
  /* `W` = « livré avec batterie et chargeur », écriture historique de la marque
     (le manuel officiel couvre « model 6221D » ET « model 6221DW »). Il dit
     QU'IL Y EN A ; il ne dit JAMAIS combien — `DF001DW` en a une, `DHP490WVE`
     en a deux. On pose donc un drapeau, jamais un nombre. */
  if (/^W/.test(s)) { avecEnergie = true; s = s.slice(1); }
  /* `Z` VEUT DIRE « OUTIL NU », OÙ QU'IL SOIT — c'est la seule lettre du
     système dont toutes les sources disent la même chose. L'ancienne écriture
     refusait de lire le `Z` final dès que le suffixe faisait deux signes, et
     `DVC750LZ` — dont SA fiche dit « (Produit seul) » — sortait « inconnu ».
     Le `L` y nomme la classe de filtration, pas un conditionnement. */
  if (/Z$/.test(s)) { nb = 0; s = ''; }
  else if (/^[DG]Z/.test(s)) { nb = 0; s = s.slice(2); }
  else if (s.charAt(0) === 'Z') { nb = 0; s = s.slice(1); }
  /* ⛔⛔ UNE LETTRE SEULE N'EST PAS UNE BATTERIE — GARDE D'ARGENT MESURÉE.
     Sur ses fiches : `MR006G` est une radio de la gamme 40 V ; le `G` final
     nomme la GAMME, pas « 2 batteries 6,0 Ah ». Lu comme un kit, on écrirait
     un coût de kit sur un outil nu. On n'accepte donc une lettre de batterie
     que si un CHARGEUR la précède, ou si un coffret / un chiffre la suit —
     autrement dit seulement quand le suffixe décrit VRAIMENT un ensemble. */
  var avaitChargeur = false;
  if (nb === null && MAKITA_CHARGEUR[s.charAt(0)]) { avaitChargeur = true; s = s.slice(1); }
  /* ⚠️ `Z`, `J` et `K` échappent à la garde : ce ne sont pas des lettres de
     BATTERIE, ce sont l'outil nu et le coffret. `RP0900J`, `PJ7000J`,
     `SG1251J`, `TW0350J` — quatre machines FILAIRES dont sa fiche dit
     « coffret Makpac » — tombaient dans la garde et sortaient « inconnu ».
     Un coffret sans batterie existe ; c'est même le cas le plus banal. */
  if (nb === null && !avaitChargeur && !estSansFil
      && /^[A-Z]$/.test(s) && 'ZJK'.indexOf(s) === -1) return null;
  if (nb === null && (avaitChargeur || estSansFil)) {
    var cles = Object.keys(MAKITA_BATTERIE).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < cles.length; i++) {
      if (s.indexOf(cles[i]) === 0) {
        nb = MAKITA_BATTERIE[cles[i]][0]; ah = MAKITA_BATTERIE[cles[i]][1];
        s = s.slice(cles[i].length); break;
      }
    }
  }
  /* Un chiffre COLLÉ à la lettre de batterie donne le nombre réel — `PT4J` = 4.
     Jamais un `0` : `DK0124G201` (ensemble XGT) y perdait ses batteries. */
  var m1 = s.match(/^([1-9])/);
  if (m1 && nb) { nb = parseInt(m1[1], 10); s = s.slice(1); }
  /* `X` + chiffre = LOT D'ACCESSOIRES. Il ne touche jamais au compte de
     batteries : sur `TM30DSMJX5`, le `SMJ` porte déjà « 2x 4,0 Ah en
     coffret », le `X5` ne peut désigner que les accessoires du lot. Il se lit
     AVANT le coffret, parce que `RP0900XJ` les porte tous les deux et que sa
     fiche dit « dans coffret Makpac ». */
  var mx = s.match(/^X(\d{0,2})/);
  if (mx) { accessoires = true; s = s.slice(mx[0].length); }
  if (s.charAt(0) === 'J' || s.charAt(0) === 'K') { coffret = 'MAKPAC'; s = s.slice(1); }
  /* ⚠️ PAS DE SECONDE LECTURE DU LOT ICI. Le lot écrit APRÈS le coffret
     (`ZJX3`, `JX3`, `TJX2`, `ZKX2`) est déjà détaché en tête de fonction —
     j'en avais mis une seconde par symétrie, et le sabotage l'a démasquée :
     on pouvait la supprimer sans qu'aucune assertion ne bouge. Du code
     qu'aucun sabotage ne peut tuer est du code qui ment sur son utilité. */
  /* `E` FINAL = LE COFFRET, à la place du `J`. Il n'entre QUE si une batterie
     a déjà été lue : sans cela `GN900SE` (cloueur à gaz, aucune batterie)
     s'inventerait un coffret sur la foi d'une lettre de nom de modèle. */
  else if (s.charAt(0) === 'E' && nb !== null) { coffret = 'MALLETTE'; s = s.slice(1); }
  /* ⚠️ APRÈS LE COFFRET, LE CHIFFRE EST AMBIGU — ET LE RECOUPEMENT L'A TRANCHÉ.
     `DDF485RTJ3` : « 3 batteries 5,0 Ah » (amazon.fr, fixami.fr, manomano.fr,
     idealo.fr) → le 3 est bien un NOMBRE.
     `DLX2210TJ1` : « 2 batteries 5 Ah + 2 coffrets MAKPAC » (afdb.fr,
     sobrico.com, kamody.fr, maxoutil.com, todotaladros.com, master-outillage,
     bati-avenue, comptoirdespros, magasin-ek — neuf revendeurs) → le 1 est la
     TAILLE du coffret, pas un compte. Une lecture naïve donnait « 1 batterie ».
     Règle qui satisfait les deux, et elle seule : un `1` après le coffret est
     une taille, jamais un compte — une seule batterie s'écrit `T1J`. */
  var m2 = s.match(/^(\d)$/);
  if (m2 && nb) { if (m2[1] !== '1') nb = parseInt(m2[1], 10); s = ''; }
  /* `U` FINAL = MODULE AWS (démarrage sans fil de l'aspirateur), une option de
     la MACHINE. Ses fiches l'écrivent : `DSP601ZJU` « AWS en MAKPAC (machine
     seule) », `DHS900ZU` « module AWS (machine seule) ». Il ne change rien au
     contenu de la boîte — on le consomme, il ne produit rien. */
  if (s === 'U') s = '';
  /* Un nombre à deux chiffres derrière un outil NU est un numéro de variante,
     pas un contenu : `CE003GZ02` « (Solo) », `HM002GZ03` « (solo) en
     coffret », `SP001GZ03` « (solo) en makpac » — trois fiches, trois fois
     « solo ». Il ne peut rien gonfler puisque le compte est déjà zéro. */
  if (nb === 0 && /^\d{2}$/.test(s)) s = '';
  if (nb === null && coffret === null && !avecEnergie) return null;  // rien de sûr : on ne devine pas
  /* ⛔ CE QUI RESTE NON CONSOMMÉ TUE LA LECTURE. `RP2302FC07` (défonceuse
     FILAIRE 2300 W) donnait « 2 batteries 3 Ah » sur la foi de son `F`, en
     abandonnant `C07` en route. Une grammaire qui ne lit qu'un MORCEAU du
     suffixe n'a pas compris le suffixe : elle se tait. */
  if (s !== '') return null;
  var cfg = { nbBatteries: nb };
  if (ah !== null) cfg.ah = ah;
  if (coffret) cfg.coffret = coffret;
  if (accessoires) cfg.accessoires = true;
  if (avecEnergie) cfg.avecEnergie = true;
  if (nb === 0) cfg.note = coffret ? 'machine seule en coffret' : 'machine seule';
  return cfg;
}

/* Sans fil = `D` suivi d'une lettre (DHP, DTD, DLX, DBO…), l'écriture de toute
   la gamme à batterie de la marque. Les machines filaires n'y répondent pas —
   HR, JR, RP, VC, KP, LS, LW, MLT, LB, GA, LD, PJ, SG, TW. */
function racineSansFilMakita(racine) {
  return /^D[A-Z]/.test(String(racine || '').toUpperCase());
}

function configDuSuffixeMakita(suf, estSansFil) {
  return Object.prototype.hasOwnProperty.call(SUFFIXES_MAKITA, suf)
    ? SUFFIXES_MAKITA[suf]                       // mesuré : prioritaire
    : decomposerSuffixeMakita(suf, estSansFil);  // déduit de la grammaire
}

/* ⛔⛔ LA COUPE ÉTAIT FAUSSE, ET C'EST ELLE QUI COÛTAIT LE PLUS.
   Trouvé le 10/08/2026 en cherchant ce que valait `ST113DSMJ` : la coupe
   gloutonne rendait racine `ST113`, suffixe `DSMJ` — et `DSMJ` n'est décodable
   par personne, donc « contenu inconnu ». Or les pages marchandes de ce
   cloueur (darty.com, manomano.fr, maxi-brico.fr, racetools.fr) écrivent
   toutes la même chose : **2 batteries 4,0 Ah, chargeur DC10SA, coffret
   MAKPAC**. Autrement dit `S` + `M` + `J` — la grammaire savait déjà lire ce
   suffixe, on ne le lui donnait pas.
   La cause : le `D` FINAL APPARTIENT AU MODÈLE, pas au code d'ensemble. Toute
   la gamme sans fil s'écrit ainsi — `TD110D`, `TD111D`, `HR140D`, `DF001D`,
   `TM30D`, `ST113D` — et le manuel officiel de la marque titre « model 6221D /
   model 6221DW », le `D` d'un côté, le code d'ensemble de l'autre.
   ⚠️ On ne déplace la lettre QUE si le reste devient décodable : un essai qui
   échoue rend la coupe d'origine. On ne gagne donc jamais un décodage faux —
   au pire on reste sur ce qu'on avait. */
function lireSuffixeMakita(sku) {
  var m = String(sku || '').toUpperCase().match(/^([A-Z]{1,4}\d{2,4})([A-Z0-9]{0,8})$/);
  if (!m) return null;
  var suf = m[2] || '';
  var sansFil = racineSansFilMakita(m[1]);
  var cfg = configDuSuffixeMakita(suf, sansFil);
  if (!cfg && /^[A-Z][A-Z0-9]/.test(suf)) {
    var cfg2 = configDuSuffixeMakita(suf.slice(1), sansFil);
    if (cfg2) return { racine: m[1] + suf.charAt(0), suffixe: suf.slice(1), config: cfg2, varianteModele: false };
  }
  /* ⛔ UNE LETTRE SEULE QUI N'EST NI `Z` NI `J`/`K` N'EST PAS UN CODE
     D'ENSEMBLE — C'EST UNE VARIANTE DE MODÈLE, et il n'y a RIEN à décoder.
     Recoupé le 10/08/2026 : `C` = paquet de contrôle électronique (vitesse
     variable, démarrage progressif) sur `HR4510C`, `HR5212C`, `HM1213C` —
     quatorze de ses fiches, toutes FILAIRES ; `G` final = gamme 40 V XGT
     (`MR006G`, `HR005G`) ; `L` = classe de filtration ou laser (`VC2512L`,
     `LS1219L`) ; `B` = variante d'une BATTERIE (`BL1850B`) ; `N`, `F`, `R`,
     `P`, `S` = variantes de machines filaires (`MLT100N`, `LB1200F`,
     `GA9020R`, `LD050P`, `KP312S`).
     ⚠️ Le dire NE LES DÉCODE PAS : `varianteModele` veut dire « il n'y a pas
     d'ensemble ici », pas « on connaît l'ensemble ». Mais ça les sort du
     compte des inconnues, où elles n'ont jamais eu leur place. */
  var variante = !cfg && /^[A-Z]$/.test(suf) && 'ZJK'.indexOf(suf) === -1;
  return { racine: m[1], suffixe: suf, config: cfg || null, varianteModele: variante };
}

/* ══ LA FORME DE LA RÉFÉRENCE — CE QUI RÉPARE LE COMPTEUR ══════════════════
   ⛔⛔ LE DÉFAUT ÉTAIT DANS MA MESURE, PAS DANS LE PARSEUR. Je comptais
   « conditionnement inconnu » sur TOUTE référence dont le suffixe ne se
   décodait pas — donc aussi sur une lame de scie, sur un fil de ligature et
   sur une raboteuse filaire de 1988. Or ces objets-là n'ONT pas de
   conditionnement : la question « nu ou en pack ? » n'a aucun sens pour eux.
   Le problème paraissait ainsi deux fois plus gros qu'il n'est, et l'effort
   partait au mauvais endroit.
   ⚠️ `porteConditionnement:false` ne veut pas dire « on sait » : il veut dire
   **IL N'Y A RIEN À SAVOIR**. Les deux ne se comptent plus ensemble.

   Les quatre formes, mesurées sur ses 611 fiches Makita (archive du
   10/08/2026) — 23 + 39 + 17 + 519, plus 13 hors forme :
     · `B-33750`, `D-74778`, `E-16586`, `P-23721`, `Y-00197` … 23 fiches :
       une LETTRE, un tiret, des chiffres. Consommables et accessoires.
     · `194093-8`, `191J59-9`, `824697-9` … 39 fiches : six signes et une clé.
       Numérotation de pièces et d'accessoires au catalogue.
     · `6906`, `1806B`, `2012NB`, `9403J` … 17 fiches : la numérotation d'avant
       la nomenclature actuelle. Machines FILAIRES — aucune batterie possible.
       ⚠️ Un `J` final y marque quand même le coffret : sa fiche `5008MGJ` dit
       « en coffret MakPac ». Le coffret existe sans batterie.
     · `DHP486RTJ`, `ST113DSMJ` … 519 fiches : lettres, chiffres, code
       d'ensemble. LA SEULE forme où l'inconnu coûte de l'argent.
   ⛔ Aucune de ces formes n'est devinée : chacune est prouvée par le TITRE que
   l'user a écrit sur ses propres fiches. */
var FORMES_MAKITA = {
  accessoire: { porteConditionnement: false, note: 'lettre-tiret-chiffres : accessoire ou consommable' },
  piece: { porteConditionnement: false, note: 'six signes et une clé : pièce ou accessoire au catalogue' },
  filaire: { porteConditionnement: false, note: 'numérotation ancienne : machine filaire, pas de batterie' },
  modele: { porteConditionnement: true, note: 'nomenclature actuelle : peut porter un code d\'ensemble' },
  inconnue: { porteConditionnement: false, note: 'aucune des formes connues' }
};

function formeReferenceMakita(sku) {
  var s = String(sku || '').toUpperCase().trim();
  if (!s) return { forme: 'inconnue', porteConditionnement: false, coffret: null };
  var forme;
  if (/^[A-Z]-\d{4,6}(-\d{1,4})?$/.test(s)) forme = 'accessoire';
  else if (/^\d{3}[A-Z0-9]\d{2}-\d$/.test(s)) forme = 'piece';
  else if (/^[A-Z]{1,4}\d{2,4}[A-Z0-9]{0,8}$/.test(s)) forme = 'modele';
  else if (/^\d{3,4}[A-Z0-9]{0,6}$/.test(s)) forme = 'filaire';
  else forme = 'inconnue';
  var d = FORMES_MAKITA[forme];
  /* Le coffret survit à l'absence de batterie : `5008MGJ`, `9403J`, `9404J`. */
  var coffret = (forme === 'filaire' && /J$/.test(s)) ? 'MAKPAC' : null;
  /* ⚠️ La forme actuelle abrite AUSSI des machines filaires — `HR2811FT`,
     `RP2302FC07`, `VC4210MX`, `JR3070CT`. Elles n'ont pas plus de batterie
     qu'une `6906`, et les compter « conditionnement inconnu » refait
     exactement l'erreur que cette fonction existe pour corriger. */
  var sansFil = (forme === 'modele') ? racineSansFilMakita(s) : false;
  /* ⛔ UNE BATTERIE ET UN CHARGEUR N'ONT PAS DE CONDITIONNEMENT — ILS EN SONT
     UN. `BL1850BX10`, `BL18120`, `DC18RD` restaient « inconnus » alors que
     leurs titres disent « Batterie 18V 12Ah » et « Chargeur rapide ». La
     famille du préfixe suffit à trancher, et elle est déjà dans la table. */
  var tete = null;
  for (var k = 0; k < PREFIXES_MAKITA_ORDRE.length; k++) {
    if (s.indexOf(PREFIXES_MAKITA_ORDRE[k]) === 0) { tete = PREFIXES_MAKITA_ORDRE[k]; break; }
  }
  var energie = !!(tete && PREFIXES_MAKITA[tete].famille === 'energie');
  /* ⛔ UN SUFFIXE QUI N'EST QU'UN LOT D'ACCESSOIRES NE DIT RIEN DU PACK — et
     ce n'est pas une supposition. `DLX4057X1` : sept revendeurs (amazon.ca,
     cotebrico.fr, lumen.ca, homedepot.ca, rona.ca, placide.com,
     mississaugahardware.com) annoncent 4 machines + **2 batteries 3,0 Ah** +
     chargeur DC18SD + sac — alors que `X1` ne porte AUCUNE lettre de
     batterie. Le code est MUET ici : ce n'est pas une ignorance du parseur,
     c'est une absence dans la référence. Le titre, lui, le dit. */
  var m = s.match(/^[A-Z]{1,4}\d{2,4}([A-Z0-9]{0,8})$/);
  var codeMuet = !!(m && /^X\d{0,2}$/.test(m[1]));
  var porte = d.porteConditionnement && !energie && !codeMuet;
  return {
    forme: forme, porteConditionnement: porte,
    energie: energie, codeMuet: codeMuet,
    sansFil: sansFil, batteriePossible: porte && sansFil,
    coffret: coffret, note: energie ? 'batterie ou chargeur : il EST le conditionnement'
      : (codeMuet ? 'suffixe de lot seul : la référence ne dit rien du pack' : d.note)
  };
}

/* ── PRÉFIXES DE RÉFÉRENCE DeWALT ────────────────────────────────────────
   ⛔ CE QUI MANQUAIT AU PREMIER JET, ET L'USER L'A VU : « dans ton document
   je n'ai absolument rien vu qui référence le DÉBUT des références ; en
   général c'est les trois premières lettres, il peut y en avoir moins ou
   plus. » Exact — j'avais documenté les suffixes (ce qu'il y a DANS la
   boîte) et rien sur les préfixes (ce QU'EST l'outil).

   Or le préfixe est ce qu'il y a de plus solide dans un titre : c'est le
   constructeur qui l'écrit, il ne change pas d'une langue à l'autre, et il
   survit à un titre en espagnol ou en anglais là où le vocabulaire échoue.

   ⚠️ DEUX SOURCES CONCORDANTES. ① En ligne : toolguyd.com, housedigest.com,
   ukplanettools.co.uk, forum.toolsinaction.com. ② SA PAGE DU 03/08 : les 46
   annonces relevées donnent, préfixe par préfixe, exactement la même
   correspondance — D25→marteau de démolition, DCB→batterie, DCE→laser ET
   vibrateur (fourre-tout confirmé), DCF→riveteuse ET clé à chocs, DCG→
   meuleuse, DCH→marteau perforateur, DCN→cloueur ET agrafeuse, DCS→scies,
   DCV et DWV→aspirateur, DCW→dégauchisseuse, DXPW→nettoyeur haute pression.
   Une table confirmée par la donnée réelle vaut mieux qu'une table citée.

   ⛔ CE QUE LE PRÉFIXE NE FAIT JAMAIS : inventer un TYPE. Un type est un nom
   précis, il vient des mots. Le préfixe donne la FAMILLE, et le RAYON
   seulement quand il n'en désigne qu'un seul. DCF couvre riveteuse ET clé à
   chocs, DCE est un fourre-tout maison : ces deux-là ne donnent aucun rayon.
   Seule exception, `DCK` — « combo kit » EST le sens du préfixe, pas une
   déduction : il peut donc porter son type.
   ⚠️ La lecture se fait du préfixe le PLUS LONG au plus court (DCMST avant
   DCM avant DC), sinon « DCMST922N » serait lu « DCM ». */
var PREFIXES_DEWALT = {
  // ── Sans fil (DC…)
  DCD:  { famille: 'machine', rayon: 'percage',      note: 'perceuse, visseuse, malaxeur' },
  DCF:  { famille: 'machine',                        note: 'fixation au sens large : visseuse à chocs, clé à chocs, riveteuse — DEUX rayons, donc aucun' },
  DCG:  { famille: 'machine', rayon: 'meulage',      note: 'meuleuse' },
  DCH:  { famille: 'machine', rayon: 'perforation',  note: 'marteau perforateur' },
  DCS:  { famille: 'machine', rayon: 'sciage',       note: 'scie, et outil oscillant' },
  DCN:  { famille: 'machine', rayon: 'fixation',     note: 'cloueur, agrafeuse' },
  DCV:  { famille: 'machine', rayon: 'aspiration',   note: 'aspirateur' },
  DCW:  { famille: 'machine', rayon: 'bois',         note: 'travail du bois' },
  DCL:  { famille: 'machine', rayon: 'mesure',       note: 'éclairage' },
  DCC:  { famille: 'machine', rayon: 'jardin',       note: 'tronçonneuse' },
  DCMW: { famille: 'machine', rayon: 'jardin',       note: 'tondeuse' },
  DCMST:{ famille: 'machine', rayon: 'jardin',       note: 'débroussailleuse, coupe-fil' },
  DCMB: { famille: 'machine', rayon: 'jardin',       note: 'coupe-bordure' },
  DCMP: { famille: 'machine', rayon: 'chantier',     note: 'nettoyeur à pression sans fil' },
  DCM:  { famille: 'machine', rayon: 'jardin',       note: 'extérieur et enlèvement de matière' },
  DCB:  { famille: 'energie', rayon: 'batterie',     note: 'batterie' },
  DCBP: { famille: 'energie', rayon: 'batterie',     note: 'batterie compacte' },
  DCK:  { famille: 'machine', rayon: 'combo', type: 'pack d\'outils', note: 'combo kit — le préfixe EST le sens' },
  DCE:  { famille: 'machine',                        note: 'fourre-tout maison : laser, vibrateur, souffleur, ponceuse à plâtre… aucun rayon sûr' },
  DCT:  { famille: 'machine', rayon: 'mesure',       note: 'Tool Connect, mesure et détection' },
  // ── Filaires et gammes historiques
  DWE:  { famille: 'machine',                        note: 'électroportatif filaire, plusieurs rayons' },
  DWS:  { famille: 'machine', rayon: 'sciage',       note: 'scie filaire' },
  DWV:  { famille: 'machine', rayon: 'aspiration',   note: 'aspirateur' },
  D25:  { famille: 'machine', rayon: 'perforation',  note: 'marteau filaire' },
  D28:  { famille: 'machine', rayon: 'meulage',      note: 'meuleuse filaire' },
  D26:  { famille: 'machine',                        note: 'ponçage et défonçage filaires, plusieurs rayons' },
  D27:  { famille: 'machine',                        note: 'machines d\'atelier, plusieurs rayons' },
  D51:  { famille: 'machine', rayon: 'fixation',     note: 'cloueur pneumatique' },
  D55:  { famille: 'machine', rayon: 'chantier',     note: 'compresseur' },
  // ── Extérieur thermique
  DXPW: { famille: 'machine', rayon: 'chantier',     note: 'nettoyeur haute pression' },
  DXGN: { famille: 'machine', rayon: 'chantier',     note: 'groupe électrogène' },
  /* ⛔ DXV / DXVP — ASPIRATEURS EAU ET POUSSIÈRES. Ils manquaient à cette
     table alors que le catalogue en porte sept (DXV15T, DXV20P, DXV20PC,
     DXV23P-QT, DXV30SAPTA, DXV34PTA, DXVP-QT). Et DXVP-QT est la SEULE
     référence DeWALT du catalogue qui ne porte AUCUN chiffre — mesuré : 1 sur
     1078. C'est elle qui a rendu ce trou visible, et c'est elle qui autorise
     le parseur à lire une référence sans chiffre : uniquement quand sa tête
     est un préfixe constructeur connu, sinon « EAU » ou « SDS-MAX » en
     deviendraient une. */
  DXVP: { famille: 'machine', rayon: 'aspiration',   note: 'aspirateur eau et poussières' },
  DXV: { famille: 'machine', rayon: 'aspiration',    note: 'aspirateur eau et poussières' },
  // ── Rangement, main, accessoires
  /* ⚠️ CES QUATRE-LÀ N'ARBITRENT PAS. Mesuré : DeWALT range sa RADIO de
     chantier sous DWST (rangement) et son TÉLÉMÈTRE LASER sous DWHT (outil à
     main). Le préfixe y désigne un catalogue commercial, pas une famille
     d'objet. Ils servent donc uniquement de SECOURS quand aucun mot n'a
     parlé — jamais à contredire un mot qui, lui, a parlé. */
  /* ⛔⛔ DWK EST UN KIT DE MACHINES, PAS UN COFFRET. Trouvé le 03/08 en
     auditant son relevé : DWK301, DWK300 et DWK223 sortaient tous les trois
     « rangement / coffret », parce que le sous-titre de la carte nomme les
     TSTAK du lot — et le contenant volait la place du contenu, exactement
     comme « Coffret DE 29 forets » avant lui. Trois lignes sur cinquante-neuf.
     Vérifié chez cinq revendeurs, tous rubrique « kits d'outils
     électroportatif » : DWK301 = DCD796 + DCS334 + DCS570 ; DWK300 = DCD796 +
     DCS331 + DCS391 ; DWK223 = DCD996 + DCH273 — chacun avec 2 batteries
     5,0 Ah, un chargeur DCB115 et ses coffrets TSTAK VI.
     Sources : todotaladros.com · leroymerlin.fr · tecnomat.fr · cdiscount.com
     · manomano.fr (consultées le 03/08/2026).
     ⚠️ J4 : c'est de l'argent. Le prix d'un lot de trois machines écrit sur un
     coffret de rangement fausse tout ce qui en découle.
     ⛔ Et il ARBITRE — pas d'`incertain` ici : le K de DeWALT Kit désigne
     l'objet vendu, comme DCK. C'est lui qui doit renverser le mot du
     sous-titre, pas l'inverse. */
  DWK:  { famille: 'machine', rayon: 'combo', type: 'pack d\'outils', note: 'DeWALT Kit — lot de machines, jamais le coffret qui les porte' },
  /* ⛔⛔ FVK EST LE MÊME PIÈGE QUE DWK, EN GAMME FLEXVOLT. Mesuré le 09/08/2026
     sur le relevé idealo Quincaillerie de l'user : « FVK271T2-QW 54V/18V
     (DCH333 + DCG418 + 2 x 6.0 Ah + DCB118 + TSTAK II + TSTAK VI) » et
     « FVK381T2-QW … » sortaient tous deux « rangement / coffret modulaire » —
     le TSTAK du lot volait la place des DEUX machines qu'il contient, et un
     kit à ~700 € passait pour un coffret de rangement. Le titre énumère
     lui-même son contenu ; `price-parse` traite d'ailleurs déjà FVK en kit
     (PREFIXES_KIT, ligne « FVK = kit FLEXVOLT »).
     ⚠️ J4 : c'est de l'argent — même mécanisme, mot pour mot, que DWK.
     ⛔ Et il ARBITRE, comme DCK et DWK : le K de FlexVolt Kit désigne l'objet
     vendu. */
  FVK:  { famille: 'machine', rayon: 'combo', type: 'pack d\'outils', note: 'FlexVolt Kit — lot de machines 54V/18V, jamais le coffret qui les porte' },
  DWST: { famille: 'rangement', rayon: 'coffret', incertain: true, note: 'coffret et organiseur, mais AUSSI la radio de chantier' },
  DWHT: { famille: 'consommable', incertain: true, note: 'outillage à main, mais AUSSI le télémètre laser' },
  DWMT: { famille: 'consommable', incertain: true, note: 'outillage de mécanicien' },
  DT:   { famille: 'consommable', incertain: true, note: 'accessoire et consommable' },

  /* ── RÉFÉRENCES PRÉCISES — elles renversent le mot d'un titre marchand ────
     ⛔⛔ UN TITRE DE MARCHAND PEUT ÊTRE FAUX ; UNE RÉFÉRENCE, NON. Trouvé le
     03/08/2026 en auditant son relevé : DEUX lignes annonçaient une
     « Dégauchisseuse sans fil DeWalt DCW 620 » — une machine d'atelier — pour
     une DÉFONCEUSE plongeante. Une troisième ligne, MÊME référence, disait
     « Défonceuse » et avait raison. C'est une mauvaise traduction de
     l'allemand « Oberfräse », recopiée par plusieurs marchands.
     Source la plus haute possible, DeWALT lui-même :
     cee.dewalt.global/product/dcw620nt-xj — « 18V XR Brushless 70mm 1/2"
     Plunge Router » (consulté le 03/08/2026). Confirmé chez tooled-up.com,
     powertoolworld.co.uk, misterworker.com.
     ⚠️ J'ai d'abord cherché une règle générale — « une dégauchisseuse est
     stationnaire, il n'en existe pas sur batterie » — et je l'ai TUÉE en
     mesurant : il en existe (Peugeot EnergyHub 18 V). Une hypothèse morte se
     déclare morte ; on ne la garde pas parce qu'elle arrangeait.
     ⛔ LE `type` EST LE CRITÈRE, ET IL SE MÉRITE. Une entrée n'en porte un que
     si elle NOMME un produit exact, avec sa source et sa date — et elle
     arbitre alors contre le mot du titre. Une entrée de famille (DCS, DCF,
     DCW…) n'en porte JAMAIS : elle couvre des dizaines d'outils différents, et
     renverserait des types justes. La lecture se faisant du plus LONG au plus
     court, `DCW620` passe avant `DCW` sans machinerie de plus.
     ⚠️ Premier jet : un drapeau `precis` séparé du `type`. Le sabotage qui le
     retirait est resté VERT — il ne distinguait rien, puisque seules ces
     entrées-là portent un type. Supprimé : un drapeau qu'aucune mesure ne
     sépare de son voisin donne une confiance qui n'existe pas. */
  DCW620: { famille: 'machine', rayon: 'bois', type: 'défonceuse',
    note: 'défonceuse plongeante 18V XR — des marchands la disent « dégauchisseuse » (Oberfräse mal traduit)' },
  /* ⛔ Même forme, autre outil : « DEWALT Coupe-bordures sans fil 54V, modèle
     DCMBC723N, avec guidon ». Un coupe-bordure n'a pas de guidon et ne coupe
     pas des arbres. DeWALT lui-même : « 54V Clearing Saw with Bull Handle »,
     lame forestière 24 dents de 25 cm, arbres jusqu'à 10 cm de diamètre —
     c'est une DÉBROUSSAILLEUSE. Sources : dewalt.com.au/product/dcmbc723n-xe ·
     screwfix.com · forestandarb.com (consultées le 03/08/2026). */
  DCMBC723: { famille: 'machine', rayon: 'jardin', type: 'débroussailleuse',
    note: 'débroussailleuse forestière 54V à guidon — des marchands la disent « coupe-bordures »' }
};
/* Les clés triées du plus LONG au plus court — l'ordre de lecture. */
var PREFIXES_DEWALT_ORDRE = Object.keys(PREFIXES_DEWALT).sort(function (a, b) { return b.length - a.length; });

/* ── PRÉFIXES MAKITA (09/08/2026) ─────────────────────────────────────────────
   ⛔ TABLE MESURÉE, PAS INVENTÉE : générée depuis products.json (611 fiches
   Makita du catalogue) — préfixe = tête alphabétique du SKU, retenu s'il porte
   AU MOINS 2 fiches ; la note dit la catégorie DOMINANTE observée et sur
   combien de fiches. Même rôle que PREFIXES_DEWALT : reconnaître qu'une tête
   de candidat est une vraie famille de références (teteConnue du parseur), et
   dire ce que le préfixe annonce. 73 préfixes retenus. */
var PREFIXES_MAKITA = {
  AF:     { famille: 'machine', note: 'Cloueurs (3/3 fiches)' },
  /* ⛔ `BL` EST UNE BATTERIE, PAS UN ACCESSOIRE. La note « Accessoires (5/7
     fiches) » venait du RAYON où l'user les avait rangées, pas de ce qu'elles
     SONT : `BL1830B`, `BL1850B`, `BL1860B`, `BL1041B`, `BL18120` — cinq
     batteries Li-Ion, et ses propres titres l'écrivent (« Batterie 18V LXT
     Li-Ion 3,0 Ah »). Une batterie ne se demande pas si elle est « nue ou en
     pack » : elle EST le pack. Même chose pour `DC`, déjà classé `energie`. */
  BL:     { famille: 'energie', rayon: 'batterie', note: 'batterie Li-Ion — jamais une machine' },
  BN:     { famille: 'machine', note: 'Rangements (2/2 fiches)' },
  BO:     { famille: 'machine', note: 'Meulage, découpe et polissage (4/5 fiches)' },
  CC:     { famille: 'machine', note: 'Scies (2/2 fiches)' },
  CE:     { famille: 'machine', note: 'Meulage, découpe et polissage (2/2 fiches)' },
  CL:     { famille: 'machine', note: 'Aspirateurs (1/2 fiches)' },
  CW:     { famille: 'machine', note: 'Accessoires (3/3 fiches)' },
  DBN:    { famille: 'machine', note: 'Accessoires (4/5 fiches)' },
  DBO:    { famille: 'machine', note: 'Meulage, découpe et polissage (9/11 fiches)' },
  DBS:    { famille: 'machine', note: 'Meulage, découpe et polissage (3/3 fiches)' },
  DC:     { famille: 'energie', note: 'Batteries et chargeurs (4/4 fiches)' },
  DCC:    { famille: 'machine', note: 'Scies (3/3 fiches)' },
  DCE:    { famille: 'machine', note: 'Meulage, découpe et polissage (2/2 fiches)' },
  DCL:    { famille: 'machine', note: 'Aspirateurs (1/2 fiches)' },
  DCO:    { famille: 'machine', note: 'Défonceuses (3/3 fiches)' },
  DCS:    { famille: 'machine', note: 'Accessoires (3/4 fiches)' },
  DDA:    { famille: 'machine', note: 'Perçage, vissage et boulonnage (5/5 fiches)' },
  DDF:    { famille: 'machine', note: 'Perçage, vissage et boulonnage (19/23 fiches)' },
  DEADML: { famille: 'machine', note: 'Accessoires (3/3 fiches)' },
  DF:     { famille: 'machine', note: 'Perçage, vissage et boulonnage (1/2 fiches)' },
  DFR:    { famille: 'machine', note: 'Perçage, vissage et boulonnage (4/4 fiches)' },
  DFS:    { famille: 'machine', note: 'Accessoires (2/4 fiches)' },
  DGA:    { famille: 'machine', note: 'Meulage, découpe et polissage (28/29 fiches)' },
  DGD:    { famille: 'machine', note: 'Accessoires (2/4 fiches)' },
  DGP:    { famille: 'machine', note: 'Accessoires (2/2 fiches)' },
  DHG:    { famille: 'machine', note: 'Accessoires (2/2 fiches)' },
  DHP:    { famille: 'machine', note: 'Perçage, vissage et boulonnage (17/31 fiches)' },
  DHR:    { famille: 'machine', note: 'Perforateurs (21/25 fiches)' },
  DHS:    { famille: 'machine', note: 'Scies (24/24 fiches)' },
  DJN:    { famille: 'machine', note: 'Accessoires (3/4 fiches)' },
  DJR:    { famille: 'machine', note: 'Scies (23/23 fiches)' },
  DJV:    { famille: 'machine', note: 'Scies (7/8 fiches)' },
  DKP:    { famille: 'machine', note: 'Rabots (2/2 fiches)' },
  DLM:    { famille: 'machine', note: 'Tronçonnage et élagage (8/13 fiches)' },
  /* ⛔⛔ DLX ET MEU SONT DES LOTS DE MACHINES — LE MÊME PIÈGE QUE `DWK` CHEZ
     L'AUTRE MARQUE, ET IL ÉTAIT OUVERT ICI. La note « Accessoires (16/20
     fiches) » venait du RAYON où l'user les a rangés, pas de ce qu'ils SONT :
     `DLX` est le code maison des « combo kits », et il en portait la famille
     d'un rayon de rangement. Recoupé le 10/08/2026 sur huit revendeurs pour
     `DLX2145TJ` et `DLX2283TJ` (makitauk.com, screwfix.com, toolstation.com,
     makita.com.au, makitatools.com rubrique « LXT COMBO KITS », amazon.co.uk,
     rsdelivers.com, primetools.co.uk) : DEUX machines + 2 batteries 5,0 Ah +
     chargeur DC18RC + coffret MAKPAC.
     `MEU` de même, recoupé sur six revendeurs pour `MEU029J` (afdb.fr,
     crespin.be, cotebrico.fr, racetools.fr, master-outillage.com,
     cdiscount.com) : scie plongeante SP6000J + scie sauteuse 4351FCTJ, deux
     MAKPAC. Sa propre fiche l'écrit d'ailleurs dans son titre.
     ⚠️ J4 — C'EST DE L'ARGENT : le prix d'un lot de deux machines pris pour
     celui d'un accessoire fausse tout ce qui en découle.
     ⛔ Et ils ARBITRENT, comme `DCK`/`DWK` : « lot de machines » EST le sens du
     préfixe, pas une déduction tirée d'un mot du sous-titre. */
  DLX:    { famille: 'machine', rayon: 'combo', type: 'pack d\'outils', note: 'combo kit — plusieurs machines, jamais un accessoire' },
  MEU:    { famille: 'machine', rayon: 'combo', type: 'pack d\'outils', note: 'ensemble de machines vendu en lot' },
  DMP:    { famille: 'machine', note: 'Accessoires (3/5 fiches)' },
  DMR:    { famille: 'machine', note: 'Accessoires (3/3 fiches)' },
  DPT:    { famille: 'machine', note: 'Rangements (3/4 fiches)' },
  DPV:    { famille: 'machine', note: 'Meulage, découpe et polissage (3/3 fiches)' },
  DRT:    { famille: 'machine', note: 'Défonceuses (5/6 fiches)' },
  DRV:    { famille: 'machine', note: 'Accessoires (2/3 fiches)' },
  DSP:    { famille: 'machine', note: 'Scies (1/2 fiches)' },
  DSS:    { famille: 'machine', note: 'Scies (3/3 fiches)' },
  DST:    { famille: 'machine', note: 'Rangements (3/4 fiches)' },
  DTD:    { famille: 'machine', note: 'Perçage, vissage et boulonnage (15/20 fiches)' },
  DTL:    { famille: 'machine', note: 'Perçage, vissage et boulonnage (4/4 fiches)' },
  DTM:    { famille: 'machine', note: 'Outils multifonctions (4/6 fiches)' },
  DTW:    { famille: 'machine', note: 'Perçage, vissage et boulonnage (26/32 fiches)' },
  DUC:    { famille: 'machine', note: 'Tronçonnage et élagage (4/8 fiches)' },
  DUS:    { famille: 'machine', note: 'Accessoires (2/2 fiches)' },
  DUT:    { famille: 'machine', note: 'Malaxeurs (2/2 fiches)' },
  DVC:    { famille: 'machine', note: 'Aspirateurs (1/2 fiches)' },
  DWR:    { famille: 'machine', note: 'Perçage, vissage et boulonnage (4/5 fiches)' },
  GA:     { famille: 'machine', note: 'Meulage, découpe et polissage (6/6 fiches)' },
  GD:     { famille: 'machine', note: 'Meulage, découpe et polissage (2/2 fiches)' },
  HB:     { famille: 'machine', note: 'Perçage, vissage et boulonnage (2/2 fiches)' },
  HM:     { famille: 'machine', note: 'Perforateurs (5/6 fiches)' },
  HR:     { famille: 'machine', note: 'Perforateurs (10/12 fiches)' },
  HS:     { famille: 'machine', note: 'Scies (2/2 fiches)' },
  JR:     { famille: 'machine', note: 'Scies (4/5 fiches)' },
  KP:     { famille: 'machine', note: 'Rabots (3/3 fiches)' },
  LM:     { famille: 'machine', note: 'Tronçonnage et élagage (3/3 fiches)' },
  LS:     { famille: 'machine', note: 'Scies (5/5 fiches)' },
  LW:     { famille: 'machine', note: 'Tronçonnage et élagage (2/2 fiches)' },
  MR:     { famille: 'machine', note: 'Accessoires (2/2 fiches)' },
  RP:     { famille: 'machine', note: 'Défonceuses (6/6 fiches)' },
  RT:     { famille: 'machine', note: 'Défonceuses (2/2 fiches)' },
  SG:     { famille: 'machine', note: 'Accessoires (2/3 fiches)' },
  SK:     { famille: 'machine', note: 'Accessoires (2/2 fiches)' },
  TW:     { famille: 'machine', note: 'Perçage, vissage et boulonnage (5/6 fiches)' },
  UB:     { famille: 'machine', note: 'Souffleurs (3/3 fiches)' },
  VC:     { famille: 'machine', note: 'Aspirateurs (3/3 fiches)' },
};
var PREFIXES_MAKITA_ORDRE = Object.keys(PREFIXES_MAKITA).sort(function (a, b) { return b.length - a.length; });

/* ══ LES PRÉFIXES DE DISTRIBUTEUR — LA MÊME MACHINE SOUS DEUX CODES ════════
   ⛔⛔ TROUVÉ SUR SA CAPTURE DU 10/08/2026 : il vendait un projecteur LED
   **349,58 €** alors que le MÊME projecteur, sous son vrai code, s'achète
   **192,36 €**. Cause : sa fiche porte `DEADML810`, et le traqueur a lu la
   tuile `DEADML810` à **357,90 €** — sans jamais voir la tuile `DML810` à
   192,36 € juste à côté, sur la même page.

   `DEA`, `DEB`, `DEC` sont des préfixes de DISTRIBUTEUR posés devant la vraie
   référence du fabricant. Recoupé sur six revendeurs français (distriartisan,
   maxoutil, manomano, quincaillerie-angles, midifix, promax-outillage) : le
   `DEADML810` vendu en France EST le `DML810` du catalogue mondial, même
   projecteur, mêmes 5 500 lumens, même IP54.

   ⛔ CE QUE ÇA COÛTAIT, MESURÉ SUR SON RELEVÉ : deux paires trouvées —
   `DEADML810` 357,90 € contre `DML810` 192,36 € (écart **165,54 €**) et
   `DEBML009G` 345 € contre `ML009G` 229,56 € (écart **115,44 €**).

   ⚠️⚠️ LA GARDE EST OBLIGATOIRE, ET DANS LE SENS INVERSE DE D'HABITUDE.
   Ici, rapprocher fait BAISSER le coût retenu — donc le prix de vente. Se
   tromper de rapprochement ferait vendre à PERTE. On n'accepte donc la
   normalisation que si le code dépouillé EXISTE VRAIMENT dans le relevé ET
   que les deux tuiles décrivent le MÊME TYPE d'outil. Vérifié sur les deux
   paires : « projecteur » des deux côtés, famille « machine » des deux côtés. */
var PREFIXES_DISTRIBUTEUR_MAKITA = ['DEA', 'DEB', 'DEC', 'DED', 'DEE', 'NLA'];

/* ⛔⛔ LA MARQUE EST OBLIGATOIRE — ORDRE DE L'USER, 10/08/2026 :
   « le parseur doit parfaitement reconnaître sur quelle marque il travaille ;
   une fois qu'il a détecté la marque, il utilise la BONNE table et les BONNES
   consignes […] ce n'est pas parce qu'il y a des choses qui marchent pareil
   que c'est pour la totalité ».
   Ces préfixes sont ceux du DISTRIBUTEUR FRANÇAIS DE MAKITA, et d'eux seuls.
   Le premier jet les appliquait à TOUTES les marques. Mesuré le jour même :
   aucune fiche d'une autre marque n'était touchée — mais c'était la CHANCE, pas
   une garantie. Le jour où une référence d'une autre marque commence par
   « DEA », elle serait dépouillée à tort, et comme ce rapprochement fait
   BAISSER le coût retenu, il ferait vendre à PERTE.
   ⚠️ Même patron que l'alias de l'autre marque (`pwAliasNomenclature`) : la
   marque est demandée ET revérifiée. Sans marque, on ne normalise RIEN. */
function refSansPrefixeDistributeur(sku, marque) {
  if (!/^makita$/i.test(String(marque || '').replace(/[\s-]/g, ''))) return null;
  var s = String(sku || '').toUpperCase().trim();
  for (var i = 0; i < PREFIXES_DISTRIBUTEUR_MAKITA.length; i++) {
    var p = PREFIXES_DISTRIBUTEUR_MAKITA[i];
    if (s.indexOf(p) === 0 && s.length > p.length + 2) return s.slice(p.length);
  }
  return null;
}

/* ══ MILWAUKEE — LIRE LA RÉFÉRENCE DANS LE TITRE ═══════════════════════════
   ⛔⛔ POURQUOI CE CODE EXISTE. Son premier balayage (10/08/2026, 67 pages,
   4 019 tuiles) a sorti 2 199 tuiles SANS RÉFÉRENCE, soit 54,7 % — non pas
   parce que la page était illisible, mais parce que la nomenclature de cette
   marque n'était écrite NULLE PART.

   ⛔ L'ANCRE EST LA FORME, JAMAIS LA POSITION (M-27) — et c'est LUI qui m'a
   repris : « elles ne sont pas toujours dans des parenthèses ». Mesuré sur ses
   793 occurrences : 393 entre parenthèses, 280 après un tiret, 74 nues en fin
   de titre, 46 ailleurs — parfois AVANT le nom du produit. S'ancrer sur les
   parenthèses aurait perdu la moitié des références.
   Ce qui est STABLE : les 791 nombres à dix chiffres du relevé commencent
   TOUS par « 49 », sans une exception ; une seconde famille vit à huit
   chiffres (128 en « 48 », 105 en « 49 »).

   ⛔⛔ L'ORDRE DES RÈGLES EST UNE RÈGLE D'ARGENT, PAS UNE COMMODITÉ.
   Le numéro d'article se lit AVANT la plateforme, et la plateforme ne se lit
   JAMAIS derrière « pour », « compatible », « adapté ». Motif mesuré sur ses
   titres : « Plateau de ponçage 125 mm POUR M18 FROS125 — 4932500123 » est un
   ACCESSOIRE dont la vraie référence est le nombre ; la plateforme y dit
   seulement sur quelle machine il se monte. C'est le piège déjà payé chez
   l'autre marque (« Butée parallèle, Makita SP6000 » à 14,49 € rapprochée de
   la SCIE) : une compatibilité prise pour une identité écrit le prix d'un
   accessoire sur une machine. */
var MILWAUKEE_ARTICLE_10 = /\b(49\d{8})\b/;
var MILWAUKEE_ARTICLE_8 = /\b(4[89]\d{6})\b/;
/* ⛔⛔ LE MÊME NUMÉRO, ÉCRIT AVEC DES TIRETS — troisième écriture, mesurée le
   11/08/2026 sur son relevé à sec : « 48-32-4537 », « 49-56-0511 ». C'est le
   numéro à HUIT chiffres de la famille ci-dessus, groupé 2-2-4 par le
   marchand. Une expression qui exige les huit chiffres COLLÉS ne le voit pas :
   45 tuiles, 32 références distinctes, restaient « sans référence » alors que
   leur numéro est écrit en toutes lettres dans le titre.
   ⛔ ET C'EST UN RISQUE DE DOUBLON À DEUX PRIX. Sur CE relevé, aucune des 32
   n'apparaît aussi sans tirets (mesuré : 0 croisement) — donc aucun écart de
   prix aujourd'hui. Mais deux écritures d'un même article qui ne se
   reconnaissent pas, c'est exactement le mécanisme qui a fait vendre une lampe
   165,54 € trop cher. On normalise avant que ça arrive, pas après.
   ⚠️ LA FORME EST TENUE SERRÉE : deux chiffres de tête (48 ou 49), puis 2,
   puis 4 — trois groupes obligatoires. Une plage de cotes (« 32-48 mm ») n'a
   pas cette forme, et une tête autre que 48/49 est refusée. */
var MILWAUKEE_ARTICLE_TIRETS = /\b(4[89])-(\d{2})-(\d{4})\b/;
/* ⛔⛔ LE SUFFIXE SE DÉTACHE — ET LE PERDRE, C'EST LE BUG À 493,48 €.
   Mesuré sur ses titres : le code d'ensemble s'écrit avec des espaces autour
   du tiret, ou sans tiret du tout — « M18 BHG -502C », « M12 GG- 401B »,
   « M18 BPD 402 C ». Une expression qui exige le tiret COLLÉ perd le suffixe,
   et alors « M18 BSX » (l'outil nu) et « M18 BSX (2 x 4 Ah + charger) »
   (le pack) s'écrasent sur la MÊME référence.
   C'est exactement la panne qu'il vient de repérer chez l'autre marque : le
   prix d'un pack (351,98 €) écrit sur la machine seule, un prix de vente
   gonflé à 493,48 € au lieu de 323,15 €. On ne la refait pas ici. */
var MILWAUKEE_PLATEFORME = /\b(M(?:12|14|18|28)\s?([A-Z][A-Z0-9]{1,12})(?:\s*-\s*|\s+)?([A-Z]?[0-9][A-Z0-9]{0,5}\s?[A-Z]?)?)\b/;
/* ⛔⛔ UN NOM DE GAMME N'EST PAS UN MODÈLE — MESURÉ, ET C'EST LE PIRE DOUBLON.
   « M18 FUEL » a été extrait de DIX titres de produits DIFFÉRENTS : une clé à
   chocs, une scie sabre, un pack de huit machines. FUEL est la gamme haut de
   game de la marque, pas une référence. Le laisser passer aurait fait porter
   un seul « produit » à dix prix incompatibles — donc un prix faux garanti.
   ⚠️ Liste tenue COURTE et mesurée : sur les 18 têtes les plus fréquentes de
   son relevé, FUEL est la seule qui ne soit pas un code modèle. On n'exclut
   pas « au cas où » : chaque mot ici a été vu jouer ce rôle. */
var MILWAUKEE_GAMMES = { FUEL: 1, ONEKEY: 1, REDLITHIUM: 1, REDLINK: 1, PACKOUT: 1, POWERPACK: 1 };
/* ⛔⛔ UN MOT FRANÇAIS N'EST PAS UNE RÉFÉRENCE — et celui-là m'avait échappé.
   Mesuré : « PACK 2 MACHINES MILWAUKEE M18 AVEC BATTERIES ET SAC » et « PACK
   MILWAUKEE GARAGISTE 3 MACHINES M18 AVEC BATTERIES » produisaient tous deux
   la référence « M18AVEC » — deux packs DIFFÉRENTS écrasés sur un mot de
   liaison. C'est le doublon dans sa forme la plus bête, et le plus dangereux :
   deux prix incompatibles sur un produit qui n'existe pas. */
var MILWAUKEE_MOTS_FR = {
  AVEC: 1, SANS: 1, POUR: 1, ET: 1, OU: 1, PLUS: 1, LOT: 1, PACK: 1, KIT: 1,
  SET: 1, BATTERIE: 1, BATTERIES: 1, CHARGEUR: 1, COFFRET: 1, MACHINES: 1, VOLTS: 1
};
var MILWAUKEE_COMPATIBILITE = /\b(pour|compatible|adapt[ée]|convient|s'adapte)\b/i;

function lireReferenceMilwaukee(titre) {
  var t = String(titre || '');
  if (!t) return null;
  var m = MILWAUKEE_ARTICLE_10.exec(t);
  if (m) return { ref: m[1], forme: 'article10', porteConditionnement: false };
  m = MILWAUKEE_ARTICLE_8.exec(t);
  if (m) return { ref: m[1], forme: 'article8', porteConditionnement: false };
  /* ⛔ Le même numéro à huit chiffres, groupé par tirets — NORMALISÉ vers la
     même identité, sinon le même article compterait pour deux produits. */
  m = MILWAUKEE_ARTICLE_TIRETS.exec(t);
  if (m) return { ref: m[1] + m[2] + m[3], forme: 'article8', porteConditionnement: false };
  /* ⛔ La plateforme ne vaut identité que si le titre ne la désigne pas comme
     une compatibilité. Sans cette garde, tout accessoire volerait la
     référence de la machine sur laquelle il se monte. */
  if (MILWAUKEE_COMPATIBILITE.test(t)) return null;
  m = MILWAUKEE_PLATEFORME.exec(t);
  if (m && !MILWAUKEE_GAMMES[m[2]] && !MILWAUKEE_MOTS_FR[m[2]]) {
    /* On normalise en retirant espaces et tirets : « M18 BHG -502C » et
       « M18BHG502C » désignent le même article, et deux écritures d'une même
       référence ne doivent jamais compter pour deux produits. */
    return {
      ref: m[1].replace(/[\s-]+/g, ''),
      forme: 'plateforme',
      porteConditionnement: true,
      suffixe: (m[3] || '').replace(/\s+/g, '') || null
    };
  }
  return null;
}

/* ══ CE QUE LE SUFFIXE MILWAUKEE DIT DU CONTENU DE LA BOÎTE ═════════════════
   *Écrit le 13/08/2026, après mesure sur le relevé de l'user ET recoupement
   Web. C'est de l'ARGENT : ce que dit ce suffixe décide d'un coût.
   Restauré à l'identique le lendemain, après la perte du bac de travail dans
   une réinitialisation de session — le premier gravage n'avait pas été poussé.*

   ⛔⛔ LE FAIT QUI COMMANDE TOUT, VÉRIFIÉ AVANT D'ÉCRIRE UNE LIGNE :
   **cette marque ne publie AUCUNE légende officielle de ses suffixes.** Ce qui
   fait foi, c'est la liste « In the Box » de chaque fiche. Encoder une
   grammaire déduite « parce qu'elle a l'air logique » reviendrait à inventer
   une règle qui décide d'un contenu, donc d'un coût, donc d'un prix de vente —
   exactement ce que M-03 et M-04 interdisent.
   ⇒ On n'encode QUE ce qui est recoupé. Tout le reste est REFUSÉ.

   ── CE QUI EST RECOUPÉ, ET PAR COMBIEN DE SOURCES ────────────────────────
   · `-502X` = **2 batteries 5,0 Ah + chargeur + HD Box** — cinq revendeurs
     indépendants le décrivent identiquement (deux britanniques, un polonais,
     deux français).
   · `-502C` = **les mêmes 2 batteries 5,0 Ah + chargeur**, mais en **coffret
     standard** au lieu du HD Box (deux revendeurs français).
     ⇒ **LA LETTRE FINALE NE CHANGE QUE LA CAISSE, JAMAIS LES BATTERIES.**
     C'est ce qui compte pour l'argent : un coffret est presque toujours fourni
     avec la machine et ne se vend pas seul, alors qu'une batterie vaut des
     dizaines d'euros pièce.
   · `-0` = **outil NU** — et c'est de loin la forme la plus fréquente.

   ── CE QUE SON RELEVÉ MESURE (67 pages, 3 929 produits distincts) ──────────
   Sur les 747 produits dont la référence porte un conditionnement :
     · `0` suivi d'une lettre .... 404 produits, 176 867 € — des outils NUS ;
     · forme `<capacité>0<nombre>`  une centaine — 201, 202, 301, 302, 401,
       402, 501, 502, 504, 602, 802… toutes cohérentes entre elles ;
     · formes ambiguës ........... une trentaine — 422, 522, 523, 533, 624,
       310, 506, 120, 121, 122, 820. Elles ne se lisent PAS avec la même règle
       (deux capacités mêlées ? une capacité à deux chiffres ?) et **aucune
       source ne tranche**. Elles sont REFUSÉES, et c'est dit.

   ⛔ POURQUOI LE REFUS EST LE BON CHOIX : un suffixe mal lu invente des
   batteries qui ne sont pas dans la boîte, ou en oublie. Dans un sens le coût
   de la machine nue déduite s'effondre — vente à perte ; dans l'autre il
   gonfle — ventes perdues. Refuser coûte une fiche non renseignée : ça se
   voit, ça se corrige, et ça ne coûte pas d'argent (sens sûr, M-11).

   ⚠️ ET LE TITRE GARDE LE DERNIER MOT (M-48). Mesuré sur son relevé : un outil
   dont le suffixe dit NU est vendu « + 1 batterie 12 V 2 Ah + chargeur ». Le
   suffixe dit ce que le FABRICANT met dans la boîte ; le titre dit ce que le
   VENDEUR expédie, et c'est le titre qui engage. Cette fonction ne décrit donc
   que la RÉFÉRENCE : elle ne contredit jamais le titre, et le parseur continue
   d'écarter une annonce qui ajoute du contenu à une référence nue.

   ⛔ SÉPARATION DES MARQUES (M-28) : cette table est celle de CETTE marque et
   d'aucune autre. La garde est en tête de fonction, et la porte
   `check-separation-marques` exige de la voir là où elle s'applique. */
var MILWAUKEE_SUFFIXE_NU = /^0([A-Z])?$/;
var MILWAUKEE_SUFFIXE_BATTERIES = /^([1-9])0([0-9])([A-Z])?$/;

function lireSuffixeMilwaukee(suffixe, marque) {
  /* ⛔ MARQUE OBLIGATOIRE : sans la garde, les suffixes d'une AUTRE marque
     seraient lus avec cette table — et « 502 » n'y veut pas dire la même
     chose. C'est le défaut M-28, et son sens fait vendre à perte. */
  if (!/^milwaukee$/i.test(String(marque || '').replace(/[\s-]/g, ''))) return null;
  var s = String(suffixe || '').toUpperCase().replace(/[\s-]/g, '');
  if (!s) return null;

  var nu = MILWAUKEE_SUFFIXE_NU.exec(s);
  if (nu) {
    return { nbBatteries: 0, ah: null, chargeur: false, nu: true,
      coffret: nu[1] || null, suffixe: s, recoupe: true };
  }
  var b = MILWAUKEE_SUFFIXE_BATTERIES.exec(s);
  if (b) {
    var ah = parseInt(b[1], 10);
    var nb = parseInt(b[2], 10);
    /* ⚠️ Une capacité annoncée avec ZÉRO batterie n'a pas de sens : c'est le
       signe qu'on est sur une autre grammaire (« 820 », « 120 »). On refuse,
       plutôt que de rendre un contenu vide qui passerait pour un outil nu —
       et un outil nu, c'est un coût bien plus bas. */
    if (!(nb >= 1)) return null;
    return { nbBatteries: nb, ah: ah, chargeur: true, nu: false,
      coffret: b[3] || null, suffixe: s, recoupe: true };
  }
  /* ⛔ TOUT LE RESTE EST REFUSÉ — un refus se lit, il ne se devine pas. */
  return null;
}

/* ── TÊTES CONNUES, TOUTES MARQUES ────────────────────────────────────────────
   L'union des tables de préfixes : le parseur (teteConnue) demande seulement
   « cette tête est-elle une famille de références connue ? » — la réponse doit
   couvrir CHAQUE marque traquée, sinon une réf à tiret sans chiffre de la
   nouvelle marque est perdue (TR-009 : la marque s'ajoute par une TABLE,
   jamais en dupliquant le parseur). */
var TETES_CONNUES = {};
/* ⛔ TÊTES DE 3 LETTRES AU MOINS. Mesuré (porte check-classer-idealo) : les
   têtes de DEUX lettres de Makita (HS, HP, HM…) faisaient passer « HSS-G »
   — une nuance d'acier, pas une référence — pour un candidat, et une offre à
   référence unique en montrait deux. Le secours teteConnue ne sert qu'aux
   réfs À TIRET SANS CHIFFRE : dans le catalogue mesuré, aucune n'a une tête
   de deux lettres — on ne perd rien, on ferme le faux positif. */
Object.keys(PREFIXES_DEWALT).forEach(function (k) { if (k.length >= 3) TETES_CONNUES[k] = 1; });
Object.keys(PREFIXES_MAKITA).forEach(function (k) { if (k.length >= 3) TETES_CONNUES[k] = 1; });

/* Un T ajouté APRÈS le code batterie signale le coffret TSTAK :
   « DCK368P3T » = 3 batteries 5,0 Ah + TSTAK. */
var SUFFIXE_COFFRET = 'T';
/* Extensions régionales — elles ne changent RIEN au contenu, seulement le
   marché visé. Deux annonces qui ne diffèrent que par là sont le MÊME
   article, et c'est ce qui permet de les rapprocher sans risque. */
var EXTENSIONS_REGION = {
  '-XJ': 'Europe continentale', '-QW': 'Europe, outil sans fil',
  '-QS': 'Europe, outil filaire', '-GB': 'Royaume-Uni',
  '-LX': '110 V chantier', '-B1': 'autre marché', '-QZ': 'accessoire Europe'
};

/* ── GAMMES ET PLATEFORMES ───────────────────────────────────────────────
   Source : dewalt.co.uk/systems. La gamme commande la compatibilité des
   batteries, donc le prix d'un lot : un FlexVolt 54 V ne se compare pas à
   un 18 V XR, même si tout le reste concorde. */
var GAMMES = {
  'XR FLEXVOLT': { marque: 'DEWALT', volts: 54, note: 'bascule 18/54 V selon l\'outil' },
  FLEXVOLT:      { marque: 'DEWALT', volts: 54, note: '54 V, se rétrograde en 18 V' },
  POWERSTACK:    { marque: 'DEWALT', volts: 18, note: 'cellules pochette : plus dense, plus légère' },
  POWERDETECT:   { marque: 'DEWALT', note: 'l\'outil adapte sa puissance à la batterie' },
  ATOMIC:        { marque: 'DEWALT', volts: 18, note: 'gamme compacte' },
  XTREME:        { marque: 'DEWALT', volts: 12, note: 'sub-compact 12 V' },
  XR:            { marque: 'DEWALT', volts: 18, note: 'plateforme 18 V la plus large' },
  LXT:           { marque: 'MAKITA', volts: 18 },
  CXT:           { marque: 'MAKITA', volts: 12 },
  XGT:           { marque: 'MAKITA', volts: 40, note: '40 V Max, incompatible LXT' }
};

/* ── EMMANCHEMENTS ───────────────────────────────────────────────────────
   Source : hellertools.fr, bricozor.com. ⛔ SDS-plus et SDS-max NE SONT PAS
   interchangeables : queue Ø 10 mm à 2 rainures contre Ø 18 mm à 3 rainures.
   Deux forets de même diamètre et d'emmanchement différent sont deux
   articles, et leurs prix n'ont rien à voir. */
var EMMANCHEMENTS = {
  'SDS-MAX':       ['sds-max', 'sds max'],
  'SDS-PLUS':      ['sds-plus', 'sds plus', 'sds+'],
  'SDS-QUICK':     ['sds-quick', 'sds quick'],
  'SDS':           ['sds'],
  'HEX 1/4':       ['hexagonal 1/4', 'hex 1/4', 'six pans 1/4'],
  'HEXAGONAL':     ['hexagonal', 'six pans', '6 pans'],
  'CYLINDRIQUE':   ['cylindrique', 'queue lisse', 'queue ronde'],
  'QUEUE T':       ['queue t', 'emmanchement t', 't-shank'],
  'QUEUE U':       ['queue u', 'emmanchement u', 'u-shank'],
  'STARLOCK':      ['starlock', 'starlock plus', 'starlock max'],
  'E-CUT':         ['e-cut', 'ecut'],
  'MOYEU DEPORTE': ['moyeu déporté'],
  'M14':           ['m14'],
  'M16':           ['m16']
};

/* ── NUANCES DE COUPE ────────────────────────────────────────────────────
   Elles pèsent plus lourd sur le prix que la marque : un foret HSS-Co coûte
   couramment le double d'un HSS ordinaire, à diamètre identique. */
var NUANCES = {
  'HSS-CO':    ['hss-co', 'hss co', 'hssco', 'cobalt'],
  'HSS-G':     ['hss-g', 'hss g', 'hss rectifié'],
  'HSS-TIN':   ['hss-tin', 'nitrure de titane', 'titane'],
  'HSS':       ['hss', 'acier rapide'],
  'HCS':       ['hcs', 'acier au carbone'],
  'BIM':       ['bim', 'bi-métal', 'bi metal', 'bimétal'],
  'CARBURE':   ['carbure', 'carbure de tungstène', 'tct', 'widia'],
  'DIAMANT':   ['diamant', 'diamanté'],
  'CERAMIQUE': ['céramique'],
  'ZIRCONIUM': ['zirconium', 'zircone'],
  'CORINDON':  ['corindon', 'oxyde d\'aluminium']
};

/* ── MATIÈRES TRAVAILLÉES ────────────────────────────────────────────────
   Le plus SPÉCIFIQUE gagne : « bois dur » avant « bois », sans quoi une lame
   à bois dur serait confondue avec une lame à bois tendre — deux prix. */
var MATIERES = [
  'multi-matériaux', 'cloison sèche', 'bois avec clous', 'bois dur', 'bois tendre',
  'bois', 'aggloméré', 'mélaminé', 'contreplaqué', 'stratifié',
  'inox', 'acier', 'fonte', 'aluminium', 'cuivre', 'métal', 'tôle',
  'béton armé', 'béton', 'pierre', 'brique', 'parpaing', 'carrelage', 'faïence',
  'plexiglas', 'pvc', 'plastique', 'placo', 'plâtre', 'fibrociment'
];

/* ── EMPREINTES DE VISSAGE ───────────────────────────────────────────────
   Source : infos.wurth.fr, bricozor.com. Pozidriv se décline PZ0 à PZ4,
   Torx TX10 à TX50, hexagonal HEX2 à HEX8. ⚠️ PH et PZ se ressemblent et ne
   sont PAS interchangeables — un embout PH dans une vis PZ arrondit la tête. */
var EMPREINTES = {
  'PZ':  ['pozidriv', 'pz'],
  'PH':  ['phillips', 'ph', 'cruciforme'],
  'TXP': ['torx plus', 'resistorx', 'tampertorx', 'torx security'],
  'TX':  ['torx', 'tx', 't-star', 'étoile'],
  'HEX': ['allen', 'hex'],
  'SQ':  ['carré', 'robertson', 'square'],
  'SL':  ['fente', 'plat', 'slotted'],
  'TRI': ['tri-wing', 'triangulaire'],
  'SPL': ['spline', 'cannelé', '12 pans']
};

/* ── FORMES DE DISQUE — EN 12413 ─────────────────────────────────────────
   Source : dépliant de sécurité FEPA (fepa-abrasives.org) + manomano.fr.
   ⚠️ Le marquage EN 12413 comporte douze éléments obligatoires, dont la
   vitesse maximale ET UNE DATE DE PÉREMPTION : un disque abrasif se périme.
   Ce n'est pas un détail de vocabulaire, c'est une contrainte de stock. */
var FORMES_DISQUE = {
  'TYPE 27': ['type 27', 'moyeu déporté', 'à ébarber'],
  'TYPE 41': ['type 41', 'tronçonnage plat'],
  'TYPE 42': ['type 42', 'tronçonnage à moyeu déporté'],
  'TYPE 1':  ['type 1', 'meule droite']
};
/* Alésage standard des disques de meuleuse d'angle. */
var ALESAGE_MEULEUSE_MM = 22.23;

/* ── GRAINS D'ABRASIF — FEPA 42-1:2006 ───────────────────────────────────
   Source : carross.eu, lecoinducarrossier.fr.
     P12–P40 ..... arrachement de matière, décapage
     P50–P120 .... ponçage courant
     P150–P320 ... lissage avant finition, mastics
     P360–P2500 .. finition très fine, apprêts et vernis
   Disques à lamelles (FEPA 42-1) : 16–24 grossier, 30–60 moyen, 80–100 fin. */
var GRAINS_ABRASIFS = { grossier: [12, 40], courant: [50, 120], lissage: [150, 320], finition: [360, 2500] };

/* ── DENTURES DE LAME ────────────────────────────────────────────────────
   Source : manomano.fr, blog.berner.eu. Le nombre de dents ET la géométrie
   font le prix : 24 dents pour le débit rapide, 48–60 pour la finition.
   Angle POSITIF pour le bois, NÉGATIF pour l'aluminium et le mélaminé. */
var DENTURES = {
  'ATB':      ['atb', 'denture alternée', 'biseau alterné', 'alternée'],
  'HI-ATB':   ['hi-atb', 'atb renforcée'],
  'TCG':      ['tcg', 'denture trapézoïdale', 'trapézoïdale'],
  'FTG':      ['ftg', 'denture plate'],
  'NEGATIVE': ['angle négatif', 'négative'],
  'POSITIVE': ['angle positif', 'positive']
};

/* ── NORMES EPI ══════════════════════════════════════════════════════════
   ⛔ VÉRIFIÉES EN LIGNE LE 03/08/2026, PAS CITÉES DE MÉMOIRE. La révision
   2022 d'EN ISO 20345 a ajouté S6 et S7 et les suffixes S / L : de mémoire
   j'aurais rendu S1 à S3 et rien d'autre, donc faux.
   ⚠️ Ce tableau DÉSIGNE où vérifier ; il n'est pas une source de droit. */
var NORMES_EPI = {
  // ─ Chaussures — EN ISO 20345:2022 (s24.fr, officina.shop)
  SB:   { norme: 'EN ISO 20345', note: 'exigences de base, embout résistant' },
  S1:   { norme: 'EN ISO 20345', note: 'SB + arrière fermé, antistatique, absorption au talon' },
  S1P:  { norme: 'EN ISO 20345', note: 'S1 + semelle anti-perforation' },
  S1PS: { norme: 'EN ISO 20345:2022', note: 'S1P, plaque textile, essai pointe 3 mm' },
  S1PL: { norme: 'EN ISO 20345:2022', note: 'S1P, plaque textile, essai pointe 4,5 mm' },
  S2:   { norme: 'EN ISO 20345', note: 'S1 + résistance à l\'eau de la tige' },
  S3:   { norme: 'EN ISO 20345', note: 'S2 + anti-perforation + semelle à crampons' },
  S3S:  { norme: 'EN ISO 20345:2022', note: 'S3, plaque textile, essai pointe 3 mm' },
  S3L:  { norme: 'EN ISO 20345:2022', note: 'S3, plaque textile, essai pointe 4,5 mm' },
  S4:   { norme: 'EN ISO 20345', note: 'bottes polymère, antistatique' },
  S5:   { norme: 'EN ISO 20345', note: 'S4 + anti-perforation + crampons' },
  S6:   { norme: 'EN ISO 20345:2022', note: 'NOUVEAU 2022 — S2 + étanchéité totale WR' },
  S7:   { norme: 'EN ISO 20345:2022', note: 'NOUVEAU 2022 — S3 + étanchéité totale WR' },
  S7S:  { norme: 'EN ISO 20345:2022', note: 'S7, essai pointe 3 mm' },
  S7L:  { norme: 'EN ISO 20345:2022', note: 'S7, essai pointe 4,5 mm' },
  SRA:  { norme: 'EN ISO 20345', note: 'antidérapant — carrelage + détergent' },
  SRB:  { norme: 'EN ISO 20345', note: 'antidérapant — acier + glycérine' },
  SRC:  { norme: 'EN ISO 20345', note: 'SRA + SRB' },
  WR:   { norme: 'EN ISO 20345', note: 'chaussure entièrement étanche' },
  WRU:  { norme: 'EN ISO 20345', note: 'tige résistante à l\'eau' },
  HRO:  { norme: 'EN ISO 20345', note: 'semelle résistante à la chaleur de contact' },
  HI:   { norme: 'EN ISO 20345', note: 'isolation contre la chaleur' },
  CI:   { norme: 'EN ISO 20345', note: 'isolation contre le froid' },
  ESD:  { norme: 'IEC 61340', note: 'décharge électrostatique' },
  // ─ Mains — EN 388 / EN ISO 21420 (mer.fr, protection-des-mains.com)
  'EN 388':       { note: 'risques mécaniques — 4 chiffres : abrasion, coupure, déchirure, perforation ; puis une lettre A→F pour la coupure ISO 13997' },
  'EN ISO 21420': { note: 'exigences générales des gants (remplace EN 420)' },
  'EN 374':       { note: 'risques chimiques et micro-organismes' },
  'EN 511':       { note: 'protection contre le froid' },
  'EN 407':       { note: 'chaleur et feu' },
  // ─ Tête — EN 397 / EN 12492 / EN 812 (abisco.fr, modyf.fr)
  'EN 397':   { note: 'casque de chantier — chute d\'objets, essai 5 kg à 1 m' },
  'EN 12492': { note: 'casque de travaux en hauteur — chocs multi-directionnels' },
  'EN 812':   { note: 'casquette anti-heurt — protection LIMITÉE, ce n\'est PAS un casque' },
  // ─ Yeux — EN 166
  'EN 166': { note: 'protection individuelle de l\'œil' },
  'EN 169': { note: 'filtres pour le soudage' },
  'EN 172': { note: 'filtres solaires à usage professionnel' },
  // ─ Auditif — EN 352
  'EN 352': { note: 'protecteurs auditifs : coquilles, bouchons, serre-tête' },
  // ─ Respiratoire — EN 149 (inrs.fr)
  FFP1:     { norme: 'EN 149', note: 'filtre ≥ 80 % des aérosols de 0,6 µm' },
  FFP2:     { norme: 'EN 149', note: 'filtre ≥ 94 %' },
  FFP3:     { norme: 'EN 149', note: 'filtre ≥ 99 %' },
  'EN 149': { note: 'demi-masques filtrants jetables' },
  // ─ Vêtements
  'EN ISO 20471': { note: 'signalisation haute visibilité, classes 1 à 3' },
  'EN 343':       { note: 'protection contre la pluie' },
  'EN 342':       { note: 'ensembles contre le froid' },
  'EN ISO 11612': { note: 'chaleur et flamme' },
  'EN ISO 11611': { note: 'vêtements de soudage' },
  // ─ Hauteur
  'EN 361': { note: 'harnais d\'antichute' },
  'EN 355': { note: 'absorbeurs d\'énergie' },
  'EN 354': { note: 'longes' },
  'EN 795': { note: 'dispositifs d\'ancrage' },
  // ─ Genoux
  'EN 14404': { note: 'protège-genoux pour le travail à genoux' }
};

/* ── TAILLES ─────────────────────────────────────────────────────────────
   Trois échelles qui n'ont RIEN à voir, et qu'un extracteur naïf mélange :
   un « 43 » est une pointure, un « 9 » une taille de gant, un « XL » une
   taille de vêtement. Les confondre apparie deux articles différents — et
   deux articles différents ont deux prix. */
var TAILLES_VETEMENT = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
var TAILLES_VETEMENT_FR = [38, 64];   // bornes incluses, pas de 2
var POINTURES = [35, 52];             // bornes incluses
var TAILLES_GANT = [6, 12];           // bornes incluses

/* ── CONDITIONNEMENTS ────────────────────────────────────────────────────
   « Coffret DE 29 forets » : le mot désigne l'EMBALLAGE, pas l'article. */
var CONDITIONNEMENTS = ['coffret', 'lot', 'pack', 'jeu', 'set', 'assortiment', 'boîte', 'boite',
  'paquet', 'blister', 'sachet', 'carton', 'seau', 'recharge'];

/* ── ÉTATS DE LIVRAISON ──────────────────────────────────────────────────
   Toutes les façons dont un fournisseur écrit « sans batterie ». Chacune
   vaut nbBatteries = 0, et c'est une INFORMATION, pas une absence. */
var MACHINE_NUE = ['outil nu', 'machine nue', 'machine seule', 'produit seul', 'solo',
  'sans batterie', 'sans batterie ni chargeur', 'body only', 'bare tool'];

/* ══ INDEX APLATI, PRÊT POUR LE PARSEUR ═══════════════════════════════════
   Une seule liste {famille, rayon, type, libelle}, tous synonymes dépliés.
   Le parseur n'a plus qu'à retenir la correspondance la plus LONGUE.
   ⛔ Construit une fois au chargement du module, jamais à chaque appel : il
   y a plusieurs centaines d'entrées et l'extracteur tourne sur chaque ligne
   d'une page de soixante produits.
   ⚠️ Un rayon inconnu fait ÉCHOUER le chargement, exprès. Une nomenclature
   à moitié valide qui se charge quand même est pire qu'une porte morte : le
   parseur typerait dans le vide sans que rien ne le dise. */
/* Rend ce que le PRÉFIXE d'une référence dit de l'article, ou null. La
   lecture va du préfixe le plus long au plus court : « DCMST922N » doit
   donner DCMST (débroussailleuse), pas DCM. */
function prefixeDeReference(ref) {
  var r = String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (var i = 0; i < PREFIXES_DEWALT_ORDRE.length; i++) {
    var p = PREFIXES_DEWALT_ORDRE[i];
    if (r.indexOf(p) === 0) {
      var d = PREFIXES_DEWALT[p];
      return { prefixe: p, famille: d.famille, rayon: d.rayon || null, type: d.type || null,
        incertain: !!d.incertain };
    }
  }
  return null;
}

function construireIndex() {
  var index = [];
  for (var i = 0; i < TYPES.length; i++) {
    var rayon = TYPES[i][0], canonique = TYPES[i][1], ecritures = TYPES[i][2];
    var def = RAYONS[rayon];
    if (!def) throw new Error('nomenclature : rayon inconnu « ' + rayon + ' » pour « ' + canonique + ' »');
    for (var j = 0; j < ecritures.length; j++) {
      index.push({ famille: def.famille, rayon: rayon, type: canonique, libelle: ecritures[j] });
    }
  }
  return index;
}
var INDEX = construireIndex();

/* Les mesures autorisées dans un rayon. Rend `null` si le rayon est inconnu
   — et `null` ne veut PAS dire « aucune » : l'appelant doit décider, pas
   supposer. C'est pourquoi `mesureAutorisee` laisse tout passer dans ce cas
   plutôt que de tout bloquer : un rayon manquant est un trou de vocabulaire,
   pas une raison de perdre des mesures justes. */
function mesuresDuRayon(rayon) {
  var def = RAYONS[rayon];
  return def ? def.mesures : null;
}
function mesureAutorisee(rayon, cle) {
  var m = mesuresDuRayon(rayon);
  return m ? m.indexOf(cle) !== -1 : true;
}

module.exports = {
  FAMILLES: FAMILLES, RAYONS: RAYONS, TYPES: TYPES, MESURES: MESURES, INDEX: INDEX,
  SUFFIXES_DEWALT: SUFFIXES_DEWALT, SUFFIXES_MAKITA: SUFFIXES_MAKITA, lireSuffixeMakita: lireSuffixeMakita, SUFFIXE_COFFRET: SUFFIXE_COFFRET,
  BATTERIES_DEWALT: BATTERIES_DEWALT, MARQUEURS_DEWALT: MARQUEURS_DEWALT,
  lireSuffixeDewalt: lireSuffixeDewalt,
  PREFIXES_DEWALT: PREFIXES_DEWALT, PREFIXES_DEWALT_ORDRE: PREFIXES_DEWALT_ORDRE,
  PREFIXES_MAKITA: PREFIXES_MAKITA, PREFIXES_MAKITA_ORDRE: PREFIXES_MAKITA_ORDRE,
  FORMES_MAKITA: FORMES_MAKITA, formeReferenceMakita: formeReferenceMakita,
  lireReferenceMilwaukee: lireReferenceMilwaukee,
  lireSuffixeMilwaukee: lireSuffixeMilwaukee,
  MILWAUKEE_SUFFIXE_NU: MILWAUKEE_SUFFIXE_NU,
  MILWAUKEE_SUFFIXE_BATTERIES: MILWAUKEE_SUFFIXE_BATTERIES,
  PREFIXES_DISTRIBUTEUR_MAKITA: PREFIXES_DISTRIBUTEUR_MAKITA,
  refSansPrefixeDistributeur: refSansPrefixeDistributeur,
  TETES_CONNUES: TETES_CONNUES,
  prefixeDeReference: prefixeDeReference,
  EXTENSIONS_REGION: EXTENSIONS_REGION, GAMMES: GAMMES,
  EMMANCHEMENTS: EMMANCHEMENTS, NUANCES: NUANCES, MATIERES: MATIERES,
  EMPREINTES: EMPREINTES, FORMES_DISQUE: FORMES_DISQUE, DENTURES: DENTURES,
  ALESAGE_MEULEUSE_MM: ALESAGE_MEULEUSE_MM, GRAINS_ABRASIFS: GRAINS_ABRASIFS,
  NORMES_EPI: NORMES_EPI, TAILLES_VETEMENT: TAILLES_VETEMENT,
  TAILLES_VETEMENT_FR: TAILLES_VETEMENT_FR, POINTURES: POINTURES, TAILLES_GANT: TAILLES_GANT,
  CONDITIONNEMENTS: CONDITIONNEMENTS, MACHINE_NUE: MACHINE_NUE,
  mesuresDuRayon: mesuresDuRayon, mesureAutorisee: mesureAutorisee
};
