(function () {
  "use strict";
  var CFG = window.RANKING_CONFIG || {};
  var CATS = ["Feminino", "Masculino", "Mista"];
  var TABS = [["semana", "Semana"], ["lancar", "Meus jogos"], ["ranking", "Ranking"], ["sorteio", "Sorteio"]];
  var S = { data: null, err: null, tab: "semana", cat: "Feminino", me: null, busy: false, forms: {}, checks: {}, loginErr: null, dispEdit: null };

  /* ---------- memória do aparelho ---------- */
  try {
    var saved = JSON.parse(localStorage.getItem("rv-ui") || "{}");
    if (saved.tab && TABS.some(function (t) { return t[0] === saved.tab; })) S.tab = saved.tab;
    if (CATS.indexOf(saved.cat) >= 0) S.cat = saved.cat;
    var me = JSON.parse(localStorage.getItem("rv-me") || "null");
    if (me && me.nome && me.codigo) S.me = me;
  } catch (e) {}
  var hashTab = (location.hash || "").replace("#", "");
  if (TABS.some(function (t) { return t[0] === hashTab; })) S.tab = hashTab;
  function saveUi() { try { localStorage.setItem("rv-ui", JSON.stringify({ tab: S.tab, cat: S.cat })); } catch (e) {} }
  function saveMe() { try { if (S.me) localStorage.setItem("rv-me", JSON.stringify(S.me)); else localStorage.removeItem("rv-me"); } catch (e) {} }

  /* ---------- utilidades ---------- */
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(iso, o) { try { return new Date(iso).toLocaleString("pt-BR", Object.assign({ timeZone: "America/Sao_Paulo" }, o)); } catch (e) { return ""; } }
  function fmtDay(iso) { return fmt(iso, { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", ""); }
  function fmtDate(iso) { return fmt(iso, { day: "2-digit", month: "2-digit" }); }
  function fmtStamp(iso) { return fmt(iso, { day: "2-digit", month: "2-digit" }) + " " + fmt(iso, { hour: "2-digit", minute: "2-digit" }); }
  function countdown(iso) {
    var ms = new Date(iso) - Date.now(); if (ms <= 0) return "prazo encerrado";
    var h = Math.floor(ms / 3600e3), d = Math.floor(h / 24);
    return d >= 1 ? "faltam " + d + (d > 1 ? " dias" : " dia") + " e " + (h % 24) + " h" : "faltam " + h + " h " + (Math.floor(ms / 60e3) % 60) + " min";
  }
  function names(p) { return esc(p[0]) + " e " + esc(p[1]); }
  var toastT;
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3600); }

  /* ---------- comunicação com a planilha ---------- */
  function load() {
    if (!CFG.apiUrl) { S.err = "O app ainda está sendo configurado. Volte em breve."; render(); return Promise.resolve(); }
    return fetch(CFG.apiUrl + "?acao=estado", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) throw new Error(d.erro || "Erro ao carregar.");
      S.data = d; S.err = null; S.loadedAt = Date.now(); render();
    }).catch(function (e) { S.err = "Não foi possível carregar o ranking agora. Confira a internet e tente de novo. (" + e.message + ")"; render(); });
  }
  function post(body) {
    return fetch(CFG.apiUrl, { method: "POST", body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) throw new Error(d.erro || "Erro ao enviar.");
      return d;
    });
  }

  /* ---------- dados derivados ---------- */
  function weeks() { return (S.data && S.data.semanas) || []; }
  function currentWeek() { var w = weeks(); return w.length ? w[w.length - 1] : null; }
  function gamesOf(weekId, cat) { return S.data.jogos.filter(function (j) { return j.semana === weekId && (!cat || j.categoria === cat); }); }
  function sideOf(j, nome) { return j.lado1.indexOf(nome) >= 0 ? 1 : j.lado2.indexOf(nome) >= 0 ? 2 : 0; }

  /* ---------- disponibilidade de horários ---------- */
  var H_FIRST = 6, H_LAST = 21; // horários de início: 6h ... 21h (jogo de 21h às 22h)
  var PERIODS = [["Manhã", 6, 11], ["Tarde", 12, 17], ["Noite", 18, 21]];
  var DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  // Dias e horários da semana atual (horário de Brasília), sem os que já passaram.
  function weekDays(w) {
    var start = new Date(w.inicio).getTime(), end = new Date(w.prazo).getTime(), now = Date.now();
    var b = new Date(start - 3 * 3600e3), days = [];
    for (var i = 0; i < 7; i++) {
      var dt = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + i));
      var ymd = dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate());
      var hours = [];
      for (var h = H_FIRST; h <= H_LAST; h++) {
        var t = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), h + 3);
        if (t >= start && t + 3600e3 <= end + 1 && t + 3600e3 > now) hours.push(h);
      }
      if (hours.length) days.push({ ymd: ymd, label: DOW[dt.getUTCDay()] + " " + pad2(dt.getUTCDate()) + "/" + pad2(dt.getUTCMonth() + 1), short: DOW[dt.getUTCDay()], hours: hours });
    }
    return days;
  }
  function slotId(ymd, h) { return ymd + "T" + pad2(h); }
  function validSlots(w) { var out = {}; weekDays(w).forEach(function (d) { d.hours.forEach(function (h) { out[slotId(d.ymd, h)] = 1; }); }); return out; }
  function dispOf(nome) {
    var row = (S.data.dados || []).filter(function (r) { return r.alvo === "eu" && r.chave === "disp" && r.jogador === nome; })[0];
    if (!row) return null;
    try { var v = JSON.parse(row.valor); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function fmtRanges(slots, w) {
    var days = weekDays(w), set = {}; slots.forEach(function (s) { set[s] = 1; });
    var parts = [];
    days.forEach(function (d) {
      var run = null;
      d.hours.concat([99]).forEach(function (h) {
        if (set[slotId(d.ymd, h)]) { if (run && h === run[1] + 1) run[1] = h; else { if (run) parts.push(d.label + ", " + run[0] + "h–" + (run[1] + 1) + "h"); run = [h, h]; } }
        else if (run) { parts.push(d.label + ", " + run[0] + "h–" + (run[1] + 1) + "h"); run = null; }
      });
    });
    return parts;
  }
  // Horários em comum de um grupo de jogadores.
  function groupAvail(players, w) {
    var valid = validSlots(w), marked = [], missing = [], sets = {};
    players.forEach(function (p) { var d = dispOf(p); if (d) { marked.push(p); sets[p] = {}; d.forEach(function (s) { if (valid[s]) sets[p][s] = 1; }); } else missing.push(p); });
    var all = Object.keys(valid).filter(function (s) { return marked.length && marked.every(function (p) { return sets[p][s]; }); });
    var three = [];
    if (marked.length === players.length && !all.length && players.length === 4) {
      players.forEach(function (out) {
        var others = players.filter(function (p) { return p !== out; });
        var sl = Object.keys(valid).filter(function (s) { return others.every(function (p) { return sets[p][s]; }); });
        if (sl.length) three.push({ out: out, ranges: fmtRanges(sl, w) });
      });
    }
    return { marked: marked, missing: missing, all: all, three: three };
  }
  function availBox(players, w) {
    var g = groupAvail(players, w), n = players.length, html = '<div class="avail">';
    if (!g.marked.length) return html + '<span class="small muted">🗓️ Ninguém marcou horários ainda.</span></div>';
    var ranges = fmtRanges(g.all, w);
    if (g.missing.length) {
      html += '<span class="small"><b>🗓️ ' + g.marked.length + " de " + n + " marcaram horários.</b> Falta" + (g.missing.length > 1 ? "m" : "") + ": " + g.missing.map(esc).join(", ") + ".</span>";
      if (g.marked.length > 1) html += '<span class="small muted">' + (ranges.length ? "Em comum até agora: " + ranges.map(esc).join(" · ") : "Ainda sem horário em comum entre quem marcou.") + "</span>";
    } else if (ranges.length) {
      html += '<span class="small"><b>🗓️ Todos podem:</b> ' + ranges.map(esc).join(" · ") + "</span>";
    } else {
      html += '<span class="small"><b>🗓️ Sem horário em que os ' + n + " possam.</b></span>";
      g.three.slice(0, 3).forEach(function (t) { html += '<span class="small muted">Sem ' + esc(t.out) + ": " + t.ranges.slice(0, 3).map(esc).join(" · ") + "</span>"; });
    }
    return html + "</div>";
  }
  function dispEditor(w) {
    var sel = S.dispEdit, days = weekDays(w);
    if (!days.length) return '<p class="small muted">Não há mais horários nesta semana.</p>';
    return '<div class="stack" style="gap:14px">' + days.map(function (d) {
      return '<div class="dday"><div class="spread"><b>' + esc(d.label) + '</b><div class="row" style="gap:6px">'
        + PERIODS.filter(function (p) { return d.hours.some(function (h) { return h >= p[1] && h <= p[2]; }); }).map(function (p) {
          return '<button type="button" class="pchip" data-period="' + d.ymd + "|" + p[1] + "|" + p[2] + '">' + p[0] + "</button>";
        }).join("") + "</div></div>"
        + '<div class="hours">' + d.hours.map(function (h) {
          var id = slotId(d.ymd, h);
          return '<button type="button" class="hchip" data-slot="' + id + '" aria-pressed="' + !!sel[id] + '">' + h + "h</button>";
        }).join("") + "</div></div>";
    }).join("")
      + '<div class="row"><button class="btn" type="button" data-act="disp-save"' + (S.busy ? " disabled" : "") + '>Salvar horários</button><button class="link" type="button" data-act="disp-cancel">Cancelar</button></div></div>';
  }
  function dispPanel(w) {
    var me = S.me.nome, mine = dispOf(me);
    var html = '<section class="panel"><div class="spread"><h3>Meus horários nesta semana</h3>'
      + (S.dispEdit ? "" : '<button class="btn ghost" type="button" data-act="disp-edit">' + (mine ? "Editar" : "Marcar horários") + "</button>") + "</div>";
    if (S.dispEdit) return html + '<p class="small muted">Toque nos horários em que você pode jogar (cada um é o início de 1 hora de jogo). Os botões Manhã, Tarde e Noite marcam o período inteiro.</p>' + dispEditor(w) + "</section>";
    var ranges = mine ? fmtRanges(mine, w) : [];
    html += mine ? (ranges.length ? "<p>" + ranges.map(esc).join(" · ") + "</p>" : '<p class="muted">Você marcou que não tem horário livre nesta semana.</p>')
      : '<p class="muted">Marque quando pode jogar. O app mostra para o seu grupo os horários em que os quatro podem.</p>';
    return html + "</section>";
  }

  function statusPill(j) {
    var sc = j.placar ? j.placar[0] + "×" + j.placar[1] : "";
    switch (j.status) {
      case "confirmado": return '<span class="pill ok">Confirmado</span>';
      case "decidido": return '<span class="pill ok">Definido pela organização</span>';
      case "valido_prazo": return '<span class="pill ok">Valeu por prazo</span>';
      case "aguardando":
        var other = j.proposta.lado === 1 ? j.lado2 : j.lado1;
        return '<span class="pill wait">Aguardando validação de ' + esc(other[0]) + " ou " + esc(other[1]) + "</span>";
      case "contestado": return '<span class="pill bad">Em disputa</span>';
      default: return '<span class="pill">Sem placar</span>';
    }
  }
  function gameRow(j, label) {
    var has = !!j.placar && j.status !== "sem_placar", a = has ? j.placar[0] : null, b = has ? j.placar[1] : null;
    var w1 = has && a > b, w2 = has && b > a;
    return '<div class="game"><div class="spread"><span class="small muted">' + esc(label || ("Jogo " + j.jogo)) + "</span>" + statusPill(j) + "</div>"
      + '<div class="teams"><span class="' + (w1 ? "win" : "") + '">' + names(j.lado1) + '</span><span class="sc ' + (has ? "" : "none") + '">' + (has ? a + "×" + b : "×") + '</span><span class="r ' + (w2 ? "win" : "") + '">' + names(j.lado2) + "</span></div>"
      + (j.status === "contestado" ? '<p class="small muted">' + esc(j.proposta.por) + " lançou " + j.proposta.placar[0] + "×" + j.proposta.placar[1] + "; " + esc(j.contestacao.por) + " contestou com " + j.contestacao.placar[0] + "×" + j.contestacao.placar[1] + ". A organização decide.</p>" : "")
      + (j.status === "aguardando" ? '<p class="small muted">Lançado por ' + esc(j.proposta.por) + " em " + fmtStamp(j.proposta.quando) + ".</p>" : "")
      + (j.status === "confirmado" && j.confirmadoPor ? '<p class="small muted">Lançado por ' + esc(j.proposta.por) + ", confirmado por " + esc(j.confirmadoPor) + ".</p>" : "")
      + "</div>";
  }

  /* ---------- telas ---------- */
  function renderTabs() {
    $("#tabs").innerHTML = TABS.map(function (t) { return '<button role="tab" type="button" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + "</button>"; }).join("");
  }
  function catSeg() {
    return '<div class="seg" role="group" aria-label="Categoria">' + CATS.map(function (c) { return '<button type="button" data-cat="' + c + '" aria-pressed="' + (S.cat === c) + '">' + c + "</button>"; }).join("") + "</div>";
  }
  function weekHead(w) {
    var open = Date.now() < new Date(w.prazo);
    return '<div class="weekhead"><div class="stack" style="gap:6px"><span class="eyebrow">Semana de ' + fmtDate(w.inicio) + " a " + fmtDate(w.prazo) + "</span>" + catSeg() + "</div>"
      + '<div class="deadline"><span class="eyebrow">Prazo</span><b>' + esc(fmtDay(w.prazo)) + " às 20h</b><span class=\"small muted\">" + (open ? countdown(w.prazo) : "prazo encerrado") + "</span></div></div>";
  }
  function renderSemana() {
    var w = currentWeek();
    if (!w) return '<div class="panel"><p>O primeiro sorteio ainda não aconteceu.</p></div>';
    var d = w.sorteio[S.cat], gs = gamesOf(w.id, S.cat);
    var html = weekHead(w) + '<div class="groups">' + d.groups.map(function (g, gi) {
      var letter = "ABCDEFGHIJKLMNOP".charAt(gi), players = g.players || g;
      var games = gs.filter(function (j) { return j.grupo === letter; });
      var done = games.filter(function (j) { return j.conta; }).length;
      return '<article class="group"><div class="gh"><b>Grupo ' + letter + '</b><span class="small muted">' + done + " de " + games.length + " jogos</span></div>"
        + '<div class="who">' + players.map(esc).join(" · ") + "</div>"
        + availBox(players, w)
        + games.map(function (j) { return gameRow(j); }).join("") + "</article>";
    }).join("") + "</div>";
    if (d.byes && d.byes.length) html += '<p class="byes"><b>De folga nesta semana:</b> ' + d.byes.map(esc).join(", ") + ".</p>";
    html += '<p class="small muted">Cada jogador marca seus horários na aba “Meus jogos”, e o grupo vê aqui quando os quatro podem. Os jogos podem ser feitos em qualquer ordem. Quem ganha lança o placar; um dos que perderam confirma.</p>';
    return html;
  }

  function renderRanking() {
    var rows = (S.data.ranking && S.data.ranking[S.cat]) || [];
    var head = '<div class="spread"><h2>Classificação</h2>' + catSeg() + "</div>";
    if (!rows.length) return head + '<div class="panel"><p>Ainda não há jogos confirmados nesta categoria.</p></div>';
    var meName = S.me && S.me.nome;
    return head + '<div class="tablewrap"><table><thead><tr><th class="l">#</th><th class="l">Jogador</th><th>Pts</th><th>J</th><th>V</th><th>D</th><th>Games</th><th>Saldo</th></tr></thead><tbody>'
      + rows.map(function (r, i) {
        var s = r.gamesPro - r.gamesContra;
        return '<tr class="' + (r.nome === meName ? "me" : "") + '"><td class="l"><span class="pos ' + (i < 3 ? "g" + (i + 1) : "") + '">' + (i + 1) + '</span></td><td class="l">' + esc(r.nome) + '</td><td class="pts">' + r.pontos + "</td><td>" + r.jogos + "</td><td>" + r.vitorias + "</td><td>" + r.derrotas + "</td><td>" + r.gamesPro + "</td><td>" + (s > 0 ? "+" : "") + s + "</td></tr>";
      }).join("") + "</tbody></table></div>"
      + '<p class="small muted">Vitória 10 · derrota 5 · participação 2 · +1 por game ganho. Desempate: vitórias, games ganhos, saldo de games e jogos disputados. Só entram jogos confirmados.</p>';
  }

  /* ---- lançar ---- */
  function stepper(id, label, val) {
    return '<div class="stepper"><span class="lbl">' + label + '</span><div class="ctl"><button type="button" data-step="' + id + '" data-d="-1" aria-label="Menos um game">−</button><output>' + val + '</output><button type="button" data-step="' + id + '" data-d="1" aria-label="Mais um game">+</button></div></div>';
  }
  function scoreForm(j, mode) {
    var f = S.forms[j.key] || { nos: 0, eles: 0 };
    var title = mode === "contestar" ? "Qual foi o placar correto?" : mode === "decidir" ? "Placar definido pela organização" : "Placar do jogo";
    var labels = mode === "decidir" ? [names(j.lado1), names(j.lado2)] : ["Sua dupla", "Adversários"];
    return '<div class="stack" style="gap:10px"><b class="small">' + title + '</b><div class="scorebox">' + stepper(j.key + "|nos", labels[0], f.nos) + stepper(j.key + "|eles", labels[1], f.eles) + "</div>"
      + '<div class="row"><button class="btn" type="button" data-act="' + mode + '" data-k="' + esc(j.key) + '"' + (S.busy ? " disabled" : "") + ">" + (mode === "contestar" ? "Enviar contestação" : mode === "decidir" ? "Definir placar" : "Enviar placar") + "</button>"
      + '<button class="link" type="button" data-act="cancel" data-k="' + esc(j.key) + '">Cancelar</button></div></div>';
  }
  function myGameCard(j) {
    var me = S.me.nome, side = sideOf(j, me), mine = side === 1 ? j.lado1 : j.lado2, opp = side === 1 ? j.lado2 : j.lado1;
    var partner = mine[0] === me ? mine[1] : mine[0];
    var f = S.forms[j.key], closed = Date.now() > new Date(j.prazo);
    var my = function (sc) { return side === 1 ? sc : [sc[1], sc[0]]; };
    var body = "";
    if (f && f.mode) body = scoreForm(j, f.mode);
    else if (j.status === "sem_placar") body = closed ? '<p class="small muted">Prazo encerrado sem placar.</p>' : '<button class="btn" type="button" data-act="open" data-mode="lancar" data-k="' + esc(j.key) + '">Lançar placar</button><p class="small muted">Quem ganhou lança.</p>';
    else if (j.status === "aguardando") {
      var sc = my(j.placar);
      if (j.proposta.lado === side) body = "<p>" + (j.proposta.por === me ? "Você lançou" : esc(j.proposta.por) + " lançou") + " <b>" + sc[0] + " × " + sc[1] + "</b> para a sua dupla. Aguardando " + esc(opp[0]) + " ou " + esc(opp[1]) + " confirmar.</p>"
        + (closed ? "" : '<button class="link" type="button" data-act="open" data-mode="lancar" data-k="' + esc(j.key) + '">Corrigir o placar</button>');
      else body = "<p><b>" + esc(j.proposta.por) + "</b> lançou: sua dupla <b>" + sc[0] + "</b> × <b>" + sc[1] + "</b> adversários. Está certo?</p>"
        + (closed ? "" : '<div class="row"><button class="btn" type="button" data-act="confirmar" data-k="' + esc(j.key) + '"' + (S.busy ? " disabled" : "") + '>Confirmar</button><button class="btn warn" type="button" data-act="open" data-mode="contestar" data-k="' + esc(j.key) + '">Não, contestar</button></div>');
    } else if (j.status === "contestado") body = "<p>Placar em disputa. A organização vai decidir.</p>" + (closed ? "" : '<button class="link" type="button" data-act="open" data-mode="lancar" data-k="' + esc(j.key) + '">As duas duplas chegaram a um acordo? Lance o placar certo</button>');
    else { var s2 = my(j.placar); body = "<p><b>" + s2[0] + " × " + s2[1] + "</b> · " + (j.status === "confirmado" ? "confirmado" : j.status === "decidido" ? "definido pela organização" : "valeu por prazo") + ".</p>"; }
    return '<article class="mycard"><div class="spread"><span class="cat">' + esc(j.categoria) + " · Grupo " + esc(j.grupo) + "</span>" + statusPill(j) + "</div>"
      + "<p>Com <b>" + esc(partner) + "</b> contra " + names(opp) + "</p>" + body + "</article>";
  }
  function renderLogin() {
    var js = (S.data.jogadores || []).slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
    var sel = S.loginNome || "", p = js.filter(function (x) { return x.nome === sel; })[0];
    var criar = p && !p.temCodigo;
    var html = '<section class="panel"><h2>Entrar</h2><p class="muted">Escolha seu nome. No primeiro acesso, você cria um código de 4 números; depois é só usar esse código. Este aparelho guarda o acesso.</p>'
      + '<form id="login" class="stack" style="gap:12px"><div class="field"><label for="lnome">Seu nome</label><select id="lnome" required><option value="">Escolha…</option>'
      + js.map(function (x) { return '<option' + (x.nome === sel ? " selected" : "") + ">" + esc(x.nome) + "</option>"; }).join("")
      + '<option value="Organização"' + (sel === "Organização" ? " selected" : "") + '>Organização</option></select></div>';
    if (sel && criar) {
      html += '<div class="info"><b>Primeiro acesso.</b> Crie um código de 4 números e guarde. Ele é só seu: com ele você marca seus horários, lança e confirma placares.</div>'
        + '<div class="field"><label for="lcod">Crie seu código</label><input id="lcod" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" required></div>'
        + '<div class="field"><label for="lcod2">Repita o código</label><input id="lcod2" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" required></div>';
    } else if (sel) {
      html += '<div class="field"><label for="lcod">' + (sel === "Organização" ? "Código da organização" : "Seu código") + '</label><input id="lcod" type="password" inputmode="numeric" autocomplete="off" maxlength="8" required></div>'
        + (sel !== "Organização" ? '<p class="small muted">Esqueceu o código ou não foi você que criou? Fale com a organização.</p>' : "");
    }
    html += (S.loginErr ? '<div class="err">' + esc(S.loginErr) + "</div>" : "")
      + (sel ? '<button class="btn" type="submit"' + (S.busy ? " disabled" : "") + ">" + (criar ? "Criar código e entrar" : "Entrar") + "</button>" : "")
      + "</form></section>";
    return html;
  }
  function renderLancar() {
    if (!S.me) return renderLogin();
    var w = currentWeek(), me = S.me.nome;
    var head = '<div class="spread"><div><span class="eyebrow">Conectado como</span><h2>' + esc(me) + '</h2></div><button class="link" type="button" data-act="sair">Sair</button></div>';
    if (S.me.admin) return head + renderAdmin();
    if (!w) return head + '<div class="panel"><p>Ainda não há sorteio.</p></div>';
    var mine = gamesOf(w.id).filter(function (j) { return sideOf(j, me); });
    var pend = mine.filter(function (j) { return j.status === "aguardando" && j.proposta.lado !== sideOf(j, me); });
    var myGroups = CATS.map(function (c) {
      var d = w.sorteio[c]; if (!d) return "";
      var gi = -1; d.groups.forEach(function (g, i) { if ((g.players || g).indexOf(me) >= 0) gi = i; });
      if (gi < 0) return "";
      var players = d.groups[gi].players || d.groups[gi];
      return '<article class="mycard"><span class="cat">' + esc(c) + " · Grupo " + "ABCDEFGHIJKLMNOP".charAt(gi) + "</span><p>" + players.map(esc).join(" · ") + "</p>" + availBox(players, w) + "</article>";
    }).join("");
    return head + (pend.length ? '<div class="banner"><b>' + pend.length + (pend.length > 1 ? " placares esperam" : " placar espera") + " a sua confirmação.</b></div>" : "")
      + (mine.length ? dispPanel(w) + (myGroups ? "<h3>Meus grupos</h3>" + '<div class="stack">' + myGroups + "</div>" : "") + "<h3>Meus jogos</h3>" : "")
      + (mine.length ? '<div class="stack">' + mine.map(myGameCard).join("") + "</div>" : '<div class="panel"><p>Você não tem jogos nesta semana.</p></div>')
      + '<p class="small muted">Quem ganhou lança o placar; um dos que perderam confirma. Se alguém lançar errado, quem lançou pode corrigir até a confirmação.</p>';
  }
  function renderAdmin() {
    var js = S.data.jogos.filter(function (j) { return j.status === "contestado" || j.status === "aguardando"; });
    var w = currentWeek(), all = w ? gamesOf(w.id) : [];
    var card = function (j) {
      var f = S.forms[j.key];
      return '<article class="mycard"><div class="spread"><span class="cat">' + esc(j.semana) + " · " + esc(j.categoria) + " · Grupo " + esc(j.grupo) + " · Jogo " + j.jogo + "</span>" + statusPill(j) + "</div>"
        + gameRow(j, " ") + (f && f.mode ? scoreForm(j, "decidir") : '<div class="row"><button class="btn ghost" type="button" data-act="open" data-mode="decidir" data-k="' + esc(j.key) + '">Definir placar</button><button class="btn warn" type="button" data-act="anular" data-k="' + esc(j.key) + '">Apagar lançamentos</button></div>') + "</article>";
    };
    return '<div class="info">Modo organização: você pode definir o placar de qualquer jogo (inclusive fora do prazo) ou apagar os lançamentos.</div>'
      + "<h2>Pendentes e em disputa</h2>" + (js.length ? '<div class="stack">' + js.map(card).join("") + "</div>" : '<p class="muted">Nada pendente.</p>')
      + '<details><summary>Todos os jogos da semana atual</summary><div class="stack" style="margin-top:10px">' + all.map(card).join("") + "</div></details>";
  }

  /* ---- sorteio ---- */
  function renderSorteio() {
    var ws = weeks().slice().reverse(), nx = S.data.proximo;
    var html = '<section class="panel"><h2>Como é o sorteio</h2><p>Toda segunda-feira às 14h, uma rede internacional independente (drand) divulga um número aleatório. Os grupos da semana saem desse número. Ninguém da organização escolhe nem consegue prever o resultado.</p>'
      + "<p>O sorteio evita colocar no mesmo grupo quem já jogou junto na mesma categoria. Na Mista, quem folgou menos vezes tem a vez de folgar.</p>"
      + '<p class="small muted">Qualquer pessoa pode conferir cada sorteio abaixo: o botão busca o número oficial e refaz a conta no seu celular. O código está público em <a href="' + esc(CFG.repoUrl) + '" target="_blank" rel="noopener">GitHub</a>.</p></section>';
    if (nx) html += '<div class="info"><b>Próximo sorteio:</b> segunda, ' + fmtDate(nx.inicio) + " às 14h, com o número da rodada " + nx.rodada.toLocaleString("pt-BR") + " do drand.</div>";
    html += ws.map(function (w, i) {
      var ck = S.checks[w.id];
      return '<section class="panel"><div class="spread"><h3>Semana de ' + fmtDate(w.inicio) + "</h3>" + (ck ? '<span class="pill ' + (ck.ok ? "ok" : ck.ok === false ? "bad" : "") + '">' + esc(ck.label) + "</span>" : "") + "</div>"
        + '<dl class="facts"><dt>Rodada</dt><dd class="num">' + w.rodada.toLocaleString("pt-BR") + ' · <a href="' + Sorteio.drandUrl(w.rodada) + '" target="_blank" rel="noopener">ver no drand</a></dd><dt>Número</dt><dd class="mono">' + esc(w.randomness) + "</dd><dt>Método</dt><dd>" + (w.metodo === "v1" ? "Grupos na ordem do sorteio (1ª semana)" : "Sem repetir quem já jogou junto") + "</dd></dl>"
        + (ck && ck.msg ? '<p class="small">' + esc(ck.msg) + "</p>" : "")
        + '<div class="row"><button class="btn ghost" type="button" data-act="check" data-w="' + esc(w.id) + '">Conferir este sorteio</button></div></section>';
    }).join("");
    return html;
  }
  function checkWeek(id) {
    var all = weeks(), idx = all.findIndex(function (w) { return w.id === id; }), w = all[idx];
    S.checks[id] = { label: "Conferindo…" }; render();
    fetch(Sorteio.drandUrl(w.rodada)).then(function (r) { return r.json(); }).then(function (b) {
      if (Number(b.round) !== w.rodada || b.randomness !== w.randomness) { S.checks[id] = { ok: false, label: "Não confere", msg: "O número publicado pelo drand para esta rodada é diferente do usado aqui." }; return render(); }
      if (!Sorteio.beaconOk(b.randomness, b.signature)) { S.checks[id] = { ok: false, label: "Não confere", msg: "A assinatura do número não bate." }; return render(); }
      var prev = all.slice(0, idx).map(function (x) { return { id: x.id, draw: x.sorteio }; });
      var d = Sorteio.drawWeek({ method: w.metodo, lists: w.listas, randomness: b.randomness }, prev);
      var mine = Sorteio.fingerprint(d), theirs = Sorteio.fingerprint({ Feminino: norm(w.sorteio.Feminino), Masculino: norm(w.sorteio.Masculino), Mista: norm(w.sorteio.Mista) });
      S.checks[id] = mine === theirs ? { ok: true, label: "Confere", msg: "O número veio direto do drand e a conta feita no seu celular deu exatamente os mesmos grupos e folgas." }
        : { ok: false, label: "Não confere", msg: "A conta no seu celular deu grupos diferentes dos publicados. Avise a organização." };
      render();
    }).catch(function () { S.checks[id] = { label: "Sem conexão", msg: "Não consegui falar com o drand agora. Tente de novo." }; render(); });
  }
  function norm(d) { return { groups: d.groups.map(function (g) { return { players: g.players || g }; }), byes: d.byes }; }

  /* ---------- render ---------- */
  function render() {
    renderTabs();
    var m = $("#main");
    if (S.err && !S.data) { m.innerHTML = '<div class="err">' + esc(S.err) + "</div>"; return; }
    if (!S.data) { m.innerHTML = '<div class="loading">Carregando o ranking… pode levar alguns segundos.</div>'; return; }
    var html = S.err ? '<div class="err">' + esc(S.err) + "</div>" : "";
    if (S.tab === "semana") html += renderSemana();
    else if (S.tab === "ranking") html += renderRanking();
    else if (S.tab === "lancar") html += renderLancar();
    else html += renderSorteio();
    m.innerHTML = html;
  }

  /* ---------- ações ---------- */
  function act(body, okMsg) {
    S.busy = true; render();
    return post(Object.assign({ nome: S.me.nome, codigo: S.me.codigo }, body)).then(function () {
      toast(okMsg); return load();
    }).catch(function (e) { toast(e.message); }).then(function () { S.busy = false; render(); });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; saveUi(); history.replaceState(null, "", "#" + S.tab); render(); window.scrollTo(0, 0); refreshIfStale(10000); return; }
    if (t.dataset.cat) { S.cat = t.dataset.cat; saveUi(); render(); return; }
    if (t.dataset.slot && S.dispEdit) { if (S.dispEdit[t.dataset.slot]) delete S.dispEdit[t.dataset.slot]; else S.dispEdit[t.dataset.slot] = 1; t.setAttribute("aria-pressed", String(!!S.dispEdit[t.dataset.slot])); return; }
    if (t.dataset.period && S.dispEdit) {
      var pp = t.dataset.period.split("|"), ids = [];
      for (var hh = Number(pp[1]); hh <= Number(pp[2]); hh++) { var sid = slotId(pp[0], hh); if (document.querySelector('[data-slot="' + sid + '"]')) ids.push(sid); }
      var allOn = ids.every(function (x) { return S.dispEdit[x]; });
      ids.forEach(function (x) { if (allOn) delete S.dispEdit[x]; else S.dispEdit[x] = 1; });
      render(); return;
    }
    if (t.dataset.step) {
      var parts = t.dataset.step.split("|"), field = parts.pop(), key = parts.join("|"), f = S.forms[key] || (S.forms[key] = { nos: 0, eles: 0 });
      f[field] = Math.max(0, Math.min(7, f[field] + Number(t.dataset.d))); render(); return;
    }
    var a = t.dataset.act, k = t.dataset.k;
    if (!a) return;
    if (a === "open") { S.forms[k] = Object.assign({ nos: 0, eles: 0 }, S.forms[k], { mode: t.dataset.mode }); render(); return; }
    if (a === "cancel") { delete S.forms[k]; render(); return; }
    if (a === "sair") { S.me = null; S.dispEdit = null; saveMe(); render(); return; }
    if (a === "disp-edit") { S.dispEdit = {}; (dispOf(S.me.nome) || []).forEach(function (s) { S.dispEdit[s] = 1; }); render(); return; }
    if (a === "disp-cancel") { S.dispEdit = null; render(); return; }
    if (a === "disp-save") {
      var valid = validSlots(currentWeek()), keep = Object.keys(S.dispEdit).filter(function (s) { return valid[s]; }).sort();
      act({ acao: "guardar", chave: "disp", alvo: "eu", valor: JSON.stringify(keep) }, keep.length ? "Horários salvos." : "Salvo: sem horário livre nesta semana.").then(function () { S.dispEdit = null; render(); });
      return;
    }
    if (a === "check") { checkWeek(t.dataset.w); return; }
    var j = S.data.jogos.filter(function (x) { return x.key === k; })[0];
    if (a === "confirmar") { act({ acao: "confirmar", jogo: k }, "Placar confirmado. Obrigado!"); return; }
    if (a === "anular") { act({ acao: "anular", jogo: k }, "Lançamentos apagados."); return; }
    if (a === "lancar" || a === "contestar" || a === "decidir") {
      var f2 = S.forms[k];
      if (f2.nos === f2.eles) { toast("O placar não pode terminar empatado."); return; }
      var l1, l2;
      if (a === "decidir") { l1 = f2.nos; l2 = f2.eles; }
      else { var side = sideOf(j, S.me.nome); l1 = side === 1 ? f2.nos : f2.eles; l2 = side === 1 ? f2.eles : f2.nos; }
      act({ acao: a, jogo: k, lado1: l1, lado2: l2 }, a === "lancar" ? "Placar enviado. Agora um dos adversários confirma." : a === "contestar" ? "Contestação enviada à organização." : "Placar definido.").then(function () { delete S.forms[k]; render(); });
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "lnome") { S.loginNome = e.target.value; S.loginErr = null; render(); var c = $("#lcod"); if (c) c.focus(); }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "login") return;
    e.preventDefault();
    var nome = $("#lnome").value, codigo = ($("#lcod") ? $("#lcod").value : "").trim(), c2 = $("#lcod2");
    if (!nome || !codigo) return;
    var first = Promise.resolve();
    if (c2) {
      if (!/^[0-9]{4}$/.test(codigo)) { S.loginErr = "O código precisa ter exatamente 4 números."; render(); return; }
      if (c2.value.trim() !== codigo) { S.loginErr = "Os dois códigos não são iguais. Digite de novo."; render(); return; }
      first = post({ acao: "criar_codigo", nome: nome, codigo: codigo });
    }
    S.busy = true; S.loginErr = null; render();
    first.then(function () { return post({ acao: "entrar", nome: nome, codigo: codigo }); }).then(function (d) {
      S.me = { nome: d.nome, codigo: codigo, admin: !!d.admin }; saveMe(); S.loginNome = null;
      toast(c2 ? "Código criado. Bem-vindo(a), " + d.nome.split(" ")[0] + "!" : "Tudo certo, " + d.nome.split(" ")[0] + "!");
      if (c2) load();
    }).catch(function (err) { S.loginErr = err.message; }).then(function () { S.busy = false; render(); });
  });

  function refreshIfStale(ms) { if (S.data && !S.busy && !S.dispEdit && !Object.keys(S.forms).length && Date.now() - (S.loadedAt || 0) > ms) load(); }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") refreshIfStale(15000); });

  render();
  load();
  setInterval(function () { if (document.visibilityState === "visible" && !S.busy && !Object.keys(S.forms).length && !S.dispEdit) load(); }, 60000);
})();
