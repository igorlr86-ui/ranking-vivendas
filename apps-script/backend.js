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
