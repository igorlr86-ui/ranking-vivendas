/* Arquivo gerado por apps-script/build.py — não edite à mão. */

/*
 * Ranking Vivendas da Mata — sorteio verificável.
 *
 * Este arquivo é usado igualzinho em dois lugares:
 *   - no navegador (página do ranking), para qualquer pessoa conferir o sorteio;
 *   - no Google Apps Script (backend), que faz o sorteio oficial.
 * Por isso só usa JavaScript puro, sem nada específico de navegador.
 *
 * O resultado depende apenas de:
 *   1) o número público do drand (rede quicknet) da rodada marcada para a semana;
 *   2) as listas de jogadores da semana;
 *   3) o histórico das semanas anteriores (quem já caiu com quem; quem já folgou).
 */
var Sorteio = (function () {
  "use strict";

  /* ---------- drand ---------- */
  var DRAND_CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
  var DRAND_GENESIS = 1692803367; // segundos (UTC)
  var DRAND_PERIOD = 3;
  function drandRound(unixSeconds) { return Math.floor((unixSeconds - DRAND_GENESIS) / DRAND_PERIOD) + 1; }
  function drandRoundTime(round) { return DRAND_GENESIS + (round - 1) * DRAND_PERIOD; }
  function drandUrl(round) { return "https://api.drand.sh/" + DRAND_CHAIN + "/public/" + round; }

  /* ---------- SHA-256 (implementação própria) ---------- */
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function sha256Bytes(bytes) {
    var l = bytes.length, bl = ((l + 9 + 63) >> 6) << 6, b = new Array(bl), i;
    for (i = 0; i < bl; i++) b[i] = 0;
    for (i = 0; i < l; i++) b[i] = bytes[i] & 255;
    b[l] = 0x80;
    var bits = l * 8, hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
    b[bl - 8] = (hi >>> 24) & 255; b[bl - 7] = (hi >>> 16) & 255; b[bl - 6] = (hi >>> 8) & 255; b[bl - 5] = hi & 255;
    b[bl - 4] = (lo >>> 24) & 255; b[bl - 3] = (lo >>> 16) & 255; b[bl - 2] = (lo >>> 8) & 255; b[bl - 1] = lo & 255;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
    function r(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var o = 0; o < bl; o += 64) {
      for (i = 0; i < 16; i++) W[i] = ((b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3]) >>> 0;
      for (i = 16; i < 64; i++) {
        var s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      var a = H[0], c = H[1], d = H[2], e = H[3], f = H[4], g = H[5], h = H[6], k = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = r(f, 6) ^ r(f, 11) ^ r(f, 25), ch = (f & g) ^ (~f & h), t1 = (k + S1 + ch + K[i] + W[i]) >>> 0;
        var S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & c) ^ (a & d) ^ (c & d), t2 = (S0 + mj) >>> 0;
        k = h; h = g; g = f; f = (e + t1) >>> 0; e = d; d = c; c = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + c) >>> 0; H[2] = (H[2] + d) >>> 0; H[3] = (H[3] + e) >>> 0;
      H[4] = (H[4] + f) >>> 0; H[5] = (H[5] + g) >>> 0; H[6] = (H[6] + h) >>> 0; H[7] = (H[7] + k) >>> 0;
    }
    var hex = "";
    for (i = 0; i < 8; i++) hex += ("00000000" + H[i].toString(16)).slice(-8);
    return hex;
  }
  function sha256(str) { return sha256Bytes(utf8(str)); }
  function hexToBytes(h) { var out = []; for (var i = 0; i < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16)); return out; }
  function isHex64(s) { return /^[0-9a-f]{64}$/.test(s || ""); }
  /** Confere se o número do drand é mesmo o SHA-256 da assinatura publicada. */
  function beaconOk(randomness, signature) { return isHex64(randomness) && !!signature && sha256Bytes(hexToBytes(signature)) === randomness; }

  /* ---------- gerador pseudoaleatório determinístico (xorshift128) ---------- */
  function Prng(seedText) {
    var h = sha256(seedText), s = [0, 1, 2, 3].map(function (i) { return parseInt(h.substr(i * 8, 8), 16) >>> 0; });
    if (!(s[0] | s[1] | s[2] | s[3])) s[0] = 1;
    this.next = function () {
      var t = s[3], x = s[0];
      s[3] = s[2]; s[2] = s[1]; s[1] = x;
      t ^= t << 11; t >>>= 0; t ^= t >>> 8;
      s[0] = (t ^ x ^ (x >>> 19)) >>> 0;
      return s[0];
    };
    this.int = function (n) { return this.next() % n; }; // n pequeno; viés desprezível e, acima de tudo, determinístico
  }
  function shuffle(arr, prng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = prng.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- formatos dos jogos ---------- */
  // Feminino/Masculino: grupo [p1,p2,p3,p4] → 3 jogos trocando duplas.
  function gamesOf4(p) { return [[[p[0], p[1]], [p[2], p[3]]], [[p[0], p[2]], [p[1], p[3]]], [[p[0], p[3]], [p[1], p[2]]]]; }
  // Mista: grupo [H1,H2,M1,M2] → 2 jogos, sempre 1 homem + 1 mulher por dupla.
  function gamesMista(p) { return [[[p[0], p[2]], [p[1], p[3]]], [[p[0], p[3]], [p[1], p[2]]]]; }
  function gamesFor(cat, players) { return cat === "Mista" ? gamesMista(players) : gamesOf4(players); }
  var LETTERS = "ABCDEFGHIJKLMNOP";

  /* ---------- método v1 (semana 19–25/10/2026) ---------- */
  function orderByHash(rand, cat, names) {
    return names.map(function (n) { return { n: n, h: sha256(rand + "|" + cat + "|" + n) }; })
      .sort(function (x, y) { return x.h < y.h ? -1 : x.h > y.h ? 1 : 0; });
  }
  function drawV1(rand, lists) {
    var out = {};
    ["Feminino", "Masculino"].forEach(function (cat) {
      var o = orderByHash(rand, cat, lists[cat]).map(function (x) { return x.n; }), groups = [];
      for (var i = 0; i + 4 <= o.length; i += 4) groups.push(o.slice(i, i + 4));
      out[cat] = { groups: groups, byes: o.slice(groups.length * 4) };
    });
    var w = orderByHash(rand, "Mista", lists.MistaMulheres).map(function (x) { return x.n; });
    var m = orderByHash(rand, "Mista", lists.MistaHomens).map(function (x) { return x.n; });
    var ng = Math.floor(Math.min(w.length, m.length) / 2), groups = [];
    for (var g = 0; g < ng; g++) groups.push([m[2 * g], m[2 * g + 1], w[2 * g], w[2 * g + 1]]);
    out.Mista = { groups: groups, byes: m.slice(ng * 2).concat(w.slice(ng * 2)) };
    return out;
  }

  /* ---------- histórico ---------- */
  function pk(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
  /** weeks: semanas anteriores, cada uma com draw[cat] = {groups, byes}. */
  function historyFor(cat, weeks) {
    var met = {}, byes = {}, played = {};
    (weeks || []).forEach(function (wk) {
      var d = wk.draw && wk.draw[cat]; if (!d) return;
      (d.groups || []).forEach(function (g) {
        g = g.players || g;
        for (var i = 0; i < g.length; i++) { played[g[i]] = (played[g[i]] || 0) + 1; for (var j = i + 1; j < g.length; j++) { var k = pk(g[i], g[j]); met[k] = (met[k] || 0) + 1; } }
      });
      (d.byes || []).forEach(function (n) { byes[n] = (byes[n] || 0) + 1; });
    });
    return { met: met, byes: byes, played: played };
  }

  /* ---------- método v2 (a partir de 26/10/2026): não repetir quem já se encontrou ---------- */
  // Custo de um grupo: soma, para cada par, do quadrado de quantas vezes já se encontraram.
  function groupCost(g, met) {
    var c = 0;
    for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) { var x = met[pk(g[i], g[j])] || 0; c += x * x; }
    return c;
  }
  function totalCost(groups, met) { var c = 0; for (var i = 0; i < groups.length; i++) c += groupCost(groups[i], met); return c; }

  // Quem folga: quem folgou menos vezes até agora; empate decidido pela ordem do sorteio.
  function pickByes(names, count, hist, rand, cat) {
    if (count <= 0) return [];
    var o = orderByHash(rand, cat + "|folga", names).map(function (x) { return x.n; });
    var pos = {}; o.forEach(function (n, i) { pos[n] = i; });
    var sorted = names.slice().sort(function (a, b) { return ((hist.byes[a] || 0) - (hist.byes[b] || 0)) || (pos[a] - pos[b]); });
    return sorted.slice(0, count);
  }

  // Busca local determinística: várias partidas embaralhadas + trocas que reduzem o custo.
  // slots: para cada posição do grupo, de qual "naipe" ela é (0 = qualquer; na Mista 0 = homem, 1 = mulher).
  function optimize(pools, slotsPerGroup, nGroups, met, prng, restarts) {
    var best = null, bestCost = Infinity;
    for (var r = 0; r < restarts; r++) {
      var shuffled = pools.map(function (p) { return shuffle(p, prng); }), take = pools.map(function () { return 0; });
      var groups = [];
      for (var g = 0; g < nGroups; g++) {
        var grp = [];
        for (var s = 0; s < slotsPerGroup.length; s++) { var pool = slotsPerGroup[s]; grp.push(shuffled[pool][take[pool]++]); }
        groups.push(grp);
      }
      var improved = true, guard = 0;
      while (improved && guard++ < 200) {
        improved = false;
        for (var g1 = 0; g1 < nGroups; g1++) for (var s1 = 0; s1 < slotsPerGroup.length; s1++) {
          for (var g2 = g1 + 1; g2 < nGroups; g2++) for (var s2 = 0; s2 < slotsPerGroup.length; s2++) {
            if (slotsPerGroup[s1] !== slotsPerGroup[s2]) continue;
            var before = groupCost(groups[g1], met) + groupCost(groups[g2], met);
            var a = groups[g1][s1], b = groups[g2][s2];
            groups[g1][s1] = b; groups[g2][s2] = a;
            var after = groupCost(groups[g1], met) + groupCost(groups[g2], met);
            if (after < before) improved = true; else { groups[g1][s1] = a; groups[g2][s2] = b; }
          }
        }
      }
      var cost = totalCost(groups, met);
      if (cost < bestCost) { bestCost = cost; best = groups.map(function (x) { return x.slice(); }); }
      if (bestCost === 0) break;
    }
    return { groups: best || [], cost: bestCost === Infinity ? 0 : bestCost };
  }
  function canonical(groups, mista) {
    // Ordena dentro do grupo (homens primeiro na Mista) e os grupos entre si, só para exibição estável.
    var gs = groups.map(function (g) {
      if (mista) return g.slice(0, 2).sort().concat(g.slice(2, 4).sort());
      return g.slice().sort();
    });
    gs.sort(function (x, y) { return x.join("|") < y.join("|") ? -1 : 1; });
    return gs;
  }
  var RESTARTS = 60;
  function drawV2(rand, lists, previousWeeks) {
    var out = {};
    ["Feminino", "Masculino"].forEach(function (cat) {
      var names = lists[cat].slice(), hist = historyFor(cat, previousWeeks);
      var byes = pickByes(names, names.length % 4, hist, rand, cat);
      var active = names.filter(function (n) { return byes.indexOf(n) < 0; }).sort();
      var res = optimize([active], [0, 0, 0, 0], active.length / 4, hist.met, new Prng(rand + "|" + cat + "|v2"), RESTARTS);
      out[cat] = { groups: canonical(res.groups, false), byes: byes.slice().sort(), repeats: res.cost };
    });
    var hist = historyFor("Mista", previousWeeks), W = lists.MistaMulheres.slice(), M = lists.MistaHomens.slice();
    var ng = Math.floor(Math.min(W.length, M.length) / 2);
    var byesM = pickByes(M, M.length - 2 * ng, hist, rand, "Mista|H"), byesW = pickByes(W, W.length - 2 * ng, hist, rand, "Mista|M");
    var aM = M.filter(function (n) { return byesM.indexOf(n) < 0; }).sort(), aW = W.filter(function (n) { return byesW.indexOf(n) < 0; }).sort();
    var res = optimize([aM, aW], [0, 0, 1, 1], ng, hist.met, new Prng(rand + "|Mista|v2"), RESTARTS);
    out.Mista = { groups: canonical(res.groups, true), byes: byesM.slice().sort().concat(byesW.slice().sort()), repeats: res.cost };
    return out;
  }

  /** Sorteio de uma semana, pelo método registrado nela. */
  function drawWeek(week, previousWeeks, randOverride) {
    var rand = randOverride || week.randomness;
    var d = week.method === "v1" ? drawV1(rand, week.lists) : drawV2(rand, week.lists, previousWeeks);
    ["Feminino", "Masculino", "Mista"].forEach(function (cat) {
      d[cat].groups = d[cat].groups.map(function (g, i) { return { name: "Grupo " + LETTERS[i], players: g }; });
    });
    return d;
  }
  /** Assinatura compacta de um sorteio, para comparar dois resultados. */
  function fingerprint(d) {
    return JSON.stringify(["Feminino", "Masculino", "Mista"].map(function (c) {
      return [d[c].groups.map(function (g) { return g.players || g; }), d[c].byes];
    }));
  }

  return {
    DRAND_CHAIN: DRAND_CHAIN, drandRound: drandRound, drandRoundTime: drandRoundTime, drandUrl: drandUrl,
    sha256: sha256, sha256Bytes: sha256Bytes, hexToBytes: hexToBytes, isHex64: isHex64, beaconOk: beaconOk,
    gamesFor: gamesFor, historyFor: historyFor, drawV1: drawV1, drawV2: drawV2, drawWeek: drawWeek, fingerprint: fingerprint, pk: pk
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Sorteio;


/*
 * Ranking Vivendas da Mata — backend (Google Apps Script, ligado à planilha de códigos).
 *
 * Abas da planilha:
 *   Jogadores  Jogador | Categorias | Código | Mensagem... | Sexo        (códigos NUNCA saem daqui)
 *   Semanas    um sorteio por linha (número público do drand, listas e grupos)
 *   Placares   registro de tudo que foi lançado, confirmado, contestado ou decidido
 *   Config     chave | valor
 */

var TZ = "America/Sao_Paulo";
var CATS = ["Feminino", "Masculino", "Mista"];
var PRIMEIRA_SEMANA_AUTO = "2026-10-26"; // a partir daqui o sorteio é automático (método v2)
var SEMANA_1 = {"id": "2026-10-19", "inicio": "2026-10-19T17:00:00.000Z", "prazo": "2026-10-25T23:00:00.000Z", "rodada": 33208612, "randomness": "8086b0b8cc48275b770f47a24324a43f64ab0369bb73cdf7fe8c88b918bf44ba", "assinatura": "b917b9e20aa064ecbd02e2e0647a20d44345ae7786d6c00246fd23305ed712ef6da425b6d3a28da54f604b66ce6d29c9", "listas": {"Feminino": ["Maria Eduarda Barbieri", "Fernanda Galhardo", "Camila Correa", "Bruna", "Patricia", "Juliana Souza", "Júlia Contin", "Marcela Fiacadori", "Andressa", "Luisa", "Maisa", "Lina", "Daniela", "Victoria de Castro", "Gabi Pires", "Alicia", "Jackeline", "Camila Zorzetto", "Kelem Vilela"], "Masculino": ["Danilo Coqueli", "Marcone Gomes", "Igor Rodrigues", "Doug", "Filipe", "Rafael", "Guide", "Jhonatan", "Edu", "Marcos Bermudes", "Alexandre", "Gabriel Zanato", "Kelner Teodoro", "William", "Evandro", "Marcelo", "Renan", "Mau Pedrosa", "Thiago", "Cassiano", "João Pedro Gomes", "Cristiano Cotrim", "André Bueno", "Guilherme Morais"], "MistaMulheres": ["Fernanda Galhardo", "Maria Eduarda Barbieri", "Camila Correa", "Bruna", "Juliana Souza", "Júlia Contin", "Marcela Fiacadori", "Andressa", "Luisa", "Maiza", "Lina", "Gabi Pires", "Alicia", "Jackeline"], "MistaHomens": ["Igor Rodrigues", "Danilo Coqueli", "Marcone Gomes", "Doug", "Filipe", "Rafael", "Guide", "Alexandre", "Edu", "Marcos Bermudes", "Gabriel Zanato", "Kelner Teodoro", "William", "Evandro", "Marcelo", "Mau Pedrosa", "João Pedro Gomes", "André Bueno", "Cristiano Cotrim"]}, "sorteio": {"Feminino": {"groups": [["Jackeline", "Maisa", "Juliana Souza", "Kelem Vilela"], ["Camila Correa", "Júlia Contin", "Lina", "Daniela"], ["Gabi Pires", "Fernanda Galhardo", "Camila Zorzetto", "Andressa"], ["Luisa", "Victoria de Castro", "Bruna", "Marcela Fiacadori"]], "byes": ["Patricia", "Maria Eduarda Barbieri", "Alicia"]}, "Masculino": {"groups": [["Cassiano", "Rafael", "Evandro", "Edu"], ["Kelner Teodoro", "Thiago", "Marcos Bermudes", "João Pedro Gomes"], ["William", "Guilherme Morais", "André Bueno", "Guide"], ["Igor Rodrigues", "Marcone Gomes", "Filipe", "Renan"], ["Doug", "Cristiano Cotrim", "Gabriel Zanato", "Marcelo"], ["Alexandre", "Danilo Coqueli", "Mau Pedrosa", "Jhonatan"]], "byes": []}, "Mista": {"groups": [["Danilo Coqueli", "Igor Rodrigues", "Camila Correa", "Maiza"], ["Alexandre", "Guide", "Fernanda Galhardo", "Juliana Souza"], ["Mau Pedrosa", "Edu", "Alicia", "Maria Eduarda Barbieri"], ["Cristiano Cotrim", "William", "Luisa", "Bruna"], ["Filipe", "Marcelo", "Andressa", "Lina"], ["Marcone Gomes", "André Bueno", "Marcela Fiacadori", "Gabi Pires"], ["Evandro", "Doug", "Júlia Contin", "Jackeline"]], "byes": ["Kelner Teodoro", "Marcos Bermudes", "Gabriel Zanato", "Rafael", "João Pedro Gomes"]}}}; // preenchido abaixo pelo build com o sorteio de 19/10/2026 (método v1)

/* ================= utilidades de planilha ================= */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name, header) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("A:Z").setNumberFormat("@");
  }
  return sh;
}
// O Google Planilhas converte sozinho textos que parecem data ou número.
// Na escrita, todo valor vai como texto (prefixo '); na leitura, datas convertidas voltam ao formato original.
var DATE_ONLY_COLS = { id: true, semana: true };
function cell_(h, v) {
  if (v === null || v === undefined) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return DATE_ONLY_COLS[h] ? Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), "yyyy-MM-dd") : v.toISOString();
  }
  return String(v);
}
function rows_(sh) {
  var v = sh.getDataRange().getValues();
  var head = v.shift().map(String);
  return v.filter(function (r) { return r.join("") !== ""; }).map(function (r) {
    var o = {}; head.forEach(function (h, i) { o[h] = cell_(h, r[i]); }); return o;
  });
}
function append_(sh, arr) { sh.appendRow(arr.map(function (x) { return "'" + (x === null || x === undefined ? "" : String(x)); })); }
var SEMANAS_HEAD = ["id", "inicio", "prazo", "metodo", "rodada", "randomness", "assinatura", "listas", "sorteio", "criado_em"];
var PLACARES_HEAD = ["quando", "semana", "categoria", "grupo", "jogo", "acao", "jogador", "lado", "games_lado1", "games_lado2", "obs"];
function semanasSheet_() { return sheet_("Semanas", SEMANAS_HEAD); }
function placaresSheet_() { return sheet_("Placares", PLACARES_HEAD); }
var DADOS_HEAD = ["semana", "alvo", "jogador", "chave", "valor", "atualizado_em"];
function dadosSheet_() { return sheet_("Dados", DADOS_HEAD); }
function configSheet_() { return sheet_("Config", ["chave", "valor"]); }
function jogadoresSheet_() {
  var named = ss_().getSheetByName("Jogadores");
  if (named) return named;
  var all = ss_().getSheets();
  for (var i = 0; i < all.length; i++) {
    var head = all[i].getRange(1, 1, 1, Math.max(1, all[i].getLastColumn())).getValues()[0].map(String);
    if (head.indexOf("Código") >= 0) { all[i].setName("Jogadores"); return all[i]; }
  }
  throw new Error("Não encontrei a aba de jogadores (com a coluna Código).");
}
function config_() {
  var o = {}; rows_(configSheet_()).forEach(function (r) { o[r.chave] = r.valor; }); return o;
}
function norm_(s) { return String(s || "").trim(); }

/* ================= instalação (rodar uma vez) ================= */
function setup() {
  var jog = jogadoresSheet_();
  var head = jog.getRange(1, 1, 1, jog.getLastColumn()).getValues()[0].map(String);
  if (head.indexOf("Sexo") < 0) {
    var col = head.length + 1;
    jog.getRange(1, col).setValue("Sexo").setFontWeight("bold");
    var data = jog.getRange(2, 1, jog.getLastRow() - 1, head.length).getValues();
    var iCat = head.indexOf("Categorias"), iNome = head.indexOf("Jogador");
    var out = data.map(function (r) {
      var c = String(r[iCat]), n = String(r[iNome]);
      if (c.indexOf("Feminino") >= 0 || n === "Maiza") return ["F"];
      if (c.indexOf("Masculino") >= 0) return ["M"];
      return [""];
    });
    jog.getRange(2, col, out.length, 1).setValues(out);
  }
  jog.getRange("C:C").setNumberFormat("@");
  semanasSheet_(); placaresSheet_();
  var cfg = config_(), cs = configSheet_();
  if (!cfg.codigo_organizacao) append_(cs, ["codigo_organizacao", String(100000 + Math.floor(Math.random() * 900000))]);
  if (!cfg.sem_validacao) append_(cs, ["sem_validacao", "aceitar"]);
  if (!cfg.semanas_por_rodada) append_(cs, ["semanas_por_rodada", "2"]);
  colunaJogadores_("E-mail");
  if (SEMANA_1 && !rows_(semanasSheet_()).some(function (r) { return r.id === SEMANA_1.id; })) {
    append_(semanasSheet_(), [SEMANA_1.id, SEMANA_1.inicio, SEMANA_1.prazo, "v1", String(SEMANA_1.rodada), SEMANA_1.randomness, SEMANA_1.assinatura,
      JSON.stringify(SEMANA_1.listas), JSON.stringify(SEMANA_1.sorteio), new Date().toISOString()]);
  }
  SpreadsheetApp.flush();
  return "Pronto. Código da organização está na aba Config.";
}

/* ================= jogadores ================= */
function jogadores_() {
  return rows_(jogadoresSheet_()).map(function (r) {
    return { nome: norm_(r["Jogador"]), codigo: norm_(r["Código"]), sexo: norm_(r["Sexo"]).toUpperCase(),
      email: norm_(r["E-mail"]).toLowerCase(), categorias: norm_(r["Categorias"]).split(",").map(norm_).filter(String) };
  }).filter(function (p) { return p.nome; });
}
/** Garante que a aba Jogadores tenha a coluna pedida; devolve o índice (0-based). */
function colunaJogadores_(nome) {
  var sh = jogadoresSheet_(), head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  var i = head.indexOf(nome);
  if (i < 0) { i = head.filter(String).length; sh.getRange(1, i + 1).setValue(nome).setFontWeight("bold"); }
  return i;
}
/** Grava um valor (como texto) na linha do jogador. */
function gravarJogador_(nome, coluna, valor) {
  var ci = colunaJogadores_(coluna), sh = jogadoresSheet_(), v = sh.getDataRange().getValues(), iNome = v[0].map(String).indexOf("Jogador");
  for (var r = 1; r < v.length; r++) if (norm_(v[r][iNome]) === nome) { sh.getRange(r + 1, ci + 1).setValue("'" + valor); return true; }
  return false;
}
function emailValido_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120; }
function listasAtuais_() {
  var js = jogadores_(), has = function (p, c) { return p.categorias.indexOf(c) >= 0; };
  var by = function (f) { return js.filter(f).map(function (p) { return p.nome; }).sort(); };
  return {
    Feminino: by(function (p) { return has(p, "Feminino"); }),
    Masculino: by(function (p) { return has(p, "Masculino"); }),
    MistaMulheres: by(function (p) { return has(p, "Mista") && p.sexo === "F"; }),
    MistaHomens: by(function (p) { return has(p, "Mista") && p.sexo === "M"; })
  };
}

/* ================= rodadas e sorteio automático ================= */
// Rodada começa numa segunda às 14h (Brasília, UTC−3) e dura N semanas (aba Config: semanas_por_rodada; padrão 2),
// terminando no domingo às 20h da última semana.
var DIA = 86400e3;
function semanasPorRodada_(cfg) { var n = Number((cfg || config_()).semanas_por_rodada); return n >= 1 && n <= 4 ? Math.floor(n) : 2; }
function prazoDe_(startMs, n) { return startMs + (7 * n - 1) * DIA + 6 * 3600e3; }
function mondayOf_(ms) {
  var b = new Date(ms - 3 * 3600e3), dow = (b.getUTCDay() + 6) % 7; // 0 = segunda
  var m = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - dow, 17, 0, 0); // 14h BRT
  if (m > ms) m -= 7 * DIA;
  return m;
}
function weekId_(startMs) { return new Date(startMs - 3 * 3600e3).toISOString().slice(0, 10); }
function weekMeta_(startMs, n) {
  return { id: weekId_(startMs), inicio: new Date(startMs).toISOString(), prazo: new Date(prazoDe_(startMs, n)).toISOString(),
    rodada: Sorteio.drandRound(Math.floor(startMs / 1000)) };
}
/** Início da próxima rodada a sortear (a contar da última rodada existente). */
function proximoInicio_(weeks, n, now) {
  if (!weeks.length) return mondayOf_(now);
  var last = Date.parse(weeks[weeks.length - 1].inicio), per = 7 * n * DIA;
  var k = Math.max(1, Math.floor((now - last) / per));
  return last + k * per;
}
/** A rodada atual sempre usa a duração configurada; grava o prazo novo se mudou. */
function ajustarPrazoAtual_(cfg) {
  var sh = semanasSheet_(), v = sh.getDataRange().getValues(), head = v[0].map(String), iId = head.indexOf("id"), iIni = head.indexOf("inicio"), iPr = head.indexOf("prazo");
  if (v.length < 2) return;
  var lastRow = 1, lastId = "";
  for (var r = 1; r < v.length; r++) { var id = cell_("id", v[r][iId]); if (id > lastId) { lastId = id; lastRow = r; } }
  var ini = Date.parse(cell_("inicio", v[lastRow][iIni])), want = new Date(prazoDe_(ini, semanasPorRodada_(cfg))).toISOString();
  if (cell_("prazo", v[lastRow][iPr]) !== want) sh.getRange(lastRow + 1, iPr + 1).setValue("'" + want);
}
/* Grupos incluídos pela organização depois do sorteio. Ficam fora da conferência do sorteio
   (que confere só o que saiu do número público) e entram no histórico para os próximos sorteios. */
var GRUPOS_EXTRAS = {
  "2026-10-19": { Feminino: { grupos: [["Jerusa", "Patricia", "Maria Eduarda Barbieri", "Alicia"]],
    nota: "O Grupo E foi incluído pela organização em 22/10, com a entrada da Jerusa no ranking: ela joga com as três que estavam de folga. Os grupos A a D são os do sorteio." } }
};
function comExtras_(id, draw) {
  var ex = GRUPOS_EXTRAS[id]; if (!ex) return draw;
  var out = JSON.parse(JSON.stringify(draw));
  Object.keys(ex).forEach(function (c) {
    var d = out[c] = out[c] || { groups: [], byes: [] }, usados = [];
    ex[c].grupos.forEach(function (g) { d.groups.push(g.slice()); usados = usados.concat(g); });
    d.byes = (d.byes || []).filter(function (n) { return usados.indexOf(n) < 0; });
  });
  return out;
}
function notasExtras_(id) {
  var ex = GRUPOS_EXTRAS[id], o = {}; if (!ex) return null;
  Object.keys(ex).forEach(function (c) { o[c] = ex[c].nota; });
  return o;
}
/* Nomes corrigidos depois do sorteio. As listas e o sorteio gravados ficam com a grafia original
   (é com ela que a conferência do sorteio refaz a conta); os grupos e os jogos usam o nome certo. */
var NOMES_CORRIGIDOS = { "Geruza": "Jerusa", "Maisa": "Maiza" };
function nomeCerto_(n) { return NOMES_CORRIGIDOS[n] || n; }
function corrigeNomes_(draw) {
  var out = {};
  Object.keys(draw).forEach(function (c) {
    var d = draw[c];
    out[c] = { groups: (d.groups || []).map(function (g) { return (g.players || g).map(nomeCerto_); }), byes: (d.byes || []).map(nomeCerto_) };
    if (d.repeats !== undefined) out[c].repeats = d.repeats;
  });
  return out;
}
function semanas_() {
  return rows_(semanasSheet_()).map(function (r) {
    var sorteado = JSON.parse(r.sorteio || "{}");
    return { id: r.id, inicio: r.inicio, prazo: r.prazo, method: r.metodo, rodada: Number(r.rodada), randomness: r.randomness,
      assinatura: r.assinatura, lists: JSON.parse(r.listas || "{}"), draw: corrigeNomes_(comExtras_(r.id, sorteado)), sorteado: sorteado, extras: notasExtras_(r.id) };
  }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
}

/* ================= ajuste de 27/10/2026 (rodar uma vez no Apps Script) ================= */
// Geruza → Jerusa (só Feminino). Maisa e Maiza são a mesma pessoa: fica uma linha só, Maiza, no Feminino e na Mista,
// com o código que já existir. Corrige também os nomes já gravados em Placares e Dados.
function ajustes27out() {
  var cfg = config_();
  if (cfg.ajuste_27out) return "Este ajuste já foi feito em " + cfg.ajuste_27out + ". Nada foi alterado.";
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var msg = [];
  try {
    var sh = jogadoresSheet_(), v = sh.getDataRange().getValues(), head = v[0].map(String);
    var iN = head.indexOf("Jogador"), iC = head.indexOf("Categorias"), linha = {};
    for (var r = 1; r < v.length; r++) linha[norm_(v[r][iN])] = r;
    if (linha["Geruza"] !== undefined && linha["Jerusa"] === undefined) {
      sh.getRange(linha["Geruza"] + 1, iN + 1).setValue("Jerusa");
      sh.getRange(linha["Geruza"] + 1, iC + 1).setValue("Feminino");
      msg.push("Geruza agora é Jerusa, só no Feminino (código e e-mail mantidos).");
    } else if (linha["Jerusa"] !== undefined) {
      sh.getRange(linha["Jerusa"] + 1, iC + 1).setValue("Feminino");
      msg.push("Jerusa já estava com o nome certo; ficou só no Feminino.");
    }
    if (linha["Maisa"] !== undefined) {
      if (linha["Maiza"] !== undefined) {
        var colunas = ["Código", "Código criado em", "E-mail", "Sexo"], rz = linha["Maiza"] + 1, rs = linha["Maisa"] + 1;
        colunas.forEach(function (h) {
          var ci = head.indexOf(h); if (ci < 0) return;
          if (!norm_(v[rz - 1][ci]) && norm_(v[rs - 1][ci])) sh.getRange(rz, ci + 1).setValue("'" + norm_(v[rs - 1][ci]));
        });
        sh.getRange(rz, iC + 1).setValue("Feminino, Mista");
        sh.deleteRow(rs);
        msg.push("Maisa e Maiza viraram uma só: Maiza, no Feminino e na Mista.");
      } else {
        sh.getRange(linha["Maisa"] + 1, iN + 1).setValue("Maiza");
        msg.push("Maisa agora é Maiza.");
      }
    }
    var trocas = 0;
    [placaresSheet_(), dadosSheet_()].forEach(function (s2) {
      var d = s2.getDataRange().getValues(), h2 = d[0].map(String), ij = h2.indexOf("jogador"), iv = h2.indexOf("valor");
      for (var k = 1; k < d.length; k++) {
        var j = norm_(d[k][ij]);
        if (NOMES_CORRIGIDOS[j]) { s2.getRange(k + 1, ij + 1).setValue("'" + NOMES_CORRIGIDOS[j]); trocas++; }
        if (iv >= 0) {
          var val = String(d[k][iv]), novo = val;
          Object.keys(NOMES_CORRIGIDOS).forEach(function (a) { novo = novo.split('"' + a + '"').join('"' + NOMES_CORRIGIDOS[a] + '"'); });
          if (novo !== val) { s2.getRange(k + 1, iv + 1).setValue("'" + novo); trocas++; }
        }
      }
    });
    if (trocas) msg.push(trocas + " registro(s) antigo(s) com o nome corrigido.");
    append_(configSheet_(), ["ajuste_27out", new Date().toISOString()]);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return msg.join(" ") || "Nada a corrigir.";
}

/* ================= ajuste de 22/10/2026 (rodar uma vez no Apps Script) ================= */
// Inclui a Jerusa (Feminino e Mista) e cancela os 3 jogos do Feminino, Grupo D, da rodada de 19/10,
// que serão jogados de novo: apaga os placares lançados e o coringa marcado.
function ajustes22out() {
  var cfg = config_();
  if (cfg.ajuste_22out) return "Este ajuste já foi feito em " + cfg.ajuste_22out + ". Nada foi alterado.";
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var msg = [];
  try {
    if (!jogadores_().some(function (p) { return p.nome === "Jerusa"; })) {
      var sh = jogadoresSheet_(), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      sh.appendRow(head.map(function (h) { return h === "Jogador" ? "Jerusa" : h === "Categorias" ? "Feminino, Mista" : h === "Sexo" ? "F" : ""; }));
      msg.push("Jerusa incluída (Feminino e Mista).");
    } else msg.push("Jerusa já estava na lista.");
    var st = estadoCompleto_(), agora = new Date().toISOString(), n = 0, c = 0;
    st.jogos.filter(function (j) { return j.semana === "2026-10-19" && j.categoria === "Feminino" && j.grupo === "D"; }).forEach(function (j) {
      if (j.status !== "sem_placar") {
        append_(placaresSheet_(), [agora, j.semana, j.categoria, j.grupo, String(j.jogo), "anular", "Organização", "", "", "", "Jogo cancelado por decisão do grupo (22/10): será jogado de novo."]);
        n++;
      }
      if (j.coringa) { guardarLinha_(j.semana, j.key, "Jogo", "coringa", ""); c++; }
    });
    msg.push("Feminino, Grupo D: " + n + " placar(es) apagado(s) e " + c + " coringa(s) removido(s).");
    append_(configSheet_(), ["ajuste_22out", agora]);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return msg.join(" ");
}
/** Faz o sorteio da semana corrente, se já passou da hora e ele ainda não existe. */
function sorteioSeDevido_() {
  var now = Date.now(), n = semanasPorRodada_(), start = proximoInicio_(semanas_(), n, now), meta = weekMeta_(start, n);
  if (now < start || meta.id < PRIMEIRA_SEMANA_AUTO) return null;
  if (semanas_().some(function (w) { return w.id === meta.id; })) return null;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return null;
  try {
    var weeks = semanas_();
    if (weeks.some(function (w) { return w.id === meta.id; })) return null;
    var resp = UrlFetchApp.fetch(Sorteio.drandUrl(meta.rodada), { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    var b = JSON.parse(resp.getContentText());
    if (Number(b.round) !== meta.rodada || !Sorteio.beaconOk(b.randomness, b.signature)) return null;
    var lists = listasAtuais_();
    var week = { method: "v2", lists: lists, randomness: b.randomness };
    var d = Sorteio.drawV2(b.randomness, lists, weeks.filter(function (w) { return w.id < meta.id; }));
    var plain = {}; CATS.forEach(function (c) { plain[c] = { groups: d[c].groups, byes: d[c].byes }; });
    append_(semanasSheet_(), [meta.id, meta.inicio, meta.prazo, "v2", String(meta.rodada), b.randomness, b.signature,
      JSON.stringify(lists), JSON.stringify(plain), new Date().toISOString()]);
    SpreadsheetApp.flush();
    return meta.id;
  } finally { lock.releaseLock(); }
}

/* ================= jogos, status e ranking ================= */
function jogosDaSemana_(w) {
  var out = [];
  CATS.forEach(function (cat) {
    var d = w.draw[cat]; if (!d) return;
    d.groups.forEach(function (g, gi) {
      var players = g.players || g, grupo = "ABCDEFGHIJKLMNOP".charAt(gi);
      Sorteio.gamesFor(cat, players).forEach(function (pairs, ji) {
        out.push({ key: [w.id, cat, grupo, ji + 1].join("|"), semana: w.id, categoria: cat, grupo: grupo, jogo: ji + 1, lado1: pairs[0], lado2: pairs[1], prazo: w.prazo });
      });
    });
  });
  return out;
}
function avaliar_(jogo, eventos, cfg, now) {
  var s = { status: "sem_placar", placar: null, proposta: null, contestacao: null, decisao: null };
  eventos.forEach(function (e) {
    var sc = [Number(e.games_lado1), Number(e.games_lado2)];
    if (e.acao === "lancar") { s.status = "aguardando"; s.proposta = { por: e.jogador, lado: Number(e.lado), placar: sc, quando: e.quando }; s.contestacao = null; s.placar = sc; }
    else if (e.acao === "confirmar" && s.status === "aguardando") { s.status = "confirmado"; s.confirmadoPor = e.jogador; s.confirmadoEm = e.quando; }
    else if (e.acao === "contestar" && s.status === "aguardando") { s.status = "contestado"; s.contestacao = { por: e.jogador, lado: Number(e.lado), placar: sc, quando: e.quando }; }
    else if (e.acao === "decidir") { s.status = "decidido"; s.placar = sc; s.decisao = { quando: e.quando, obs: e.obs }; }
    else if (e.acao === "anular") { s = { status: "sem_placar", placar: null, proposta: null, contestacao: null, decisao: null }; }
  });
  if (s.status === "aguardando" && now > Date.parse(jogo.prazo) && cfg.sem_validacao === "aceitar") s.status = "valido_prazo";
  s.conta = s.status === "confirmado" || s.status === "decidido" || s.status === "valido_prazo";
  return s;
}
function estadoCompleto_() {
  var cfg = config_(), now = Date.now(), weeks = semanas_();
  var ev = {}; rows_(placaresSheet_()).forEach(function (e) { var k = [e.semana, e.categoria, e.grupo, e.jogo].join("|"); (ev[k] = ev[k] || []).push(e); });
  var jogos = [];
  var cor = coringas_();
  weeks.forEach(function (w) { jogosDaSemana_(w).forEach(function (j) { var s = avaliar_(j, ev[j.key] || [], cfg, now); for (var x in s) j[x] = s[x]; j.coringa = cor[j.key] || null; jogos.push(j); }); });
  return { cfg: cfg, now: now, weeks: weeks, jogos: jogos };
}
/** Coringas marcados por jogo (aba Dados, chave "coringa"): { chaveDoJogo: {ausente, coringa, por} }. */
function coringas_() {
  var out = {};
  rows_(dadosSheet_()).forEach(function (r) {
    if (r.chave !== "coringa" || !r.valor) return;
    try { var v = JSON.parse(r.valor); if (v && v.ausente) out[r.alvo] = v; } catch (e) {}
  });
  return out;
}
function ranking_(jogos) {
  var R = {};
  CATS.forEach(function (c) { R[c] = {}; });
  jogos.forEach(function (j) {
    if (!j.conta) return;
    var t = R[j.categoria], a = j.placar[0], b = j.placar[1], aus = j.coringa && j.coringa.ausente;
    [[j.lado1, a, b], [j.lado2, b, a]].forEach(function (x) {
      x[0].forEach(function (p) {
        var r = t[p] = t[p] || { nome: p, pontos: 0, jogos: 0, vitorias: 0, derrotas: 0, gamesPro: 0, gamesContra: 0, wo: 0 };
        // Regra do coringa: quem faltou fica com W.O. (0 ponto) e o coringa não pontua.
        if (p === aus) { r.wo++; return; }
        r.jogos++; r.gamesPro += x[1]; r.gamesContra += x[2];
        if (x[1] > x[2]) { r.vitorias++; r.pontos += 10; } else { r.derrotas++; r.pontos += 5; }
        r.pontos += 2 + x[1];
      });
    });
  });
  var out = {};
  CATS.forEach(function (c) {
    out[c] = Object.keys(R[c]).map(function (k) { return R[c][k]; }).sort(function (x, y) {
      return (y.pontos - x.pontos) || (y.vitorias - x.vitorias) || (y.gamesPro - x.gamesPro) ||
        ((y.gamesPro - y.gamesContra) - (x.gamesPro - x.gamesContra)) || (y.jogos - x.jogos) || (x.nome < y.nome ? -1 : 1);
    });
  });
  return out;
}

/* ================= API pública ================= */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) {
  try {
    sorteioSeDevido_();
    ajustarPrazoAtual_();
    var st = estadoCompleto_(), n = semanasPorRodada_(st.cfg), nextStart = proximoInicio_(st.weeks, n, st.now);
    if (nextStart <= st.now) nextStart += 7 * n * DIA;
    return json_({
      ok: true, agora: new Date(st.now).toISOString(),
      semanas: st.weeks.map(function (w) { return { id: w.id, inicio: w.inicio, prazo: w.prazo, metodo: w.method, rodada: w.rodada, randomness: w.randomness, assinatura: w.assinatura, listas: w.lists, sorteio: w.draw, sorteado: w.sorteado, extras: w.extras }; }),
      jogos: st.jogos.map(publicJogo_),
      ranking: ranking_(st.jogos),
      proximo: weekMeta_(nextStart, n),
      semanas_por_rodada: n,
      regras: { sem_validacao: st.cfg.sem_validacao || "aceitar" },
      dados: dadosPublicos_(st),
      jogadores: jogadores_().map(function (p) { return { nome: p.nome, sexo: p.sexo, categorias: p.categorias, temCodigo: !!p.codigo, temEmail: !!p.email }; })
    });
  } catch (err) { return json_({ ok: false, erro: String(err && err.message || err) }); }
}
function publicJogo_(j) {
  return { key: j.key, semana: j.semana, categoria: j.categoria, grupo: j.grupo, jogo: j.jogo, lado1: j.lado1, lado2: j.lado2, prazo: j.prazo,
    status: j.status, placar: j.placar, proposta: j.proposta, contestacao: j.contestacao, confirmadoPor: j.confirmadoPor || null, decisao: j.decisao, conta: j.conta, coringa: j.coringa || null };
}

/* ---- identificação com limite de tentativas (5 erros por nome a cada 15 min) ---- */
function autenticar_(nome, codigo) {
  nome = norm_(nome); codigo = norm_(codigo);
  var cache = CacheService.getScriptCache(), key = "falhas:" + Sorteio.sha256(nome).slice(0, 32);
  var falhas = Number(cache.get(key) || 0);
  if (falhas >= 5) throw new Error("Muitas tentativas erradas para este nome. Espere 15 minutos.");
  var cfg = config_();
  if (nome === "Organização") {
    if (codigo && codigo === norm_(cfg.codigo_organizacao)) return { nome: nome, admin: true };
  } else {
    var p = jogadores_().filter(function (x) { return x.nome === nome; })[0];
    if (p && !p.codigo) throw new Error("Este nome ainda não tem código. Crie o seu no primeiro acesso.");
    if (p && codigo && codigo === p.codigo) return { nome: nome, admin: false };
  }
  cache.put(key, String(falhas + 1), 900);
  throw new Error("Nome ou código não confere.");
}
/* ---- primeiro acesso: o próprio jogador cria o código (só se ainda não houver um) ---- */
function criarCodigo_(nome, codigo, email) {
  nome = norm_(nome); codigo = norm_(codigo); email = norm_(email).toLowerCase();
  if (!/^[0-9]{4}$/.test(codigo)) throw new Error("O código precisa ter exatamente 4 números.");
  if (email && !emailValido_(email)) throw new Error("E-mail inválido. Confira e tente de novo.");
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = jogadoresSheet_(), v = sh.getDataRange().getValues(), head = v[0].map(String);
    var iNome = head.indexOf("Jogador"), iCod = head.indexOf("Código");
    for (var r = 1; r < v.length; r++) {
      if (norm_(v[r][iNome]) !== nome) continue;
      if (norm_(cell_("Código", v[r][iCod]))) throw new Error("Este nome já tem código. Se não foi você que criou, fale com a organização.");
      sh.getRange(r + 1, iCod + 1).setValue("'" + codigo);
      var ci = head.indexOf("Código criado em");
      if (ci < 0) { ci = head.length; sh.getRange(1, ci + 1).setValue("Código criado em").setFontWeight("bold"); }
      sh.getRange(r + 1, ci + 1).setValue("'" + new Date().toISOString());
      if (email) gravarJogador_(nome, "E-mail", email);
      SpreadsheetApp.flush();
      return { ok: true, nome: nome };
    }
    throw new Error("Nome não encontrado na lista de jogadores.");
  } finally { lock.releaseLock(); }
}
/* ---- dados livres por semana (disponibilidade de horários e futuros recursos) ----
 * alvo "eu": dado do próprio jogador na semana atual; alvo = chave de um jogo: dado daquele jogo
 * (só quem está no jogo, ou a organização, grava). Cada jogador só altera as próprias linhas. */
function semanaAtualId_(weeks) { return weeks.length ? weeks[weeks.length - 1].id : ""; }
function dadosPublicos_(st) {
  var atual = semanaAtualId_(st.weeks);
  return rows_(dadosSheet_()).filter(function (r) { return r.semana === atual || r.chave === "coringa"; }).map(function (r) {
    return { alvo: r.alvo, jogador: r.jogador, chave: r.chave, valor: r.valor, quando: r.atualizado_em };
  });
}
function marcarCoringa_(who, alvo, valor, st) {
  var j = st.jogos.filter(function (x) { return x.key === alvo; })[0];
  if (!j) throw new Error("Jogo não encontrado.");
  var gente = j.lado1.concat(j.lado2);
  if (!who.admin && gente.indexOf(who.nome) < 0) throw new Error("Você não está neste jogo.");
  if (!who.admin && Date.now() > Date.parse(j.prazo)) throw new Error("O prazo desta rodada acabou. Fale com a organização.");
  var v = "";
  if (valor) {
    var o; try { o = JSON.parse(valor); } catch (e) { throw new Error("Dados do coringa inválidos."); }
    var aus = norm_(o.ausente), cor = norm_(o.coringa).slice(0, 40);
    if (gente.indexOf(aus) < 0) throw new Error("Quem faltou precisa ser um dos quatro do jogo.");
    if (!cor) throw new Error("Informe quem jogou de coringa.");
    if (gente.indexOf(cor) >= 0) throw new Error("O coringa não pode ser alguém que já está no jogo.");
    if (aus === who.nome && !who.admin) throw new Error("Quem marca o coringa é um dos que jogaram.");
    v = JSON.stringify({ ausente: aus, coringa: cor, por: who.nome });
  }
  guardarLinha_(j.semana, alvo, "Jogo", "coringa", v);
  return { ok: true };
}
function guardar_(who, req) {
  var chave = norm_(req.chave), alvo = norm_(req.alvo || "eu"), valor = req.valor === null || req.valor === undefined ? "" : String(req.valor);
  if (!/^[a-z][a-z0-9_]{0,23}$/.test(chave)) throw new Error("Chave inválida.");
  if (valor.length > 4000) throw new Error("Conteúdo grande demais.");
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var st = estadoCompleto_(), semana;
    if (/^grupo:/.test(alvo)) throw new Error("Use o agendamento do grupo.");
    if (chave === "coringa") return marcarCoringa_(who, alvo, valor, st);
    if (alvo === "eu") {
      semana = semanaAtualId_(st.weeks);
      if (!semana) throw new Error("Ainda não há semana sorteada.");
    } else {
      var j = st.jogos.filter(function (x) { return x.key === alvo; })[0];
      if (!j) throw new Error("Jogo não encontrado.");
      if (!who.admin && j.lado1.indexOf(who.nome) < 0 && j.lado2.indexOf(who.nome) < 0) throw new Error("Você não está neste jogo.");
      semana = j.semana;
    }
    var sh = dadosSheet_(), v = sh.getDataRange().getValues(), head = v[0].map(String);
    var idx = function (h) { return head.indexOf(h); };
    var line = [semana, alvo, who.nome, chave, valor, new Date().toISOString()].map(function (x) { return "'" + x; });
    for (var r = 1; r < v.length; r++) {
      if (cell_("semana", v[r][idx("semana")]) === semana && cell_("alvo", v[r][idx("alvo")]) === alvo &&
          cell_("jogador", v[r][idx("jogador")]) === who.nome && cell_("chave", v[r][idx("chave")]) === chave) {
        sh.getRange(r + 1, 1, 1, line.length).setValues([line]);
        SpreadsheetApp.flush();
        return { ok: true };
      }
    }
    sh.appendRow(line);
    SpreadsheetApp.flush();
    return { ok: true };
  } finally { lock.releaseLock(); }
}
/* ---- agendamento do grupo, com aviso por e-mail ---- */
function grupoDe_(st, chave) {
  var p = String(chave || "").split("|"), w = st.weeks.filter(function (x) { return x.id === p[0]; })[0];
  if (!w || p.length !== 3 || CATS.indexOf(p[1]) < 0) return null;
  var gi = "ABCDEFGHIJKLMNOP".indexOf(p[2]), d = w.draw[p[1]];
  if (gi < 0 || !d || !d.groups[gi]) return null;
  return { semana: w, categoria: p[1], grupo: p[2], players: d.groups[gi].players || d.groups[gi] };
}
var MESES_ = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"], DIAS_ = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function slotMs_(slot) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(slot || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3) : NaN; }
function slotTexto_(slot) {
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(slot), d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return DIAS_[d.getUTCDay()] + ", " + (+m[3]) + " de " + MESES_[+m[2] - 1] + ", às " + (+m[4]) + "h";
}
function escHtml_(t) { return String(t || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function escIcs_(t) { return String(t || "").replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, " "); }
function icsData_(ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function agendar_(who, req) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var g, quando, local, desmarcar = !!req.desmarcar, alvo, now = Date.now();
  try {
    var st = estadoCompleto_();
    g = grupoDe_(st, req.grupo);
    if (!g) throw new Error("Grupo não encontrado.");
    if (g.semana.id !== st.weeks[st.weeks.length - 1].id) throw new Error("Só dá para agendar jogos da rodada atual.");
    if (!who.admin && g.players.indexOf(who.nome) < 0) throw new Error("Você não está neste grupo.");
    quando = norm_(req.quando); local = norm_(req.local).slice(0, 60);
    if (!desmarcar) {
      var t = slotMs_(quando);
      if (isNaN(t)) throw new Error("Escolha o dia e o horário.");
      if (t < now - 3600e3) throw new Error("Esse horário já passou.");
      if (t < Date.parse(g.semana.inicio) || t > Date.parse(g.semana.prazo)) throw new Error("O horário precisa ser dentro da rodada (até o prazo).");
    }
    alvo = "grupo:" + req.grupo;
    var valor = desmarcar ? "" : JSON.stringify({ quando: quando, local: local, por: who.nome });
    guardarLinha_(g.semana.id, alvo, "Grupo", "agenda", valor);
  } finally { lock.releaseLock(); }
  return avisarGrupo_(g, quando, local, who.nome, desmarcar, alvo);
}
function guardarLinha_(semana, alvo, jogador, chave, valor) {
  var sh = dadosSheet_(), v = sh.getDataRange().getValues(), head = v[0].map(String);
  var idx = function (h) { return head.indexOf(h); };
  var line = [semana, alvo, jogador, chave, valor, new Date().toISOString()].map(function (x) { return "'" + x; });
  for (var r = 1; r < v.length; r++) {
    if (cell_("semana", v[r][idx("semana")]) === semana && cell_("alvo", v[r][idx("alvo")]) === alvo &&
        cell_("jogador", v[r][idx("jogador")]) === jogador && cell_("chave", v[r][idx("chave")]) === chave) {
      sh.getRange(r + 1, 1, 1, line.length).setValues([line]); SpreadsheetApp.flush(); return;
    }
  }
  sh.appendRow(line); SpreadsheetApp.flush();
}
function avisarGrupo_(g, quando, local, por, desmarcar, alvo) {
  var emails = {}; jogadores_().forEach(function (p) { if (p.email) emails[p.nome] = p.email; });
  var com = g.players.filter(function (p) { return emails[p]; }), sem = g.players.filter(function (p) { return !emails[p]; });
  var titulo = g.categoria + " · Grupo " + g.grupo, jogos = Sorteio.gamesFor(g.categoria, g.players);
  var site = "https://igorlr86-ui.github.io/ranking-vivendas/";
  var listaJogos = jogos.map(function (j, i) { return "Jogo " + (i + 1) + ": " + j[0].join(" e ") + " × " + j[1].join(" e "); });
  var assunto = desmarcar ? "Jogo desmarcado — " + titulo : "🎾 Jogo marcado: " + titulo + " — " + slotTexto_(quando);
  var texto = desmarcar
    ? por + " desmarcou o horário do " + titulo + ". Combinem um novo horário no app:\n" + site
    : "Jogo marcado por " + por + ".\n\n" + titulo + "\n" + slotTexto_(quando) + (local ? "\nLocal: " + local : "") + "\n\nJogadores: " + g.players.join(", ") + "\n\n" + listaJogos.join("\n") + "\n\nQuem ganha lança o placar no app; um dos que perderam confirma:\n" + site;
  var html = "<div style=\"font-family:Arial,sans-serif;font-size:15px;color:#12211C\">"
    + (desmarcar ? "<p><b>" + por + "</b> desmarcou o horário do <b>" + titulo + "</b>.</p><p>Combinem um novo horário no app.</p>"
      : "<p style=\"font-size:18px\"><b>🎾 " + titulo + "</b></p><p style=\"font-size:17px\"><b>" + slotTexto_(quando) + "</b>" + (local ? "<br>Local: " + escHtml_(local) : "") + "</p>"
        + "<p>Jogadores: " + g.players.join(", ") + "</p><ul>" + listaJogos.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>"
        + "<p style=\"color:#52635C\">Marcado por " + por + ". Quem ganha lança o placar no app; um dos que perderam confirma.</p>")
    + "<p><a href=\"" + site + "\" style=\"background:#1B5A43;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none\">Abrir o app do ranking</a></p></div>";
  var anexos = [];
  if (!desmarcar) {
    var t = slotMs_(quando), dur = g.categoria === "Mista" ? 90 : 120;
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ranking Vivendas//PT", "METHOD:PUBLISH", "BEGIN:VEVENT",
      "UID:" + alvo.replace(/[^A-Za-z0-9-]/g, "") + "@ranking-vivendas", "SEQUENCE:" + Math.floor(Date.now() / 1000),
      "DTSTAMP:" + icsData_(Date.now()), "DTSTART:" + icsData_(t), "DTEND:" + icsData_(t + dur * 60000),
      "SUMMARY:Beach tennis – " + titulo, "LOCATION:" + escIcs_(local || "Vivendas da Mata"),
      "DESCRIPTION:" + ("Jogadores: " + g.players.join(", ") + "\\n" + listaJogos.join("\\n")).replace(/,/g, "\\,"),
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    anexos.push(Utilities.newBlob(ics, "text/calendar", "jogo-ranking.ics"));
  }
  var enviados = 0, erro = "";
  try {
    if (com.length && MailApp.getRemainingDailyQuota() < com.length) throw new Error("limite diário de e-mails do Google atingido");
    com.forEach(function (p) {
      MailApp.sendEmail({ to: emails[p], subject: assunto, body: texto, htmlBody: html, name: "Ranking Vivendas", attachments: anexos });
      enviados++;
    });
  } catch (e) { erro = String(e && e.message || e); }
  return { ok: true, enviados: enviados, semEmail: sem, erroEmail: erro };
}
/** Rode uma vez no editor para autorizar o envio de e-mails. */
function autorizarEmail() { return "E-mails liberados. Cota restante hoje: " + MailApp.getRemainingDailyQuota(); }
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || "{}");
    if (req.acao === "criar_codigo") return json_(criarCodigo_(req.nome, req.codigo, req.email));
    var who = autenticar_(req.nome, req.codigo);
    if (req.acao === "entrar") return json_({ ok: true, nome: who.nome, admin: who.admin });
    if (req.acao === "guardar") return json_(guardar_(who, req));
    if (req.acao === "email") {
      var em = norm_(req.email).toLowerCase();
      if (who.admin) throw new Error("A organização não tem e-mail de jogador.");
      if (em && !emailValido_(em)) throw new Error("E-mail inválido. Confira e tente de novo.");
      var l0 = LockService.getScriptLock(); l0.waitLock(20000);
      try { gravarJogador_(who.nome, "E-mail", em); SpreadsheetApp.flush(); } finally { l0.releaseLock(); }
      return json_({ ok: true });
    }
    if (req.acao === "agendar") return json_(agendar_(who, req));
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var st = estadoCompleto_(), j = st.jogos.filter(function (x) { return x.key === req.jogo; })[0];
      if (!j) throw new Error("Jogo não encontrado.");
      var parts = j.key.split("|"), now = st.now;
      var row = function (acao, lado, a, b, obs) {
        append_(placaresSheet_(), [new Date(now).toISOString(), parts[0], parts[1], parts[2], parts[3], acao, who.nome, String(lado || ""), String(a === null ? "" : a), String(b === null ? "" : b), obs || ""]);
      };
      var placar = function () {
        var a = Number(req.lado1), b = Number(req.lado2);
        if (!(a >= 0 && a <= 7 && b >= 0 && b <= 7 && Math.floor(a) === a && Math.floor(b) === b) || a === b) throw new Error("Placar inválido: use de 0 a 7 games e sem empate.");
        return [a, b];
      };
      if (who.admin) {
        if (req.acao === "decidir") { var p = placar(); row("decidir", "", p[0], p[1], req.obs); }
        else if (req.acao === "anular") row("anular", "", null, null, req.obs);
        else throw new Error("Ação não permitida.");
      } else {
        var lado = j.lado1.indexOf(who.nome) >= 0 ? 1 : j.lado2.indexOf(who.nome) >= 0 ? 2 : 0;
        if (!lado) throw new Error("Você não está neste jogo.");
        if (now > Date.parse(j.prazo)) throw new Error("O prazo desta semana acabou. Fale com a organização.");
        if (j.status === "confirmado" || j.status === "decidido") throw new Error("Este jogo já está fechado.");
        if (req.acao === "lancar") { var p2 = placar(); row("lancar", lado, p2[0], p2[1]); }
        else if (req.acao === "confirmar") {
          if (j.status !== "aguardando") throw new Error("Não há placar aguardando confirmação.");
          if (j.proposta.lado === lado) throw new Error("A confirmação precisa vir da dupla adversária.");
          row("confirmar", lado, j.placar[0], j.placar[1]);
        } else if (req.acao === "contestar") {
          if (j.status !== "aguardando") throw new Error("Não há placar para contestar.");
          if (j.proposta.lado === lado) throw new Error("Para corrigir o seu próprio lançamento, lance de novo.");
          var p3 = placar(); row("contestar", lado, p3[0], p3[1]);
        } else throw new Error("Ação desconhecida.");
      }
      SpreadsheetApp.flush();
    } finally { lock.releaseLock(); }
    return json_({ ok: true });
  } catch (err) { return json_({ ok: false, erro: String(err && err.message || err) }); }
}
