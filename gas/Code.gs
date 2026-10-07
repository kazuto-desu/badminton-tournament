/**
 * バドミントン大会運営アプリ — オンライン申込・公開用サーバー（Google Apps Script）
 *
 * 【設置手順】
 *  1. Googleドライブで新しいスプレッドシートを作成
 *  2. メニュー「拡張機能」→「Apps Script」を開き、このファイルの内容を全部貼り付けて保存
 *  3. 下の ADMIN_KEY を自分だけが知る文字列に変更して保存
 *  4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *       次のユーザーとして実行：自分
 *       アクセスできるユーザー：全員
 *     → 「デプロイ」→ 表示された「ウェブアプリのURL」をコピー
 *  5. 大会運営アプリの「設定・連携」に URL と ADMIN_KEY を入力
 *
 * 申込データはこのスプレッドシートの「申込」シートにも記録されます。
 * コードを変更した場合は「デプロイを管理」→ 編集 → バージョン「新バージョン」で更新してください。
 */

const ADMIN_KEY = 'change-me'; // ← 必ず変更してください

const SHEET_ENTRIES = '申込';
const SHEET_STORE = '_store';
const CHUNK = 40000;

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'public') {
      const snap = readStore_('public');
      if (!snap) return json_({ ok: false, error: '大会情報がまだ公開されていません' });
      return json_({ ok: true, snapshot: JSON.parse(snap) });
    }
    return json_({ ok: true, message: 'badminton tournament api' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '不正なリクエスト' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (body.action) {
      case 'apply': return json_(apply_(body.entry));
      case 'ping': auth_(body.key); return json_({ ok: true });
      case 'publish': auth_(body.key); writeStore_('public', JSON.stringify(body.snapshot)); return json_({ ok: true });
      case 'entries': auth_(body.key); return json_({ ok: true, entries: listEntries_() });
      case 'saveState': auth_(body.key); writeStore_('state', JSON.stringify(body.state)); return json_({ ok: true, savedAt: Date.now() });
      case 'loadState': { auth_(body.key); const s = readStore_('state'); return json_({ ok: true, state: s ? JSON.parse(s) : null }); }
      default: return json_({ ok: false, error: '不明な操作です' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function auth_(key) {
  if (ADMIN_KEY === 'change-me') throw new Error('Code.gs の ADMIN_KEY を変更してから再デプロイしてください');
  if (key !== ADMIN_KEY) throw new Error('管理キーが一致しません');
}

function apply_(entry) {
  if (!entry || !entry.eventId) return { ok: false, error: '種目が指定されていません' };
  const snapText = readStore_('public');
  if (!snapText) return { ok: false, error: '大会の申込受付が開始されていません' };
  const snap = JSON.parse(snapText);
  const t = snap.tournament || {};
  if (t.acceptApply === false) return { ok: false, error: '現在、申込を受け付けていません' };
  const ev = (snap.events || []).find(function (x) { return x.id === entry.eventId; });
  if (!ev) return { ok: false, error: '種目が見つかりません' };
  if (t.deadline) {
    const d = new Date(String(t.deadline).replace(/\//g, '-') + 'T23:59:59+09:00');
    if (!isNaN(d.getTime()) && new Date() > d) return { ok: false, error: '申込締切を過ぎています' };
  }
  const players = (entry.players || []).filter(function (p) { return p && String(p.name || '').trim(); });
  if (!players.length) return { ok: false, error: '選手名を入力してください' };
  const sh = sheet_(SHEET_ENTRIES);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues() : [];
  if (ev.capacity && +ev.capacity > 0) {
    const n = rows.filter(function (r) { return r[2] === ev.id; }).length;
    if (n >= +ev.capacity) return { ok: false, error: '「' + ev.name + '」は定員に達しました' };
  }
  const id = 'w' + new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = {
    id: id, eventId: ev.id,
    players: players.slice(0, 4).map(function (p) { return { name: s_(p.name), kana: s_(p.kana), team: s_(p.team) }; }),
    team: s_(entry.team), contactName: s_(entry.contactName), contactEmail: s_(entry.contactEmail), contactTel: s_(entry.contactTel),
    memo: s_(entry.memo), createdAt: new Date().getTime(), source: 'web'
  };
  const p = clean.players;
  sh.appendRow([new Date(), id, ev.id, ev.name,
    p[0] ? p[0].name : '', p[0] ? p[0].team : '', p[1] ? p[1].name : '', p[1] ? p[1].team : '',
    clean.contactName, clean.contactEmail, clean.contactTel, clean.memo, JSON.stringify(clean)]);
  return { ok: true, id: id };
}

function listEntries_() {
  const sh = sheet_(SHEET_ENTRIES);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 13, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { try { return JSON.parse(r[0]); } catch (e) { return null; } })
    .filter(function (x) { return x; });
}

function s_(v) { return String(v == null ? '' : v).slice(0, 200); }

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (name === SHEET_ENTRIES) {
      sh.appendRow(['受付日時', 'ID', '種目ID', '種目', '選手1', '所属1', '選手2', '所属2', '代表者', 'メール', '電話', '備考', 'data(JSON)']);
      sh.setFrozenRows(1);
    }
    if (name === SHEET_STORE) sh.hideSheet();
  }
  return sh;
}

// 大きなJSONをセルに分割して保存
function writeStore_(key, text) {
  const sh = sheet_(SHEET_STORE);
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 0; i--) if (data[i][0] === key) sh.deleteRow(i + 1);
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push([key, i / CHUNK, text.slice(i, i + CHUNK)]);
  if (chunks.length) sh.getRange(sh.getLastRow() + 1, 1, chunks.length, 3).setValues(chunks);
}

function readStore_(key) {
  const sh = sheet_(SHEET_STORE);
  if (sh.getLastRow() < 1) return null;
  const rows = sh.getDataRange().getValues().filter(function (r) { return r[0] === key; });
  if (!rows.length) return null;
  rows.sort(function (a, b) { return a[1] - b[1]; });
  return rows.map(function (r) { return r[2]; }).join('');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
