/* =========================================================
 * api.js — Google Apps Script（オンライン申込・公開用）との通信
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
    try { json = JSON.parse(text); } catch (e) { throw new Error('連携先の応答が不正です（URL・公開設定を確認してください）'); }
    if (!json.ok) throw new Error(json.error || 'エラーが発生しました');
    return json;
  };

  API.getPublic = async (url) => {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'action=public&_=' + Date.now());
    const json = JSON.parse(await res.text());
    if (!json.ok) throw new Error(json.error || '取得できませんでした');
    return json.snapshot;
  };

  API.ping = (url, key) => API.post(url, { action: 'ping', key });
  API.publish = (url, key, snapshot) => API.post(url, { action: 'publish', key, snapshot });
  API.apply = (url, entry) => API.post(url, { action: 'apply', entry });
  API.entries = (url, key) => API.post(url, { action: 'entries', key });
  API.saveState = (url, key, state) => API.post(url, { action: 'saveState', key, state });
  API.loadState = (url, key) => API.post(url, { action: 'loadState', key });

  global.BTAPI = API;
})(window);
