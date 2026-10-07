/* =========================================================
 * view.js — 公開ページ（要項・組み合わせ・タイムテーブル・速報）
 * ========================================================= */
(function () {
  'use strict';
  const esc = BT.esc;
  const app = document.getElementById('app');
  const tabs = document.getElementById('tabs');
  const params = new URLSearchParams(location.search);
  const api = params.get('api');
  let snap = null, c = null;
  let tab = params.get('tab') || 'results', evId = '', q = '';

  const TABS = [['results', '結果・速報'], ['draw', '組み合わせ'], ['time', 'タイムテーブル'], ['list', '試合一覧'], ['guide', '大会要項']];

  function render() {
    const t = snap.tournament;
    document.title = t.name || '大会情報';
    document.getElementById('title').textContent = t.name || '大会情報';
    document.getElementById('sub').textContent = [BTR.fmtDate(t.date), t.venue, `更新 ${new Date(snap.publishedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join('　');
    tabs.innerHTML = TABS.map(([k, lb]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${lb}</button>`).join('');
    const evSel = `<select id="evSel"><option value="">全種目</option>${snap.events.map((e) => `<option value="${e.id}"${evId === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>`;
    let h = '';
    if (tab === 'guide') h = BTR.guide(snap);
    else if (tab === 'results') h = `<div class="res-grid">${BTR.results(c)}</div>`;
    else if (tab === 'draw') {
      h = `<div class="card row">${evSel}</div>` + snap.events.filter((e) => !evId || e.id === evId).map((ev) => `<section class="card"><h3><span class="evdot" style="background:${BTR.evColor(c, ev.id)}"></span>${esc(ev.name)} <span class="pill">${BT.FORMATS[ev.format]}</span></h3>${BTR.eventDraw(c, ev)}</section>`).join('');
    } else if (tab === 'time') h = `<div class="card row">${evSel}<span class="small muted">選んだ種目以外を薄く表示します</span></div><div class="card">${BTR.timetable(c, { eventId: evId })}</div>`;
    else if (tab === 'list') h = `<div class="card row">${evSel}<input id="q" placeholder="選手名・所属で検索" value="${esc(q)}" style="flex:1;min-width:160px"></div><div class="card tbl-scroll" id="listBody">${BTR.matchList(c, { eventId: evId })}</div>`;
    app.innerHTML = h;
    filterList();
  }

  function filterList() {
    const body = document.getElementById('listBody');
    if (!body || !q) return;
    const k = q.replace(/[\s　]/g, '');
    body.querySelectorAll('tr.mrow').forEach((tr) => { tr.style.display = tr.textContent.replace(/[\s　]/g, '').includes(k) ? '' : 'none'; });
  }

  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
  app.addEventListener('change', (e) => { if (e.target.id === 'evSel') { evId = e.target.value; render(); } });
  app.addEventListener('input', (e) => { if (e.target.id === 'q') { q = e.target.value; app.querySelectorAll('tr.mrow').forEach((tr) => { tr.style.display = ''; }); filterList(); } });

  async function load() {
    try {
      snap = await BTAPI.getPublic(api);
      c = BT.ctx(snap);
      if (!document.activeElement || document.activeElement.id !== 'q') render();
    } catch (e) {
      if (!snap) app.innerHTML = `<div class="notice err">大会情報を読み込めませんでした：${esc(e.message)}</div>`;
    }
  }

  if (!api) { app.innerHTML = '<div class="notice err">URLが正しくありません。大会主催者から案内されたURLを開いてください。</div>'; return; }
  load();
  setInterval(load, 60000); // 1分ごとに自動更新
})();
