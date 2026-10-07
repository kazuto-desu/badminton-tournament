/**
 * バドミントン大会運営アプリ — Google連携（Google Apps Script）
 *
 * 大会ごとにスプレッドシートを自動作成し、すべてのデータを保存します。
 *   Googleドライブ / バドミントン大会データ / 「2026-11-23 ○○大会」 … 大会ごとのスプレッドシート
 *   このスプレッドシートの「大会一覧」シート … 全大会の一覧とリンク
 *
 * 【設置手順（最初の1回だけ）】
 *  1. Googleドライブで新しいスプレッドシートを作成（名前は「大会運営_連携」など）
 *  2. メニュー「拡張機能」→「Apps Script」を開き、このファイルの内容を全部貼り付けて保存
 *     ※Googleに複数アカウントでログインしていて開けない場合は、script.google.com で
 *       「新しいプロジェクト」を作って貼り付け、下の INDEX_SPREADSHEET_ID に1.のIDを入れてください
 *  3. 下の ADMIN_KEY を自分だけが知る文字列に変更して保存
 *  4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *       次のユーザーとして実行：自分
 *       アクセスできるユーザー：全員
 *     → 「デプロイ」（Googleドライブへのアクセス許可を求められたら許可）
 *  5. 表示された「ウェブアプリのURL」と ADMIN_KEY を、大会運営アプリの「設定・連携」に入力
 *
 * コードを変更したときは「デプロイを管理」→ 編集（鉛筆）→ バージョン「新バージョン」→ デプロイ。
 * （URLは変わりません）
 */

const ADMIN_KEY = 'change-me'; // ← 必ず変更してください

// 「大会一覧」を置くスプレッドシートのID（URLの /d/ と /edit の間の文字列）。
// スプレッドシートの「拡張機能 → Apps Script」から作った場合は空欄のままでOK。
// 空欄で単独のApps Scriptとして動かすと、「バドミントン大会データ」フォルダに「大会一覧」を自動で作ります。
const INDEX_SPREADSHEET_ID = '';

const FOLDER_NAME = 'バドミントン大会データ';
const INDEX_SHEET = '大会一覧';
const WEB_SHEET = 'Web申込';
const STORE_SHEET = '_data';
const CHUNK = 40000;
// 大会スプレッドシートのシート順
const SHEET_ORDER = ['大会情報', '種目', '申込一覧', WEB_SHEET, '組み合わせ', '試合結果', 'リーグ順位', '入賞者'];

// ===================== 入口 =====================
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'public') {
      const ss = openT_(p.t);
      const snap = ss && readStore_(ss, 'public');
      if (!snap) return json_({ ok: false, error: '大会情報がまだ公開されていません' });
      return json_({ ok: true, snapshot: JSON.parse(snap) });
    }
    return json_({ ok: true, message: 'badminton tournament api' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '不正なリクエスト' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    switch (b.action) {
      case 'apply': return json_(apply_(b.t, b.entry));
      case 'ping': auth_(b.key); folder_(); return json_({ ok: true, indexUrl: indexSS_().getUrl() });
      case 'sync': auth_(b.key); return json_(sync_(b));
      case 'entries': { auth_(b.key); const ss = openT_(b.t); return json_({ ok: true, entries: ss ? webEntries_(ss) : [] }); }
      case 'loadState': { auth_(b.key); const ss = openT_(b.t); const s = ss && readStore_(ss, 'state'); return json_({ ok: true, state: s ? JSON.parse(s) : null }); }
      case 'list': auth_(b.key); return json_({ ok: true, list: list_() });
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

// ===================== 大会スプレッドシート =====================
function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('folderId');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* 作り直す */ }
  }
  const f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('folderId', f.getId());
  return f;
}

// 大会一覧のスプレッドシート
function indexSS_() {
  if (INDEX_SPREADSHEET_ID) return SpreadsheetApp.openById(INDEX_SPREADSHEET_ID);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('indexId');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* 作り直す */ } }
  const ss = SpreadsheetApp.create('大会一覧');
  DriveApp.getFileById(ss.getId()).moveTo(folder_());
  props.setProperty('indexId', ss.getId());
  return ss;
}

function index_() {
  const ss = indexSS_();
  let sh = ss.getSheetByName(INDEX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INDEX_SHEET, 0);
    sh.appendRow(['大会ID', '大会名', '期日', 'スプレッドシート', 'ファイルID', '作成日時', '最終保存']);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 280); sh.setColumnWidth(4, 320);
  }
  return sh;
}

function findIndexRow_(tid) {
  const sh = index_();
  if (sh.getLastRow() < 2) return null;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(tid)) return i + 2;
  return null;
}

function openT_(tid) {
  if (!tid) return null;
  const row = findIndexRow_(tid);
  if (!row) return null;
  const fileId = index_().getRange(row, 5).getValue();
  try { return SpreadsheetApp.openById(fileId); } catch (e) { return null; }
}

function fileTitle_(t) {
  return [t.date || '', t.name || '（無題の大会）'].filter(String).join(' ');
}

function createT_(tid, title) {
  const ss = SpreadsheetApp.create(title);
  DriveApp.getFileById(ss.getId()).moveTo(folder_());
  SHEET_ORDER.forEach(function (n, i) { if (i === 0) ss.getSheets()[0].setName(n); else ss.insertSheet(n); });
  const web = ss.getSheetByName(WEB_SHEET);
  web.appendRow(['受付日時', '申込ID', '種目', 'チーム名', '選手・メンバー', '所属', '代表者', 'メール', '電話', '備考', 'data(JSON)']);
  web.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#e8eef7');
  web.setFrozenRows(1);
  const st = ss.insertSheet(STORE_SHEET); st.hideSheet();
  const now = new Date();
  index_().appendRow([tid, '', '', ss.getUrl(), ss.getId(), now, now]);
  return ss;
}

// アプリからの保存：表データ・公開データ・全データを書き込む
function sync_(b) {
  if (!b.tid) throw new Error('大会IDがありません');
  const t = (b.snapshot && b.snapshot.tournament) || {};
  const title = fileTitle_(t);
  let ss = openT_(b.tid);
  if (!ss) ss = createT_(b.tid, title);
  else if (ss.getName() !== title) ss.rename(title);

  const sheets = b.sheets || {};
  Object.keys(sheets).forEach(function (name) { if (name !== WEB_SHEET && name !== STORE_SHEET) writeTable_(ss, name, sheets[name]); });
  writeStore_(ss, 'public', JSON.stringify(b.snapshot || {}));
  if (b.state) writeStore_(ss, 'state', JSON.stringify(b.state));

  const row = findIndexRow_(b.tid);
  const sh = index_();
  sh.getRange(row, 2, 1, 3).setValues([[t.name || '', t.date || '', ss.getUrl()]]);
  sh.getRange(row, 7).setValue(new Date());
  return { ok: true, url: ss.getUrl(), savedAt: Date.now() };
}

function writeTable_(ss, name, rows) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  if (!rows || !rows.length) return;
  const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  const vals = rows.map(function (r) {
    const out = [];
    for (let i = 0; i < w; i++) {
      let v = r[i] == null ? '' : String(r[i]);
      if (/^[=+@]/.test(v)) v = "'" + v; // 数式として解釈させない
      out.push(v);
    }
    return out;
  });
  const range = sh.getRange(1, 1, vals.length, w);
  range.setNumberFormat('@'); // 「21-15」などが日付に変換されないよう文字列で保存
  range.setValues(vals);
  sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e8eef7');
  sh.setFrozenRows(1);
}

function list_() {
  const sh = index_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().map(function (r) {
    return { id: String(r[0]), name: r[1], date: r[2] instanceof Date ? Utilities.formatDate(r[2], 'Asia/Tokyo', 'yyyy-MM-dd') : String(r[2]), url: r[3], updatedAt: r[6] instanceof Date ? r[6].getTime() : null };
  }).reverse();
}

// ===================== Web申込 =====================
function apply_(tid, entry) {
  if (!entry || !entry.eventId) return { ok: false, error: '種目が指定されていません' };
  const ss = openT_(tid);
  const snapText = ss && readStore_(ss, 'public');
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
  const isTeam = ev.type === 'team';
  if (isTeam && !String(entry.teamName || '').trim()) return { ok: false, error: 'チーム名を入力してください' };
  if (isTeam && ev.teamMin && players.length < +ev.teamMin) return { ok: false, error: 'メンバーは' + ev.teamMin + '名以上必要です' };

  const web = webEntries_(ss);
  if (ev.capacity && +ev.capacity > 0) {
    const known = {};
    (snap.entries || []).forEach(function (x) { if (x.eventId === ev.id && !x.withdrawn) known[x.id] = 1; });
    web.forEach(function (x) { if (x.eventId === ev.id) known[x.id] = 1; });
    if (Object.keys(known).length >= +ev.capacity) return { ok: false, error: '「' + ev.name + '」は定員に達しました' };
  }
  const id = 'w' + new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = {
    id: id, eventId: ev.id,
    players: players.slice(0, 20).map(function (p) { return { name: s_(p.name), kana: s_(p.kana), team: s_(p.team) }; }),
    team: s_(entry.team), teamName: s_(entry.teamName),
    contactName: s_(entry.contactName), contactEmail: s_(entry.contactEmail), contactTel: s_(entry.contactTel),
    memo: s_(entry.memo), createdAt: new Date().getTime(), source: 'web'
  };
  const names = clean.players.map(function (p) { return p.name; }).join('、');
  const teams = clean.team || uniq_(clean.players.map(function (p) { return p.team; })).join('、');
  ss.getSheetByName(WEB_SHEET).appendRow([new Date(), id, ev.name, clean.teamName, names, teams,
    clean.contactName, clean.contactEmail, clean.contactTel, clean.memo, JSON.stringify(clean)]);
  return { ok: true, id: id };
}

function webEntries_(ss) {
  const sh = ss.getSheetByName(WEB_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 11, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { try { return JSON.parse(r[0]); } catch (e) { return null; } })
    .filter(function (x) { return x; });
}

// ===================== 補助 =====================
function s_(v) { return String(v == null ? '' : v).slice(0, 200); }
function uniq_(a) { const o = {}; return a.filter(function (x) { if (!x || o[x]) return false; o[x] = 1; return true; }); }

// 大きなJSONを隠しシートに分割して保存
function writeStore_(ss, key, text) {
  let sh = ss.getSheetByName(STORE_SHEET);
  if (!sh) { sh = ss.insertSheet(STORE_SHEET); sh.hideSheet(); }
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 0; i--) if (data[i][0] === key) sh.deleteRow(i + 1);
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push([key, i / CHUNK, text.slice(i, i + CHUNK)]);
  if (chunks.length) {
    const r = sh.getRange(sh.getLastRow() + 1, 1, chunks.length, 3);
    r.setNumberFormat('@');
    r.setValues(chunks);
  }
}

function readStore_(ss, key) {
  const sh = ss.getSheetByName(STORE_SHEET);
  if (!sh || sh.getLastRow() < 1) return null;
  const rows = sh.getDataRange().getValues().filter(function (r) { return r[0] === key; });
  if (!rows.length) return null;
  rows.sort(function (a, b) { return a[1] - b[1]; });
  return rows.map(function (r) { return r[2]; }).join('');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
