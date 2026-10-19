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
