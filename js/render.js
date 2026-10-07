/* =========================================================
 * render.js — 要項・ドロー表・リーグ表・タイムテーブル・結果 の描画
 * ========================================================= */
(function (global) {
  'use strict';
  const BT = global.BT;
  const esc = BT.esc;
  const R = {};

  R.sideLabel = (c, src, short) => {
    const id = BT.resolve(c, src);
    if (id === 'BYE') return { text: '', bye: true };
    if (id) { const en = c.entry.get(id); return { text: short ? BT.entryNames(en) : BT.entryLabel(en), team: BT.entryTeam(en), id }; }
    if (src && src.g) return { text: `${src.g}組${src.r}位`, tbd: true };
    if (src && src.m) { const m = c.match.get(src.m); return { text: m && m.no ? `No.${m.no}の${src.w === false ? '敗者' : '勝者'}` : '未定', tbd: true }; }
    return { text: '未定', tbd: true };
  };

  R.stageLabel = (c, m) => {
    if (m.stage === 'L') return `予選${m.group}組`;
    const ko = c.state.matches.filter((x) => x.eventId === m.eventId && x.stage === 'K' && !x.third);
    const maxR = Math.max(...ko.map((x) => x.round));
    const hasL = c.state.matches.some((x) => x.eventId === m.eventId && x.stage === 'L');
    return (hasL ? '決勝T ' : '') + BT.roundName(maxR, m.round, m.third);
  };

  // 日付表示（和暦: 令和7年8月17日（日） / 西暦: 2025年8月17日（日））
  R.fmtDate = (s, era) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return s || '';
    const y = +m[1], d = new Date(y, +m[2] - 1, +m[3]);
    let ys = `${y}年`;
    if (era !== 'seireki' && d >= new Date(2019, 4, 1)) ys = `令和${y - 2018 === 1 ? '元' : y - 2018}年`;
    return `${ys}${+m[2]}月${+m[3]}日（${'日月火水木金土'[d.getDay()]}）`;
  };

  R.eventSummary = (ev) => {
    let fm = BT.FORMATS[ev.format];
    if (ev.format !== 'tournament' && +ev.groupSize > 1) fm += `（1組${ev.groupSize}程度${ev.format === 'league_tournament' ? `・各組上位${ev.advance || 1}位が決勝T` : ''}）`;
    const rule = BT.isTeamEv(ev)
      ? `${BT.rubberList(ev).join('・')}（各${ev.games == 1 ? '1ゲーム' : (ev.games || 3) + 'ゲームマッチ'}）`
      : `${ev.games == 1 ? '1ゲーム' : (ev.games || 3) + 'ゲームマッチ'}・${ev.points || 21}点`;
    return { fm, rule };
  };

  // 1行目を本文、2行目以降を字下げの補足として表示
  const lines = (text, boldFirst) => {
    const ls = String(text || '').split('\n').filter((l, i) => i === 0 || l.trim());
    if (!ls.length || !ls[0].trim() && ls.length === 1) return '';
    return ls.map((l, i) => i === 0 ? `<div class="g-main">${boldFirst ? `<b>${esc(l)}</b>` : esc(l)}</div>` : `<div class="g-sub">${esc(l)}</div>`).join('');
  };

  // ---------- 大会要項 ----------
  R.guide = (state) => {
    const t = state.tournament;
    const fd = (s) => R.fmtDate(s, t.era);
    const items = [];
    const add = (title, body) => { if (body && String(body).replace(/<[^>]+>/g, '').trim()) items.push([title, body]); };

    add('主催', lines(t.organizer));
    add('主管', lines(t.host));
    add('後援', lines(t.sponsor));
    if (t.date) {
      const time = t.receptionTime ? `受付　${t.receptionTime}～` : t.startTime ? `試合開始　${t.startTime}～` : '';
      add('日時', `<div class="g-main">${esc(fd(t.date))}<span class="g-gap"></span>${esc(time)}</div>`);
    }
    add('場所', lines(t.venue + (t.address ? `\n${t.address}` : '')));

    let evText = t.eventsText;
    if (!String(evText || '').trim()) evText = state.events.map((e) => e.name).filter(Boolean).join('　・　');
    let evHtml = lines(evText);
    if (t.showEventTable && state.events.length) {
      evHtml += '<table class="tbl guide-ev"><thead><tr><th>種目</th><th>試合方法</th><th>定員</th><th>参加料</th></tr></thead><tbody>' + state.events.map((ev) => {
        const s = R.eventSummary(ev);
        return `<tr><td>${esc(ev.name)}${ev.note ? `<div class="small">${esc(ev.note)}</div>` : ''}</td><td>${esc(s.fm)}<div class="small">${esc(s.rule)}${ev.thirdPlace ? '・3位決定戦あり' : ''}</div></td><td>${ev.capacity ? esc(ev.capacity) : '—'}</td><td>${esc(ev.fee || '—')}</td></tr>`;
      }).join('') + '</tbody></table>';
    }
    add('種目', evHtml);
    add('参加資格', lines(t.eligibility));
    add('試合方法', lines(t.method));
    add('使用球', lines(t.shuttle));

    let ap = lines(t.applyMethod);
    if (t.contactName || t.contactTel || t.contactEmail || t.contactLine) {
      ap += `<div class="g-main">申し込み先</div><div class="g-box"><div class="g-box-txt">
        <div class="g-box-row"><span class="g-box-name">${esc(t.contactName)}</span>${t.contactTel ? `<span>TEL：${esc(t.contactTel)}</span>` : ''}${t.contactEmail ? `<span>E-Mail：${esc(t.contactEmail)}</span>` : ''}</div>
        ${t.contactLine ? `<div class="g-box-row"><span class="g-box-name"></span><span>LINE：${esc(t.contactLine)}</span></div>` : ''}</div>
        ${t.contactQr ? `<img class="g-qr" src="${esc(t.contactQr)}" alt="QRコード">` : ''}</div>`;
    }
    add('申し込み', ap);
    if (t.deadline) add('申込期限', `<div class="g-main g-strong">${esc(fd(t.deadline))}</div>${t.deadlineNote ? `<div class="g-main g-strong">${esc(t.deadlineNote)}</div>` : ''}`);

    let fee = t.fee;
    if (!String(fee || '').trim()) fee = state.events.filter((e) => e.fee).map((e) => `${e.name}　${e.fee}`).join('\n');
    // 「・」「※」で始まる行は字下げの補足、それ以外は太字
    add('参加料等', String(fee || '').split('\n').filter((l) => l.trim()).map((l, i) => (i > 0 && /^[・※]/.test(l) ? `<div class="g-sub">${esc(l)}</div>` : `<div class="g-main g-strong">${esc(l)}</div>`)).join(''));
    (t.extraSections || []).forEach((s) => add(s.title, lines(s.body)));
    add('その他', String(t.notes || '').split('\n').filter((l) => l.trim()).map((l) => `<div class="${/^[・※]/.test(l) ? 'g-sub' : 'g-main'}">${esc(l)}</div>`).join(''));

    const from = [t.issueDate, t.issuer || t.organizer, t.representative].filter((x) => String(x || '').trim());
    return `<article class="guide-doc">
      ${t.addressee || from.length ? `<div class="g-head"><div class="g-to">${esc(t.addressee)}</div><div class="g-from">${from.map((x) => `<div>${esc(x)}</div>`).join('')}</div></div>` : ''}
      <h1 class="g-title">${esc(t.name || '（大会名未設定）')}${t.titleSuffix ? `　${esc(t.titleSuffix)}` : ''}</h1>
      <p class="g-ki">記</p>
      <ol class="g-items">${items.map(([h, b], i) => `<li><span class="g-no">${i + 1}</span><span class="g-lb">${esc(h)}</span><div class="g-bd">${b}</div></li>`).join('')}</ol>
    </article>`;
  };

  // ---------- トーナメント表（SVG） ----------
  R.bracket = (c, ev, opts = {}) => {
    const ko = c.state.matches.filter((m) => m.eventId === ev.id && m.stage === 'K');
    if (!ko.length) return '';
    const main = ko.filter((m) => !m.third);
    const RR = Math.max(...main.map((m) => m.round));
    const r1 = main.filter((m) => m.round === 1).sort((a, b) => a.idx - b.idx);
    const N = r1.length * 2;
    const rowH = 30, nameW = 250, colW = 120, top = 16;
    const W = nameW + RR * colW + 200, H = N * rowH + top * 2 + (ko.some((m) => m.third) ? 90 : 0);
    const X = (r) => nameW + r * colW;
    const byRound = {};
    main.forEach((m) => { (byRound[m.round] = byRound[m.round] || [])[m.idx] = m; });
    const yOf = {}; // matchId -> y (output)
    let svg = '';
    const line = (x1, y1, x2, y2, win) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${win ? 'bw' : 'bl'}"/>`;
    // 1回戦の名前
    const slotY = (i) => top + (i + 0.5) * rowH;
    r1.forEach((m) => {
      ['a', 'b'].forEach((s, k) => {
        const i = m.idx * 2 + k, y = slotY(i);
        const lb = R.sideLabel(c, m[s]);
        const en = lb.id && c.entry.get(lb.id);
        const seed = en && +en.seed > 0 ? `<tspan class="seed">[${en.seed}]</tspan> ` : '';
        svg += `<text x="4" y="${y + 4}" class="nm${lb.tbd ? ' tbd' : ''}${lb.bye ? ' bye' : ''}">${seed}${esc(lb.bye ? '' : lb.text)}</text>`;
      });
    });
    for (let r = 1; r <= RR; r++) {
      (byRound[r] || []).forEach((m) => {
        if (!m) return;
        const yA = r === 1 ? slotY(m.idx * 2) : yOf[byRound[r - 1][m.idx * 2].id];
        const yB = r === 1 ? slotY(m.idx * 2 + 1) : yOf[byRound[r - 1][m.idx * 2 + 1].id];
        const ym = (yA + yB) / 2;
        yOf[m.id] = ym;
        const w = BT.winnerSide(c, m);
        const auto = BT.isAuto(c, m);
        const x0 = r === 1 ? nameW - 6 : X(r - 1), x1 = X(r);
        svg += line(x0, yA, x1, yA, w === 'a');
        svg += line(x0, yB, x1, yB, w === 'b');
        svg += line(x1, yA, x1, ym, w === 'a');
        svg += line(x1, ym, x1, yB, w === 'b');
        if (!auto) {
          const label = m.no ? `No.${m.no}` : '';
          svg += `<g class="mhit" data-mid="${m.id}"><rect x="${x1 - colW + 6}" y="${Math.min(yA, yB) + 2}" width="${colW - 8}" height="${Math.abs(yB - yA) - 4}" rx="4"/>`;
          if (label) svg += `<text x="${x1 - 4}" y="${ym - 4}" class="mno" text-anchor="end">${label}</text>`;
          if (m.result) svg += `<text x="${x1 - 4}" y="${ym + 12}" class="msc" text-anchor="end">${esc(BT.scoreText(m, m.result === 'b'))}</text>`;
          else if (m.status === 'playing') svg += `<text x="${x1 - 4}" y="${ym + 12}" class="msc live" text-anchor="end">試合中 ${m.court ? m.court + 'コート' : ''}</text>`;
          else if (m.time != null) svg += `<text x="${x1 - 4}" y="${ym + 12}" class="msc" text-anchor="end">${BT.fmtMin(m.time)} / ${m.court}C</text>`;
          svg += '</g>';
        }
        if (r === RR) {
          svg += line(x1, ym, x1 + 30, ym, !!w);
          if (w) { const lb = R.sideLabel(c, m[w]); svg += `<text x="${x1 + 36}" y="${ym + 5}" class="champ">🏆 ${esc(lb.text)}</text>`; }
        }
      });
    }
    const third = ko.find((m) => m.third);
    if (third) {
      const y0 = top + N * rowH + 30;
      const a = R.sideLabel(c, third.a), b = R.sideLabel(c, third.b), w = BT.winnerSide(c, third);
      svg += `<text x="4" y="${y0 - 8}" class="mno">3位決定戦 ${third.no ? 'No.' + third.no : ''}</text>`;
      svg += `<text x="4" y="${y0 + 14}" class="nm${a.tbd ? ' tbd' : ''}">${esc(a.text)}</text><text x="4" y="${y0 + 44}" class="nm${b.tbd ? ' tbd' : ''}">${esc(b.text)}</text>`;
      svg += line(nameW - 6, y0 + 10, X(1), y0 + 10, w === 'a') + line(nameW - 6, y0 + 40, X(1), y0 + 40, w === 'b') + line(X(1), y0 + 10, X(1), y0 + 25, w === 'a') + line(X(1), y0 + 25, X(1), y0 + 40, w === 'b');
      svg += `<g class="mhit" data-mid="${third.id}"><rect x="${nameW}" y="${y0 + 12}" width="${colW - 8}" height="26" rx="4"/>${third.result ? `<text x="${X(1) - 4}" y="${y0 + 37}" class="msc" text-anchor="end">${esc(BT.scoreText(third, third.result === 'b'))}</text>` : ''}</g>`;
      if (w) svg += `<text x="${X(1) + 10}" y="${y0 + 30}" class="champ">${esc(R.sideLabel(c, third[w]).text)}</text>`;
    }
    return `<div class="bracket-wrap"><svg class="bracket" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg></div>`;
  };

  // ---------- リーグ表 ----------
  R.league = (c, ev, group, opts = {}) => {
    const st = BT.standings(c, ev.id, group);
    const draw = c.state.draws[ev.id];
    const g = draw.groups.find((x) => x.name === group);
    const ids = g.entryIds.filter((id) => c.entry.has(id));
    const rowOf = new Map(st.rows.map((r) => [r.id, r]));
    const team = BT.isTeamEv(ev);
    const find = (x, y) => st.matches.find((m) => (m.a.e === x && m.b.e === y) || (m.a.e === y && m.b.e === x));
    let h = `<table class="tbl league"><thead><tr><th class="lg-name">${esc(group)}組</th>${ids.map((id, i) => `<th class="lg-c">${i + 1}</th>`).join('')}<th>勝-敗</th>${team ? '<th>得失マッチ</th>' : ''}<th>得失G</th><th>得失点</th><th>順位</th></tr></thead><tbody>`;
    ids.forEach((x, i) => {
      const en = c.entry.get(x);
      h += `<tr><th class="lg-name"><span class="lg-i">${i + 1}</span>${esc(BT.entryNames(en))}<div class="muted small">${esc(BT.entryTeam(en))}</div></th>`;
      ids.forEach((y) => {
        if (x === y) { h += '<td class="lg-x"></td>'; return; }
        const m = find(x, y);
        if (!m) { h += '<td></td>'; return; }
        const flip = m.a.e !== x;
        let cell = '';
        if (m.result) {
          const won = (m.result === 'a') !== flip;
          cell = `<b class="${won ? 'win' : 'lose'}">${won ? '○' : '●'}</b><div class="small">${esc(BT.scoreText(m, flip))}</div>`;
        } else if (m.status === 'playing') cell = '<span class="live small">試合中</span>';
        else if (m.no) cell = `<span class="muted small">No.${m.no}${m.time != null ? '<br>' + BT.fmtMin(m.time) : ''}</span>`;
        h += `<td class="lg-cell" data-mid="${m.id}">${cell}</td>`;
      });
      const r = rowOf.get(x) || {};
      h += `<td>${r.win || 0}-${r.lose || 0}</td>${team ? `<td>${r.mw || 0}-${r.ml || 0}</td>` : ''}<td>${(r.gw || 0)}-${(r.gl || 0)}</td><td>${(r.pw || 0)}-${(r.pl || 0)}</td><td class="lg-rank">${st.complete || r.played ? (r.rank || '') : ''}</td></tr>`;
    });
    h += '</tbody></table>';
    if (opts.showOverride && st.complete) h += `<div class="small muted">順位：${st.rows.map((r) => `${r.rank}位 ${esc(BT.entryNames(c.entry.get(r.id)))}`).join('　')}</div>`;
    return h;
  };

  R.eventDraw = (c, ev, opts = {}) => {
    const draw = c.state.draws[ev.id];
    if (!draw) return '<p class="muted">組み合わせ未作成</p>';
    let h = '';
    if (draw.groups && draw.groups.length) {
      h += '<div class="leagues">' + draw.groups.map((g) => `<div class="league-box">${R.league(c, ev, g.name, opts)}</div>`).join('') + '</div>';
    }
    const b = R.bracket(c, ev, opts);
    if (b) h += (draw.groups && draw.groups.length ? '<h4>決勝トーナメント</h4>' : '') + b;
    return h;
  };

  // ---------- タイムテーブル ----------
  R.timetable = (c, opts = {}) => {
    const st = c.state;
    const C = Math.max(1, +st.tournament.courts || 1);
    const ms = st.matches.filter((m) => m.time != null && m.court);
    if (!ms.length) return '<p class="muted">タイムテーブル未作成です。</p>';
    const times = [...new Set(ms.map((m) => m.time))].sort((a, b) => a - b);
    const filterEv = opts.eventId;
    let h = `<div class="tt-wrap"><table class="tbl tt"><thead><tr><th class="tt-time">時刻</th>${Array.from({ length: C }, (_, i) => `<th>第${i + 1}コート</th>`).join('')}</tr></thead><tbody>`;
    times.forEach((t) => {
      h += `<tr><th class="tt-time">${BT.fmtMin(t)}</th>`;
      for (let k = 1; k <= C; k++) {
        const m = ms.find((x) => x.time === t && x.court === k);
        if (!m) { h += '<td class="tt-empty"></td>'; continue; }
        h += R.ttCell(c, m, filterEv);
      }
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  };

  R.ttCell = (c, m, filterEv) => {
    const ev = c.event.get(m.eventId);
    const a = R.sideLabel(c, m.a, true), b = R.sideLabel(c, m.b, true);
    const w = BT.winnerSide(c, m);
    const dim = filterEv && filterEv !== m.eventId ? ' dim' : '';
    const stt = m.result ? ' done' : m.status === 'playing' ? ' playing' : '';
    return `<td class="tt-cell${stt}${dim}" data-mid="${m.id}" style="--ev:${R.evColor(c, m.eventId)}"><div class="tt-h"><b>No.${m.no || '-'}</b> ${esc(ev ? ev.name : '')}</div><div class="tt-r">${esc(R.stageLabel(c, m))}</div><div class="tt-p${w === 'a' ? ' w' : ''}${a.tbd ? ' tbd' : ''}">${esc(a.text)}</div><div class="tt-p${w === 'b' ? ' w' : ''}${b.tbd ? ' tbd' : ''}">${esc(b.text)}</div>${m.result ? `<div class="tt-s">${esc(BT.scoreText(m))}</div>` : ''}</td>`;
  };

  R.evColor = (c, eventId) => {
    const i = c.state.events.findIndex((e) => e.id === eventId);
    const hues = [210, 140, 20, 280, 340, 180, 50, 100, 250, 0];
    return `hsl(${hues[i % hues.length]} 70% 50%)`;
  };

  // 試合番号順の一覧
  R.matchList = (c, opts = {}) => {
    let ms = c.state.matches.filter((m) => !BT.isAuto(c, m) || m.no);
    if (opts.eventId) ms = ms.filter((m) => m.eventId === opts.eventId);
    if (opts.filter === 'pending') ms = ms.filter((m) => !m.result);
    if (opts.filter === 'done') ms = ms.filter((m) => m.result);
    ms.sort((x, y) => ((x.no || 1e9) - (y.no || 1e9)) || (BT.phaseRank(c, x) - BT.phaseRank(c, y)));
    if (!ms.length) return '<p class="muted">該当する試合がありません。</p>';
    return `<table class="tbl mlist"><thead><tr><th>No.</th><th>時刻</th><th>コート</th><th>種目</th><th>回戦</th><th>対戦</th><th>スコア</th><th>状態</th></tr></thead><tbody>${ms.map((m) => {
      const ev = c.event.get(m.eventId);
      const a = R.sideLabel(c, m.a), b = R.sideLabel(c, m.b), w = BT.winnerSide(c, m);
      const status = m.result ? '<span class="tag done">終了</span>' : m.status === 'playing' ? '<span class="tag live">試合中</span>' : (a.tbd || b.tbd) ? '<span class="tag">未確定</span>' : '<span class="tag wait">待機</span>';
      return `<tr class="mrow" data-mid="${m.id}"><td>${m.no || ''}</td><td>${BT.fmtMin(m.time)}</td><td>${m.court || ''}</td><td><span class="evdot" style="background:${R.evColor(c, m.eventId)}"></span>${esc(ev ? ev.name : '')}</td><td>${esc(R.stageLabel(c, m))}</td><td><span class="${w === 'a' ? 'w' : ''}${a.tbd ? ' tbd' : ''}">${esc(a.text)}</span> <span class="muted">vs</span> <span class="${w === 'b' ? 'w' : ''}${b.tbd ? ' tbd' : ''}">${esc(b.text)}</span></td><td>${esc(m.result ? BT.scoreText(m) : '')}</td><td>${status}</td></tr>`;
    }).join('')}</tbody></table>`;
  };

  // ---------- 結果（入賞者） ----------
  R.results = (c) => {
    const st = c.state;
    if (!st.events.length) return '<p class="muted">種目がありません。</p>';
    return st.events.map((ev) => {
      const fr = BT.finalRanking(c, ev);
      let body = '';
      if (fr.type === 'K') {
        body = fr.rows.length ? `<table class="tbl res"><tbody>${fr.rows.map((r) => { const en = c.entry.get(r.id); return `<tr><th class="rk rk${r.rank}">${typeof r.rank === 'number' ? r.rank + '位' : r.rank}</th><td>${esc(BT.entryNames(en))}</td><td class="muted">${esc(BT.entryTeam(en))}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">試合結果待ち</p>';
      } else if (fr.type === 'L') {
        body = fr.groups.map((g) => `<div class="res-g"><div class="small muted">${fr.groups.length > 1 ? esc(g.name) + '組' : ''}${g.st.complete ? '' : '（途中経過）'}</div><table class="tbl res"><tbody>${g.st.rows.map((r) => { const en = c.entry.get(r.id); return `<tr><th class="rk rk${r.rank}">${r.rank}位</th><td>${esc(BT.entryNames(en))}</td><td class="muted">${esc(BT.entryTeam(en))}</td><td class="small">${r.win}勝${r.lose}敗</td></tr>`; }).join('')}</tbody></table></div>`).join('');
      } else body = '<p class="muted">組み合わせ未作成</p>';
      const total = st.matches.filter((m) => m.eventId === ev.id && !BT.isAuto(c, m)).length;
      const done = st.matches.filter((m) => m.eventId === ev.id && !BT.isAuto(c, m) && m.result).length;
      return `<section class="card res-card"><h3><span class="evdot" style="background:${R.evColor(c, ev.id)}"></span>${esc(ev.name)} <span class="muted small">${done}/${total}試合終了</span></h3>${body}</section>`;
    }).join('');
  };

  global.BTR = R;
})(typeof window !== 'undefined' ? window : globalThis);
