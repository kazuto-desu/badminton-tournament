/* =========================================================
 * apply.js — 参加者用 オンライン申込ページ
 * ========================================================= */
(function () {
  'use strict';
  const esc = BT.esc;
  const app = document.getElementById('app');
  const qs = new URLSearchParams(location.search);
  const api = qs.get('api'), tid = qs.get('t');
  let snap = null;

  function closedReason() {
    const t = snap.tournament;
    if (t.acceptApply === false) return '現在、申込を受け付けていません。';
    if (t.deadline) {
      const d = new Date(t.deadline + 'T23:59:59+09:00');
      if (!isNaN(d) && Date.now() > d.getTime()) return `申込締切（${BTR.fmtDate(t.deadline)}）を過ぎました。`;
    }
    return '';
  }

  function playersHTML(ev) {
    const n = BT.playerCount(ev);
    if (BT.isTeamEv(ev)) {
      const min = Math.max(1, +ev.teamMin || 1);
      return `<h4>チーム</h4><div class="grid"><label class="f"><span>チーム名 *</span><input name="teamName" required placeholder="○○クラブA"></label><label class="f"><span>所属 *</span><input name="team" required placeholder="○○クラブ"></label></div>
        <h4>メンバー（${min}〜${n}名）</h4><p class="small muted">1試合の内訳：${esc(BT.rubberList(ev).join('・'))}</p>
        <div class="grid">${Array.from({ length: n }, (_, i) => `<label class="f"><span>メンバー${i + 1}${i < min ? ' *' : ''}</span><input name="p${i}name"${i < min ? ' required' : ''} autocomplete="off"></label>`).join('')}</div>`;
    }
    return Array.from({ length: n }, (_, i) => `<h4>${n > 1 ? `選手${i + 1}` : '選手'}</h4><div class="grid">
      <label class="f"><span>氏名 *</span><input name="p${i}name" required autocomplete="off" placeholder="山田 太郎"></label>
      <label class="f"><span>フリガナ</span><input name="p${i}kana" autocomplete="off" placeholder="ヤマダ タロウ"></label>
      <label class="f"><span>所属 *</span><input name="p${i}team" required placeholder="○○クラブ"></label></div>`).join('');
  }

  function render() {
    const t = snap.tournament;
    document.title = (t.name || '大会') + ' 参加申込';
    document.getElementById('title').textContent = (t.name || '大会') + '　参加申込';
    document.getElementById('sub').textContent = [BTR.fmtDate(t.date), t.venue].filter(Boolean).join('　');
    const closed = closedReason();
    const evs = snap.events;
    app.innerHTML = `<details class="card"><summary><b>大会要項を見る</b></summary><div style="margin-top:12px">${BTR.guide(snap)}</div></details>
      ${closed ? `<div class="notice err">${esc(closed)}</div>` : `<form class="card" id="f"><h3>申込フォーム</h3>
        ${t.deadline ? `<p class="small">申込締切：<b>${esc(BTR.fmtDate(t.deadline))}</b></p>` : ''}
        <label class="f"><span>種目 *</span><select name="eventId" required><option value="">選択してください</option>${evs.map((e) => `<option value="${e.id}">${esc(e.name)}${e.fee ? '（' + esc(e.fee) + '）' : ''}${e.capacity ? `　定員${esc(e.capacity)}` : ''}</option>`).join('')}</select></label>
        <div id="players"></div>
        <h4>申込責任者（大会からの連絡先）</h4>
        <div class="grid"><label class="f"><span>氏名 *</span><input name="contactName" required></label>
        <label class="f"><span>メールアドレス</span><input type="email" name="contactEmail" autocomplete="email"></label>
        <label class="f"><span>電話番号</span><input type="tel" name="contactTel" autocomplete="tel"></label>
        <p class="small wide" style="margin:0">※メールアドレスか電話番号の<b>どちらか一方は必須</b>です。</p>
        <label class="f wide"><span>備考</span><textarea name="memo" rows="2"></textarea></label></div>
        <p class="small muted">ご入力の個人情報は本大会の運営（組み合わせ・プログラム作成、連絡）にのみ使用します。選手氏名と所属は組み合わせ表・結果として公開されます。</p>
        <label class="chk"><input type="checkbox" name="agree" required> 上記に同意して申し込みます</label>
        <div id="msg"></div>
        <div class="row" style="margin-top:12px"><button class="btn primary" type="submit" id="submit">申し込む</button></div></form>`}`;
    const f = document.getElementById('f');
    if (!f) return;
    const sel = f.eventId;
    sel.addEventListener('change', () => {
      const ev = evs.find((e) => e.id === sel.value);
      document.getElementById('players').innerHTML = ev ? playersHTML(ev) : '';
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ev = evs.find((x) => x.id === sel.value);
      if (!ev) return;
      const fd = new FormData(f);
      if (!String(fd.get('contactEmail') || '').trim() && !String(fd.get('contactTel') || '').trim()) {
        document.getElementById('msg').innerHTML = '<div class="notice err">申込責任者のメールアドレスか電話番号のどちらかを入力してください。</div>';
        f.contactEmail.focus();
        return;
      }
      const n = BT.playerCount(ev);
      const team = BT.isTeamEv(ev);
      const entry = {
        eventId: ev.id,
        teamName: team ? fd.get('teamName') : '', team: team ? fd.get('team') : '',
        players: Array.from({ length: n }, (_, i) => ({ name: fd.get(`p${i}name`) || '', kana: fd.get(`p${i}kana`) || '', team: team ? fd.get('team') : (fd.get(`p${i}team`) || '') })).filter((p) => p.name.trim()),
        contactName: fd.get('contactName'), contactEmail: fd.get('contactEmail'), contactTel: fd.get('contactTel'), memo: fd.get('memo'),
      };
      const btn = document.getElementById('submit');
      btn.disabled = true; btn.textContent = '送信中…';
      try {
        const r = await BTAPI.apply(api, tid, entry);
        app.innerHTML = `<div class="card"><h3>✅ 申込を受け付けました</h3><p>種目：<b>${esc(ev.name)}</b><br>${entry.teamName ? `<b>${esc(entry.teamName)}</b>（${esc(entry.team)}）<br>` : ''}${entry.players.map((p) => esc(p.name) + (p.team ? `（${esc(p.team)}）` : '')).join('・')}</p><p class="small muted">受付番号：<code>${esc(r.id)}</code>　この画面を保存またはスクリーンショットしておいてください。</p><p><a href="${esc(location.href)}">続けて別の申込をする</a></p></div>`;
        window.scrollTo(0, 0);
      } catch (err) {
        document.getElementById('msg').innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
        btn.disabled = false; btn.textContent = '申し込む';
      }
    });
  }

  (async () => {
    if (!api) { app.innerHTML = '<div class="notice err">申込ページのURLが正しくありません。大会主催者から案内されたURLを開いてください。</div>'; return; }
    try { snap = await BTAPI.getPublic(api, tid); render(); }
    catch (e) { app.innerHTML = `<div class="notice err">大会情報を読み込めませんでした：${esc(e.message)}</div>`; }
  })();
})();
