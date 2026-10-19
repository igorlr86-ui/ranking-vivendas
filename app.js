(function () {
  "use strict";
  var CFG = window.RANKING_CONFIG || {};
  var CATS = ["Feminino", "Masculino", "Mista"];
  var TABS = [["semana", "Semana"], ["lancar", "Lançar placar"], ["ranking", "Ranking"], ["sorteio", "Sorteio"]];
  var S = { data: null, err: null, tab: "semana", cat: "Feminino", me: null, busy: false, forms: {}, checks: {}, loginErr: null };

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
      S.data = d; S.err = null; render();
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
        + games.map(function (j) { return gameRow(j); }).join("") + "</article>";
    }).join("") + "</div>";
    if (d.byes && d.byes.length) html += '<p class="byes"><b>De folga nesta semana:</b> ' + d.byes.map(esc).join(", ") + ".</p>";
    html += '<p class="small muted">Os jogos do grupo podem ser feitos em qualquer ordem. Quem ganha lança o placar na aba “Lançar placar”; um dos que perderam confirma.</p>';
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
    var opts = (S.data.jogadores || []).map(function (p) { return p.nome; }).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
    return '<section class="panel"><h2>Entrar</h2><p class="muted">Escolha seu nome e digite o código pessoal que a organização mandou no seu WhatsApp. Este aparelho guarda o acesso.</p>'
      + '<form id="login" class="stack" style="gap:12px"><div class="field"><label for="lnome">Seu nome</label><select id="lnome" required><option value="">Escolha…</option>'
      + opts.map(function (n) { return '<option>' + esc(n) + "</option>"; }).join("") + '<option value="Organização">Organização</option></select></div>'
      + '<div class="field"><label for="lcod">Código pessoal</label><input id="lcod" type="password" inputmode="numeric" autocomplete="off" maxlength="8" required></div>'
      + (S.loginErr ? '<div class="err">' + esc(S.loginErr) + "</div>" : "")
      + '<button class="btn" type="submit"' + (S.busy ? " disabled" : "") + ">Entrar</button></form></section>";
  }
  function renderLancar() {
    if (!S.me) return renderLogin();
    var w = currentWeek(), me = S.me.nome;
    var head = '<div class="spread"><div><span class="eyebrow">Conectado como</span><h2>' + esc(me) + '</h2></div><button class="link" type="button" data-act="sair">Sair</button></div>';
    if (S.me.admin) return head + renderAdmin();
    if (!w) return head + '<div class="panel"><p>Ainda não há sorteio.</p></div>';
    var mine = gamesOf(w.id).filter(function (j) { return sideOf(j, me); });
    var pend = mine.filter(function (j) { return j.status === "aguardando" && j.proposta.lado !== sideOf(j, me); });
    return head + (pend.length ? '<div class="banner"><b>' + pend.length + (pend.length > 1 ? " placares esperam" : " placar espera") + " a sua confirmação.</b></div>" : "")
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
    if (t.dataset.tab) { S.tab = t.dataset.tab; saveUi(); history.replaceState(null, "", "#" + S.tab); render(); window.scrollTo(0, 0); return; }
    if (t.dataset.cat) { S.cat = t.dataset.cat; saveUi(); render(); return; }
    if (t.dataset.step) {
      var parts = t.dataset.step.split("|"), field = parts.pop(), key = parts.join("|"), f = S.forms[key] || (S.forms[key] = { nos: 0, eles: 0 });
      f[field] = Math.max(0, Math.min(7, f[field] + Number(t.dataset.d))); render(); return;
    }
    var a = t.dataset.act, k = t.dataset.k;
    if (!a) return;
    if (a === "open") { S.forms[k] = Object.assign({ nos: 0, eles: 0 }, S.forms[k], { mode: t.dataset.mode }); render(); return; }
    if (a === "cancel") { delete S.forms[k]; render(); return; }
    if (a === "sair") { S.me = null; saveMe(); render(); return; }
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
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "login") return;
    e.preventDefault();
    var nome = $("#lnome").value, codigo = $("#lcod").value.trim();
    if (!nome || !codigo) return;
    S.busy = true; S.loginErr = null; render();
    post({ acao: "entrar", nome: nome, codigo: codigo }).then(function (d) {
      S.me = { nome: d.nome, codigo: codigo, admin: !!d.admin }; saveMe(); toast("Tudo certo, " + d.nome.split(" ")[0] + "!");
    }).catch(function (err) { S.loginErr = err.message; }).then(function () { S.busy = false; render(); });
  });

  render();
  load();
  setInterval(function () { if (document.visibilityState === "visible" && !S.busy && !Object.keys(S.forms).length) load(); }, 60000);
})();
