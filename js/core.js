/* =========================================================
 * core.js — データモデル・組み合わせ・順位計算・タイムテーブル
 * 管理画面 / 申込画面 / 公開画面 で共通利用
 * ========================================================= */
(function (global) {
  'use strict';

  const BT = {};

  // ---------- 汎用 ----------
  BT.uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  BT.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  BT.normName = (s) => String(s || '').replace(/[\s　]/g, '');
  BT.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  BT.nextPow2 = (n) => { let p = 2; while (p < n) p *= 2; return p; };
  BT.toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  BT.fmtMin = (m) => (m == null || isNaN(m)) ? '' : `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;
  BT.groupName = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  BT.parseCourts = (str, max) => {
    const out = new Set();
    String(str || '').split(/[,、\s]+/).forEach((tok) => {
      const m = /^(\d+)\s*[-~〜]\s*(\d+)$/.exec(tok);
      if (m) for (let i = +m[1]; i <= +m[2]; i++) out.add(i);
      else if (/^\d+$/.test(tok)) out.add(+tok);
    });
    const list = [...out].filter((c) => c >= 1 && c <= max).sort((a, b) => a - b);
    return list.length ? list : Array.from({ length: max }, (_, i) => i + 1);
  };

  BT.FORMATS = { tournament: 'トーナメント', league: 'リーグ戦', league_tournament: '予選リーグ→決勝トーナメント' };
  BT.TYPES = { singles: 'シングルス', doubles: 'ダブルス', team: '団体戦' };

  // ---------- 初期データ ----------
  BT.newTournament = () => ({
    version: 1,
    id: BT.uid('t'),
    tournament: {
      name: '', date: '', venue: '', address: '',
      organizer: '', host: '', sponsor: '',
      contactName: '', contactEmail: '', contactTel: '', contactLine: '', contactQr: '',
      deadline: '', shuttle: '', eligibility: '', method: '', notes: '',
      extraSections: [],
      // 要項の様式
      addressee: '関係者各位', issueDate: '', issuer: '', representative: '',
      titleSuffix: '実施要項', receptionTime: '', eventsText: '', fee: '',
      applyMethod: '別紙申し込み用紙に必要事項を記入のうえ、下記までメールまたはLINEで申し込み下さい。',
      deadlineNote: '※締切期限厳守でお願い致します', era: 'wareki', showEventTable: false,
      applyUrl: '', showApplyQr: true,
      // 当日配布パンフレット
      coverImage: '', programNotes: '',
      officers: [
        { role: '大会会長', org: '', name: '' }, { role: '大会副会長', org: '', name: '' }, { role: '顧問', org: '', name: '' },
        { role: '事務局長', org: '', name: '' }, { role: '審判長', org: '', name: '' }, { role: '大会委員', org: '', name: '' },
      ],
      agenda: [
        { item: '開場', time: '8:30～', note: '' }, { item: '受付', time: '8:40～', note: '' }, { item: '練習', time: '準備ができ次第', note: '' },
        { item: '開会式', time: '9:25～', note: '' }, { item: '試合開始', time: '9:30～', note: '' },
      ],
      pamphlet: { cover: true, officers: true, timetable: true, entries: true, draws: true },
      courts: 6, startTime: '09:00', matchMinutes: 20, restMinutes: 10,
      autoPublish: true, acceptApply: true,
    },
    events: [],
    entries: [],
    draws: {},
    matches: [],
    updatedAt: Date.now(),
  });

  BT.newEvent = () => ({
    id: BT.uid('e'), name: '', type: 'doubles', format: 'tournament',
    groupSize: 4, advance: 1, thirdPlace: false,
    games: 3, points: 21, fee: '', capacity: '', courts: '', note: '', minutes: '', code: '',
    // 団体戦
    rubbers: '第1ダブルス,第2ダブルス,シングルス', teamMin: 3, teamMax: 6, playAll: false,
  });

  BT.newEntry = (eventId) => ({
    id: BT.uid('n'), eventId, players: [{ name: '', kana: '', team: '' }, { name: '', kana: '', team: '' }],
    team: '', teamName: '', seed: '', contactName: '', contactEmail: '', contactTel: '', memo: '',
    createdAt: Date.now(), source: 'manual',
  });

  BT.isTeamEv = (ev) => !!ev && ev.type === 'team';
  BT.playerCount = (ev) => (ev && ev.type === 'singles') ? 1 : BT.isTeamEv(ev) ? Math.max(1, +ev.teamMax || 6) : 2;
  BT.rubberList = (ev) => String((ev && ev.rubbers) || '').split(/[,、\n]+/).map((s) => s.trim()).filter(Boolean);

  // ---------- エントリー表示 ----------
  BT.entryTeam = (en) => {
    if (!en) return '';
    if (en.team) return en.team;
    const ts = [...new Set((en.players || []).map((p) => p.team).filter(Boolean))];
    return ts.join('・');
  };
  BT.entryNames = (en) => (en ? (en.teamName || (en.players || []).map((p) => p.name).filter(Boolean).join('・')) : '');
  BT.memberNames = (en) => (en ? (en.players || []).map((p) => p.name).filter(Boolean) : []);
  BT.entryLabel = (en) => {
    if (!en) return '';
    const n = BT.entryNames(en), t = BT.entryTeam(en);
    return t && n !== t ? `${n}（${t}）` : n;
  };
  BT.playerKeys = (en) => (en ? (en.players || []).map((p) => BT.normName(p.name)).filter(Boolean) : []);

  // ---------- コンテキスト（計算キャッシュ） ----------
  BT.ctx = (state) => {
    const c = {
      state,
      entry: new Map(state.entries.map((e) => [e.id, e])),
      event: new Map(state.events.map((e) => [e.id, e])),
      match: new Map(state.matches.map((m) => [m.id, m])),
      resolveCache: new Map(),
      standingCache: new Map(),
    };
    return c;
  };

  // src: {e:id} | {bye:1} | {m:id, w:true/false} | {g:'A', r:1} | null
  BT.resolve = (c, src) => {
    if (!src) return null;
    if (src.bye) return 'BYE';
    if (src.e) return c.entry.has(src.e) ? src.e : 'BYE';
    if (src.m) {
      const m = c.match.get(src.m);
      if (!m) return null;
      const w = BT.winnerSide(c, m);
      if (!w) return null;
      const side = src.w === false ? (w === 'a' ? 'b' : 'a') : w;
      return BT.resolve(c, m[side]);
    }
    if (src.g) {
      const st = BT.standings(c, src.ev, src.g);
      if (!st.complete) return null;
      const row = st.rows[src.r - 1];
      return row ? row.id : 'BYE';
    }
    return null;
  };

  BT.sides = (c, m) => [BT.resolve(c, m.a), BT.resolve(c, m.b)];

  // 勝者サイド 'a' | 'b' | null
  BT.winnerSide = (c, m) => {
    const key = m.id;
    if (c.resolveCache.has(key)) return c.resolveCache.get(key);
    c.resolveCache.set(key, null); // 循環防止
    const [a, b] = BT.sides(c, m);
    let w = null;
    if (a === 'BYE' && b === 'BYE') w = 'a';
    else if (a === 'BYE' && b) w = 'b';
    else if (b === 'BYE' && a) w = 'a';
    else if (a && b && m.result) w = m.result;
    c.resolveCache.set(key, w);
    return w;
  };

  // 不戦（BYE）のみで決まる試合
  BT.isAuto = (c, m) => {
    const [a, b] = BT.sides(c, m);
    return a === 'BYE' || b === 'BYE' || !!(m.a && m.a.bye) || !!(m.b && m.b.bye);
  };

  BT.isDone = (c, m) => !!BT.winnerSide(c, m);

  // ---------- スコア ----------
  BT.scoreText = (m, flip) => {
    if (m.resultType === 'walkover') return '棄権';
    if (m.rubbers) {
      const t = BT.teamCount(m);
      return (flip ? `${t.rb}-${t.ra}` : `${t.ra}-${t.rb}`) + (m.resultType === 'retired' ? '（途中棄権）' : '');
    }
    const g = (m.scores || []).filter((s) => s && (s[0] !== '' || s[1] !== ''));
    let t = g.map((s) => flip ? `${s[1]}-${s[0]}` : `${s[0]}-${s[1]}`).join(', ');
    if (m.resultType === 'retired') t += '（途中棄権）';
    return t;
  };
  BT.gameCount = (m) => {
    let ga = 0, gb = 0, pa = 0, pb = 0;
    (m.scores || []).forEach((s) => {
      const x = +s[0], y = +s[1];
      if (isNaN(x) || isNaN(y) || (s[0] === '' && s[1] === '')) return;
      pa += x; pb += y;
      if (x > y) ga++; else if (y > x) gb++;
    });
    return { ga, gb, pa, pb };
  };
  BT.autoWinner = (m) => {
    if (m.rubbers) return BT.autoWinnerTeam(m);
    const g = BT.gameCount(m); return g.ga > g.gb ? 'a' : g.gb > g.ga ? 'b' : null;
  };

  // ---------- 団体戦 ----------
  // m.rubbers = [{ label, pa, pb, scores:[[x,y],...], result:'a'|'b'|null }]
  BT.rubberWinner = (r) => r.result || BT.autoWinner({ scores: r.scores || [] });
  BT.teamCount = (m) => {
    let ra = 0, rb = 0, ga = 0, gb = 0, pa = 0, pb = 0;
    (m.rubbers || []).forEach((r) => {
      const w = BT.rubberWinner(r);
      if (w === 'a') ra++; else if (w === 'b') rb++;
      const g = BT.gameCount({ scores: r.scores || [] });
      ga += g.ga; gb += g.gb; pa += g.pa; pb += g.pb;
    });
    return { ra, rb, ga, gb, pa, pb };
  };
  BT.autoWinnerTeam = (m) => {
    const n = (m.rubbers || []).length;
    const t = BT.teamCount(m);
    const need = Math.floor(n / 2) + 1;
    if (t.ra >= need && t.ra > t.rb) return 'a';
    if (t.rb >= need && t.rb > t.ra) return 'b';
    const played = (m.rubbers || []).filter((r) => BT.rubberWinner(r)).length;
    if (played === n && n) return t.ra > t.rb ? 'a' : t.rb > t.ra ? 'b' : null;
    return null;
  };

  // ---------- 順位（リーグ） ----------
  BT.standings = (c, eventId, group) => {
    const key = eventId + '|' + group;
    if (c.standingCache.has(key)) return c.standingCache.get(key);
    const draw = c.state.draws[eventId];
    const ev = c.event.get(eventId);
    const g = draw && draw.groups && draw.groups.find((x) => x.name === group);
    const empty = { rows: [], complete: false, matches: [] };
    if (!g) { c.standingCache.set(key, empty); return empty; }
    const ids = g.entryIds.filter((id) => c.entry.has(id));
    const rows = new Map(ids.map((id) => [id, { id, played: 0, win: 0, lose: 0, mw: 0, ml: 0, gw: 0, gl: 0, pw: 0, pl: 0 }]));
    const isTeam = BT.isTeamEv(ev);
    const nRub = BT.rubberList(ev).length || 3;
    const ms = c.state.matches.filter((m) => m.eventId === eventId && m.stage === 'L' && m.group === group);
    let complete = ms.length > 0 || ids.length <= 1;
    const h2h = new Map();
    const needGames = Math.ceil((ev ? ev.games : 3) / 2);
    ms.forEach((m) => {
      const a = m.a && m.a.e, b = m.b && m.b.e;
      if (!rows.has(a) || !rows.has(b)) return;
      if (!m.result) { complete = false; return; }
      const ra = rows.get(a), rb = rows.get(b);
      let gc;
      if (isTeam) {
        const t = BT.teamCount(m);
        gc = { ma: t.ra, mb: t.rb, ga: t.ga, gb: t.gb, pa: t.pa, pb: t.pb };
        if (m.resultType === 'walkover') { const need = Math.floor(nRub / 2) + 1; gc = m.result === 'a' ? { ma: need, mb: 0, ga: 0, gb: 0, pa: 0, pb: 0 } : { ma: 0, mb: need, ga: 0, gb: 0, pa: 0, pb: 0 }; }
        ra.mw += gc.ma; ra.ml += gc.mb; rb.mw += gc.mb; rb.ml += gc.ma;
      } else {
        gc = BT.gameCount(m);
        if (m.resultType === 'walkover') { if (m.result === 'a') { gc.ga = needGames; gc.gb = 0; } else { gc.gb = needGames; gc.ga = 0; } }
      }
      ra.played++; rb.played++;
      ra.gw += gc.ga; ra.gl += gc.gb; rb.gw += gc.gb; rb.gl += gc.ga;
      ra.pw += gc.pa; ra.pl += gc.pb; rb.pw += gc.pb; rb.pl += gc.pa;
      const wId = m.result === 'a' ? a : b, lId = m.result === 'a' ? b : a;
      rows.get(wId).win++; rows.get(lId).lose++;
      h2h.set(wId + '>' + lId, true);
    });
    const ratio = (w, l) => (w + l === 0 ? 0 : w / (w + l));
    const tieSort = (list) => {
      if (list.length === 2) {
        const [x, y] = list;
        if (h2h.get(y.id + '>' + x.id)) return [y, x];
        if (h2h.get(x.id + '>' + y.id)) return [x, y];
      }
      // 団体戦は 得失マッチ率 → 得失ゲーム率 → 得失点率
      const key = (r) => [isTeam ? ratio(r.mw, r.ml) : 0, ratio(r.gw, r.gl), ratio(r.pw, r.pl)];
      const cmpK = (x, y) => { const a = key(x), b = key(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i]; return 0; };
      const sorted = list.slice().sort(cmpK);
      if (list.length > 2) {
        // 率でも並ぶ2者は直接対決
        for (let i = 0; i + 1 < sorted.length; i++) {
          const x = sorted[i], y = sorted[i + 1];
          if (cmpK(x, y) === 0 && h2h.get(y.id + '>' + x.id)) { sorted[i] = y; sorted[i + 1] = x; }
        }
      }
      return sorted;
    };
    const all = [...rows.values()];
    const byWins = new Map();
    all.forEach((r) => { if (!byWins.has(r.win)) byWins.set(r.win, []); byWins.get(r.win).push(r); });
    let ordered = [...byWins.keys()].sort((a, b) => b - a).flatMap((w) => tieSort(byWins.get(w)));
    const ov = draw.rankOverride && draw.rankOverride[group];
    if (ov && ov.length) {
      const pos = new Map(ov.map((id, i) => [id, i]));
      ordered = ordered.slice().sort((x, y) => (pos.has(x.id) ? pos.get(x.id) : 999) - (pos.has(y.id) ? pos.get(y.id) : 999));
    }
    ordered.forEach((r, i) => { r.rank = i + 1; });
    const res = { rows: ordered, complete, matches: ms };
    c.standingCache.set(key, res);
    return res;
  };

  // ---------- 組み合わせ生成 ----------
  // 標準シード配置: 枠 i に入るシード番号
  BT.seedOrder = (n) => { let arr = [1]; while (arr.length < n) { const m = arr.length * 2 + 1; arr = arr.flatMap((s) => [s, m - s]); } return arr; };
  // 枠 i と j が何回戦で当たるか（大きいほど遅い）
  BT.meetRound = (i, j) => 32 - Math.clz32(i ^ j);

  // 同所属を離して配置（greedy）
  function placeSeparated(items, freeSlots, slots, keyOf) {
    const counts = new Map();
    items.forEach((it) => { const k = keyOf(it); if (k) counts.set(k, (counts.get(k) || 0) + 1); });
    const order = BT.shuffle(items).sort((x, y) => (counts.get(keyOf(y)) || 0) - (counts.get(keyOf(x)) || 0));
    const placedKey = new Map(); // key -> [slotIdx]
    slots.forEach((s, i) => { if (s && s._key) { if (!placedKey.has(s._key)) placedKey.set(s._key, []); placedKey.get(s._key).push(i); } });
    let free = freeSlots.slice();
    order.forEach((it) => {
      const k = keyOf(it);
      const same = (k && placedKey.get(k)) || [];
      let best = [], bestScore = -1;
      free.forEach((f) => {
        const sc = same.length ? Math.min(...same.map((p) => BT.meetRound(f, p))) * 100 - same.filter((p) => BT.meetRound(f, p) === Math.min(...same.map((q) => BT.meetRound(f, q)))).length : 9999;
        if (sc > bestScore) { bestScore = sc; best = [f]; } else if (sc === bestScore) best.push(f);
      });
      const slot = best[Math.floor(Math.random() * best.length)];
      slots[slot] = Object.assign({}, it.src, { _key: k });
      free = free.filter((f) => f !== slot);
      if (k) { if (!placedKey.has(k)) placedKey.set(k, []); placedKey.get(k).push(slot); }
    });
  }

  // トーナメント枠（src配列）からマッチ生成
  BT.buildBracket = (ev, slots) => {
    const N = slots.length, R = Math.log2(N);
    const ms = [];
    let prev = [];
    for (let r = 1; r <= R; r++) {
      const cur = [];
      const cnt = N / Math.pow(2, r);
      for (let i = 0; i < cnt; i++) {
        const m = { id: BT.uid('m'), eventId: ev.id, stage: 'K', round: r, idx: i, scores: [], result: null, resultType: 'normal', court: null, time: null, no: null, status: '' };
        if (r === 1) { m.a = clean(slots[2 * i]); m.b = clean(slots[2 * i + 1]); }
        else { m.a = { m: prev[2 * i].id, w: true }; m.b = { m: prev[2 * i + 1].id, w: true }; }
        cur.push(m); ms.push(m);
      }
      prev = cur;
    }
    if (ev.thirdPlace && R >= 2) {
      const sf = ms.filter((m) => m.round === R - 1);
      ms.push({ id: BT.uid('m'), eventId: ev.id, stage: 'K', round: R, idx: 1, third: true, a: { m: sf[0].id, w: false }, b: { m: sf[1].id, w: false }, scores: [], result: null, resultType: 'normal', court: null, time: null, no: null, status: '' });
    }
    return ms;
    function clean(s) { if (!s) return { bye: 1 }; const o = Object.assign({}, s); delete o._key; return o; }
  };

  BT.roundName = (R, r, third) => {
    if (third) return '3位決定戦';
    const left = R - r;
    if (left === 0) return '決勝';
    if (left === 1) return '準決勝';
    if (left === 2) return '準々決勝';
    return `${r}回戦`;
  };

  // トーナメント（エントリーから）
  function drawKnockout(ev, entries) {
    const n = entries.length;
    const N = BT.nextPow2(Math.max(n, 2));
    const order = BT.seedOrder(N);
    const slots = new Array(N).fill(null);
    const seeded = entries.filter((e) => +e.seed > 0).sort((a, b) => +a.seed - +b.seed);
    const seededIds = new Set(seeded.map((e) => e.id));
    // BYE: シード番号 > n の枠
    order.forEach((s, i) => { if (s > n) slots[i] = { bye: 1 }; });
    seeded.forEach((e, k) => { const i = order.indexOf(k + 1); slots[i] = { e: e.id, _key: BT.entryTeam(e) || null }; });
    const free = slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
    const rest = entries.filter((e) => !seededIds.has(e.id)).map((e) => ({ src: { e: e.id }, team: BT.entryTeam(e) }));
    placeSeparated(rest, free, slots, (x) => x.team || null);
    return { slots: slots.map((s) => { const o = Object.assign({}, s); delete o._key; return o; }) };
  }

  // グループ分け
  function makeGroups(ev, entries) {
    const n = entries.length;
    const size = +ev.groupSize > 1 ? +ev.groupSize : n;
    const gCount = Math.max(1, Math.ceil(n / size));
    const cap = Array.from({ length: gCount }, (_, i) => Math.floor(n / gCount) + (i < n % gCount ? 1 : 0));
    const groups = Array.from({ length: gCount }, (_, i) => ({ name: BT.groupName(i), entryIds: [] }));
    const seeded = entries.filter((e) => +e.seed > 0).sort((a, b) => +a.seed - +b.seed);
    const seededIds = new Set(seeded.map((e) => e.id));
    // シードはスネーク配置
    seeded.forEach((e, k) => {
      const lap = Math.floor(k / gCount), pos = k % gCount;
      let gi = lap % 2 === 0 ? pos : gCount - 1 - pos;
      if (groups[gi].entryIds.length >= cap[gi]) gi = groups.findIndex((g, i) => g.entryIds.length < cap[i]);
      groups[gi].entryIds.push(e.id);
    });
    const teamOf = (id) => BT.entryTeam(entries.find((e) => e.id === id));
    const counts = new Map();
    entries.forEach((e) => { const t = BT.entryTeam(e); if (t) counts.set(t, (counts.get(t) || 0) + 1); });
    const rest = BT.shuffle(entries.filter((e) => !seededIds.has(e.id))).sort((a, b) => (counts.get(BT.entryTeam(b)) || 0) - (counts.get(BT.entryTeam(a)) || 0));
    rest.forEach((e) => {
      const t = BT.entryTeam(e);
      let best = [], bestScore = Infinity;
      groups.forEach((g, i) => {
        if (g.entryIds.length >= cap[i]) return;
        const same = t ? g.entryIds.filter((id) => teamOf(id) === t).length : 0;
        const sc = same * 1000 + g.entryIds.length;
        if (sc < bestScore) { bestScore = sc; best = [i]; } else if (sc === bestScore) best.push(i);
      });
      const gi = best[Math.floor(Math.random() * best.length)];
      groups[gi].entryIds.push(e.id);
    });
    return groups;
  }

  // 総当たり（サークル方式）
  BT.roundRobin = (ev, group) => {
    const ids = group.entryIds.slice();
    if (ids.length < 2) return [];
    const list = ids.length % 2 ? ids.concat([null]) : ids.slice();
    const n = list.length, ms = [];
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const x = list[i], y = list[n - 1 - i];
        if (x && y) ms.push({ id: BT.uid('m'), eventId: ev.id, stage: 'L', group: group.name, round: r + 1, idx: ms.length, a: { e: x }, b: { e: y }, scores: [], result: null, resultType: 'normal', court: null, time: null, no: null, status: '' });
      }
      list.splice(1, 0, list.pop());
    }
    return ms;
  };

  // 予選通過者から決勝トーナメント枠
  function qualifierSlots(ev, groups) {
    const adv = Math.max(1, +ev.advance || 1);
    const quals = [];
    for (let r = 1; r <= adv; r++) groups.forEach((g) => { if (g.entryIds.length >= r) quals.push({ g: g.name, r, ev: ev.id }); });
    const Q = quals.length;
    if (Q < 2) return null;
    const N = BT.nextPow2(Q);
    const order = BT.seedOrder(N);
    const slots = new Array(N).fill(null);
    order.forEach((s, i) => { if (s > Q) slots[i] = { bye: 1 }; });
    const firsts = quals.filter((q) => q.r === 1);
    firsts.forEach((q, k) => { slots[order.indexOf(k + 1)] = Object.assign({}, q, { _key: q.g }); });
    for (let r = 2; r <= adv; r++) {
      const items = quals.filter((q) => q.r === r).map((q) => ({ src: q, team: q.g }));
      const free = slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
      placeSeparated(items, free, slots, (x) => x.team);
    }
    return slots.map((s) => { const o = Object.assign({}, s); delete o._key; return o; });
  }

  // 種目の組み合わせを生成（state を書き換え）
  BT.generateDraw = (state, eventId) => {
    const ev = state.events.find((e) => e.id === eventId);
    const entries = state.entries.filter((e) => e.eventId === eventId && !e.withdrawn);
    if (entries.length < 2) throw new Error('エントリーが2組以上必要です');
    state.matches = state.matches.filter((m) => m.eventId !== eventId);
    const draw = { format: ev.format, generatedAt: Date.now(), groups: [], rankOverride: {} };
    let ms = [];
    if (ev.format === 'tournament') {
      const { slots } = drawKnockout(ev, entries);
      ms = BT.buildBracket(ev, slots);
    } else {
      const evx = ev.format === 'league' ? Object.assign({}, ev, { groupSize: +ev.groupSize > 1 ? ev.groupSize : entries.length }) : ev;
      draw.groups = makeGroups(evx, entries);
      draw.groups.forEach((g) => { ms = ms.concat(BT.roundRobin(ev, g)); });
      if (ev.format === 'league_tournament') {
        const slots = qualifierSlots(ev, draw.groups);
        if (slots) ms = ms.concat(BT.buildBracket(ev, slots));
      }
    }
    state.draws[eventId] = draw;
    state.matches = state.matches.concat(ms);
    return draw;
  };

  // グループのリーグ戦を再生成（入替え後）
  BT.regenGroupMatches = (state, eventId, groupName) => {
    const ev = state.events.find((e) => e.id === eventId);
    const g = state.draws[eventId].groups.find((x) => x.name === groupName);
    state.matches = state.matches.filter((m) => !(m.eventId === eventId && m.stage === 'L' && m.group === groupName));
    state.matches = state.matches.concat(BT.roundRobin(ev, g));
  };

  BT.eventHasResults = (state, eventId) => state.matches.some((m) => m.eventId === eventId && m.result);

  // ---------- 種目の最終順位 ----------
  BT.finalRanking = (c, ev) => {
    const ms = c.state.matches.filter((m) => m.eventId === ev.id);
    const ko = ms.filter((m) => m.stage === 'K');
    const out = [];
    if (ko.length) {
      const R = Math.max(...ko.map((m) => m.round));
      const fin = ko.find((m) => m.round === R && !m.third);
      const third = ko.find((m) => m.third);
      if (fin) {
        const w = BT.winnerSide(c, fin);
        const [a, b] = BT.sides(c, fin);
        if (w) { out.push({ rank: 1, id: w === 'a' ? a : b }); out.push({ rank: 2, id: w === 'a' ? b : a }); }
        else { [a, b].forEach((x) => x && x !== 'BYE' && out.push({ rank: '決勝進出', id: x })); }
      }
      if (third) {
        const w = BT.winnerSide(c, third);
        const [a, b] = BT.sides(c, third);
        if (w) { out.push({ rank: 3, id: w === 'a' ? a : b }); out.push({ rank: 4, id: w === 'a' ? b : a }); }
      } else if (R >= 2) {
        ko.filter((m) => m.round === R - 1).forEach((sf) => {
          const w = BT.winnerSide(c, sf);
          if (w) { const [a, b] = BT.sides(c, sf); const l = w === 'a' ? b : a; if (l && l !== 'BYE') out.push({ rank: 3, id: l }); }
        });
      }
      return { type: 'K', rows: out.filter((r) => r.id && r.id !== 'BYE') };
    }
    const draw = c.state.draws[ev.id];
    if (!draw) return { type: 'none', rows: [] };
    return { type: 'L', groups: draw.groups.map((g) => ({ name: g.name, st: BT.standings(c, ev.id, g.name) })) };
  };

  // ---------- タイムテーブル ----------
  BT.matchDeps = (c, m) => {
    const deps = [];
    [m.a, m.b].forEach((s) => {
      if (!s) return;
      if (s.m) deps.push(s.m);
      if (s.g) c.state.matches.forEach((x) => { if (x.eventId === s.ev && x.stage === 'L' && x.group === s.g) deps.push(x.id); });
    });
    return deps;
  };

  BT.candidatePlayers = (c, m, memo = new Map()) => {
    if (memo.has(m.id)) return memo.get(m.id);
    const set = new Set();
    memo.set(m.id, set);
    [m.a, m.b].forEach((s) => {
      if (!s) return;
      if (s.e) BT.playerKeys(c.entry.get(s.e)).forEach((k) => set.add(k));
      if (s.m) { const pm = c.match.get(s.m); if (pm) BT.candidatePlayers(c, pm, memo).forEach((k) => set.add(k)); }
      if (s.g) { const g = c.state.draws[s.ev] && c.state.draws[s.ev].groups.find((x) => x.name === s.g); if (g) g.entryIds.forEach((id) => BT.playerKeys(c.entry.get(id)).forEach((k) => set.add(k))); }
    });
    return set;
  };

  // 試合の進行順の優先度
  BT.phaseRank = (c, m) => {
    if (m.stage === 'L') return m.round;
    const lr = Math.max(0, ...c.state.matches.filter((x) => x.eventId === m.eventId && x.stage === 'L').map((x) => x.round));
    return lr + m.round + (m.third ? -0.5 : 0);
  };

  /**
   * opts: { onlyPending: bool } — true の場合、終了/進行中の試合は固定し残りを再編成
   */
  BT.schedule = (state, opts = {}) => {
    const t = state.tournament;
    const C = Math.max(1, +t.courts || 1);
    const D = Math.max(1, +t.matchMinutes || 20);
    const REST = Math.max(0, +t.restMinutes || 0);
    const start = BT.toMin(t.startTime) ?? 540;
    const c = BT.ctx(state);
    const evOrder = new Map(state.events.map((e, i) => [e.id, i]));
    const allowed = new Map(state.events.map((e) => [e.id, BT.parseCourts(e.courts, C)]));
    const memo = new Map();
    const durOf = new Map(state.events.map((e) => [e.id, +e.minutes > 0 ? +e.minutes : D]));
    const dur = (m) => durOf.get(m.eventId) || D;

    const fixed = [], todo = [];
    state.matches.forEach((m) => {
      if (m.a && m.a.bye || m.b && m.b.bye) { m.time = null; m.court = null; return; }
      if (opts.onlyPending && (m.result || m.status === 'playing')) fixed.push(m); else todo.push(m);
    });

    const end = new Map(); // matchId -> end time
    const lastEnd = new Map(); // player -> end
    const courtFree = new Array(C + 1).fill(start);
    fixed.forEach((m) => {
      const s = m.time ?? start; const e = s + dur(m);
      end.set(m.id, e);
      BT.candidatePlayers(c, m, memo).forEach((p) => lastEnd.set(p, Math.max(lastEnd.get(p) || 0, e)));
      if (m.court && m.court <= C) courtFree[m.court] = Math.max(courtFree[m.court], m.result ? start : e);
    });
    // 自動（BYE）試合は時間0扱い
    const autoEnd = (id) => {
      const m = c.match.get(id);
      if (!m) return start;
      if (end.has(id)) return end.get(id);
      if (m.a && m.a.bye || m.b && m.b.bye) {
        const d = BT.matchDeps(c, m).map(autoEnd);
        const v = d.length ? Math.max(...d) - REST : start - REST;
        end.set(id, v); return v;
      }
      return undefined;
    };

    const prio = (m) => [BT.phaseRank(c, m), evOrder.get(m.eventId) || 0, m.group || '', m.idx];
    const cmp = (x, y) => { const a = prio(x), b = prio(y); for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
    let pending = todo.slice().sort(cmp);
    const players = new Map(pending.map((m) => [m.id, [...BT.candidatePlayers(c, m, memo)]]));
    let guard = 0;
    while (pending.length && guard++ < 100000) {
      // 最も早く空くコート
      let court = -1, ct = Infinity;
      for (let k = 1; k <= C; k++) if (courtFree[k] < ct) { ct = courtFree[k]; court = k; }
      if (court < 0 || ct === Infinity) break;
      let best = null, bestReady = Infinity, minReady = Infinity;
      for (const m of pending) {
        if (!allowed.get(m.eventId).includes(court)) continue;
        const deps = BT.matchDeps(c, m);
        let ready = start, ok = true;
        for (const d of deps) { const e = end.has(d) ? end.get(d) : autoEnd(d); if (e === undefined) { ok = false; break; } ready = Math.max(ready, e + REST); }
        if (!ok) continue;
        players.get(m.id).forEach((p) => { if (lastEnd.has(p)) ready = Math.max(ready, lastEnd.get(p) + REST); });
        if (ready <= ct) { best = m; bestReady = ready; break; }
        if (ready < minReady) minReady = ready;
      }
      if (best) {
        best.court = court; best.time = ct;
        const e = ct + dur(best);
        end.set(best.id, e);
        players.get(best.id).forEach((p) => lastEnd.set(p, e));
        courtFree[court] = e;
        pending = pending.filter((m) => m !== best);
      } else {
        // 次のイベント時刻まで進める
        const others = courtFree.filter((v, k) => k >= 1 && k !== court && v > ct && v !== Infinity);
        let nxt = Math.min(minReady, others.length ? Math.min(...others) : Infinity);
        // 同時刻に空いている他コートが先に試合を入れる可能性がある
        if (nxt === Infinity && courtFree.some((v, k) => k >= 1 && k !== court && v === ct)) nxt = ct + 1;
        courtFree[court] = nxt === Infinity ? Infinity : Math.max(nxt, ct + 1);
      }
    }
    pending.forEach((m) => { m.time = null; m.court = null; });
    // 試合番号
    if (!opts.onlyPending) {
      const sch = state.matches.filter((m) => m.time != null).sort((x, y) => (x.time - y.time) || (x.court - y.court));
      state.matches.forEach((m) => { m.no = null; });
      sch.forEach((m, i) => { m.no = i + 1; });
    } else {
      let maxNo = Math.max(0, ...state.matches.map((m) => m.no || 0));
      state.matches.filter((m) => m.time != null && !m.no).sort((x, y) => (x.time - y.time) || (x.court - y.court)).forEach((m) => { m.no = ++maxNo; });
    }
    return { unscheduled: pending.length };
  };

  // ---------- 試合コード（種目略称-番号。例: MA-1） ----------
  BT.eventCode = (ev, i) => (ev && ev.code) || (ev ? ev.name : '') || BT.groupName(i || 0);
  BT.matchCode = (c, m) => {
    if (!c.codeMap) {
      c.codeMap = new Map();
      c.state.events.forEach((ev, i) => {
        const ms = c.state.matches.filter((x) => x.eventId === ev.id && !(x.a && x.a.bye) && !(x.b && x.b.bye))
          .sort((x, y) => ((x.no || 1e9) - (y.no || 1e9)) || (BT.phaseRank(c, x) - BT.phaseRank(c, y)) || (String(x.group || '').localeCompare(String(y.group || ''))) || (x.idx - y.idx));
        ms.forEach((x, k) => c.codeMap.set(x.id, BT.eventCode(ev, i) + '-' + (k + 1)));
      });
    }
    return c.codeMap.get(m.id) || '';
  };

  // ---------- 公開用スナップショット（個人連絡先を除く） ----------
  BT.publicSnapshot = (state) => {
    const t = Object.assign({}, state.tournament);
    delete t.apiKey; delete t.apiUrl; delete t.autoPublish; delete t.coverImage;
    return {
      tournament: t,
      events: state.events,
      entries: state.entries.map((e) => ({ id: e.id, eventId: e.eventId, seed: e.seed, team: e.team, teamName: e.teamName, withdrawn: e.withdrawn, players: (e.players || []).map((p) => ({ name: p.name, team: p.team })) })),
      draws: state.draws,
      matches: state.matches,
      publishedAt: Date.now(),
    };
  };

  // ---------- CSV ----------
  BT.parseCSV = (text) => {
    text = text.replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  };
  BT.toCSV = (rows) => '﻿' + rows.map((r) => r.map((x) => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');

  global.BT = BT;
})(typeof window !== 'undefined' ? window : globalThis);
