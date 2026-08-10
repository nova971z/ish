/* Banc de reconnaissance MAKITA — rejouable, mesure le taux et NOMME les causes. */
var fs=require("fs"),path=require("path");
var R=process.argv[2], DIR=process.argv[3];
var pp=require(path.join(R,"api/_lib/price-parse.js"));
var prods=JSON.parse(fs.readFileSync(path.join(R,"products.json")));
var arr=Array.isArray(prods)?prods:prods.products;
var mk=arr.filter(function(p){return String(p.brand||"").toUpperCase()==="MAKITA";});
var norm=function(s){return String(s).toUpperCase().replace(/[^A-Z0-9]/g,"");};

// ── ce que le balayage a VU
var apparies={},unknown=[],rejets=[];
fs.readdirSync(DIR).filter(function(f){return /\.json$/.test(f);}).forEach(function(fn){
  var j=JSON.parse(fs.readFileSync(path.join(DIR,fn)));
  (j.applied||[]).concat(j.unchanged||[]).forEach(function(a){if(a&&a.sku)apparies[norm(a.sku)]=1;});
  (j.unknown||[]).forEach(function(u){if(u&&u.sku)unknown.push(u);});
  (j.sansRef||[]).forEach(function(e){if(e&&e.titre)rejets.push(e);});
});

// ── tentative d'appariement des rejets par le code ACTUEL
var recolle=pp.apparierParRefRecollee(rejets,arr,"MAKITA");
recolle.items.forEach(function(i){apparies[norm(i.sku)]=1;});

// ── bilan
var vus=mk.filter(function(p){return apparies[norm(p.sku)];});
var manquants=mk.filter(function(p){return !apparies[norm(p.sku)];});

// ── POURQUOI chaque manquant manque : on classe par cause
var unkParRef={};unknown.forEach(function(u){unkParRef[norm(u.sku)]=u;});
var clesUnk=Object.keys(unkParRef);
var causes={};
function ajout(c,p,det){(causes[c]=causes[c]||[]).push({sku:p.sku,det:det});}
manquants.forEach(function(p){
  var k=norm(p.sku);
  // (a) une reference de MEME RACINE est vue (suffixe de conditionnement different)
  if(k.length>=6){
    var pref=k.slice(0,6);
    var cand=clesUnk.filter(function(c){return c.indexOf(pref)===0;});
    if(cand.length){ajout("A_suffixe_different",p,cand.slice(0,3).join(","));return;}
  }
  // (b) sa reference apparait dans un titre rejete
  var dansRejet=rejets.filter(function(e){return k.length>=5&&norm(e.titre).indexOf(k)!==-1;});
  if(dansRejet.length){ajout("B_dans_titre_rejete",p,String(dansRejet[0].titre).slice(0,44));return;}
  // (c) nulle part
  ajout("C_absent_des_pages",p,"");
});

console.log("═══ BANC MAKITA ═══");
console.log("fiches au catalogue : "+mk.length);
console.log("RECONNUES           : "+vus.length+"  ("+(vus.length/mk.length*100).toFixed(1)+" %)");
console.log("manquantes          : "+manquants.length);
console.log("");
Object.keys(causes).sort().forEach(function(c){
  console.log("  "+c+" : "+causes[c].length);
});
if(process.argv[4]==="--detail"){
  console.log("");
  Object.keys(causes).sort().forEach(function(c){
    console.log("── "+c+" ──");
    causes[c].slice(0,12).forEach(function(x){console.log("   "+String(x.sku).padEnd(15)+x.det);});
  });
}
