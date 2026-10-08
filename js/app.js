/* =========================================================
 * app.js — 管理画面
 * ========================================================= */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = BT.esc;
  const main = $('#main');

  // ---------- 保存 ----------
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };
  const getIndex = () => { try { return JSON.parse(LS.get('bt.index')) || []; } catch (e) { return []; } };
  const setIndex = (l) => LS.set('bt.index', JSON.stringify(l));

  function migrate(s) {
    if (!s) return null;
    const base = BT.newTournament();
    s.tournament = Object.assign(base.tournament, s.tournament || {});
    s.events = (s.events || []).map((e) => Object.assign(BT.newEvent(), e));
    s.entries = s.entries || [];
    s.draws = s.draws || {};
    s.matches = s.matches || [];
    s.ignoredIds = s.ignoredIds || [];
    return s;
  }
  const loadT = (id) => { try { return migrate(JSON.parse(LS.get('bt.t.' + id))); } catch (e) { return null; } };

  // Google連携の設定（全大会で共通）
  const getApi = () => { try { return JSON.parse(LS.get('bt.api')) || {}; } catch (e) { return {}; } };
  const setApi = (o) => LS.set('bt.api', JSON.stringify(Object.assign(getApi(), o)));
  const API = () => { const a = getApi(); return { url: a.url || (S && S.tournament.apiUrl) || '', key: a.key || (S && S.tournament.apiKey) || '', indexUrl: a.indexUrl || '' }; };
  const linked = () => !!(API().url && API().key);
  const pageUrl = (page) => (API().url ? new URL(page, location.href).href + '?api=' + encodeURIComponent(API().url) + '&t=' + encodeURIComponent(S.id) : '');
  // LINE・メールで送る用（Google側の案内ページ。リンクのプレビューに大会名が出る）
  const shareUrl = (kind) => (API().url ? API().url + '?share=' + kind + '&t=' + encodeURIComponent(S.id) : '');

  const getTpls = () => { try { return JSON.parse(LS.get('bt.templates')) || []; } catch (e) { return []; } };
  const setTpls = (l) => LS.set('bt.templates', JSON.stringify(l));

  let S = null;
  let ui = (() => { try { return JSON.parse(LS.get('bt.ui')) || {}; } catch (e) { return {}; } })();
  ui = Object.assign({ tab: 'guide', evFilter: '', ttView: 'grid', ttEv: '', runEv: '', runFilter: 'pending', swap: {} }, ui);
  const saveUI = () => LS.set('bt.ui', JSON.stringify(Object.assign({}, ui, { swap: {} })));

  let saveTimer = null, pubTimer = null, syncing = false;
  function save(immediate) {
    S.updatedAt = Date.now();
    const write = () => {
      const ok = LS.set('bt.t.' + S.id, JSON.stringify(S));
      const idx = getIndex().filter((x) => x.id !== S.id);
      idx.unshift({ id: S.id, name: S.tournament.name || '（無題の大会）', updatedAt: S.updatedAt });
      setIndex(idx);
      LS.set('bt.current', S.id);
      setStatus(ok ? '保存しました ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '⚠ ブラウザに保存できません（JSONで書き出してください）');
      refreshSelector();
    };
    clearTimeout(saveTimer);
    if (immediate) write(); else saveTimer = setTimeout(write, 300);
    if (!syncing && S.tournament.autoPublish !== false && S.sheetUrl && linked()) {
      clearTimeout(pubTimer);
      pubTimer = setTimeout(() => publish(true), 8000);
    }
  }
  const setStatus = (t) => { $('#status').textContent = t; };

  function switchTo(id) {
    const s = loadT(id);
    if (!s) return;
    S = s; LS.set('bt.current', id); render();
  }
  function createNew(state) {
    S = migrate(state || BT.newTournament());
    save(true); ui.tab = 'guide'; render();
  }

  function refreshSelector() {
    const sel = $('#tSelect');
    const idx = getIndex();
    sel.innerHTML = idx.map((x) => `<option value="${x.id}"${S && x.id === S.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  }

  // ---------- パス指定で値を設定 ----------
  function setPath(path, v) {
    const ts = path.split('.');
    let o = S;
    const step = (obj, t) => (t[0] === '#' ? obj.find((x) => x.id === t.slice(1)) : obj[t]);
    for (let i = 0; i < ts.length - 1; i++) { o = step(o, ts[i]); if (o == null) return; }
    const last = ts[ts.length - 1];
    o[last] = v;
  }
  const getPath = (path) => path.split('.').reduce((o, t) => (o == null ? o : t[0] === '#' ? o.find((x) => x.id === t.slice(1)) : o[t]), S);

  // 入力欄HTML
  function field(label, path, opts = {}) {
    const v = getPath(path);
    const type = opts.type || 'text';
    const attrs = `data-bind="${path}"${opts.rerender ? ' data-rerender="1"' : ''}${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ''}`;
    let input;
    if (type === 'textarea') input = `<textarea ${attrs} rows="${opts.rows || 3}">${esc(v)}</textarea>`;
    else if (type === 'select') input = `<select ${attrs}>${opts.options.map(([val, lb]) => `<option value="${esc(val)}"${String(v) === String(val) ? ' selected' : ''}>${esc(lb)}</option>`).join('')}</select>`;
    else if (type === 'checkbox') return `<label class="chk${opts.cls ? ' ' + opts.cls : ''}"><input type="checkbox" ${attrs}${v ? ' checked' : ''}> ${esc(label)}</label>`;
    else input = `<input type="${type}" ${attrs} value="${esc(v ?? '')}"${opts.min != null ? ` min="${opts.min}"` : ''}>`;
    return `<label class="f${opts.cls ? ' ' + opts.cls : ''}"><span>${esc(label)}</span>${input}${opts.hint ? `<small>${esc(opts.hint)}</small>` : ''}</label>`;
  }

  // ---------- 描画 ----------
  const TABS = [['guide', '大会要項'], ['events', '種目'], ['entries', '申込'], ['draw', '組み合わせ'], ['time', 'タイムテーブル'], ['pamphlet', 'パンフレット'], ['run', '進行・結果入力'], ['results', '結果'], ['settings', '設定・連携']];

  function render() {
    if (S.sheetUrl && linked()) { S.tournament.applyUrl = pageUrl('apply.html'); S.tournament.formUrl = pageUrl('form.html'); }
    // 別の大会（複製元など）の申込URLが残っていたら消す（QRコードが別の大会につながるのを防ぐ）
    const mine = (u) => String(u || '').endsWith('&t=' + encodeURIComponent(S.id));
    if (!mine(S.tournament.applyUrl)) S.tournament.applyUrl = '';
    if (!mine(S.tournament.formUrl)) S.tournament.formUrl = '';
    refreshSelector();
    $('#tabs').innerHTML = TABS.map(([k, lb], i) => `<button data-tab="${k}" class="${ui.tab === k ? 'active' : ''}"><span class="num">${i + 1}</span>${lb}</button>`).join('');
    const sc = window.scrollY;
    const v = VIEWS[ui.tab] || VIEWS.guide;
    main.innerHTML = v();
    fitGuide();
    window.scrollTo(0, sc);
    saveUI();
  }

  const VIEWS = {};

  // 要項プレビューをA4幅のまま縮小表示（印刷と同じ改行位置になる）
  function fitGuide() {
    document.querySelectorAll('#guidePreview, .a4-preview').forEach((box) => {
      const z = Math.min(1, box.clientWidth / 796);
      box.querySelectorAll('.guide-doc, .pm-page').forEach((d) => { d.style.zoom = z; });
    });
  }
  window.addEventListener('resize', fitGuide);

  // ===== 1. 大会要項 =====
  VIEWS.guide = () => {
    const t = 'tournament.';
    const T = S.tournament;
    const ex = T.extraSections || [];
    const welcome = !S.events.length && !T.name ? `<div class="help"><b>はじめに：</b>大会情報 → 種目 → 申込 → 組み合わせ → タイムテーブル → 進行・結果入力 の順に進めます。まず操作を試したい場合は <button class="btn sm" data-act="demo">デモデータを読み込む</button></div>` : '';
    const sub = '2行目以降は字下げして表示されます（「・」で始めると補足の箇条書きになります）';
    return `${welcome}<div class="split"><div class="card"><h3>文書の体裁</h3><div class="grid">
      ${field('宛名', t + 'addressee', { placeholder: '関係者各位' })}
      ${field('発行日', t + 'issueDate', { placeholder: '令和7年6月吉日' })}
      ${field('発行者（団体名）', t + 'issuer', { placeholder: '空欄なら主催者名' })}
      ${field('代表者', t + 'representative', { placeholder: '会　長　吉野　大二' })}
      ${field('大会名', t + 'name', { cls: 'wide', placeholder: '日出町協会長杯バドミントン大会' })}
      ${field('表題の後ろ', t + 'titleSuffix', { placeholder: '実施要項' })}
      ${field('日付の表記', t + 'era', { type: 'select', options: [['wareki', '和暦（令和7年8月17日）'], ['seireki', '西暦（2025年8月17日）']] })}
      </div>
      <h3 style="margin-top:20px">要項の項目</h3><div class="grid">
      ${field('主催', t + 'organizer', { placeholder: '日出町バドミントン協会' })}
      ${field('主管', t + 'host')}
      ${field('後援', t + 'sponsor', { cls: 'wide' })}
      ${field('期日', t + 'date', { type: 'date' })}
      ${field('受付時刻', t + 'receptionTime', { placeholder: '8:40' })}
      ${field('試合開始時刻（タイムテーブル用）', t + 'startTime', { type: 'time' })}
      ${field('場所', t + 'venue', { placeholder: '日出町町営体育館' })}
      ${field('場所の住所', t + 'address')}
      ${field('種目', t + 'eventsText', { type: 'textarea', cls: 'wide', rows: 3, placeholder: '空欄なら「種目」タブの種目名を並べます\n例）男女ダブルス　A級・B級・C級・D級\n・男女混成チームは男子の部に出場してください。', hint: sub })}
      ${field('種目ごとの一覧表（試合方法・定員・参加料）も載せる', t + 'showEventTable', { type: 'checkbox', cls: 'wide' })}
      ${field('参加資格', t + 'eligibility', { type: 'textarea', cls: 'wide', rows: 2, placeholder: '中学生以上のバドミントン愛好家' })}
      ${field('試合方法', t + 'method', { type: 'textarea', cls: 'wide', rows: 3, placeholder: '予選はリーグ方式、決勝はトーナメント方式とします。\n・参加チーム数により変更する事もあります。', hint: sub })}
      <div class="wide row"><button class="btn sm" data-act="methodTemplate">種目設定から試合方法の文を作る</button></div>
      ${field('使用球', t + 'shuttle')}
      </div>
      <h3 style="margin-top:20px">申し込み</h3><div class="grid">
      ${field('申し込み方法', t + 'applyMethod', { type: 'textarea', cls: 'wide', rows: 2 })}
      <div class="wide row"><button class="btn sm" data-act="applyTextWeb">Web申込用の文例にする</button><button class="btn sm" data-act="applyTextMail">メール・LINE申込用の文例にする</button></div>
      <div class="wide">${field('申込書（Excel）のダウンロードURLとQRコードを要項に載せる', t + 'showFormQr', { type: 'checkbox', rerender: true })}</div>
      <div class="wide">${field('Web申込のURLとQRコードを要項に載せる', t + 'showApplyQr', { type: 'checkbox', rerender: true })}
        <div class="small muted">${T.applyUrl ? '申込ページのQRコードが「申し込み」の欄に入ります。印刷した要項からスマートフォンで申し込めます。' : 'この大会を「⑧設定・連携」でGoogleに保存すると、申込ページのURLとQRコードが表示されます。'}</div></div>
      ${field('申し込み先（氏名）', t + 'contactName')}
      ${field('TEL', t + 'contactTel')}
      ${field('E-Mail', t + 'contactEmail', { type: 'email' })}
      ${field('LINE（URL）', t + 'contactLine', { placeholder: 'https://lin.ee/...' })}
      <label class="f"><span>QRコード画像</span><div class="row">${T.contactQr ? `<img class="qr-prev" src="${esc(T.contactQr)}" alt=""><button class="btn sm danger" data-act="qrDel">削除</button>` : ''}<label class="btn sm">画像を選ぶ<input type="file" accept="image/*" id="qrFile" hidden></label></div></label>
      ${field('申込期限', t + 'deadline', { type: 'date' })}
      ${field('申込期限の注意書き', t + 'deadlineNote', { cls: 'wide' })}
      ${field('参加料等', t + 'fee', { type: 'textarea', cls: 'wide', rows: 3, placeholder: '1人　2,000円\n・当日受付で徴収致します。', hint: '空欄なら「種目」タブの参加料を並べます。「・」「※」で始まる行は補足として表示' })}
      ${field('その他', t + 'notes', { type: 'textarea', cls: 'wide', rows: 3 })}
      <div class="wide row"><button class="btn sm" data-act="notesTemplate">その他の文例を挿入</button></div>
    </div>
    <h4>追加項目（「その他」の前に入ります）</h4>
    ${ex.map((s, i) => `<div class="grid" style="margin-bottom:8px">${field('見出し', `tournament.extraSections.${i}.title`)}${field('内容', `tournament.extraSections.${i}.body`, { type: 'textarea', cls: 'wide' })}<div class="wide"><button class="btn sm danger" data-act="delSection" data-i="${i}">この項目を削除</button></div></div>`).join('')}
    <button class="btn sm" data-act="addSection">＋ 項目を追加（表彰、服装、注意事項など）</button>
    </div>
    <div><div class="row no-print" style="margin-bottom:8px"><b>プレビュー</b><span class="spacer"></span><button class="btn primary" data-act="printGuide">印刷 / PDF保存</button></div><div id="guidePreview">${BTR.guide(S)}</div></div></div>`;
  };

  // ===== 2. 種目 =====
  const PRESETS = ['一般男子シングルス', '一般女子シングルス', '一般男子ダブルス', '一般女子ダブルス', '混合ダブルス', '男子ダブルス1部', '男子ダブルス2部', '女子ダブルス1部', '女子ダブルス2部', '小学生男子シングルス', '小学生女子シングルス', '中学生男子ダブルス', '中学生女子ダブルス', '高校生男子ダブルス', '高校生女子ダブルス', 'シニア男子ダブルス(50歳以上)', 'シニア女子ダブルス(50歳以上)', '男子団体戦', '女子団体戦', '混合団体戦'];
  VIEWS.events = () => {
    const rows = S.events.map((ev, i) => {
      const p = `events.#${ev.id}.`;
      const n = S.entries.filter((e) => e.eventId === ev.id && !e.withdrawn).length;
      const team = BT.isTeamEv(ev);
      return `<div class="card"><div class="row"><h3 style="margin:0"><span class="evdot" style="background:${BTR.evColor(BT.ctx(S), ev.id)}"></span>${esc(ev.name || '（種目名未設定）')}</h3><span class="pill">${n}${team ? 'チーム' : '組'}</span><span class="spacer"></span>
        <button class="btn sm" data-act="evUp" data-id="${ev.id}"${i === 0 ? ' disabled' : ''}>↑</button><button class="btn sm" data-act="evDown" data-id="${ev.id}"${i === S.events.length - 1 ? ' disabled' : ''}>↓</button><button class="btn sm" data-act="evDup" data-id="${ev.id}">複製</button><button class="btn sm danger" data-act="evDel" data-id="${ev.id}">削除</button></div>
        <div class="grid" style="margin-top:10px">
        ${field('種目名', p + 'name', { placeholder: '一般男子ダブルス' })}
        ${field('略称（試合コード用）', p + 'code', { placeholder: '例: MA → 試合コード MA-1' })}
        ${field('種別', p + 'type', { type: 'select', options: Object.entries(BT.TYPES), rerender: true })}
        ${field('試合形式', p + 'format', { type: 'select', options: Object.entries(BT.FORMATS), rerender: true })}
        ${ev.format !== 'tournament' ? field(ev.format === 'league' ? '1グループの人数（空欄=全員で1リーグ）' : '1グループの人数', p + 'groupSize', { type: 'number', min: 2 }) : ''}
        ${ev.format === 'league_tournament' ? field('各グループの決勝T進出数', p + 'advance', { type: 'number', min: 1 }) : ''}
        ${team ? field('1対戦の内訳（カンマ区切り）', p + 'rubbers', { cls: 'wide', placeholder: '第1ダブルス,第2ダブルス,シングルス', rerender: true }) : ''}
        ${team ? field('メンバー最少人数', p + 'teamMin', { type: 'number', min: 1 }) : ''}
        ${team ? field('メンバー最大人数', p + 'teamMax', { type: 'number', min: 1, rerender: true }) : ''}
        ${field(team ? '各試合のゲーム数' : 'ゲーム数', p + 'games', { type: 'select', options: [['1', '1ゲーム'], ['3', '3ゲームマッチ'], ['5', '5ゲームマッチ']] })}
        ${field('点数', p + 'points', { type: 'select', options: [['21', '21点'], ['15', '15点'], ['11', '11点'], ['30', '30点']] })}
        ${field('参加料', p + 'fee', { placeholder: '1組 3,000円' })}
        ${field(team ? '定員（チーム）' : '定員（組）', p + 'capacity', { type: 'number', min: 0 })}
        ${field(team ? '1対戦の目安（分）' : '1試合の目安（分・空欄=全体設定）', p + 'minutes', { type: 'number', min: 1, placeholder: team ? '60' : '' })}
        ${field('使用コート（空欄=全コート）', p + 'courts', { placeholder: '例: 1-4' })}
        ${field('備考（要項に表示）', p + 'note', { placeholder: '例: 年齢合計100歳以上' })}
        ${ev.format !== 'league' ? field('3位決定戦を行う', p + 'thirdPlace', { type: 'checkbox' }) : ''}
        </div></div>`;
    }).join('');
    return `<div class="help">クラス（種目）ごとに試合形式を選べます。同じ大会の中でトーナメント・リーグ・予選リーグ→決勝トーナメントを混在できます。種別を「団体戦」にすると、チーム単位の申込と、1対戦の内訳（例：第1ダブルス・第2ダブルス・シングルス）ごとの結果入力になります。</div>
      ${rows || '<p class="muted">種目がまだありません。</p>'}
      <div class="card row"><button class="btn primary" data-act="evAdd">＋ 種目を追加</button><span class="muted small">よく使う種目：</span><select id="presetSel"><option value="">選択して追加…</option>${PRESETS.map((p) => `<option>${esc(p)}</option>`).join('')}</select></div>`;
  };

  // ===== 3. 申込 =====
  VIEWS.entries = () => {
    const evs = ui.evFilter ? S.events.filter((e) => e.id === ui.evFilter) : S.events;
    const t = S.tournament;
    const applyUrl = S.sheetUrl ? pageUrl('apply.html') : '';
    const total = S.entries.filter((e) => !e.withdrawn).length;
    let h = `<div class="card"><div class="row"><b>申込 ${total}組</b><span class="spacer"></span>
      <select data-act-change="evFilter"><option value="">すべての種目</option>${S.events.map((e) => `<option value="${e.id}"${ui.evFilter === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
      <button class="btn" data-act="formDownload">申込書Excelを作成</button>
      <label class="btn">Excel申込書を取込<input type="file" accept=".xlsx" id="xlsxFile" multiple hidden></label>
      <button class="btn" data-act="csvTemplate">CSVひな形</button>
      <label class="btn">CSV取込<input type="file" accept=".csv,text/csv" id="csvFile" hidden></label>
      <button class="btn" data-act="csvExport">CSV出力</button>
      ${S.sheetUrl && linked() ? '<button class="btn primary" data-act="pullEntries">Web申込を取り込む</button>' : ''}
      </div>
      ${applyUrl ? `<p class="small" style="margin:10px 0 0">参加者用 申込ページ：<button class="btn sm primary" data-act="copy" data-text="${esc(shareUrl('apply'))}">LINE・メールで送るURLをコピー</button> <span class="muted">（リンクに大会名が表示されます）</span>　<a href="${esc(applyUrl)}" target="_blank" rel="noopener">申込ページを開く</a></p>` : '<p class="small muted" style="margin:10px 0 0">参加者がWebから直接申し込めるようにするには「設定・連携」でGoogle連携を設定し、この大会をスプレッドシートに保存してください。紙・メール・Googleフォームの申込はCSV取込または手入力で登録できます。</p>'}
      </div>`;
    if (!S.events.length) return h + '<p class="muted">先に「種目」タブで種目を登録してください。</p>';
    evs.forEach((ev) => {
      const list = S.entries.filter((e) => e.eventId === ev.id);
      const pc = BT.playerCount(ev);
      const teamEv = BT.isTeamEv(ev);
      h += `<section class="card"><div class="row"><h3 style="margin:0"><span class="evdot" style="background:${BTR.evColor(BT.ctx(S), ev.id)}"></span>${esc(ev.name)}</h3><span class="pill">${list.filter((e) => !e.withdrawn).length}${ev.capacity ? ' / ' + esc(ev.capacity) : ''}${teamEv ? 'チーム' : '組'}</span><span class="spacer"></span><button class="btn sm primary" data-act="entryAdd" data-ev="${ev.id}">＋ 追加</button></div>
      <div class="tbl-scroll" style="margin-top:8px"><table class="tbl"><thead><tr><th>#</th><th title="数字を入れるとシード（1が第1シード）">シード</th>
      ${teamEv ? '<th>チーム名</th><th>所属</th><th>メンバー（改行または「、」区切り）</th><th>人数</th>' : Array.from({ length: pc }, (_, i) => `<th>選手${pc > 1 ? i + 1 : ''} 氏名</th><th>所属</th>`).join('')}
      <th>${teamEv ? '監督・代表者' : '代表者'}</th><th>連絡先</th><th>受付</th><th>棄権</th><th></th></tr></thead><tbody>
      ${list.map((en, i) => {
        const p = `entries.#${en.id}.`;
        const nm = BT.memberNames(en).length;
        const warn = teamEv && (nm < (+ev.teamMin || 1) || nm > (+ev.teamMax || 99));
        const cells = teamEv ? `<td><input data-bind="${p}teamName" value="${esc(en.teamName)}" placeholder="○○クラブA"></td><td><input data-bind="${p}team" value="${esc(en.team)}"></td><td><textarea class="members" rows="2" data-members="${en.id}">${esc(BT.memberNames(en).join('、'))}</textarea></td><td class="num${warn ? ' w' : ''}" title="${esc(`${ev.teamMin || 1}〜${ev.teamMax || ''}人`)}">${nm}</td>` : Array.from({ length: pc }, (_, k) => `<td><input data-bind="${p}players.${k}.name" value="${esc((en.players[k] || {}).name)}"></td><td><input data-bind="${p}players.${k}.team" value="${esc((en.players[k] || {}).team)}"></td>`).join('');
        return `<tr class="${en.withdrawn ? 'withdrawn' : ''}"><td class="num">${i + 1}</td><td style="width:62px"><input type="number" min="0" data-bind="${p}seed" value="${esc(en.seed)}"></td>${cells}
          <td><input data-bind="${p}contactName" value="${esc(en.contactName)}"></td><td><input data-bind="${p}contactEmail" value="${esc(en.contactEmail || en.contactTel)}" placeholder="メール/電話"></td>
          <td><span class="tag ${en.source === 'web' ? 'web' : ''}">${en.source === 'web' ? 'Web' : en.source === 'csv' ? 'CSV' : en.source === 'excel' ? 'Excel' : '手入力'}</span></td>
          <td class="center"><input type="checkbox" data-bind="${p}withdrawn" data-rerender="1"${en.withdrawn ? ' checked' : ''}></td>
          <td><button class="btn sm danger" data-act="entryDel" data-id="${en.id}">削除</button></td></tr>`;
      }).join('') || `<tr><td colspan="${teamEv ? 10 : 6 + pc * 2}" class="muted">申込はまだありません</td></tr>`}
      </tbody></table></div></section>`;
    });
    return h;
  };

  // ===== 4. 組み合わせ =====
  VIEWS.draw = () => {
    if (!S.events.length) return '<p class="muted">先に種目を登録してください。</p>';
    const c = BT.ctx(S);
    return `<div class="help">「組み合わせ作成」でシード順・同一所属を離して自動抽選します。結果が入る前なら「入替え」で手動調整できます。ドロー表の試合をクリックすると結果を入力できます。</div>` + S.events.map((ev) => {
      const n = S.entries.filter((e) => e.eventId === ev.id && !e.withdrawn).length;
      const draw = S.draws[ev.id];
      const swap = ui.swap[ev.id];
      return `<section class="card"><div class="row"><h3 style="margin:0"><span class="evdot" style="background:${BTR.evColor(c, ev.id)}"></span>${esc(ev.name)}</h3><span class="pill">${BT.FORMATS[ev.format]}</span><span class="muted small">${n}組</span><span class="spacer"></span>
        <button class="btn ${draw ? '' : 'primary'}" data-act="genDraw" data-id="${ev.id}">${draw ? '組み合わせ再作成' : '組み合わせ作成'}</button>
        ${draw ? `<button class="btn" data-act="toggleSwap" data-id="${ev.id}">${swap ? '入替えを閉じる' : '入替え'}</button><button class="btn" data-act="printDraw" data-id="${ev.id}">印刷</button>` : ''}</div>
        ${draw && draw.format !== ev.format ? '<p class="notice warn">試合形式が変更されています。再作成してください。</p>' : ''}
        ${swap ? swapUI(c, ev) : ''}
        <div style="margin-top:12px">${draw ? BTR.eventDraw(c, ev, { showOverride: true }) : ''}</div></section>`;
    }).join('');
  };

  function swapUI(c, ev) {
    const draw = S.draws[ev.id];
    let h = '<div class="card" style="background:#fafbfd;margin-top:10px">';
    if (draw.groups && draw.groups.length) {
      const gs = draw.groups.map((g) => g.name);
      h += '<h4 style="margin-top:0">グループの入替え</h4><div class="tbl-scroll"><table class="tbl"><thead><tr><th>グループ</th><th>選手</th><th>移動先</th></tr></thead><tbody>';
      draw.groups.forEach((g) => g.entryIds.forEach((id) => {
        h += `<tr><td>${g.name}組</td><td>${esc(BT.entryLabel(c.entry.get(id)))}</td><td><select data-act-change="moveGroup" data-ev="${ev.id}" data-entry="${id}">${gs.map((x) => `<option${x === g.name ? ' selected' : ''}>${x}</option>`).join('')}</select></td></tr>`;
      }));
      h += '</tbody></table></div><p class="small muted">移動すると、関係するグループのリーグ戦は作り直されます。</p>';
      h += draw.groups.map((g) => `<button class="btn sm" data-act="rankOverride" data-ev="${ev.id}" data-g="${g.name}">${g.name}組の順位を手動指定</button>`).join(' ');
    }
    const r1 = S.matches.filter((m) => m.eventId === ev.id && m.stage === 'K' && m.round === 1).sort((a, b) => a.idx - b.idx);
    if (r1.length) {
      const slots = r1.flatMap((m) => [[m, 'a'], [m, 'b']]);
      h += '<h4>トーナメント枠の入替え</h4><div class="tbl-scroll"><table class="tbl"><thead><tr><th>枠</th><th>現在</th><th>この枠と入替え</th></tr></thead><tbody>';
      slots.forEach(([m, s], i) => {
        const lb = BTR.sideLabel(c, m[s]);
        h += `<tr><td class="num">${i + 1}</td><td>${lb.bye ? '<span class="muted">（不戦）</span>' : esc(lb.text)}</td><td><select data-act-change="swapSlot" data-ev="${ev.id}" data-i="${i}"><option value="">—</option>${slots.map((_, j) => j === i ? '' : `<option value="${j}">枠${j + 1}</option>`).join('')}</select></td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    return h + '</div>';
  }

  // ===== 5. タイムテーブル =====
  VIEWS.time = () => {
    const c = BT.ctx(S);
    const t = 'tournament.';
    const sched = S.matches.filter((m) => m.time != null);
    const endT = sched.length ? Math.max(...sched.map((m) => m.time)) + (+S.tournament.matchMinutes || 20) : null;
    const total = S.matches.filter((m) => !BT.isAuto(c, m) && !(m.a && m.a.bye || m.b && m.b.bye)).length;
    return `<div class="card"><h3>タイムテーブル設定</h3><div class="grid">
      ${field('コート数', t + 'courts', { type: 'number', min: 1 })}
      ${field('開始時刻', t + 'startTime', { type: 'time' })}
      ${field('1試合の目安（分）', t + 'matchMinutes', { type: 'number', min: 1 })}
      ${field('同じ選手の最低休憩（分）', t + 'restMinutes', { type: 'number', min: 0 })}
      </div>
      <p class="small muted">種目ごとの使用コートは「種目」タブで指定できます。複数種目に出場する選手（同じ氏名）も重ならないように配置します。</p>
      <div class="row"><button class="btn primary" data-act="schedule">自動作成</button><button class="btn" data-act="reschedule" title="終了・試合中の試合はそのままに、残りの試合を開始時刻から組み直します">未終了の試合だけ組み直す</button><span class="spacer"></span>
      ${sched.length ? `<span class="small">全${total}試合 / 終了予定 <b>${BT.fmtMin(endT)}</b></span>` : ''}</div></div>
      <div class="card"><div class="row no-print"><select data-act-change="ttView"><option value="grid"${ui.ttView === 'grid' ? ' selected' : ''}>コート×時刻</option><option value="list"${ui.ttView === 'list' ? ' selected' : ''}>試合番号順</option></select>
      <select data-act-change="ttEv"><option value="">全種目</option>${S.events.map((e) => `<option value="${e.id}"${ui.ttEv === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
      <span class="spacer"></span><button class="btn" data-act="printTT">印刷</button></div><div id="ttBody" style="margin-top:10px">
      ${ui.ttView === 'list' ? BTR.matchList(c, { eventId: ui.ttEv }) : BTR.timetable(c, { eventId: ui.ttEv })}</div>
      <p class="small muted">試合をクリックすると時刻・コートの変更や結果入力ができます。</p></div>`;
  };

  // ===== パンフレット =====
  VIEWS.pamphlet = () => {
    const T = S.tournament;
    const t = 'tournament.';
    const L = T.pmLayout = BTR.pmLayout(T);
    const sel = (path, cur, opts) => `<select data-bind="${path}">${opts.map(([v, lb]) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${lb}</option>`).join('')}</select>`;
    const cols = (path, cur, max) => sel(path, cur, Array.from({ length: max }, (_, i) => [i + 1, `${i + 1}列`]));
    const opt = {
      officers: `${cols(t + 'pmLayout.officersCols', L.officersCols, 3)} <label class="chk"><input type="checkbox" data-bind="${t}pmLayout.sideBySide"${L.sideBySide ? ' checked' : ''}> 大会次第と横に並べる</label>`,
      agenda: cols(t + 'pmLayout.agendaCols', L.agendaCols, 3),
      entries: `個人戦 ${cols(t + 'pmLayout.indCols', L.indCols, 3)}　団体戦 ${sel(t + 'pmLayout.teamPerRow', L.teamPerRow, [4, 5, 6, 7, 8].map((n) => [n, `横${n}チーム`]))}`,
      draws: `リーグ表 ${cols(t + 'pmLayout.leagueCols', L.leagueCols, 3)}`,
    };
    const layoutRows = L.order.map((k, i) => `<tr><td class="center"><input type="checkbox" data-bind="${t}pmLayout.show.${k}"${L.show[k] ? ' checked' : ''}></td><td><b>${BTR.PM_SECTIONS[k]}</b></td>
      <td style="white-space:nowrap"><button class="btn sm" data-act="pmUp" data-k="${k}"${i === 0 ? ' disabled' : ''}>↑</button><button class="btn sm" data-act="pmDown" data-k="${k}"${i === L.order.length - 1 ? ' disabled' : ''}>↓</button></td>
      <td class="center">${k === 'cover' ? '<span class="muted small">常に1ページ</span>' : `<input type="checkbox" data-bind="${t}pmLayout.breakAfter.${k}"${L.breakAfter[k] ? ' checked' : ''}>`}</td>
      <td class="small">${opt[k] || ''}</td></tr>`).join('');
    const evCodes = S.events.map((ev, i) => `<tr><td>${esc(ev.name)}</td><td style="width:120px"><input data-bind="events.#${ev.id}.code" value="${esc(ev.code)}" placeholder="${esc(BT.groupName(i))}"></td></tr>`).join('');
    return `<div class="help">大会当日に配るプログラム（表紙・大会役員と大会次第・タイムテーブル・参加者一覧・対戦表）を作ります。組み合わせとタイムテーブルを作成してから印刷してください。</div>
    <div class="split"><div>
      <div class="card"><h3>ページ構成と配置</h3>
        <p class="small muted">↑↓で順番を入れ替え、「このあと改ページ」を外すと次の項目を同じページに続けて載せます。列数を増やすと横に並べて縦の長さを抑えられます。</p>
        <div class="tbl-scroll"><table class="tbl pm-layout"><thead><tr><th>表示</th><th>項目</th><th>順番</th><th>このあと改ページ</th><th>配置</th></tr></thead><tbody>${layoutRows}</tbody></table></div>
        <div class="row" style="margin-top:8px"><label class="chk"><input type="checkbox" data-bind="${t}pmLayout.dense"${L.dense ? ' checked' : ''}> 行の間隔を詰める</label></div></div>
      <div class="card"><h3>表紙</h3>
        <p class="small muted">大会名・期日・場所・主催は「大会要項」の内容が入ります。</p>
        <div class="row">${T.coverImage ? `<img src="${esc(T.coverImage)}" alt="" style="max-height:90px;border:1px solid var(--line);border-radius:4px"><button class="btn sm danger" data-act="coverDel">画像を削除</button>` : ''}<label class="btn sm">表紙の画像を選ぶ<input type="file" accept="image/*" id="coverFile" hidden></label></div></div>
      <div class="card"><h3>大会役員</h3>
        <table class="tbl"><thead><tr><th>役職</th><th>所属</th><th>氏名（複数は改行）</th><th></th></tr></thead><tbody>
        ${(T.officers || []).map((o, i) => `<tr><td style="width:110px"><input data-bind="tournament.officers.${i}.role" value="${esc(o.role)}"></td><td><input data-bind="tournament.officers.${i}.org" value="${esc(o.org)}"></td><td><textarea rows="1" data-bind="tournament.officers.${i}.name" style="min-height:34px">${esc(o.name)}</textarea></td><td><button class="btn sm danger" data-act="delOfficer" data-i="${i}">×</button></td></tr>`).join('')}
        </tbody></table><button class="btn sm" data-act="addOfficer" style="margin-top:6px">＋ 行を追加</button></div>
      <div class="card"><h3>大会次第</h3>
        <table class="tbl"><thead><tr><th>項目</th><th>時刻</th><th>備考</th><th></th></tr></thead><tbody>
        ${(T.agenda || []).map((a, i) => `<tr><td style="width:110px"><input data-bind="tournament.agenda.${i}.item" value="${esc(a.item)}"></td><td style="width:130px"><input data-bind="tournament.agenda.${i}.time" value="${esc(a.time)}"></td><td><input data-bind="tournament.agenda.${i}.note" value="${esc(a.note)}" placeholder="例: ※集合しての開会式は行いません。"></td><td><button class="btn sm danger" data-act="delAgenda" data-i="${i}">×</button></td></tr>`).join('')}
        </tbody></table><button class="btn sm" data-act="addAgenda" style="margin-top:6px">＋ 行を追加</button></div>
      <div class="card"><h3>試合方式・注意事項（タイムテーブルの下）</h3>
        ${field('', t + 'programNotes', { type: 'textarea', rows: 8 })}
        <button class="btn sm" data-act="programNotesTemplate">文例を入れる</button></div>
      <div class="card"><h3>試合コード（タイムテーブル・対戦表に表示）</h3>
        <p class="small muted">種目の略称と試合順の番号で「MA-1」のように表示します（空欄の種目はA・B・C…）。略称は「種目」タブでも変更できます。</p>
        <table class="tbl"><thead><tr><th>種目</th><th>略称</th></tr></thead><tbody>${evCodes}</tbody></table></div>
    </div>
    <div><div class="row no-print" style="margin-bottom:8px"><b>プレビュー</b><span class="spacer"></span><button class="btn primary" data-act="printPamphlet">印刷 / PDF保存</button></div>
      <div class="a4-preview" id="pmPreview">${BTR.pamphlet(S)}</div></div></div>`;
  };

  // ===== 6. 進行・結果入力 =====
  function readyMatches(c) {
    const playing = new Set();
    S.matches.filter((m) => m.status === 'playing' && !m.result).forEach((m) => BT.playerKeys(c.entry.get(BT.resolve(c, m.a))).concat(BT.playerKeys(c.entry.get(BT.resolve(c, m.b)))).forEach((k) => playing.add(k)));
    return S.matches.filter((m) => {
      if (m.result || m.status === 'playing' || BT.isAuto(c, m)) return false;
      const [a, b] = BT.sides(c, m);
      if (!a || !b) return false;
      const ks = BT.playerKeys(c.entry.get(a)).concat(BT.playerKeys(c.entry.get(b)));
      return !ks.some((k) => playing.has(k));
    }).sort((x, y) => ((x.no || 1e9) - (y.no || 1e9)) || (BT.phaseRank(c, x) - BT.phaseRank(c, y)));
  }

  VIEWS.run = () => {
    const c = BT.ctx(S);
    const C = Math.max(1, +S.tournament.courts || 1);
    const ready = readyMatches(c);
    const allTotal = S.matches.filter((m) => !BT.isAuto(c, m)).length;
    const allDone = S.matches.filter((m) => !BT.isAuto(c, m) && m.result).length;
    let board = '';
    const usedSug = new Set(), usedKeys = new Set();
    const matchKeys = (x) => BT.sides(c, x).flatMap((id) => BT.playerKeys(c.entry.get(id)));
    for (let k = 1; k <= C; k++) {
      const m = S.matches.find((x) => x.status === 'playing' && !x.result && x.court === k);
      if (m) {
        const ev = c.event.get(m.eventId);
        board += `<div class="court busy"><div class="ch"><span>第${k}コート</span><span class="live small">試合中 ${m.startedAt ? new Date(m.startedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + '〜' : ''}</span></div>
          <div class="small muted">No.${m.no || '-'} ${esc(ev.name)} ${esc(BTR.stageLabel(c, m))}</div>
          <div class="vs">${esc(BTR.sideLabel(c, m.a).text)}<br><span class="muted">vs</span><br>${esc(BTR.sideLabel(c, m.b).text)}</div>
          <div class="act"><button class="btn sm primary" data-act="openMatch" data-id="${m.id}">結果入力</button><button class="btn sm" data-act="unplay" data-id="${m.id}">取消</button></div></div>`;
      } else {
        const free = (x) => !usedSug.has(x.id) && !matchKeys(x).some((p) => usedKeys.has(p));
        const sug = ready.find((x) => x.court === k && free(x)) || ready.find(free);
        if (sug) { usedSug.add(sug.id); matchKeys(sug).forEach((p) => usedKeys.add(p)); }
        board += `<div class="court"><div class="ch"><span>第${k}コート</span><span class="muted small">空き</span></div>
          ${sug ? `<div class="small muted">次の候補：No.${sug.no || '-'} ${esc(c.event.get(sug.eventId).name)}</div><div class="vs small">${esc(BTR.sideLabel(c, sug.a, true).text)} vs ${esc(BTR.sideLabel(c, sug.b, true).text)}</div>` : '<div class="small muted">開始できる試合はありません</div>'}
          <div class="act">${sug ? `<button class="btn sm primary" data-act="call" data-id="${sug.id}" data-court="${k}">コール</button>` : ''}
          ${ready.length > 1 ? `<select data-act-change="callPick" data-court="${k}"><option value="">他の試合…</option>${ready.slice(0, 40).map((x) => `<option value="${x.id}">No.${x.no || '-'} ${esc(c.event.get(x.eventId).name)} ${esc(BTR.sideLabel(c, x.a, true).text)} vs ${esc(BTR.sideLabel(c, x.b, true).text)}</option>`).join('')}</select>` : ''}</div></div>`;
      }
    }
    return `<div class="card"><div class="row"><h3 style="margin:0">コート進行</h3><span class="pill">${allDone} / ${allTotal} 試合終了</span><span class="spacer"></span>${S.sheetUrl && linked() ? '<button class="btn" data-act="publish">今すぐ保存・公開</button>' : ''}</div>
      <p class="small muted">「コール」で試合中にし、終わったら「結果入力」。試合番号順に、出場中の選手と重ならない試合を候補に出します。</p>
      <div class="courts">${board}</div></div>
      <div class="card"><div class="row"><h3 style="margin:0">試合一覧</h3><span class="spacer"></span>
      <select data-act-change="runEv"><option value="">全種目</option>${S.events.map((e) => `<option value="${e.id}"${ui.runEv === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
      <select data-act-change="runFilter"><option value="pending"${ui.runFilter === 'pending' ? ' selected' : ''}>未終了</option><option value="done"${ui.runFilter === 'done' ? ' selected' : ''}>終了</option><option value="all"${ui.runFilter === 'all' ? ' selected' : ''}>すべて</option></select></div>
      <div class="tbl-scroll" style="margin-top:8px">${BTR.matchList(c, { eventId: ui.runEv, filter: ui.runFilter })}</div></div>`;
  };

  // ===== 7. 結果 =====
  VIEWS.results = () => {
    const c = BT.ctx(S);
    const viewUrl = S.sheetUrl ? pageUrl('view.html') : '';
    return `<div class="card row no-print"><b>大会結果</b><span class="spacer"></span><button class="btn" data-act="resultCsv">全試合結果CSV</button><button class="btn" data-act="printResults">印刷</button>
      ${viewUrl ? `<a class="btn" href="${esc(viewUrl)}" target="_blank" rel="noopener">公開ページを開く</a><button class="btn primary" data-act="publish">今すぐ保存・公開</button>` : ''}${S.sheetUrl ? `<a class="btn" href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">スプレッドシートを開く</a>` : ''}</div>
      <div class="res-grid">${BTR.results(c)}</div>`;
  };

  // ===== 8. 設定・連携 =====
  VIEWS.settings = () => {
    const t = 'tournament.';
    const T = S.tournament;
    const a = API();
    const applyUrl = S.sheetUrl ? pageUrl('apply.html') : '';
    const viewUrl = S.sheetUrl ? pageUrl('view.html') : '';
    const when = S.syncedAt ? new Date(S.syncedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="card"><h3>この大会のスプレッドシート</h3>
      ${!linked() ? '<p class="notice warn">先に下の「Google連携」を設定してください。</p>' : S.sheetUrl
        ? `<p>保存先：<a href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">${esc(T.name || '（無題の大会）')} のスプレッドシートを開く</a>　<span class="small muted">最終保存 ${esc(when)}</span></p>`
        : '<p class="small">まだGoogleに保存していません。「スプレッドシートを作成して保存」を押すと、Googleドライブの「バドミントン大会データ」フォルダにこの大会のスプレッドシートが作られます。</p>'}
      <p class="small muted">保存される内容：大会情報（要項）・種目・申込一覧・Web申込・組み合わせ・試合結果（タイムテーブル）・リーグ順位・入賞者、およびアプリの全データ（別のパソコンで復元用）。</p>
      <div class="row"><button class="btn primary" data-act="publish"${linked() ? '' : ' disabled'}>${S.sheetUrl ? '今すぐ保存・公開' : 'スプレッドシートを作成して保存'}</button>
      ${field('変更を自動で保存・公開する（約8秒後）', t + 'autoPublish', { type: 'checkbox' })}
      ${field('Web申込を受け付ける', t + 'acceptApply', { type: 'checkbox' })}</div>
      ${applyUrl ? `<table class="tbl" style="margin-top:12px"><thead><tr><th></th><th>LINE・メールで送る用<div class="small muted">リンクに大会名が表示されます</div></th><th>直接開く用</th></tr></thead>
      <tr><th>申込書（Excel）のダウンロード</th><td><button class="btn sm primary" data-act="copy" data-text="${esc(shareUrl('form'))}">URLをコピー</button> <a href="${esc(shareUrl('form'))}" target="_blank" rel="noopener">確認</a></td><td><a href="${esc(pageUrl('form.html'))}" target="_blank" rel="noopener">開く</a> <button class="btn sm" data-act="copy" data-text="${esc(pageUrl('form.html'))}">URLをコピー</button></td></tr>
      <tr><th>参加者用 申込ページ</th><td><button class="btn sm primary" data-act="copy" data-text="${esc(shareUrl('apply'))}">URLをコピー</button> <a href="${esc(shareUrl('apply'))}" target="_blank" rel="noopener">確認</a></td><td><a href="${esc(applyUrl)}" target="_blank" rel="noopener">開く</a> <button class="btn sm" data-act="copy" data-text="${esc(applyUrl)}">URLをコピー</button></td></tr>
      <tr><th>公開ページ（要項・組み合わせ・タイムテーブル・速報）</th><td><button class="btn sm primary" data-act="copy" data-text="${esc(shareUrl('view'))}">URLをコピー</button> <a href="${esc(shareUrl('view'))}" target="_blank" rel="noopener">確認</a></td><td><a href="${esc(viewUrl)}" target="_blank" rel="noopener">開く</a> <button class="btn sm" data-act="copy" data-text="${esc(viewUrl)}">URLをコピー</button></td></tr></table>
      <p class="small muted">公開ページに出るのは要項・種目・選手名と所属・組み合わせ・結果のみです。代表者の連絡先はスプレッドシートにだけ保存され、公開されません。</p>` : ''}
      </div>

      <div class="card"><h3>Google連携（全大会共通・最初に1回だけ）</h3>
      <div class="help"><b>設定手順（約5分）</b><ol>
        <li>Googleドライブで新しいスプレッドシートを作成（名前は「大会運営_連携」など）</li>
        <li>「拡張機能」→「Apps Script」を開き、<a href="https://github.com/kazuto-desu/badminton-tournament/blob/main/gas/Code.gs" target="_blank" rel="noopener">Code.gs</a> の内容をすべて貼り付け</li>
        <li><code>ADMIN_KEY = 'change-me'</code> を自分だけが知る文字列（管理キー）に変更して保存</li>
        <li>「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」／実行ユーザー「自分」／アクセス「全員」→ デプロイ（Googleドライブへのアクセス許可を求められたら許可）</li>
        <li>表示された「ウェブアプリのURL」と管理キーを下に入力して「接続テスト」</li></ol>
        以後、大会ごとのスプレッドシートは自動で作られます。連携に使ったスプレッドシートには「大会一覧」シートができ、全大会へのリンクが並びます。</div>
      <div class="grid"><label class="f wide"><span>ウェブアプリのURL</span><input id="apiUrlIn" value="${esc(a.url)}" placeholder="https://script.google.com/macros/s/..../exec"></label>
      <label class="f"><span>管理キー（ADMIN_KEY）</span><input id="apiKeyIn" type="password" value="${esc(a.key)}"></label></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="ping">接続テスト</button>${a.indexUrl ? `<a class="btn" href="${esc(a.indexUrl)}" target="_blank" rel="noopener">大会一覧（スプレッドシート）を開く</a>` : ''}</div>
      <div id="apiMsg"></div>
      <p class="small muted">URLと管理キーはこのブラウザに保存されます。別のパソコンでは同じURL・管理キーを入力し、下の「Googleから大会を読み込む」で続きから作業できます。</p>
      </div>

      <div class="card"><h3>データの保存・バックアップ</h3>
      <p class="small muted">作業中のデータはこのブラウザにも自動保存されます。</p>
      <div class="row">${linked() ? '<button class="btn primary" data-act="cloudLoad">Googleから大会を読み込む</button>' : ''}<button class="btn" data-act="exportJson">ファイルに書き出し（JSON）</button><label class="btn">ファイルから読み込み<input type="file" accept=".json,application/json" id="jsonFile" hidden></label></div></div>
      <div class="card"><h3>テンプレート</h3>
      <p class="small muted">大会の内容（要項・種目・パンフレットの設定など）だけを保存し、次の大会を作るときに使えます。申込・組み合わせ・結果、期日・申込期限は含みません。</p>
      <div class="row"><button class="btn primary" data-act="saveTpl">この大会をテンプレートとして登録</button><button class="btn" data-act="newT">テンプレートから新しい大会を作成</button></div>
      <div id="tplList" style="margin-top:10px">${tplListHTML()}</div></div>
      <div class="card"><h3>大会の管理</h3><div class="row"><button class="btn" data-act="newT">新しい大会を作成</button><button class="btn" data-act="dupT">この大会を複製（要項・種目のみ）</button><button class="btn" data-act="demo">デモデータで新規作成</button><span class="spacer"></span><button class="btn danger" data-act="delT">この大会をこのブラウザから削除</button></div>
      <p class="small muted">ブラウザから削除しても、Googleのスプレッドシートは残ります。</p></div>`;
  };

  function tplListHTML() {
    const l = getTpls();
    if (!l.length) return '<p class="small muted">このブラウザに登録されたテンプレートはありません。' + (linked() ? '（Googleに保存されたものは「テンプレートから新しい大会を作成」で表示されます）' : '') + '</p>';
    return `<table class="tbl"><thead><tr><th>テンプレート名</th><th>種目</th><th>登録日</th><th></th></tr></thead><tbody>${l.map((t) => `<tr><td>${esc(t.name)}</td><td class="small">${esc(((t.data && t.data.events) || []).map((e) => e.name).join('、'))}</td><td class="small">${new Date(t.createdAt).toLocaleDateString('ja-JP')}</td><td><button class="btn sm danger" data-act="delTpl" data-id="${t.id}" data-name="${esc(t.name)}">削除</button></td></tr>`).join('')}</tbody></table>`;
  }

  // 新しい大会：白紙 or テンプレートから
  async function chooseNew() {
    let list = getTpls().map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt, local: t }));
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    const draw = (note) => {
      bg.innerHTML = `<div class="modal"><h3>新しい大会を作成</h3>
        <div class="tpl-pick"><button class="btn" data-n="blank">白紙から作成</button>
        ${list.map((t) => `<button class="btn" data-n="${t.id}"><b>${esc(t.name)}</b><span class="small muted">${t.local ? '' : 'Google　'}${t.createdAt ? new Date(t.createdAt).toLocaleDateString('ja-JP') : ''}</span></button>`).join('')}</div>
        <p class="small muted">${note || ''}テンプレートから作ると、要項・種目・パンフレットの設定が入った状態で始まります（期日・申込期限は空欄）。</p>
        <div class="foot"><button class="btn" data-n="close">閉じる</button></div></div>`;
    };
    draw(linked() ? 'Googleのテンプレートを確認中…<br>' : '');
    document.body.appendChild(bg);
    if (linked()) {
      try {
        const g = (await BTAPI.listTemplates(API().url, API().key)).list || [];
        g.forEach((x) => { if (!list.some((y) => y.id === x.id)) list.push(x); });
        draw('');
      } catch (e) { draw(`Googleのテンプレートを読み込めませんでした（${esc(e.message)}）<br>`); }
    }
    bg.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-n]');
      if (e.target === bg || (b && b.dataset.n === 'close')) { bg.remove(); return; }
      if (!b) return;
      if (b.dataset.n === 'blank') { bg.remove(); createNew(); return; }
      const item = list.find((x) => x.id === b.dataset.n);
      let tpl = item && item.local;
      try {
        if (!tpl) { b.disabled = true; tpl = (await BTAPI.loadTemplate(API().url, API().key, item.id)).template; }
        if (!tpl) throw new Error('テンプレートが見つかりません');
        bg.remove();
        createNew(BT.fromTemplate(tpl));
        toast(`テンプレート「${tpl.name}」から作成しました。期日・申込期限を入力してください`);
      } catch (err) { alert('読み込めませんでした：' + err.message); b.disabled = false; }
    });
  }

  // ---------- 試合モーダル ----------
  function dependents(mid) {
    const out = new Set();
    const m0 = S.matches.find((m) => m.id === mid);
    const stack = [mid];
    if (m0 && m0.stage === 'L') S.matches.forEach((m) => { if ([m.a, m.b].some((s) => s && s.g === m0.group && s.ev === m0.eventId)) stack.push(m.id), out.add(m.id); });
    while (stack.length) {
      const id = stack.pop();
      S.matches.forEach((m) => { if ([m.a, m.b].some((s) => s && s.m === id) && !out.has(m.id)) { out.add(m.id); stack.push(m.id); } });
    }
    return [...out].map((id) => S.matches.find((m) => m.id === id)).filter((m) => m.result);
  }

  function openMatch(id) {
    const m = S.matches.find((x) => x.id === id);
    if (!m) return;
    const c = BT.ctx(S);
    if (BT.isAuto(c, m)) return;
    const ev = c.event.get(m.eventId);
    const team = BT.isTeamEv(ev);
    const a = BTR.sideLabel(c, m.a), b = BTR.sideLabel(c, m.b);
    const G = Math.max(1, +ev.games || 3);
    const ready = !a.tbd && !b.tbd;
    const dis = ready ? '' : ' disabled';
    const rubLabels = team ? BT.rubberList(ev) : [];
    const rubs = team ? rubLabels.map((lb, i) => Object.assign({ label: lb, pa: '', pb: '', scores: [] }, (m.rubbers || [])[i] || {}, { label: lb })) : [];
    const memOpts = (src) => { const en = c.entry.get(BT.resolve(c, src)); return BT.memberNames(en).map((n) => `<option value="${esc(n)}">`).join(''); };

    // スコア入力欄（r: 団体戦の試合番号 / 個人戦は 'x'）
    const grid = (r, scores, players) => {
      const sc = (i, k) => (scores && scores[i] ? scores[i][k] : '');
      const nameCell = (k) => players ? `<input class="rp" data-r="${r}" data-p="${k}" list="mem${k}" placeholder="${k ? esc(b.text) : esc(a.text)} の選手" value="${esc(players[k])}"${dis}>` : `<div class="nm">${esc(k ? b.text : a.text)}</div>`;
      return `<div class="score-grid" style="grid-template-columns:minmax(0,1fr) repeat(${G}, 52px)"><div></div>${Array.from({ length: G }, (_, i) => `<div class="hd">第${i + 1}G</div>`).join('')}
        ${[0, 1].map((k) => nameCell(k) + Array.from({ length: G }, (_, i) => `<input type="number" min="0" inputmode="numeric" data-r="${r}" data-g="${i}" data-s="${k}" value="${esc(sc(i, k))}"${dis}>`).join('')).join('')}</div>`;
    };

    const body = team
      ? `<datalist id="mem0">${memOpts(m.a)}</datalist><datalist id="mem1">${memOpts(m.b)}</datalist>
         <div class="team-sum" id="mTeamSum"></div>
         ${rubs.map((r, i) => `<div class="rub"><div class="rub-h"><b>${esc(r.label)}</b><span class="rub-w" id="rw${i}"></span></div>${grid(i, r.scores, [r.pa, r.pb])}</div>`).join('')}`
      : grid('x', m.scores);

    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal${team ? ' wide' : ''}"><h3>No.${m.no || '-'}　${esc(ev.name)}</h3><div class="muted small">${esc(BTR.stageLabel(c, m))}${m.time != null ? '　' + BT.fmtMin(m.time) + '〜 第' + m.court + 'コート' : ''}</div>
      ${team ? `<div class="vs-head"><b>${esc(a.text)}</b> <span class="muted">対</span> <b>${esc(b.text)}</b></div>` : ''}
      ${ready ? '' : '<p class="notice warn">対戦相手が確定していません（前の試合の結果入力後に入力できます）。</p>'}
      ${body}
      <div class="row" style="margin-top:12px"><label class="f"><span>結果の種類</span><select id="mType"><option value="normal">通常</option><option value="retired">途中棄権</option><option value="walkover">棄権（不戦勝）</option></select></label>
      <label class="f"><span>勝者</span><select id="mWin"><option value="">自動（${team ? '勝ち数' : 'スコア'}から判定）</option><option value="a">${esc(a.text)}</option><option value="b">${esc(b.text)}</option></select></label></div>
      <div id="mJudge" class="small" style="margin-top:6px"></div>
      <details style="margin-top:12px"><summary class="small">時刻・コートを変更</summary><div class="row" style="margin-top:8px"><label class="f"><span>開始予定</span><input type="time" id="mTime" value="${m.time != null ? BT.fmtMin(m.time).padStart(5, '0') : ''}"></label><label class="f"><span>コート</span><input type="number" min="1" id="mCourt" value="${m.court || ''}" style="width:80px"></label><label class="f"><span>試合番号</span><input type="number" min="1" id="mNo" value="${m.no || ''}" style="width:80px"></label></div></details>
      <div class="foot">${m.result ? '<button class="btn danger" data-m="clear">結果を取り消す</button>' : ''}<span class="spacer"></span><button class="btn" data-m="close">閉じる</button><button class="btn primary" data-m="save"${dis}>保存</button></div></div>`;
    document.body.appendChild(bg);
    $('#mType', bg).value = m.resultType || 'normal';
    $('#mWin', bg).value = m.result && (m.resultType !== 'normal' || BT.autoWinner(m) !== m.result) ? m.result : '';

    const readScores = (r) => {
      const scores = [];
      for (let i = 0; i < G; i++) {
        const x = $(`input[data-r="${r}"][data-g="${i}"][data-s="0"]`, bg).value, y = $(`input[data-r="${r}"][data-g="${i}"][data-s="1"]`, bg).value;
        if (x !== '' || y !== '') scores.push([x === '' ? '' : +x, y === '' ? '' : +y]);
      }
      return scores;
    };
    const collect = () => {
      const type = $('#mType', bg).value;
      const res = { type };
      if (team) {
        res.rubbers = rubs.map((r, i) => {
          const scores = readScores(i);
          return { label: r.label, pa: $(`input[data-r="${i}"][data-p="0"]`, bg).value.trim(), pb: $(`input[data-r="${i}"][data-p="1"]`, bg).value.trim(), scores, result: BT.autoWinner({ scores }) };
        });
        res.scores = [];
        res.has = res.rubbers.some((r) => r.scores.length);
        res.win = $('#mWin', bg).value || (type === 'walkover' ? '' : BT.autoWinnerTeam({ rubbers: res.rubbers })) || null;
      } else {
        res.scores = readScores('x');
        res.has = res.scores.length > 0;
        res.win = $('#mWin', bg).value || (type === 'walkover' ? '' : BT.autoWinner({ scores: res.scores })) || null;
      }
      return res;
    };
    const judge = () => {
      const r = collect();
      if (team) {
        const t = BT.teamCount({ rubbers: r.rubbers });
        $('#mTeamSum', bg).innerHTML = `<span>${esc(a.text)}</span><b>${t.ra}</b><span class="muted">-</span><b>${t.rb}</b><span>${esc(b.text)}</span>`;
        r.rubbers.forEach((x, i) => { $(`#rw${i}`, bg).innerHTML = x.result ? `<span class="w">${esc(x.result === 'a' ? a.text : b.text)} の勝ち</span>` : ''; });
      }
      $('#mJudge', bg).innerHTML = r.win ? `勝者：<b class="w">${esc(r.win === 'a' ? a.text : b.text)}</b>` : `<span class="muted">勝者が決まっていません（スコアまたは勝者を指定）</span>`;
    };
    bg.addEventListener('input', judge); bg.addEventListener('change', judge); judge();
    const first = $('input[data-g="0"][data-s="0"]', bg); if (first && !first.disabled && !team) setTimeout(() => first.focus(), 50);
    const close = () => bg.remove();
    const reset = (d) => { d.result = null; d.scores = []; d.rubbers = null; d.status = ''; d.resultType = 'normal'; };
    bg.addEventListener('click', (e) => {
      if (e.target === bg) return close();
      const act = e.target.dataset && e.target.dataset.m;
      if (act === 'close') close();
      if (act === 'clear') {
        const deps = dependents(m.id);
        if (deps.length && !confirm(`この試合の結果に関係する後の試合（${deps.length}試合）の結果も取り消されます。よろしいですか？`)) return;
        deps.forEach(reset); reset(m);
        save(); close(); render();
      }
      if (act === 'save') {
        const r = collect();
        applyTimeEdits();
        if (r.win || r.has) {
          if (!r.win) { alert('勝者を判定できません。スコアを確認するか勝者を選択してください。'); return; }
          if (m.result && m.result !== r.win) {
            const deps = dependents(m.id);
            if (deps.length && !confirm(`勝者が変わるため、後の試合（${deps.length}試合）の結果を取り消します。よろしいですか？`)) return;
            deps.forEach(reset);
          }
          m.scores = r.scores; m.resultType = r.type; m.result = r.win; m.status = 'done'; m.endedAt = Date.now();
          if (team) m.rubbers = r.rubbers;
        } else if (team) {
          m.rubbers = collect().rubbers; // 途中経過（出場選手など）を保存
        }
        save(); close(); render();
      }
    });
    function applyTimeEdits() {
      const tv = BT.toMin($('#mTime', bg).value); const cv = +$('#mCourt', bg).value; const nv = +$('#mNo', bg).value;
      if (tv != null) m.time = tv;
      if (cv > 0) m.court = cv;
      if (nv > 0) m.no = nv;
    }
    bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'number') $('[data-m="save"]', bg).click(); });
  }

  // ---------- 公開・通信 ----------
  // 大会スプレッドシートへ保存（初回は自動作成）＋公開ページ更新
  async function publish(silent) {
    const a = API();
    if (!a.url || !a.key) { if (!silent) alert('先に「設定・連携」でGoogle連携を設定してください。'); return; }
    const target = S;
    const state = JSON.parse(JSON.stringify(target));
    delete state.tournament.apiUrl; delete state.tournament.apiKey;
    setStatus('Googleに保存中…');
    try {
      const r = await BTAPI.sync(a.url, a.key, { tid: target.id, snapshot: BT.publicSnapshot(target), state, sheets: BTR.sheetData(target) });
      target.sheetUrl = r.url; target.syncedAt = Date.now();
      syncing = true; if (target === S) save(true); else LS.set('bt.t.' + target.id, JSON.stringify(target)); syncing = false;
      setStatus('Googleに保存しました ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
      if (!silent) { toast('スプレッドシートに保存し、公開ページを更新しました'); if (ui.tab === 'settings' || ui.tab === 'results' || ui.tab === 'entries') render(); }
    } catch (e) {
      syncing = false;
      setStatus('⚠ Google保存に失敗: ' + e.message);
      if (!silent) alert('Googleへの保存に失敗しました：' + e.message);
    }
  }

  function toast(msg) {
    document.querySelectorAll('.toast').forEach((x) => x.remove());
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    d.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#14213d;color:#fff;padding:10px 18px;border-radius:8px;z-index:200;font-size:.9rem;box-shadow:0 8px 20px rgba(0,0,0,.2)';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function printHTML(title, html, landscape) {
    const w = window.open('', '_blank');
    if (!w) { alert('ポップアップがブロックされました。許可してください。'); return; }
    w.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="${new URL('css/style.css', location.href).href}"><style>body{background:#fff;padding:12px}@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:${landscape ? 10 : 15}mm}h2{margin:0 0 8px}</style></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }

  // ---------- CSV ----------
  const CSV_HEAD = ['種目', '選手1氏名', '選手1フリガナ', '選手1所属', '選手2氏名', '選手2フリガナ', '選手2所属', 'シード', '代表者', 'メール', '電話', '備考'];
  function mapHeader(h) {
    const s = String(h).replace(/[\s　]/g, '');
    // 見出しの番号（選手1〜選手12）を読み取る
    const half = s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
    const dm = /(\d{1,2})/.exec(half);
    const no = dm && +dm[1] >= 1 && +dm[1] <= 20 ? +dm[1] - 1 : /パートナー|ペア|後衛/.test(s) ? 1 : 0;
    const hasNo = !!dm || /パートナー|ペア/.test(s);
    if (/種目|クラス|部門|カテゴリ/.test(s)) return { k: 'event' };
    if (/代表|責任者|申込者/.test(s)) return { k: 'contactName' };
    if (/メール|mail/i.test(s)) return { k: 'contactEmail' };
    if (/電話|TEL|携帯/i.test(s)) return { k: 'contactTel' };
    if (/シード/.test(s)) return { k: 'seed' };
    if (/備考|メモ|連絡事項/.test(s)) return { k: 'memo' };
    if (/タイムスタンプ|日時/.test(s)) return null;
    if (/チーム名|団体名/.test(s)) return { k: 'teamName' };
    if (/フリガナ|ふりがな|カナ|よみ/.test(s)) return { k: 'kana', p: no };
    if (/所属|チーム|クラブ|団体|学校/.test(s)) return hasNo ? { k: 'team', p: no } : { k: 'entryTeam' };
    if (/氏名|名前|選手/.test(s)) return { k: 'name', p: no };
    return null;
  }
  function importCSV(text) {
    const rows = BT.parseCSV(text);
    if (rows.length < 2) { alert('データ行がありません'); return; }
    const map = rows[0].map(mapHeader);
    if (!map.some((x) => x && (x.k === 'name' || x.k === 'teamName'))) { alert('「氏名」列が見つかりません。CSVひな形の見出しを使ってください。'); return; }
    let added = 0, newEv = [];
    rows.slice(1).forEach((r) => {
      const en = BT.newEntry(null); en.source = 'csv';
      let evName = '';
      r.forEach((v, i) => {
        const m = map[i]; if (!m) return; v = String(v).trim();
        if (m.k === 'event') evName = v;
        else if (m.k === 'entryTeam') { en.team = v; }
        else if (m.p != null) { en.players[m.p] = en.players[m.p] || { name: '', kana: '', team: '' }; en.players[m.p][m.k] = v; }
        else en[m.k] = v;
      });
      en.players = en.players.filter((p) => p && (p.name || !en.teamName));
      if (!en.players.some((p) => p.name) && !en.teamName) return;
      if (en.team) en.players.forEach((p) => { if (p.name && !p.team) p.team = en.team; });
      let ev = evName ? S.events.find((e) => BT.normName(e.name) === BT.normName(evName)) : (ui.evFilter ? S.events.find((e) => e.id === ui.evFilter) : S.events[0]);
      if (!ev) {
        ev = Object.assign(BT.newEvent(), { name: evName || '未分類' });
        if (en.teamName) { ev.type = 'team'; ev.minutes = 60; } else if (!en.players[1] || !en.players[1].name) ev.type = 'singles';
        S.events.push(ev); newEv.push(ev.name);
      }
      en.eventId = ev.id;
      S.entries.push(en); added++;
    });
    save(); render();
    alert(`${added}件を取り込みました。${newEv.length ? '\n新しく作成した種目：' + newEv.join('、') + '（「種目」タブで形式を確認してください）' : ''}`);
  }

  // ---------- Excel申込書の取り込み ----------
  async function importXlsx(files) {
    let added = 0, dup = 0;
    const msgs = [];
    const key = (en) => en.eventId + '|' + (en.teamName ? BT.normName(en.teamName) + '|' : '') + BT.playerKeys(en).join(',');
    const have = new Set(S.entries.map(key));
    for (const f of files) {
      try {
        const r = await BTX.parse(await f.arrayBuffer(), S);
        r.warnings.forEach((w) => msgs.push(`${f.name}：${w}`));
        if (!r.contact.contactEmail && !r.contact.contactTel) msgs.push(`${f.name}：申込責任者の電話番号・メールアドレスが未記入です`);
        r.entries.forEach((en) => { const k = key(en); if (have.has(k)) { dup++; return; } have.add(k); S.entries.push(en); added++; });
      } catch (e) { msgs.push(`${f.name}：読み込めませんでした（${e.message}）`); }
    }
    save(); render();
    alert(`Excel申込書から ${added}件を取り込みました。${dup ? `\n（すでに登録済みの ${dup}件は除外）` : ''}${msgs.length ? '\n\n' + msgs.join('\n') : ''}`);
  }

  // ---------- デモデータ ----------
  function demoState() {
    const s = BT.newTournament();
    Object.assign(s.tournament, {
      name: '第1回 みらいカップ バドミントン大会', date: '2026-11-23', venue: '市民総合体育館 メインアリーナ', address: '○○市△△町1-2-3',
      organizer: 'みらいバドミントン協会', host: 'みらいバドミントンクラブ', deadline: '2026-11-09', shuttle: '日本バドミントン協会検定合格球',
      contactName: '大会事務局', contactEmail: 'entry@example.com', courts: 6, startTime: '09:00', matchMinutes: 20, restMinutes: 10,
      method: '（公財）日本バドミントン協会競技規則および大会運営規程に準ずる。\n全試合21点ラリーポイント3ゲームマッチで行う。',
      eligibility: '中学生以上のバドミントン愛好家', receptionTime: '8:40', issueDate: '令和8年9月吉日', representative: '会　長　未来　太郎',
      contactTel: '090-0000-0000', contactLine: 'https://lin.ee/xxxxxxx',
      fee: '個人戦　1人　1,500円\n団体戦　1チーム　8,000円\n・当日受付で徴収致します。',
      eventsText: '一般男子ダブルス・一般女子シングルス・混合ダブルス・男子団体戦\n・申込み数によりランクの変更があります。',
      notes: '要項に定めのない事については主催者一任のこと。\n競技中の事故につきましては一切の責任を持ちませんので各自ご了承下さい。',
    });
    const ln = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '清水', '斎藤', '森', '池田', '橋本', '石川'];
    const mf = ['翔太', '大輔', '健太', '拓也', '直樹', '亮', '悠斗', '蓮', '陽翔', '湊'], ff = ['美咲', '陽菜', '結衣', '彩', '花子', '真央', '葵', '凛', '芽依', '咲'];
    const teams = ['みらいBC', 'さくらクラブ', '中央クラブ', '東高校', 'スマッシュ会', '北部BC'];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const mk = (ev, n, fem, mixed) => {
      for (let i = 0; i < n; i++) {
        const en = BT.newEntry(ev.id); en.source = 'manual';
        const team = pick(teams);
        en.players = Array.from({ length: BT.playerCount(ev) }, (_, k) => ({ name: `${pick(ln)} ${pick(mixed ? (k ? ff : mf) : fem ? ff : mf)}`, kana: '', team }));
        if (i < 2 && ev.format !== 'league') en.seed = String(i + 1);
        s.entries.push(en);
      }
    };
    const e1 = Object.assign(BT.newEvent(), { name: '一般男子ダブルス', type: 'doubles', format: 'tournament', fee: '1組 3,000円', capacity: 32 });
    const e2 = Object.assign(BT.newEvent(), { name: '一般女子シングルス', type: 'singles', format: 'league', groupSize: '', fee: '1人 1,500円', games: '3' });
    const e3 = Object.assign(BT.newEvent(), { name: '混合ダブルス', type: 'doubles', format: 'league_tournament', groupSize: 3, advance: 1, fee: '1組 3,000円', games: '1', points: '21' });
    s.events.push(e1, e2, e3);
    mk(e1, 11, false, false); mk(e2, 5, true, false); mk(e3, 12, false, true);
    const e4 = Object.assign(BT.newEvent(), { name: '男子団体戦', type: 'team', format: 'league_tournament', groupSize: 3, advance: 1, fee: '1チーム 8,000円', games: '3', minutes: 60, rubbers: '第1ダブルス,第2ダブルス,シングルス', teamMin: 3, teamMax: 6 });
    s.events.push(e4);
    teams.forEach((tm, i) => {
      const en = BT.newEntry(e4.id); en.source = 'manual'; en.teamName = `${tm} ${i % 2 ? 'B' : 'A'}チーム`; en.team = tm;
      en.players = Array.from({ length: 4 + (i % 2) }, () => ({ name: `${pick(ln)} ${pick(mf)}`, kana: '', team: tm }));
      s.entries.push(en);
    });
    return s;
  }

  // ---------- アクション ----------
  const ACT = {
    demo() { if (S.events.length && !confirm('デモデータで新しい大会を作成します（今の大会は残ります）。')) return; createNew(demoState()); toast('デモデータを読み込みました'); },
    methodTemplate() {
      const T = S.tournament;
      const fmts = [...new Set(S.events.map((e) => e.format))];
      const head = fmts.length === 1 ? { tournament: 'トーナメント方式とします。', league: 'リーグ方式とします。', league_tournament: '予選はリーグ方式、決勝はトーナメント方式とします。' }[fmts[0]] : '';
      const ls = [];
      if (!head) S.events.forEach((e) => ls.push(`・${e.name}：${BTR.eventSummary(e).fm}`));
      S.events.filter(BT.isTeamEv).forEach((e) => ls.push(`・${e.name}は${BT.rubberList(e).join('・')}の${BT.rubberList(e).length}試合で行います。`));
      ls.push('・参加チーム数により変更する事もあります。', '・得点やセット数は主催者一任のこと。');
      T.method = [head || '試合方法は次のとおりとします。'].concat(ls).join('\n');
      save(); render();
    },
    notesTemplate() { const T = S.tournament; T.notes = (T.notes ? T.notes + '\n' : '') + '要項に定めのない事については主催者一任のこと。\n競技中の事故につきましては一切の責任を持ちませんので各自ご了承下さい。'; save(); render(); },
    qrDel() { S.tournament.contactQr = ''; save(); render(); },
    applyTextWeb() { const T = S.tournament; T.applyMethod = '下記のQRコードまたはURLから、Webで申し込み下さい。\n・メールまたはLINEでの申し込みも受け付けます。'; T.showApplyQr = true; save(); render(); },
    applyTextMail() { const T = S.tournament; T.applyMethod = '別紙申し込み用紙に必要事項を記入のうえ、下記までメールまたはLINEで申し込み下さい。'; save(); render(); },
    addSection() { S.tournament.extraSections.push({ title: '', body: '' }); save(); render(); },
    delSection(el) { S.tournament.extraSections.splice(+el.dataset.i, 1); save(); render(); },
    printGuide() { printHTML(S.tournament.name + ' 要項', BTR.guide(S)); },
    evAdd(el, name) { const ev = BT.newEvent(); if (typeof name === 'string') { ev.name = name; if (/シングルス/.test(name)) ev.type = 'singles'; if (/団体/.test(name)) { ev.type = 'team'; ev.minutes = 60; } } S.events.push(ev); save(); render(); },
    evUp(el) { const i = S.events.findIndex((e) => e.id === el.dataset.id); if (i > 0) { [S.events[i - 1], S.events[i]] = [S.events[i], S.events[i - 1]]; save(); render(); } },
    evDown(el) { const i = S.events.findIndex((e) => e.id === el.dataset.id); if (i < S.events.length - 1) { [S.events[i + 1], S.events[i]] = [S.events[i], S.events[i + 1]]; save(); render(); } },
    evDup(el) {
      const i = S.events.findIndex((e) => e.id === el.dataset.id);
      const ev = Object.assign({}, JSON.parse(JSON.stringify(S.events[i])), { id: BT.uid('e'), name: S.events[i].name + '（コピー）', code: '' });
      S.events.splice(i + 1, 0, ev); save(); render(); toast('種目を複製しました（申込・組み合わせは複製されません）');
      const inp = main.querySelector(`[data-bind="events.#${ev.id}.name"]`); if (inp) { inp.focus(); inp.select(); }
    },
    addOfficer() { S.tournament.officers.push({ role: '', org: '', name: '' }); save(); render(); },
    delOfficer(el) { S.tournament.officers.splice(+el.dataset.i, 1); save(); render(); },
    addAgenda() { S.tournament.agenda.push({ item: '', time: '', note: '' }); save(); render(); },
    delAgenda(el) { S.tournament.agenda.splice(+el.dataset.i, 1); save(); render(); },
    coverDel() { S.tournament.coverImage = ''; save(); render(); },
    programNotesTemplate() {
      const T = S.tournament;
      const ev = S.events[0] || {};
      T.programNotes = '(1)流し込みでコールします。時間・コートの変更にご注意ください。\n(2)試合方法\n　' + (ev.games == 1 ? '1ゲーム' : (ev.games || 3) + 'ゲームマッチ') + '（' + (ev.points || 21) + '点）\n　順位は次の順で決まる\n　　①勝ち数\n　　②得失点\n　　③①～②で決まらない場合は当該対戦勝者\n(3)相互審判とします。（不足する時は本部へお申し出ください。）\n(4)早めのオーダー用紙提出にご協力ください。\n(5)連続試合になる場合は十分な間隔を空けて行います。';
      save(); render();
    },
    pmUp(el) { const o = S.tournament.pmLayout.order; const i = o.indexOf(el.dataset.k); if (i > 0) { [o[i - 1], o[i]] = [o[i], o[i - 1]]; save(); render(); } },
    pmDown(el) { const o = S.tournament.pmLayout.order; const i = o.indexOf(el.dataset.k); if (i >= 0 && i < o.length - 1) { [o[i + 1], o[i]] = [o[i], o[i + 1]]; save(); render(); } },
    async formDownload() {
      if (!S.events.length) { alert('先に「種目」タブで種目を登録してください。'); return; }
      try { toast('申込書を作成しています…'); const blob = await BTX.build(S); BTX.download(blob, BTX.fileName(S.tournament)); }
      catch (e) { alert(e.message); }
    },
    printPamphlet() { printHTML((S.tournament.name || '大会') + ' プログラム', BTR.pamphlet(S)); },
    evDel(el) {
      const id = el.dataset.id; const n = S.entries.filter((e) => e.eventId === id).length;
      if (!confirm(`この種目を削除しますか？${n ? `\n申込${n}件と組み合わせ・結果も削除されます。` : ''}`)) return;
      S.events = S.events.filter((e) => e.id !== id); S.entries = S.entries.filter((e) => e.eventId !== id); S.matches = S.matches.filter((m) => m.eventId !== id); delete S.draws[id];
      save(); render();
    },
    entryAdd(el) {
      const en = BT.newEntry(el.dataset.ev);
      const prev = S.entries.filter((e) => e.eventId === el.dataset.ev).pop();
      if (BT.isTeamEv(S.events.find((e) => e.id === el.dataset.ev))) en.players = [];
      else if (prev) en.players.forEach((p, k) => { p.team = (prev.players[k] || {}).team || ''; }); // 所属は前の行を引き継ぐ
      S.entries.push(en); save(); render();
      const inp = main.querySelector(`[data-bind="entries.#${en.id}.players.0.name"],[data-bind="entries.#${en.id}.teamName"]`); if (inp) inp.focus();
    },
    entryDel(el) {
      const en = S.entries.find((e) => e.id === el.dataset.id);
      if (!confirm(`「${BT.entryLabel(en) || '（未入力）'}」を削除しますか？`)) return;
      if (en.source === 'web') S.ignoredIds.push(en.id);
      S.entries = S.entries.filter((e) => e.id !== en.id); save(); render();
    },
    csvTemplate() { download('申込ひな形.csv', BT.toCSV([CSV_HEAD, [S.events[0] ? S.events[0].name : '一般男子ダブルス', '山田 太郎', 'ヤマダ タロウ', 'みらいBC', '鈴木 一郎', 'スズキ イチロウ', 'みらいBC', '', '山田 太郎', 'taro@example.com', '090-0000-0000', '']]), 'text/csv'); },
    csvExport() {
      const rows = [CSV_HEAD.concat(['受付', 'チーム名', 'メンバー'])];
      S.entries.forEach((en) => { const ev = S.events.find((e) => e.id === en.eventId); const p = en.players; rows.push([ev ? ev.name : '', p[0] && p[0].name, p[0] && p[0].kana, p[0] && p[0].team, p[1] && p[1].name, p[1] && p[1].kana, p[1] && p[1].team, en.seed, en.contactName, en.contactEmail, en.contactTel, en.memo, en.withdrawn ? '棄権' : '', en.teamName || '', en.teamName ? BT.memberNames(en).join('、') : '']); });
      download('申込一覧.csv', BT.toCSV(rows), 'text/csv');
    },
    async pullEntries() {
      try {
        const r = await BTAPI.entries(API().url, API().key, S.id);
        const have = new Set(S.entries.map((e) => e.id).concat(S.ignoredIds));
        let added = 0, skipped = 0;
        (r.entries || []).forEach((en) => {
          if (have.has(en.id)) return;
          if (!S.events.some((e) => e.id === en.eventId)) { skipped++; return; }
          S.entries.push(Object.assign(BT.newEntry(en.eventId), en, { source: 'web' })); added++;
        });
        save(); render();
        alert(`Web申込 ${added}件を新たに取り込みました。${skipped ? `\n（削除済みの種目への申込 ${skipped}件は除外）` : ''}`);
      } catch (e) { alert('取り込みに失敗しました：' + e.message); }
    },
    copy(el) { navigator.clipboard.writeText(el.dataset.text).then(() => toast('コピーしました'), () => prompt('コピーしてください', el.dataset.text)); },
    genDraw(el) {
      const id = el.dataset.id;
      if (S.draws[id] && !confirm(BT.eventHasResults(S, id) ? 'この種目には入力済みの結果があります。再作成すると結果はすべて消えます。よろしいですか？' : '組み合わせを作り直しますか？（抽選し直します）')) return;
      try { BT.generateDraw(S, id); save(); render(); toast('組み合わせを作成しました。タイムテーブルも作り直してください'); } catch (e) { alert(e.message); }
    },
    toggleSwap(el) { ui.swap[el.dataset.id] = !ui.swap[el.dataset.id]; render(); },
    rankOverride(el) {
      const c = BT.ctx(S); const st = BT.standings(c, el.dataset.ev, el.dataset.g);
      const list = st.rows.map((r, i) => `${i + 1}: ${BT.entryNames(c.entry.get(r.id))}`).join('\n');
      const v = prompt(`${el.dataset.g}組の順位を、現在の番号を上位から順にカンマ区切りで入力（空欄で自動に戻す）\n${list}`, st.rows.map((_, i) => i + 1).join(','));
      if (v == null) return;
      const d = S.draws[el.dataset.ev]; d.rankOverride = d.rankOverride || {};
      if (!v.trim()) delete d.rankOverride[el.dataset.g];
      else { const ord = v.split(/[,、\s]+/).map((x) => st.rows[+x - 1]).filter(Boolean).map((r) => r.id); d.rankOverride[el.dataset.g] = ord; }
      save(); render();
    },
    printDraw(el) { const ev = S.events.find((e) => e.id === el.dataset.id); printHTML(ev.name, `<h2>${esc(S.tournament.name)}　${esc(ev.name)}</h2>${BTR.eventDraw(BT.ctx(S), ev)}`, true); },
    schedule() {
      if (S.matches.some((m) => m.result || m.status === 'playing') && !confirm('入力済みの結果がある試合も含めて、全試合の時刻・コート・試合番号を作り直します。\n（途中から組み直す場合は「未終了の試合だけ組み直す」を使ってください）')) return;
      const r = BT.schedule(S); save(); render();
      if (r.unscheduled) alert(`${r.unscheduled}試合を配置できませんでした。種目の使用コート設定を確認してください。`); else toast('タイムテーブルを作成しました');
    },
    reschedule() {
      const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const v = prompt('何時から組み直しますか？', hm); if (!v) return;
      const keep = S.tournament.startTime; S.tournament.startTime = v;
      BT.schedule(S, { onlyPending: true }); S.tournament.startTime = keep; save(); render(); toast('未終了の試合を組み直しました');
    },
    printTT() { const c = BT.ctx(S); printHTML('タイムテーブル', `<h2>${esc(S.tournament.name)}　タイムテーブル</h2>${BTR.timetable(c)}<div class="print-break"></div><h2>試合順</h2>${BTR.matchList(c)}`, true); },
    openMatch(el) { openMatch(el.dataset.id); },
    call(el) { const m = S.matches.find((x) => x.id === el.dataset.id); m.status = 'playing'; m.court = +el.dataset.court; m.startedAt = Date.now(); save(); render(); },
    unplay(el) { const m = S.matches.find((x) => x.id === el.dataset.id); m.status = ''; m.startedAt = null; save(); render(); },
    publish() { publish(false); },
    async ping() {
      const box = $('#apiMsg');
      const url = $('#apiUrlIn').value.trim(), key = $('#apiKeyIn').value;
      setApi({ url, key });
      try {
        const r = await BTAPI.ping(url, key);
        setApi({ indexUrl: r.indexUrl || '' });
        render();
        $('#apiMsg').innerHTML = '<div class="notice ok">接続できました。上の「スプレッドシートを作成して保存」を押すと、この大会のスプレッドシートが作られます。</div>';
      } catch (e) { box.innerHTML = `<div class="notice err">接続できません：${esc(e.message)}</div>`; }
    },
    resultCsv() {
      const c = BT.ctx(S);
      const rows = [['No.', '種目', '回戦', '時刻', 'コート', '選手A', '所属A', '選手B', '所属B', 'スコア', '勝者']];
      S.matches.filter((m) => !BT.isAuto(c, m)).sort((x, y) => (x.no || 1e9) - (y.no || 1e9)).forEach((m) => {
        const [a, b] = BT.sides(c, m); const ea = c.entry.get(a), eb = c.entry.get(b); const w = BT.winnerSide(c, m);
        rows.push([m.no || '', c.event.get(m.eventId).name, BTR.stageLabel(c, m), BT.fmtMin(m.time), m.court || '', BT.entryNames(ea), BT.entryTeam(ea), BT.entryNames(eb), BT.entryTeam(eb), m.result ? BT.scoreText(m) : '', w ? BT.entryNames(w === 'a' ? ea : eb) : '']);
      });
      download('試合結果.csv', BT.toCSV(rows), 'text/csv');
    },
    printResults() { printHTML('大会結果', `<h2>${esc(S.tournament.name)}　大会結果</h2><div class="res-grid">${BTR.results(BT.ctx(S))}</div>`); },
    exportJson() { download(`${S.tournament.name || 'tournament'}_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S, null, 1), 'application/json'); },
    async cloudLoad() {
      const a = API();
      try {
        const r = await BTAPI.list(a.url, a.key);
        if (!r.list || !r.list.length) { alert('Googleに保存された大会がありません'); return; }
        const v = prompt('読み込む大会の番号を入力してください\n\n' + r.list.map((x, i) => `${i + 1}. ${x.date || ''} ${x.name || '（無題）'}`).join('\n'), '1');
        const item = v && r.list[+v - 1]; if (!item) return;
        const st = await BTAPI.loadState(a.url, a.key, item.id);
        if (!st.state) { alert('この大会のデータが見つかりません'); return; }
        const local = loadT(item.id);
        if (local && !confirm(`このブラウザにも同じ大会があります（最終更新 ${new Date(local.updatedAt).toLocaleString('ja-JP')}）。\nGoogleのデータ（${new Date(st.state.updatedAt).toLocaleString('ja-JP')}）で上書きしますか？`)) return;
        S = migrate(st.state); S.sheetUrl = item.url; save(true); render(); toast('読み込みました');
      } catch (e) { alert('読み込みに失敗：' + e.message); }
    },
    newT() { chooseNew(); },
    async saveTpl() {
      const name = prompt('テンプレートの名前', (S.tournament.name || '').replace(/^第\s*\d+\s*回\s*/, '') || '大会テンプレート');
      if (!name) return;
      const tpl = BT.makeTemplate(S, name);
      const list = getTpls().filter((x) => x.name !== name);
      list.unshift(tpl); setTpls(list);
      let msg = `テンプレート「${name}」を登録しました。`;
      if (linked()) {
        try { const old = (await BTAPI.listTemplates(API().url, API().key)).list.find((x) => x.name === name); if (old) await BTAPI.deleteTemplate(API().url, API().key, old.id); await BTAPI.saveTemplate(API().url, API().key, tpl); msg += '（Googleにも保存しました）'; }
        catch (e) { msg += `\n※Googleへの保存に失敗しました：${e.message}`; }
      }
      render(); alert(msg);
    },
    async delTpl(el) {
      const t = getTpls().find((x) => x.id === el.dataset.id) || { id: el.dataset.id, name: el.dataset.name };
      if (!confirm(`テンプレート「${t.name}」を削除しますか？（作成済みの大会には影響しません）`)) return;
      setTpls(getTpls().filter((x) => x.id !== t.id));
      if (linked()) { try { await BTAPI.deleteTemplate(API().url, API().key, t.id); } catch (e) { /* ブラウザ分は削除済み */ } }
      render();
    },
    dupT() {
      const s = BT.newTournament();
      s.tournament = Object.assign({}, JSON.parse(JSON.stringify(S.tournament)), { name: S.tournament.name + '（コピー）' });
      s.events = S.events.map((e) => Object.assign({}, e, { id: BT.uid('e') }));
      delete s.sheetUrl; delete s.syncedAt; s.tournament.applyUrl = ''; s.tournament.formUrl = '';
      createNew(s); toast('複製しました');
    },
    delT() {
      if (!confirm(`「${S.tournament.name || '（無題の大会）'}」をこのブラウザから削除しますか？元に戻せません。`)) return;
      LS.del('bt.t.' + S.id); setIndex(getIndex().filter((x) => x.id !== S.id));
      const idx = getIndex(); if (idx.length) switchTo(idx[0].id); else createNew();
    },
  };

  const CHANGE = {
    evFilter(el) { ui.evFilter = el.value; render(); },
    ttView(el) { ui.ttView = el.value; render(); },
    ttEv(el) { ui.ttEv = el.value; render(); },
    runEv(el) { ui.runEv = el.value; render(); },
    runFilter(el) { ui.runFilter = el.value; render(); },
    callPick(el) { if (el.value) ACT.call({ dataset: { id: el.value, court: el.dataset.court } }); },
    moveGroup(el) {
      const draw = S.draws[el.dataset.ev], id = el.dataset.entry, to = el.value;
      const from = draw.groups.find((g) => g.entryIds.includes(id));
      if (!from || from.name === to) return;
      const has = S.matches.some((m) => m.eventId === el.dataset.ev && m.stage === 'L' && (m.group === from.name || m.group === to) && m.result);
      if (has && !confirm('移動元・移動先のグループの結果が消えます。よろしいですか？')) { render(); return; }
      from.entryIds = from.entryIds.filter((x) => x !== id);
      draw.groups.find((g) => g.name === to).entryIds.push(id);
      BT.regenGroupMatches(S, el.dataset.ev, from.name); BT.regenGroupMatches(S, el.dataset.ev, to);
      save(); render(); toast('移動しました。タイムテーブルを作り直してください');
    },
    swapSlot(el) {
      if (el.value === '') return;
      const r1 = S.matches.filter((m) => m.eventId === el.dataset.ev && m.stage === 'K' && m.round === 1).sort((a, b) => a.idx - b.idx);
      const slots = r1.flatMap((m) => [[m, 'a'], [m, 'b']]);
      const [m1, s1] = slots[+el.dataset.i], [m2, s2] = slots[+el.value];
      if ([m1, m2].some((m) => m.result) && !confirm('結果が入力済みの試合が含まれます。結果を取り消して入れ替えますか？')) { render(); return; }
      [m1, m2].forEach((m) => { m.result = null; m.scores = []; m.rubbers = null; m.status = ''; });
      const tmp = m1[s1]; m1[s1] = m2[s2]; m2[s2] = tmp;
      save(); render();
    },
  };

  // ---------- イベント ----------
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { ui.tab = b.dataset.tab; window.scrollTo(0, 0); render(); } });
  main.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a && ACT[a.dataset.act]) { e.preventDefault(); ACT[a.dataset.act](a, e); return; }
    const m = e.target.closest('[data-mid]');
    if (m) openMatch(m.dataset.mid);
  });
  const onInput = (e) => {
    const el = e.target;
    if (el.dataset.members) {
      const en = S.entries.find((x) => x.id === el.dataset.members);
      en.players = el.value.split(/[,、，\n]+/).map((x) => x.trim()).filter(Boolean).map((name) => ({ name, kana: '', team: en.team || '' }));
      save();
      return;
    }
    if (el.dataset.bind) {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number' && v !== '' && /^tournament\.(courts|matchMinutes|restMinutes)$/.test(el.dataset.bind)) v = +v;
      setPath(el.dataset.bind, v);
      save();
      if (el.dataset.rerender && e.type === 'change') render();
      else if (ui.tab === 'guide') { const p = $('#guidePreview'); if (p) { p.innerHTML = BTR.guide(S); fitGuide(); } }
      else if (ui.tab === 'pamphlet') { const p = $('#pmPreview'); if (p) { p.innerHTML = BTR.pamphlet(S); fitGuide(); } }
    }
  };
  main.addEventListener('input', onInput);
  main.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.actChange && CHANGE[el.dataset.actChange]) { CHANGE[el.dataset.actChange](el); return; }
    if (el.id === 'presetSel' && el.value) { ACT.evAdd(null, el.value); return; }
    if (el.id === 'csvFile' && el.files[0]) { readFile(el.files[0], importCSV); return; }
    if (el.id === 'xlsxFile' && el.files.length) { importXlsx([...el.files]); return; }
    if (el.id === 'qrFile' && el.files[0]) { loadQr(el.files[0]); return; }
    if (el.id === 'coverFile' && el.files[0]) { loadCover(el.files[0]); return; }
    if (el.dataset.members) { render(); return; }
    if (el.id === 'jsonFile' && el.files[0]) {
      readFile(el.files[0], (text) => {
        try { const s = migrate(JSON.parse(text)); if (!s.tournament || !s.events) throw new Error(); if (getIndex().some((x) => x.id === s.id) && !confirm('同じ大会のデータがあります。上書きしますか？（キャンセルで別の大会として読み込み）')) s.id = BT.uid('t'); S = s; save(true); render(); toast('読み込みました'); }
        catch (err) { alert('このファイルは読み込めません'); }
      });
      return;
    }
    if (el.dataset.bind && el.dataset.rerender) render();
  });
  // 表紙画像（長辺1000pxに縮小してJPEG保存）
  function loadCover(file) {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1000 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        S.tournament.coverImage = cv.toDataURL('image/jpeg', 0.85); save(); render();
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }

  // QRコード画像を縮小して保存
  function loadQr(file) {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const w = Math.min(240, img.width) || 240;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round(w * img.height / img.width);
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        S.tournament.contactQr = cv.toDataURL('image/png'); save(); render();
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }
  function readFile(f, cb) {
    const r = new FileReader();
    r.onload = () => {
      let text = r.result;
      // Shift_JIS（Excel保存）対策
      if (text.includes('�')) { const r2 = new FileReader(); r2.onload = () => cb(r2.result); r2.readAsText(f, 'shift_jis'); return; }
      cb(text);
    };
    r.readAsText(f, 'utf-8');
  }
  $('#tSelect').addEventListener('change', (e) => switchTo(e.target.value));
  $('#btnNew').addEventListener('click', () => chooseNew());
  window.addEventListener('storage', (e) => { if (S && e.key === 'bt.t.' + S.id && e.newValue) { S = migrate(JSON.parse(e.newValue)); render(); } });

  // ---------- 起動 ----------
  const cur = LS.get('bt.current');
  S = (cur && loadT(cur)) || (getIndex()[0] && loadT(getIndex()[0].id));
  if (!S) { S = BT.newTournament(); save(true); }
  render();
})();
