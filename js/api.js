/* =========================================================
 * api.js — Google Apps Script（大会ごとのスプレッドシート保存・Web申込・公開）との通信
 * ========================================================= */
(function (global) {
  'use strict';
  const API = {};

  // text/plain で送るとCORSのプリフライトが発生せず、GASで受け取れる
  API.post = async (url, payload) => {
    if (!url) throw new Error('連携URLが設定されていません');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new Error('連携先の応答が不正です（URL・デプロイ設定を確認してください）'); }
    if (!json.ok) throw new Error(json.error || 'エラーが発生しました');
    return json;
  };

  API.getPublic = async (url, t) => {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'action=public&t=' + encodeURIComponent(t || '') + '&_=' + Date.now());
    const json = JSON.parse(await res.text());
    if (!json.ok) throw new Error(json.error || '取得できませんでした');
    return json.snapshot;
  };

  API.ping = (url, key) => API.post(url, { action: 'ping', key });
  // 大会スプレッドシートへ保存（なければ自動作成）＋公開
  API.sync = (url, key, payload) => API.post(url, Object.assign({ action: 'sync', key }, payload));
  API.apply = (url, t, entry) => API.post(url, { action: 'apply', t, entry });
  API.entries = (url, key, t) => API.post(url, { action: 'entries', key, t });
  API.loadState = (url, key, t) => API.post(url, { action: 'loadState', key, t });
  API.list = (url, key) => API.post(url, { action: 'list', key });

  global.BTAPI = API;
})(window);
