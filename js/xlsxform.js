/* =========================================================
 * xlsxform.js — Excel申込書の作成と取り込み（ExcelJSを使用）
 * 管理画面・申込書ダウンロードページで共通利用
 * ========================================================= */
(function (global) {
  'use strict';
  const BT = global.BT, BTR = global.BTR;
  const X = {};
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  const COVER = '申込責任者';
  const META = '_meta';
  const HEAD_ROW = 4; // 各種目シートの見出し行

  // ライブラリは必要になったときだけ読み込む
  X.ensureLib = () => new Promise((resolve, reject) => {
    if (global.ExcelJS) return resolve(global.ExcelJS);
    const s = document.createElement('script');
    s.src = LIB;
    s.onload = () => resolve(global.ExcelJS);
    s.onerror = () => reject(new Error('Excel作成ライブラリを読み込めませんでした（インターネット接続を確認してください）'));
    document.head.appendChild(s);
  });

  const thin = { style: 'thin', color: { argb: 'FF555555' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const INPUT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBE6' } };
  const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };

  // シート名に使えない文字を除き、31文字以内・重複なしにする
  function sheetName(name, used) {
    let n = String(name || '種目').replace(/[\\/?*[\]:]/g, '').slice(0, 28) || '種目';
    let k = n, i = 2;
    while (used.has(k)) k = n.slice(0, 26) + '_' + i++;
    used.add(k);
    return k;
  }

  // 種目ごとの入力欄
  X.columns = (ev) => {
    if (BT.isTeamEv(ev)) {
      const n = Math.max(1, +ev.teamMax || 6);
      return [{ h: 'チーム名', w: 20, k: 'teamName' }, { h: '所属', w: 18, k: 'team' }]
        .concat(Array.from({ length: n }, (_, i) => ({ h: `メンバー${i + 1}${i < (+ev.teamMin || 1) ? '（必須）' : ''}`, w: 14, k: 'm' + i })))
        .concat([{ h: '備考', w: 18, k: 'memo' }]);
    }
    if (ev.type === 'singles') return [{ h: '氏名', w: 18, k: 'p0name' }, { h: 'フリガナ', w: 18, k: 'p0kana' }, { h: '所属', w: 20, k: 'p0team' }, { h: '備考', w: 22, k: 'memo' }];
    return [{ h: '選手1 氏名', w: 16, k: 'p0name' }, { h: 'フリガナ', w: 16, k: 'p0kana' }, { h: '所属', w: 16, k: 'p0team' },
      { h: '選手2 氏名', w: 16, k: 'p1name' }, { h: 'フリガナ', w: 16, k: 'p1kana' }, { h: '所属', w: 16, k: 'p1team' }, { h: '備考', w: 18, k: 'memo' }];
  };

  // 申込書を作成（snap = 大会データ or 公開データ）
  X.build = async (snap) => {
    const ExcelJS = await X.ensureLib();
    const t = snap.tournament || {};
    const wb = new ExcelJS.Workbook();
    wb.creator = t.organizer || '大会運営';
    const used = new Set([COVER, META]);

    // --- 表紙（申込責任者） ---
    const ws = wb.addWorksheet(COVER, { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ showGridLines: false }] });
    ws.columns = [{ width: 18 }, { width: 50 }];
    ws.mergeCells('A1:B1');
    const title = ws.getCell('A1');
    title.value = `${t.name || '大会'}　参加申込書`;
    title.font = { size: 15, bold: true };
    title.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;
    let r = 3;
    const info = [['期日', BTR.fmtDate(t.date, t.era)], ['会場', t.venue], ['申込期限', BTR.fmtDate(t.deadline, t.era)],
      ['申込先', [t.contactName, t.contactTel && 'TEL ' + t.contactTel, t.contactEmail && 'E-Mail ' + t.contactEmail].filter(Boolean).join('　')], ['LINE', t.contactLine]];
    info.filter((x) => x[1]).forEach(([k, v]) => { ws.getCell(r, 1).value = k; ws.getCell(r, 2).value = v; ws.getCell(r, 1).font = { bold: true }; r++; });
    r++;
    ws.getCell(r, 1).value = '申込責任者（大会からの連絡先）';
    ws.getCell(r, 1).font = { bold: true, size: 12 };
    r++;
    [['氏名（必須）', 'contactName'], ['所属', 'contactTeam'], ['電話番号', 'contactTel'], ['メールアドレス', 'contactEmail']].forEach(([k]) => {
      const a = ws.getCell(r, 1), b = ws.getCell(r, 2);
      a.value = k; a.border = box; a.fill = HEAD; b.border = box; b.fill = INPUT;
      ws.getRow(r).height = 22; r++;
    });
    r++;
    const notes = [
      '【記入方法】',
      '・画面下のシート見出し（種目名）を切り替えて、出場する種目のシートに記入してください。',
      '・黄色の欄に入力してください。行が足りない場合は下に続けて入力して構いません。',
      '・電話番号かメールアドレスのどちらかは必ず記入してください。',
      '・記入後、このファイルを保存して申込先へメールまたはLINEで送ってください。',
      '・ファイル名やシート名、見出しの行は変更しないでください（取り込みに使います）。',
    ];
    notes.forEach((n, i) => { ws.getCell(r, 1).value = n; if (i === 0) ws.getCell(r, 1).font = { bold: true }; ws.mergeCells(r, 1, r, 2); r++; });

    // --- 種目ごとのシート ---
    const meta = [['tid', snap.id || ''], ['version', 1]];
    (snap.events || []).forEach((ev) => {
      const name = sheetName(ev.name, used);
      const cols = X.columns(ev);
      const wide = cols.length > 6;
      const s = wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: wide ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEAD_ROW}:${HEAD_ROW}` } });
      s.columns = [{ width: 5 }].concat(cols.map((c) => ({ width: c.w })));
      s.mergeCells(1, 1, 1, cols.length + 1);
      s.getCell(1, 1).value = `${ev.name}　申込`;
      s.getCell(1, 1).font = { size: 14, bold: true };
      const head = s.getRow(HEAD_ROW);
      head.values = ['No'].concat(cols.map((c) => c.h));
      head.font = { bold: true };
      head.height = 22;
      head.eachCell((cell) => { cell.border = box; cell.fill = HEAD; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
      const rows = Math.max(5, Math.min(+ev.capacity || (BT.isTeamEv(ev) ? 10 : 20), 60));
      for (let i = 0; i < rows; i++) {
        const row = s.getRow(HEAD_ROW + 1 + i);
        row.getCell(1).value = i + 1;
        row.getCell(1).alignment = { horizontal: 'center' };
        for (let j = 0; j <= cols.length; j++) { const cell = row.getCell(j + 1); cell.border = box; if (j > 0) cell.fill = INPUT; }
        row.height = 21;
      }
      s.views = [{ state: 'frozen', ySplit: HEAD_ROW, showGridLines: false }];
      meta.push(['sheet', name, ev.id, ev.type, ev.name]);
    });

    const m = wb.addWorksheet(META, { state: 'veryHidden' });
    meta.forEach((row) => m.addRow(row));
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  X.fileName = (t) => `${(t.name || '大会').replace(/[\\/:*?"<>|]/g, '')}_参加申込書.xlsx`;

  X.download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  // 記入済み申込書を読み取る → { entries, contact, warnings }
  X.parse = async (arrayBuffer, state) => {
    const ExcelJS = await X.ensureLib();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const text = (cell) => String((cell && cell.text) || '').trim();
    const warnings = [];
    // 申込責任者
    const contact = {};
    const cs = wb.getWorksheet(COVER);
    if (cs) cs.eachRow((row) => {
      const k = text(row.getCell(1)), v = text(row.getCell(2));
      if (/^氏名/.test(k)) contact.contactName = v;
      if (k === '所属') contact.contactTeam = v;
      if (k === '電話番号') contact.contactTel = v;
      if (k === 'メールアドレス') contact.contactEmail = v;
    });
    // シートと種目の対応
    const map = new Map();
    const ms = wb.getWorksheet(META);
    if (ms) ms.eachRow((row) => { if (text(row.getCell(1)) === 'sheet') map.set(text(row.getCell(2)), { id: text(row.getCell(3)), name: text(row.getCell(5)) }); });
    const entries = [];
    wb.eachSheet((s) => {
      if (s.name === COVER || s.name === META) return;
      const mm = map.get(s.name);
      let ev = mm && state.events.find((e) => e.id === mm.id);
      if (!ev) ev = state.events.find((e) => BT.normName(e.name).slice(0, 28) === BT.normName(mm ? mm.name : s.name).slice(0, 28));
      if (!ev) { warnings.push(`シート「${s.name}」に対応する種目が見つかりません`); return; }
      const cols = X.columns(ev);
      for (let r = HEAD_ROW + 1; r <= s.rowCount; r++) {
        const row = s.getRow(r);
        const v = {};
        cols.forEach((c, j) => { v[c.k] = text(row.getCell(j + 2)); });
        const en = BT.newEntry(ev.id);
        en.source = 'excel';
        en.memo = v.memo || '';
        Object.assign(en, { contactName: contact.contactName || '', contactEmail: contact.contactEmail || '', contactTel: contact.contactTel || '' });
        if (BT.isTeamEv(ev)) {
          en.teamName = v.teamName; en.team = v.team || contact.contactTeam || '';
          en.players = Object.keys(v).filter((k) => /^m\d+$/.test(k) && v[k]).map((k) => ({ name: v[k], kana: '', team: en.team }));
          if (!en.teamName && !en.players.length) continue;
          if (!en.teamName) en.teamName = en.team || '（チーム名未記入）';
        } else {
          const n = ev.type === 'singles' ? 1 : 2;
          en.players = Array.from({ length: n }, (_, i) => ({ name: v[`p${i}name`] || '', kana: v[`p${i}kana`] || '', team: v[`p${i}team`] || contact.contactTeam || '' }));
          if (!en.players.some((p) => p.name)) continue;
        }
        entries.push(en);
      }
    });
    if (!map.size) warnings.push('このアプリで作成した申込書ではない可能性があります（シート名で種目を判定しました）');
    return { entries, contact, warnings };
  };

  global.BTX = X;
})(window);
