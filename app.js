(function () {
  "use strict";
  var CFG = window.RANKING_CONFIG || {};
  var CATS = ["Feminino", "Masculino", "Mista"];
  var TABS = [["semana", "Rodada"], ["lancar", "Meus jogos"], ["ranking", "Ranking"], ["regras", "Regras"], ["sorteio", "Sorteio"]];
  var S = { data: null, err: null, tab: "semana", cat: "Feminino", me: null, busy: false, forms: {}, checks: {}, loginErr: null, dispEdit: null, dispOpen: {}, sched: null };

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
  // Nome exibido no jogo: quem faltou aparece como o coringa que jogou no lugar.
  function nomeJ(j, p) { return j && j.coringa && j.coringa.ausente === p ? esc(j.coringa.coringa) + ' <span class="cor">(coringa)</span>' : esc(p); }
  function namesJ(j, l) { return nomeJ(j, l[0]) + " e " + nomeJ(j, l[1]); }
  function coringaNote(j) {
    return j.coringa ? '<p class="small cornote">🃏 <b>' + esc(j.coringa.coringa) + "</b> jogou de coringa no lugar de <b>" + esc(j.coringa.ausente) + "</b>, que fica com W.O. O coringa não pontua.</p>" : "";
  }
  var toastT;
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, Math.min(9000, 3000 + msg.length * 35)); }

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
  var TIPOS = { genero: "Feminino/Masculino", mista: "Mista" };
  function tipoDe(cat) { return cat === "Mista" ? "mista" : "genero"; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  // Dias e horários da rodada atual (horário de Brasília), sem os que já passaram.
  function weekDays(w) {
    var start = new Date(w.inicio).getTime(), end = new Date(w.prazo).getTime(), now = Date.now();
    var b = new Date(start - 3 * 3600e3), days = [];
    for (var i = 0; i < 31; i++) {
      var dt = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + i));
      if (dt.getTime() + 3 * 3600e3 > end) break;
      var ymd = dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate());
      var hours = [];
      for (var h = H_FIRST; h <= H_LAST; h++) {
        var t = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), h + 3);
        if (t >= start && t + 3600e3 <= end + 1 && t + 3600e3 > now) hours.push(h);
      }
      if (hours.length) days.push({ ymd: ymd, label: DOW[dt.getUTCDay()] + " " + pad2(dt.getUTCDate()) + "/" + pad2(dt.getUTCMonth() + 1), hours: hours });
    }
    return days;
  }
  function slotId(ymd, h) { return ymd + "T" + pad2(h); }
  function slotLabel(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(s || ""); if (!m) return "";
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return DOW[d.getUTCDay()] + " " + m[3] + "/" + m[2] + " às " + (+m[4]) + "h";
  }
  function validSlots(w) { var out = {}; weekDays(w).forEach(function (d) { d.hours.forEach(function (h) { out[slotId(d.ymd, h)] = 1; }); }); return out; }
  function dadoEu(nome, chave) { return (S.data.dados || []).filter(function (r) { return r.alvo === "eu" && r.chave === chave && r.jogador === nome; })[0]; }
  // Horários de um jogador para o tipo de jogo (genero ou mista). O registro antigo "disp" vale para os dois.
  function dispOf(nome, tipo) {
    var row = dadoEu(nome, "disp_" + tipo) || dadoEu(nome, "disp");
    if (!row) return null;
    try { var v = JSON.parse(row.valor); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function myTipos(nome) {
    var p = (S.data.jogadores || []).filter(function (x) { return x.nome === nome; })[0], out = [];
    if (!p) return ["genero", "mista"];
    if (p.categorias.indexOf("Feminino") >= 0 || p.categorias.indexOf("Masculino") >= 0) out.push("genero");
    if (p.categorias.indexOf("Mista") >= 0) out.push("mista");
    return out;
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
  function groupAvail(players, w, tipo) {
    var valid = validSlots(w), marked = [], missing = [], sets = {};
    players.forEach(function (p) { var d = dispOf(p, tipo); if (d) { marked.push(p); sets[p] = {}; d.forEach(function (s) { if (valid[s]) sets[p][s] = 1; }); } else missing.push(p); });
    var all = Object.keys(valid).filter(function (s) { return marked.length && marked.every(function (p) { return sets[p][s]; }); }).sort();
    var three = [];
    if (marked.length === players.length && !all.length && players.length === 4) {
      players.forEach(function (out) {
        var others = players.filter(function (p) { return p !== out; });
        var sl = Object.keys(valid).filter(function (s) { return others.every(function (p) { return sets[p][s]; }); }).sort();
        if (sl.length) three.push({ out: out, ranges: fmtRanges(sl, w) });
      });
    }
    return { marked: marked, missing: missing, all: all, three: three };
  }
  function availBox(players, w, tipo) {
    var g = groupAvail(players, w, tipo), n = players.length, html = '<div class="avail">';
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
    var sel = S.dispEdit.sel, days = weekDays(w), open = S.dispOpen || {};
    if (!days.length) return '<p class="small muted">Não há mais horários nesta rodada.</p>';
    return '<div class="stack" style="gap:10px">' + days.map(function (d) {
      var count = d.hours.filter(function (h) { return sel[slotId(d.ymd, h)]; }).length, isOpen = open[d.ymd];
      return '<div class="dday"><div class="spread"><button type="button" class="dlabel" data-day="' + d.ymd + '" aria-expanded="' + !!isOpen + '"><b>' + esc(d.label) + "</b> "
        + (count ? '<span class="dcount">' + count + "h</span>" : "") + '<span class="caret">' + (isOpen ? "▴" : "▾") + "</span></button>"
        + '<div class="row" style="gap:6px">' + PERIODS.filter(function (p) { return d.hours.some(function (h) { return h >= p[1] && h <= p[2]; }); }).map(function (p) {
          var hs = d.hours.filter(function (h) { return h >= p[1] && h <= p[2]; }), on = hs.every(function (h) { return sel[slotId(d.ymd, h)]; });
          return '<button type="button" class="pchip" aria-pressed="' + on + '" data-period="' + d.ymd + "|" + p[1] + "|" + p[2] + '">' + p[0] + "</button>";
        }).join("") + "</div></div>"
        + (isOpen ? '<div class="hours">' + d.hours.map(function (h) {
          var id = slotId(d.ymd, h);
          return '<button type="button" class="hchip" data-slot="' + id + '" aria-pressed="' + !!sel[id] + '">' + h + "h</button>";
        }).join("") + "</div>" : "") + "</div>";
    }).join("")
      + '<div class="row"><button class="btn" type="button" data-act="disp-save"' + (S.busy ? " disabled" : "") + '>Salvar horários</button><button class="link" type="button" data-act="disp-cancel">Cancelar</button></div></div>';
  }
  function dispPanel(w) {
    var me = S.me.nome, tipos = myTipos(me);
    var html = '<section class="panel"><h3>Meus horários livres nesta rodada</h3>';
    if (S.dispEdit) {
      var tp = S.dispEdit.tipo, other = tp === "mista" ? "genero" : "mista";
      return html + '<p class="small"><b>Para os jogos de ' + TIPOS[tp] + ".</b> Toque nos períodos ou abra o dia para escolher hora por hora (cada horário é o início de 1 hora de jogo).</p>"
        + (tipos.indexOf(other) >= 0 && dispOf(me, other) ? '<button class="link" type="button" data-act="disp-copy">Copiar os horários de ' + TIPOS[other] + "</button>" : "")
        + dispEditor(w) + "</section>";
    }
    html += '<p class="small muted">Marque quando pode jogar. O app mostra ao seu grupo os horários em que os quatro podem.</p>';
    tipos.forEach(function (tp) {
      var mine = dispOf(me, tp), ranges = mine ? fmtRanges(mine, w) : [];
      html += '<div class="dtipo"><div class="spread"><b>' + TIPOS[tp] + '</b><button class="btn ghost small-btn" type="button" data-act="disp-edit" data-tipo="' + tp + '">' + (mine ? "Editar" : "Marcar horários") + "</button></div>"
        + (mine ? (ranges.length ? '<p class="small">' + ranges.map(esc).join(" · ") + "</p>" : '<p class="small muted">Sem horário livre nesta rodada.</p>') : '<p class="small muted">Ainda não marcado.</p>') + "</div>";
    });
    return html + "</section>";
  }

  /* ---------- agendamento do grupo ---------- */
  function agendaOf(grupoKey) {
    var row = (S.data.dados || []).filter(function (r) { return r.alvo === "grupo:" + grupoKey && r.chave === "agenda"; })[0];
    if (!row || !row.valor) return null;
    try { return JSON.parse(row.valor); } catch (e) { return null; }
  }
  function agendaLine(grupoKey) {
    var ag = agendaOf(grupoKey);
    if (!ag) return "";
    return '<div class="agenda"><b>📅 Marcado: ' + esc(slotLabel(ag.quando)) + "</b>" + (ag.local ? " · " + esc(ag.local) : "") + '<span class="small muted"> (por ' + esc(ag.por) + ")</span></div>";
  }
  function scheduleBox(grupoKey, players, w, tipo) {
    var ag = agendaOf(grupoKey), f = S.sched && S.sched.key === grupoKey ? S.sched : null;
    if (!f) {
      return (ag ? agendaLine(grupoKey) : "")
        + '<div class="row" style="margin-top:8px"><button class="btn ghost" type="button" data-act="sched-open" data-g="' + esc(grupoKey) + '">' + (ag ? "Alterar dia e hora" : "Marcar dia e hora do jogo") + "</button>"
        + (ag ? '<button class="link" type="button" data-act="sched-cancel-game" data-g="' + esc(grupoKey) + '">Desmarcar</button>' : "") + "</div>";
    }
    var days = weekDays(w), common = groupAvail(players, w, tipo).all.slice(0, 6);
    var dayOpts = days.map(function (d) { return '<option value="' + d.ymd + '"' + (f.ymd === d.ymd ? " selected" : "") + ">" + esc(d.label) + "</option>"; }).join("");
    var dsel = days.filter(function (d) { return d.ymd === f.ymd; })[0] || days[0];
    var hourOpts = dsel ? dsel.hours.map(function (h) { return '<option value="' + h + '"' + (Number(f.h) === h ? " selected" : "") + ">" + h + "h</option>"; }).join("") : "";
    return '<form class="stack sched" style="gap:10px;margin-top:8px" data-g="' + esc(grupoKey) + '">'
      + (common.length ? '<div class="small"><b>Horários em que os quatro podem:</b><div class="row" style="gap:6px;margin-top:6px">' + common.map(function (s) { return '<button type="button" class="pchip" data-pick="' + s + '">' + esc(slotLabel(s)) + "</button>"; }).join("") + "</div></div>" : "")
      + '<div class="scorebox"><div class="field"><label for="sday">Dia</label><select id="sday">' + dayOpts + '</select></div><div class="field"><label for="shour">Hora</label><select id="shour">' + hourOpts + "</select></div></div>"
      + '<div class="field"><label for="slocal">Local (opcional)</label><input id="slocal" type="text" maxlength="60" placeholder="Ex.: quadra 2 do condomínio" value="' + esc(f.local || "") + '"></div>'
      + '<p class="small muted">Os quatro do grupo recebem um e-mail com a data e um convite para a agenda do celular.</p>'
      + '<div class="row"><button class="btn" type="submit"' + (S.busy ? " disabled" : "") + '>Marcar e avisar por e-mail</button><button class="link" type="button" data-act="sched-close">Cancelar</button></div></form>';
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
      + '<div class="teams"><span class="' + (w1 ? "win" : "") + '">' + namesJ(j, j.lado1) + '</span><span class="sc ' + (has ? "" : "none") + '">' + (has ? a + "×" + b : "×") + '</span><span class="r ' + (w2 ? "win" : "") + '">' + namesJ(j, j.lado2) + "</span></div>"
      + coringaNote(j)
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
    return '<div class="weekhead"><div class="stack" style="gap:6px"><span class="eyebrow">Rodada de ' + fmtDate(w.inicio) + " a " + fmtDate(w.prazo) + "</span>" + catSeg() + "</div>"
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
        + agendaLine(w.id + "|" + S.cat + "|" + letter)
        + availBox(players, w, tipoDe(S.cat))
        + games.map(function (j) { return gameRow(j); }).join("") + "</article>";
    }).join("") + "</div>";
    if (d.byes && d.byes.length) html += '<p class="byes"><b>De folga nesta rodada:</b> ' + d.byes.map(esc).join(", ") + ".</p>";
    if (w.extras && w.extras[S.cat]) html += '<p class="small cornote">' + esc(w.extras[S.cat]) + "</p>";
    html += '<p class="small muted">Cada jogador marca seus horários livres na aba “Meus jogos”, e o grupo vê aqui quando os quatro podem. Lá também se marca o dia e a hora do jogo, com aviso por e-mail. Quem ganha lança o placar; um dos que perderam confirma.</p>';
    return html;
  }

  function renderRanking() {
    var rows = (S.data.ranking && S.data.ranking[S.cat]) || [];
    var head = '<div class="spread"><h2>Classificação</h2>' + catSeg() + "</div>";
    if (!rows.length) return head + '<div class="panel"><p>Ainda não há jogos confirmados nesta categoria.</p></div>';
    var meName = S.me && S.me.nome;
    return head + '<div class="tablewrap"><table><thead><tr><th class="l">#</th><th class="l">Jogador</th><th>Pts</th><th>J</th><th>V</th><th>D</th><th>Games</th><th>Saldo</th></tr></thead><tbody>'
      + (function () {
        // Empate total (mesmos pontos, vitórias, games, saldo e jogos) fica na mesma posição; o regulamento manda sortear.
        var keyOf = function (r) { return [r.pontos, r.vitorias, r.gamesPro, r.gamesPro - r.gamesContra, r.jogos].join("|"); };
        var pos = [], tie = {};
        rows.forEach(function (r, i) { pos[i] = i && keyOf(r) === keyOf(rows[i - 1]) ? pos[i - 1] : i + 1; });
        rows.forEach(function (r, i) { if ((i && pos[i] === pos[i - 1]) || (i + 1 < rows.length && pos[i] === pos[i + 1])) tie[i] = 1; });
        return rows.map(function (r, i) {
        var s = r.gamesPro - r.gamesContra, n = pos[i];
        return '<tr class="' + (r.nome === meName ? "me" : "") + '"><td class="l"><span class="pos ' + (n <= 3 ? "g" + n : "") + '">' + n + '</span></td><td class="l">' + esc(r.nome) + (r.wo ? ' <span class="wo">' + r.wo + " W.O.</span>" : "") + (tie[i] ? ' <span class="tie">empate</span>' : "") + '</td><td class="pts">' + r.pontos + "</td><td>" + r.jogos + "</td><td>" + r.vitorias + "</td><td>" + r.derrotas + "</td><td>" + r.gamesPro + "</td><td>" + (s > 0 ? "+" : "") + s + "</td></tr>";
      }).join(""); })() + "</tbody></table></div>"
      + '<p class="small muted">Vitória 10 · derrota 5 · participação 2 · +1 por game ganho. W.O. vale 0 ponto. “Empate” marca quem está igual em todos os critérios: a organização sorteia a posição. Desempate: vitórias, games ganhos, saldo de games e jogos disputados. Só entram jogos confirmados.</p>';
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
  function coringaBox(j) {
    var me = S.me && S.me.nome, admin = S.me && S.me.admin, closed = Date.now() > new Date(j.prazo);
    if (!admin && closed) return "";
    var f = S.cor && S.cor.key === j.key ? S.cor : null, gente = j.lado1.concat(j.lado2);
    if (j.coringa && !f) return '<div class="row"><button class="link" type="button" data-act="cor-del" data-k="' + esc(j.key) + '">Remover coringa</button></div>';
    if (!f) return '<div class="row"><button class="link" type="button" data-act="cor-open" data-k="' + esc(j.key) + '">Teve coringa neste jogo?</button></div>';
    var aus = gente.filter(function (p) { return admin || p !== me; });
    var w = currentWeek(), d = w && w.sorteio[j.categoria], folga = (d && d.byes) || [];
    var cand = (S.data.jogadores || []).filter(function (p) { return p.categorias.indexOf(j.categoria) >= 0 && gente.indexOf(p.nome) < 0; }).map(function (p) { return p.nome; })
      .sort(function (x, y) { return (folga.indexOf(y) >= 0) - (folga.indexOf(x) >= 0) || x.localeCompare(y, "pt-BR"); });
    return '<form class="stack corf" style="gap:10px" data-k="' + esc(j.key) + '"><b class="small">Coringa neste jogo</b>'
      + '<div class="field"><label for="caus">Quem faltou</label><select id="caus" required><option value="">Escolha…</option>' + aus.map(function (p) { return "<option" + (f.ausente === p ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select></div>"
      + '<div class="field"><label for="ccor">Quem jogou de coringa</label><select id="ccor" required><option value="">Escolha…</option>' + cand.map(function (p) { return "<option" + (f.coringa === p ? " selected" : "") + ">" + esc(p) + (folga.indexOf(p) >= 0 ? " (de folga)" : "") + "</option>"; }).join("") + "</select></div>"
      + '<p class="small muted">Pelo regulamento, quem faltou fica com W.O. (0 ponto) e o coringa não pontua. Os outros três pontuam normalmente.</p>'
      + '<div class="row"><button class="btn" type="submit"' + (S.busy ? " disabled" : "") + '>Salvar coringa</button><button class="link" type="button" data-act="cor-close">Cancelar</button></div></form>';
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
      + "<p>Com <b>" + nomeJ(j, partner) + "</b> contra " + namesJ(j, opp) + "</p>" + body + coringaBox(j) + "</article>";
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
      html += '<div class="info"><b>Primeiro acesso.</b> Crie um código de 4 números e guarde. Ele é só seu: com ele você marca horários, agenda jogos, lança e confirma placares.</div>'
        + '<div class="field"><label for="lcod">Crie seu código</label><input id="lcod" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" required></div>'
        + '<div class="field"><label for="lcod2">Repita o código</label><input id="lcod2" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" required></div>'
        + '<div class="field"><label for="lemail">Seu e-mail (para receber os avisos de jogo marcado)</label><input id="lemail" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="nome@exemplo.com"></div>';
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
      var players = d.groups[gi].players || d.groups[gi], letter = "ABCDEFGHIJKLMNOP".charAt(gi), gk = w.id + "|" + c + "|" + letter;
      return '<article class="mycard"><span class="cat">' + esc(c) + " · Grupo " + letter + "</span><p>" + players.map(esc).join(" · ") + "</p>"
        + scheduleBox(gk, players, w, tipoDe(c)) + availBox(players, w, tipoDe(c)) + "</article>";
    }).join("");
    var pj = (S.data.jogadores || []).filter(function (x) { return x.nome === me; })[0];
    var emailBox = S.emailEdit || (pj && !pj.temEmail)
      ? '<form id="emailf" class="panel"><h3>' + (pj && pj.temEmail ? "Trocar meu e-mail" : "Cadastre seu e-mail") + '</h3><p class="small muted">Para receber o aviso quando alguém do seu grupo marcar o dia e a hora do jogo.</p><div class="field"><label for="memail">E-mail</label><input id="memail" type="email" inputmode="email" autocomplete="email" maxlength="120" required></div><div class="row"><button class="btn" type="submit"' + (S.busy ? " disabled" : "") + '>Salvar e-mail</button>' + (S.emailEdit ? '<button class="link" type="button" data-act="email-cancel">Cancelar</button>' : "") + "</div></form>"
      : "";
    return head + (pend.length ? '<div class="banner"><b>' + pend.length + (pend.length > 1 ? " placares esperam" : " placar espera") + " a sua confirmação.</b></div>" : "")
      + emailBox
      + (mine.length ? dispPanel(w) + (myGroups ? "<h3>Meus grupos</h3>" + '<div class="stack">' + myGroups + "</div>" : "") + "<h3>Meus jogos</h3>" : "")
      + (mine.length ? '<div class="stack">' + mine.map(myGameCard).join("") + "</div>" : '<div class="panel"><p>Você não tem jogos nesta rodada.</p></div>')
      + '<p class="small muted">Quem ganhou lança o placar; um dos que perderam confirma. Se alguém lançar errado, quem lançou pode corrigir até a confirmação.</p>'
      + (pj && pj.temEmail && !S.emailEdit ? '<p class="small muted">E-mail cadastrado para os avisos. <button class="link" type="button" data-act="email-edit">Trocar e-mail</button></p>' : "");
  }
  function renderAdmin() {
    var js = S.data.jogos.filter(function (j) { return j.status === "contestado" || j.status === "aguardando"; });
    var w = currentWeek(), all = w ? gamesOf(w.id) : [];
    var card = function (j) {
      var f = S.forms[j.key];
      return '<article class="mycard"><div class="spread"><span class="cat">' + esc(j.semana) + " · " + esc(j.categoria) + " · Grupo " + esc(j.grupo) + " · Jogo " + j.jogo + "</span>" + statusPill(j) + "</div>"
        + gameRow(j, " ") + coringaBox(j) + (f && f.mode ? scoreForm(j, "decidir") : '<div class="row"><button class="btn ghost" type="button" data-act="open" data-mode="decidir" data-k="' + esc(j.key) + '">Definir placar</button><button class="btn warn" type="button" data-act="anular" data-k="' + esc(j.key) + '">Apagar lançamentos</button></div>') + "</article>";
    };
    return '<div class="info">Modo organização: você pode definir o placar de qualquer jogo (inclusive fora do prazo) ou apagar os lançamentos.</div>'
      + "<h2>Pendentes e em disputa</h2>" + (js.length ? '<div class="stack">' + js.map(card).join("") + "</div>" : '<p class="muted">Nada pendente.</p>')
      + '<details><summary>Todos os jogos da rodada atual</summary><div class="stack" style="margin-top:10px">' + all.map(card).join("") + "</div></details>";
  }

  /* ---- sorteio ---- */
  function renderSorteio() {
    var ws = weeks().slice().reverse(), nx = S.data.proximo;
    var nsem = S.data.semanas_por_rodada || 2, quando = nsem === 1 ? "Toda segunda-feira" : "A cada " + nsem + " semanas, na segunda-feira";
    var html = '<section class="panel"><h2>Como é o sorteio</h2><p>' + quando + ' às 14h, uma rede internacional independente (drand) divulga um número aleatório. Os grupos da rodada saem desse número. Ninguém da organização escolhe nem consegue prever o resultado.</p>'
      + "<p>O sorteio evita colocar no mesmo grupo quem já jogou junto na mesma categoria. Na Mista, quem folgou menos vezes tem a vez de folgar.</p>"
      + '<p class="small muted">Qualquer pessoa pode conferir cada sorteio abaixo: o botão busca o número oficial e refaz a conta no seu celular. O código está público em <a href="' + esc(CFG.repoUrl) + '" target="_blank" rel="noopener">GitHub</a>.</p></section>';
    if (nx) html += '<div class="info"><b>Próximo sorteio:</b> segunda, ' + fmtDate(nx.inicio) + " às 14h, com o número da rodada " + nx.rodada.toLocaleString("pt-BR") + " do drand.</div>";
    html += ws.map(function (w, i) {
      var ck = S.checks[w.id];
      return '<section class="panel"><div class="spread"><h3>Rodada de ' + fmtDate(w.inicio) + "</h3>" + (ck ? '<span class="pill ' + (ck.ok ? "ok" : ck.ok === false ? "bad" : "") + '">' + esc(ck.label) + "</span>" : "") + "</div>"
        + '<dl class="facts"><dt>Rodada</dt><dd class="num">' + w.rodada.toLocaleString("pt-BR") + ' · <a href="' + Sorteio.drandUrl(w.rodada) + '" target="_blank" rel="noopener">ver no drand</a></dd><dt>Número</dt><dd class="mono">' + esc(w.randomness) + "</dd><dt>Método</dt><dd>" + (w.metodo === "v1" ? "Grupos na ordem do sorteio (1ª rodada)" : "Sem repetir quem já jogou junto") + "</dd></dl>"
        + (ck && ck.msg ? '<p class="small">' + esc(ck.msg) + "</p>" : "")
        + (w.extras ? Object.keys(w.extras).map(function (c) { return '<p class="small muted"><b>' + esc(c) + ":</b> " + esc(w.extras[c]) + " A conferência vale para os grupos sorteados.</p>"; }).join("") : "")
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
      var mine = Sorteio.fingerprint(d), so = w.sorteado || w.sorteio, theirs = Sorteio.fingerprint({ Feminino: norm(so.Feminino), Masculino: norm(so.Masculino), Mista: norm(so.Mista) });
      S.checks[id] = mine === theirs ? { ok: true, label: "Confere", msg: "O número veio direto do drand e a conta feita no seu celular deu exatamente os mesmos grupos e folgas." }
        : { ok: false, label: "Não confere", msg: "A conta no seu celular deu grupos diferentes dos publicados. Avise a organização." };
      render();
    }).catch(function () { S.checks[id] = { label: "Sem conexão", msg: "Não consegui falar com o drand agora. Tente de novo." }; render(); });
  }
  function norm(d) { return { groups: d.groups.map(function (g) { return { players: g.players || g }; }), byes: d.byes }; }

  /* ---- regras ---- */
  function renderRegras() {
    var nsem = S.data.semanas_por_rodada || 2, aceitar = !S.data.regras || S.data.regras.sem_validacao !== "pendente";
    var sec = function (t, body) { return '<section class="panel regra"><h3>' + t + "</h3>" + body + "</section>"; };
    return '<div class="spread"><h2>Regras do ranking</h2></div>'
      + sec("Categorias e classificação", "<ul><li>Três categorias: <b>Feminino</b>, <b>Masculino</b> e <b>Mista</b>.</li><li>A classificação é <b>individual</b>: cada jogador soma os próprios pontos, mesmo jogando em dupla.</li></ul>")
      + sec("Rodadas", "<ul><li>Cada rodada dura <b>" + (nsem === 1 ? "1 semana" : nsem + " semanas") + "</b>.</li><li>O sorteio sai na <b>segunda-feira às 14h</b> e o prazo para jogar vai até o <b>domingo às 20h</b> " + (nsem === 1 ? "da mesma semana" : "da última semana da rodada") + ".</li></ul>")
      + sec("Grupos e jogos", "<ul><li><b>Feminino e Masculino:</b> grupos de 4 pessoas, com 3 jogos trocando as duplas. Cada um joga uma vez com cada parceiro do grupo.</li><li><b>Mista:</b> grupos de 2 homens e 2 mulheres, com 2 jogos. A dupla é sempre 1 homem e 1 mulher.</li><li>Os jogos do grupo podem ser feitos em qualquer ordem, de preferência seguidos, no mesmo dia.</li></ul>")
      + sec("Sorteio e folgas", "<ul><li>Os grupos saem de um número aleatório público, e qualquer um pode conferir na aba Sorteio.</li><li>O sorteio evita colocar no mesmo grupo quem já jogou junto na mesma categoria.</li><li>Quando o número de inscritos não fecha em grupos completos, algumas pessoas folgam. Folga quem folgou menos vezes até ali.</li><li><b>Folga não é W.O.:</b> ninguém perde ponto, só não joga naquela rodada.</li></ul>")
      + sec("Pontuação", '<table class="pts-table"><tbody><tr><td>Vitória</td><td>10</td></tr><tr><td>Derrota</td><td>5</td></tr><tr><td>Participação (por jogo)</td><td>2</td></tr><tr><td>Cada game ganho</td><td>+1</td></tr><tr><td>W.O. (quem faltou)</td><td>0</td></tr></tbody></table>'
        + '<p class="small muted">Exemplo: quem vence por 6×4 soma 10 + 2 + 6 = 18 pontos; quem perde soma 5 + 2 + 4 = 11.</p>')
      + sec("Desempate", "<ol><li>Mais vitórias</li><li>Mais games ganhos</li><li>Maior saldo de games</li><li>Mais jogos disputados</li><li>Sorteio</li></ol>")
      + sec("Como marcar o jogo", "<ul><li>Em <b>Meus jogos</b>, marque seus horários livres, separados para Feminino/Masculino e para Mista.</li><li>O grupo vê os horários em que os quatro podem.</li><li>Qualquer um do grupo marca o dia e a hora, e os quatro recebem um e-mail com o convite para a agenda.</li></ul>")
      + sec("Placar", "<ul><li><b>Quem ganhou lança</b> o placar no app.</li><li><b>Um dos que perderam confirma</b>. Se estiver errado, contesta, e a organização decide.</li><li>Só conta jogo confirmado." + (aceitar ? " Se ninguém confirmar até o prazo, vale o placar lançado." : " Jogo sem confirmação até o prazo fica pendente até a organização decidir.") + "</li><li>Jogo depois do prazo só com liberação da organização.</li></ul>")
      + sec("Faltas e coringa", "<ul><li>Como o ranking é individual, e não de duplas, quem não comparece fica com <b>W.O.</b> (0 ponto).</li><li>Para que os outros três não percam o jogo, o grupo pode chamar um <b>coringa</b> inscrito no ranking. O coringa está ali só para dar jogo e não pontua. Os três que vieram jogar pontuam normalmente.</li><li>Se o jogo não acontecer, os pontos de quem compareceu são definidos pela organização.</li></ul>")
      + sec("Acesso", "<ul><li>No primeiro acesso, cada jogador cria um código de 4 números e cadastra o e-mail.</li><li>O código é pessoal: não passe para ninguém. Se esquecer, fale com a organização.</li></ul>");
  }

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
    else if (S.tab === "regras") html += renderRegras();
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
    if (t.dataset.slot && S.dispEdit) { var se = S.dispEdit.sel; if (se[t.dataset.slot]) delete se[t.dataset.slot]; else se[t.dataset.slot] = 1; render(); return; }
    if (t.dataset.day && S.dispEdit) { S.dispOpen[t.dataset.day] = !S.dispOpen[t.dataset.day]; render(); return; }
    if (t.dataset.period && S.dispEdit) {
      var pp = t.dataset.period.split("|"), dd = weekDays(currentWeek()).filter(function (d) { return d.ymd === pp[0]; })[0], ids = [];
      (dd ? dd.hours : []).forEach(function (h) { if (h >= Number(pp[1]) && h <= Number(pp[2])) ids.push(slotId(pp[0], h)); });
      var sel2 = S.dispEdit.sel, allOn = ids.every(function (x) { return sel2[x]; });
      ids.forEach(function (x) { if (allOn) delete sel2[x]; else sel2[x] = 1; });
      render(); return;
    }
    if (t.dataset.pick && S.sched) { var mm = /^(.{10})T(\d{2})$/.exec(t.dataset.pick); S.sched.ymd = mm[1]; S.sched.h = Number(mm[2]); S.sched.local = ($("#slocal") || {}).value || S.sched.local; render(); return; }
    if (t.dataset.step) {
      var parts = t.dataset.step.split("|"), field = parts.pop(), key = parts.join("|"), f = S.forms[key] || (S.forms[key] = { nos: 0, eles: 0 });
      f[field] = Math.max(0, Math.min(7, f[field] + Number(t.dataset.d))); render(); return;
    }
    var a = t.dataset.act, k = t.dataset.k;
    if (!a) return;
    if (a === "open") { S.forms[k] = Object.assign({ nos: 0, eles: 0 }, S.forms[k], { mode: t.dataset.mode }); render(); return; }
    if (a === "cancel") { delete S.forms[k]; render(); return; }
    if (a === "sair") { S.me = null; S.dispEdit = null; S.sched = null; S.emailEdit = false; S.cor = null; saveMe(); render(); return; }
    if (a === "disp-edit") {
      var tipo = t.dataset.tipo, sel = {}; (dispOf(S.me.nome, tipo) || []).forEach(function (s) { sel[s] = 1; });
      S.dispEdit = { tipo: tipo, sel: sel }; S.dispOpen = {}; render(); return;
    }
    if (a === "disp-copy" && S.dispEdit) { var oth = S.dispEdit.tipo === "mista" ? "genero" : "mista"; S.dispEdit.sel = {}; (dispOf(S.me.nome, oth) || []).forEach(function (s) { S.dispEdit.sel[s] = 1; }); render(); return; }
    if (a === "disp-cancel") { S.dispEdit = null; render(); return; }
    if (a === "disp-save") {
      var valid = validSlots(currentWeek()), keep = Object.keys(S.dispEdit.sel).filter(function (s) { return valid[s]; }).sort();
      act({ acao: "guardar", chave: "disp_" + S.dispEdit.tipo, alvo: "eu", valor: JSON.stringify(keep) }, keep.length ? "Horários salvos." : "Salvo: sem horário livre nesta rodada.").then(function () { S.dispEdit = null; render(); });
      return;
    }
    if (a === "sched-open") {
      var ag = agendaOf(t.dataset.g), dd0 = weekDays(currentWeek())[0];
      var m0 = ag && /^(.{10})T(\d{2})$/.exec(ag.quando || "");
      S.sched = { key: t.dataset.g, ymd: m0 ? m0[1] : dd0 && dd0.ymd, h: m0 ? Number(m0[2]) : 19, local: ag ? ag.local : "" }; render(); return;
    }
    if (a === "sched-close") { S.sched = null; render(); return; }
    if (a === "sched-cancel-game") {
      if (S.armed !== "unsched:" + t.dataset.g) { S.armed = "unsched:" + t.dataset.g; t.textContent = "Toque de novo para desmarcar"; return; }
      S.armed = null;
      actSched({ acao: "agendar", grupo: t.dataset.g, desmarcar: true }, true); return;
    }
    if (a === "cor-open") { S.cor = { key: k, ausente: "", coringa: "" }; render(); return; }
    if (a === "cor-close") { S.cor = null; render(); return; }
    if (a === "cor-del") {
      if (S.armed !== "cor:" + k) { S.armed = "cor:" + k; t.textContent = "Toque de novo para remover o coringa"; return; }
      S.armed = null; act({ acao: "guardar", chave: "coringa", alvo: k, valor: "" }, "Coringa removido."); return;
    }
    if (a === "email-edit") { S.emailEdit = true; render(); return; }
    if (a === "email-cancel") { S.emailEdit = false; render(); return; }
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
    if (e.target.id === "sday" && S.sched) {
      S.sched.ymd = e.target.value; S.sched.local = ($("#slocal") || {}).value || "";
      var d1 = weekDays(currentWeek()).filter(function (d) { return d.ymd === S.sched.ymd; })[0];
      if (d1 && d1.hours.indexOf(Number(S.sched.h)) < 0) S.sched.h = d1.hours[0];
      render();
    }
    if (e.target.id === "shour" && S.sched) S.sched.h = Number(e.target.value);
  });
  function actSched(body, desmarcar) {
    S.busy = true; render();
    return post(Object.assign({ nome: S.me.nome, codigo: S.me.codigo }, body)).then(function (r) {
      var msg = desmarcar ? "Jogo desmarcado." : "Jogo marcado.";
      if (r.enviados) msg += " E-mail enviado para " + r.enviados + (r.enviados > 1 ? " pessoas." : " pessoa.");
      if (r.semEmail && r.semEmail.length) msg += " Sem e-mail cadastrado: " + r.semEmail.join(", ") + ". Avise no grupo.";
      if (r.erroEmail) msg += " Não consegui enviar os e-mails agora.";
      S.sched = null; toast(msg); return load();
    }).catch(function (e) { toast(e.message); }).then(function () { S.busy = false; render(); });
  }
  document.addEventListener("submit", function (e) {
    if (e.target.classList.contains("sched") && S.sched) {
      e.preventDefault();
      S.sched.h = Number($("#shour").value); S.sched.ymd = $("#sday").value; S.sched.local = $("#slocal").value.trim();
      actSched({ acao: "agendar", grupo: S.sched.key, quando: slotId(S.sched.ymd, S.sched.h), local: S.sched.local }, false);
      return;
    }
    if (e.target.classList.contains("corf") && S.cor) {
      e.preventDefault();
      var ausv = $("#caus").value, corv = $("#ccor").value.replace(/ \(de folga\)$/, "");
      if (!ausv || !corv) { toast("Escolha quem faltou e quem foi o coringa."); return; }
      var kk = S.cor.key;
      act({ acao: "guardar", chave: "coringa", alvo: kk, valor: JSON.stringify({ ausente: ausv, coringa: corv }) }, "Coringa registrado: " + ausv.split(" ")[0] + " fica com W.O.").then(function () { S.cor = null; render(); });
      return;
    }
    if (e.target.id === "emailf") {
      e.preventDefault();
      var em = $("#memail").value.trim();
      act({ acao: "email", email: em }, "E-mail salvo.").then(function () { S.emailEdit = false; render(); });
      return;
    }
    if (e.target.id !== "login") return;
    e.preventDefault();
    var nome = $("#lnome").value, codigo = ($("#lcod") ? $("#lcod").value : "").trim(), c2 = $("#lcod2");
    if (!nome || !codigo) return;
    var first = Promise.resolve();
    if (c2) {
      if (!/^[0-9]{4}$/.test(codigo)) { S.loginErr = "O código precisa ter exatamente 4 números."; render(); return; }
      if (c2.value.trim() !== codigo) { S.loginErr = "Os dois códigos não são iguais. Digite de novo."; render(); return; }
      var em0 = ($("#lemail") ? $("#lemail").value : "").trim();
      if (em0 && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em0)) { S.loginErr = "Confira o e-mail: parece incompleto."; render(); return; }
      first = post({ acao: "criar_codigo", nome: nome, codigo: codigo, email: em0 });
    }
    S.busy = true; S.loginErr = null; render();
    first.then(function () { return post({ acao: "entrar", nome: nome, codigo: codigo }); }).then(function (d) {
      S.me = { nome: d.nome, codigo: codigo, admin: !!d.admin }; saveMe(); S.loginNome = null;
      toast(c2 ? "Código criado. Bem-vindo(a), " + d.nome.split(" ")[0] + "!" : "Tudo certo, " + d.nome.split(" ")[0] + "!");
      if (c2) load();
    }).catch(function (err) { S.loginErr = err.message; }).then(function () { S.busy = false; render(); });
  });

  function refreshIfStale(ms) { if (S.data && !S.busy && !S.dispEdit && !S.sched && !S.emailEdit && !S.cor && !Object.keys(S.forms).length && Date.now() - (S.loadedAt || 0) > ms) load(); }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") refreshIfStale(15000); });

  render();
  load();
  setInterval(function () { if (document.visibilityState === "visible" && !S.busy && !Object.keys(S.forms).length && !S.dispEdit && !S.sched && !S.emailEdit && !S.cor && !document.querySelector("#emailf input:focus")) load(); }, 60000);
})();
