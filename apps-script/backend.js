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
var SEMANA_1 = null; // preenchido abaixo pelo build com o sorteio de 19/10/2026 (método v1)

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
      categorias: norm_(r["Categorias"]).split(",").map(norm_).filter(String) };
  }).filter(function (p) { return p.nome; });
}
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

/* ================= semanas e sorteio automático ================= */
// Semana começa na segunda às 14h (Brasília, UTC−3) e termina no domingo às 20h.
function mondayOf_(ms) {
  var b = new Date(ms - 3 * 3600e3), dow = (b.getUTCDay() + 6) % 7; // 0 = segunda
  var m = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - dow, 17, 0, 0); // 14h BRT
  if (m > ms) m -= 7 * 86400e3;
  return m;
}
function weekId_(startMs) { return new Date(startMs - 3 * 3600e3).toISOString().slice(0, 10); }
function weekMeta_(startMs) {
  return { id: weekId_(startMs), inicio: new Date(startMs).toISOString(), prazo: new Date(startMs + 6 * 86400e3 + 6 * 3600e3).toISOString(),
    rodada: Sorteio.drandRound(Math.floor(startMs / 1000)) };
}
function semanas_() {
  return rows_(semanasSheet_()).map(function (r) {
    return { id: r.id, inicio: r.inicio, prazo: r.prazo, method: r.metodo, rodada: Number(r.rodada), randomness: r.randomness,
      assinatura: r.assinatura, lists: JSON.parse(r.listas || "{}"), draw: JSON.parse(r.sorteio || "{}") };
  }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
}
/** Faz o sorteio da semana corrente, se já passou da hora e ele ainda não existe. */
function sorteioSeDevido_() {
  var now = Date.now(), start = mondayOf_(now), meta = weekMeta_(start);
  if (meta.id < PRIMEIRA_SEMANA_AUTO) return null;
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
  weeks.forEach(function (w) { jogosDaSemana_(w).forEach(function (j) { var s = avaliar_(j, ev[j.key] || [], cfg, now); for (var x in s) j[x] = s[x]; jogos.push(j); }); });
  return { cfg: cfg, now: now, weeks: weeks, jogos: jogos };
}
function ranking_(jogos) {
  var R = {};
  CATS.forEach(function (c) { R[c] = {}; });
  jogos.forEach(function (j) {
    if (!j.conta) return;
    var t = R[j.categoria], a = j.placar[0], b = j.placar[1];
    [[j.lado1, a, b], [j.lado2, b, a]].forEach(function (x) {
      x[0].forEach(function (p) {
        var r = t[p] = t[p] || { nome: p, pontos: 0, jogos: 0, vitorias: 0, derrotas: 0, gamesPro: 0, gamesContra: 0 };
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
    var st = estadoCompleto_(), nextStart = mondayOf_(st.now) + 7 * 86400e3;
    return json_({
      ok: true, agora: new Date(st.now).toISOString(),
      semanas: st.weeks.map(function (w) { return { id: w.id, inicio: w.inicio, prazo: w.prazo, metodo: w.method, rodada: w.rodada, randomness: w.randomness, assinatura: w.assinatura, listas: w.lists, sorteio: w.draw }; }),
      jogos: st.jogos.map(publicJogo_),
      ranking: ranking_(st.jogos),
      proximo: weekMeta_(nextStart),
      regras: { sem_validacao: st.cfg.sem_validacao || "aceitar" },
      dados: dadosPublicos_(st),
      jogadores: jogadores_().map(function (p) { return { nome: p.nome, sexo: p.sexo, categorias: p.categorias, temCodigo: !!p.codigo }; })
    });
  } catch (err) { return json_({ ok: false, erro: String(err && err.message || err) }); }
}
function publicJogo_(j) {
  return { key: j.key, semana: j.semana, categoria: j.categoria, grupo: j.grupo, jogo: j.jogo, lado1: j.lado1, lado2: j.lado2, prazo: j.prazo,
    status: j.status, placar: j.placar, proposta: j.proposta, contestacao: j.contestacao, confirmadoPor: j.confirmadoPor || null, decisao: j.decisao, conta: j.conta };
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
function criarCodigo_(nome, codigo) {
  nome = norm_(nome); codigo = norm_(codigo);
  if (!/^[0-9]{4}$/.test(codigo)) throw new Error("O código precisa ter exatamente 4 números.");
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
  return rows_(dadosSheet_()).filter(function (r) { return r.semana === atual; }).map(function (r) {
    return { alvo: r.alvo, jogador: r.jogador, chave: r.chave, valor: r.valor, quando: r.atualizado_em };
  });
}
function guardar_(who, req) {
  var chave = norm_(req.chave), alvo = norm_(req.alvo || "eu"), valor = req.valor === null || req.valor === undefined ? "" : String(req.valor);
  if (!/^[a-z][a-z0-9_]{0,23}$/.test(chave)) throw new Error("Chave inválida.");
  if (valor.length > 4000) throw new Error("Conteúdo grande demais.");
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var st = estadoCompleto_(), semana;
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
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || "{}");
    if (req.acao === "criar_codigo") return json_(criarCodigo_(req.nome, req.codigo));
    var who = autenticar_(req.nome, req.codigo);
    if (req.acao === "entrar") return json_({ ok: true, nome: who.nome, admin: who.admin });
    if (req.acao === "guardar") return json_(guardar_(who, req));
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
