// RankFeed-Generator: läuft in der Tierlist und macht aus dem Ranking-Geschehen Artikel.
// Die Artikel gehen an server.py, RankFeed.html holt sie dort ab.
// Ohne Server (Seite per Doppelklick geöffnet) bleibt der Generator still.
(function () {
  const T = window.RF_TEXT;
  const ONLINE = location.protocol.startsWith("http");

  const MIN_GAP = 45000; // mindestens so viel Zeit zwischen zwei Artikeln
  const FIRST_GAP = 20000; // nach dem Start kommt der erste Live-Artikel frühestens nach dieser Zeit
  const IDLE_GAP = 150000; // passiert so lange nichts Grosses, gibt es einen Lagebericht
  const BATCH = 10; // nach so vielen neuen Platzierungen eine Sammelliste
  const CROSS_EVERY = 4; // jeder vierte Artikel vergleicht über Listen hinweg
  const SEED_TYPES = ["shocking", "batch", "stier", "raus", "cross", "state", "shocking", "batch", "raus"];

  const TIER_ORDER = ["S", "A", "B", "C", "D", "X"];
  const AVATAR_COLORS = ["#FFD84D", "#8FD3FF", "#FF9EC7", "#A6F0A0", "#C9B8FF", "#FFB27A"];

  let lists = [];
  let state = null; // liefert { list, entries } der laufenden Tierlist
  let memory = { snapshots: {} };
  let session = null; // was in der aktuellen Liste seit ihrem Start passiert ist
  let pending = [];
  let lastArticle = 0;
  let articleCount = 0;
  let ready = false;

  // ── kleine Helfer ──
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const int = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
  const tierName = (t) => (t === "X" ? "RAUS" : `${t}-Tier`);
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  const media = (e) => ({ name: e.name, image: e.image || null, emoji: e.emoji || null });
  const en = (list) => T.lists[list.id] || { label: list.label, one: "entry", keys: list.keys };
  const clock = (t) => new Date(t || Date.now()).toTimeString().slice(0, 5);

  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  // ── Werte für die Textbausteine ──
  // Ein Eintrag aus einer anderen Liste, möglichst mit bekanntem Score
  function otherEntry(list) {
    const snaps = Object.values(memory.snapshots).filter((s) => s.id !== list.id && s.entries.length);
    if (snaps.length) {
      const s = pick(snaps);
      return { ...pick(s.entries), listLabel: s.label, one: s.one };
    }
    const l = pick(lists.filter((x) => x !== list)) || list;
    return { ...media(pick(l.items)), score: null, tier: null, listLabel: en(l).label, one: en(l).one };
  }

  function entryVars(e, list, other) {
    const L = en(list);
    const v = e.v || [e.score, e.score, e.score];
    const hi = v.indexOf(Math.max(...v));
    const lo = v.indexOf(Math.min(...v));
    const k = int(0, 2);
    return {
      name: e.name,
      tier: tierName(e.tier),
      score: e.score,
      list: L.label,
      one: L.one,
      k: L.keys[k],
      v: v[k],
      kHigh: L.keys[hi],
      vHigh: v[hi],
      kLow: L.keys[lo],
      vLow: v[lo],
      other: other.name,
      otherList: other.listLabel,
      otherOne: other.one,
      otherScore: other.score ?? "?",
      otherTier: other.tier ? tierName(other.tier) : "?",
      pct: int(3, 47),
      ordinal: pick(["second", "third", "fourth", "seventh"]),
      clock: clock(),
    };
  }

  function summary(ctx) {
    const ranked = ctx.entries.filter((e) => e.tier);
    const listed = ranked.filter((e) => e.tier !== "X");
    const by = {};
    TIER_ORDER.forEach((t) => (by[t] = ranked.filter((e) => e.tier === t).sort((a, b) => b.score - a.score)));
    const crowded = TIER_ORDER.slice(0, 5).reduce((a, t) => (by[t].length > by[a].length ? t : a), "S");
    const sorted = [...listed].sort((a, b) => b.score - a.score);
    const avg = listed.length ? Math.round(listed.reduce((s, e) => s + e.score, 0) / listed.length) : 0;
    return { ranked, listed, by, crowded, sorted, avg };
  }

  function listVars(ctx) {
    const s = summary(ctx);
    const best = s.sorted[0];
    const worst = s.sorted[s.sorted.length - 1];
    return {
      list: en(ctx.list).label,
      one: en(ctx.list).one,
      count: s.ranked.length,
      crowded: s.crowded,
      crowdedCount: s.by[s.crowded].length,
      best: best ? best.name : "nobody",
      bestScore: best ? best.score : 0,
      worst: worst ? worst.name : "nobody",
      avg: s.avg,
      avgTier: tierName(tierOfScore(s.avg)),
      rausCount: s.by.X.length,
      sCount: s.by.S.length,
      clock: clock(ctx.time),
    };
  }

  // Schluss innerhalb der Liste und, wenn möglich, über die Listen hinweg
  function conclusion(ctx, e) {
    const parts = [fill(pick(T.conclusionsList), listVars(ctx))];
    const o = otherEntry(ctx.list);
    if (e && o.score != null) parts.push(fill(pick(T.conclusionsCross), entryVars(e, ctx.list, o)));
    return parts.join(" ");
  }

  // ── Kommentare und Reaktionen ──
  function username() {
    const [a, b] = T.userWords;
    return pick([
      () => pick(a) + pick(b) + int(1, 999),
      () => pick(a) + "_" + pick(b),
      () => pick(b) + "_tier_" + pick(["forever", "truther", "hater", "enjoyer"]),
      () => pick(a).toUpperCase() + pick(b).toUpperCase(),
    ])();
  }

  function person() {
    return { user: username(), avatar: pick(T.avatars), color: pick(AVATAR_COLORS) };
  }

  // Jeder Kommentar redet über einen der Einträge, um die es im Artikel geht
  function makeComments(ctx, vars, pool, start, n) {
    const kinds = ["pro", "pro", "contra", "contra", "random", "random", "meta", "cross"];
    const out = [];
    for (let i = 0; i < n; i++) {
      const kind = pick(kinds);
      const e = pick(pool);
      const v = { ...vars, ...entryVars(e, ctx.list, otherEntry(ctx.list)) };
      v.score2 = Math.min(100, e.score + int(3, 30));
      // Die ersten Kommentare kommen schnell, der Rest tröpfelt über die nächste Dreiviertelstunde
      const at = start + (i < 3 ? int(20, 180) * 1000 : int(3, 45) * 60000);
      const c = { ...person(), text: fill(pick(T.comments[kind]), v), likes: int(0, 6) * int(0, 9), at, replies: [] };
      if (Math.random() < 0.35) {
        for (let r = int(1, 2); r > 0; r--) {
          const pool = kind === "pro" ? T.comments.replyDisagree : pick([T.comments.replyAgree, T.comments.replyDisagree]);
          c.replies.push({ ...person(), text: fill(pick(pool), { ...v, user: c.user }), likes: int(0, 12), at: c.at + int(1, 20) * 60000 });
        }
      }
      out.push(c);
    }
    return out.sort((a, b) => a.at - b.at);
  }

  function reactions() {
    const r = {};
    shuffle(["👍", "😂", "😭", "🤯", "😡", "🙄", "❤️", "😬"]).forEach((emoji, i) => {
      r[emoji] = i < 3 ? int(3, 60) : int(0, 4);
    });
    return r;
  }

  function article(type, ctx, vars, parts) {
    const time = ctx.time || Date.now();
    return {
      id: time.toString(36) + Math.random().toString(36).slice(2, 7),
      type,
      list: ctx.list.id,
      listLabel: en(ctx.list).label,
      time,
      tag: T.tags[type],
      headline: fill(pick(T.headlines[type]), vars),
      dek: fill(pick(T.deks[type]), vars),
      author: pick(T.authors),
      intro: fill(pick(T.intros[type]), vars),
      items: parts.items,
      outro: parts.outro,
      thumb: parts.thumb,
      reactions: reactions(),
      comments: makeComments(ctx, vars, parts.pool, time, int(5, 12)),
    };
  }

  function tierRows(ctx, perRow) {
    const s = summary(ctx);
    return TIER_ORDER.map((t) => ({ t, m: s.by[t].slice(0, perRow).map(media) }));
  }

  // ── Artikeltypen ──
  function shocking(ctx, e) {
    const events = ctx.hist(e);
    const items = [];
    events.forEach((ev, i) => {
      const o = otherEntry(ctx.list);
      const v = entryVars(e, ctx.list, o);
      if (ev.kind === "placed") {
        items.push({ title: `The Debut: ${ev.score} Points`, text: `It all began when ${e.name} entered the ranking in ${tierName(ev.tier)}. ${pick(T.blurbs[ev.tier])}`, media: media(e), tier: ev.tier });
        return;
      }
      const cause = fill(pick(ev.delta > 0 ? T.causesUp : T.causesDown), v);
      let text = fill(pick(T.consequences), v);
      if (ev.from !== ev.tier) text += " " + fill(pick(T.tierMove), { ...v, from: tierName(ev.from), to: tierName(ev.tier) });
      items.push({ title: `${signed(ev.delta)} Points: ${cause}`, text, media: i % 2 ? media(o) : media(e), tier: ev.tier, delta: ev.delta });
    });
    // Erfundene Gerüchte dazwischen, damit es eine richtige BuzzFeed-Länge bekommt
    const target = Math.max(items.length, int(7, 13));
    while (items.length < target) {
      const v = entryVars(e, ctx.list, otherEntry(ctx.list));
      items.splice(int(1, items.length), 0, { title: fill(pick(T.rumorTitles), v), text: pick(T.rumorTexts), rumor: true });
    }
    const last = [...events].reverse().find((ev) => ev.kind === "drift");
    const o = otherEntry(ctx.list);
    const vars = { ...entryVars(e, ctx.list, o), n: items.length, first: events.length ? events[0].score : e.score };
    return article("shocking", ctx, vars, {
      items,
      pool: [e],
      outro: conclusion(ctx, e),
      thumb: { layout: pick(["hero", "duo"]), m: [media(e), media(o)], sticker: last ? signed(last.delta) : "WHAT?!", mark: last && last.delta > 0 ? "up" : "down", tier: e.tier },
    });
  }

  function raus(ctx, e) {
    const events = ctx.hist(e);
    const peakEv = events.reduce((a, ev) => (ev.score > a.score ? ev : a), events[0] || { score: e.score, tier: e.tier });
    const v = { ...entryVars(e, ctx.list, otherEntry(ctx.list)), near: int(12, 19) };
    const items = T.rausStages.map(([title, text]) => ({ title, text: fill(text, v) }));
    items[0].media = media(e);
    items.push({ title: `Its Peak: ${peakEv.score} Points`, text: `At its best, ${e.name} was sitting in ${tierName(peakEv.tier)}. Those were simpler times.`, tier: peakEv.tier });
    const next = summary(ctx).by.D.slice(-3);
    if (next.length) {
      items.push({ title: "Who's Next?", text: `Currently closest to the edge: ${next.map((x) => `${x.name} (${x.score})`).join(", ")}. Thoughts and prayers.`, media: media(next[next.length - 1]) });
    }
    const vars = { ...v, n: items.length, peak: tierName(peakEv.tier) };
    return article("raus", ctx, vars, {
      items,
      pool: [e],
      outro: conclusion(ctx, e),
      thumb: { layout: "hero", m: [media(e)], sticker: "RAUS", mark: "down", tier: "X" },
    });
  }

  function stier(ctx, e) {
    const L = en(ctx.list);
    const base = entryVars(e, ctx.list, otherEntry(ctx.list));
    const items = (e.v || []).map((val, i) => ({
      title: `${L.keys[i]}: ${val}/100`,
      text: fill(pick(val >= 60 ? T.criterionHigh : T.criterionLow), { ...base, k: L.keys[i], v: val }),
      media: i === 0 ? media(e) : null,
    }));
    const peers = summary(ctx).by.S.filter((x) => x !== e);
    items.push({
      title: "The Neighbors",
      text: peers.length ? `It now shares S-Tier with ${peers.slice(0, 5).map((x) => x.name).join(", ")}. Awkward silence in the group chat.` : "It is currently alone in S-Tier. Lonely at the top, as they say.",
      media: peers[0] ? media(peers[0]) : null,
    });
    const vars = { ...base, ...listVars(ctx), name: e.name, score: e.score, n: items.length };
    return article("stier", ctx, vars, {
      items,
      pool: [e],
      outro: conclusion(ctx, e),
      thumb: { layout: "hero", m: [media(e)], sticker: "S-TIER!", mark: "star", tier: "S" },
    });
  }

  function batch(ctx, group) {
    const ranked = group.filter((e) => e.tier).sort((a, b) => b.score - a.score);
    if (!ranked.length) return null;
    const items = ranked.map((e) => ({ title: `${e.name}: ${tierName(e.tier)} (${e.score})`, text: pick(T.blurbs[e.tier]), media: media(e), tier: e.tier }));
    const lv = listVars(ctx);
    const vars = { ...lv, n: items.length, best: ranked[0].name, worst: ranked[ranked.length - 1].name, avg: Math.round(ranked.reduce((s, e) => s + e.score, 0) / ranked.length) };
    return article("batch", ctx, vars, {
      items,
      pool: ranked,
      outro: conclusion(ctx, ranked[0]),
      thumb: { layout: "strip", rows: tierRows(ctx, 4), sticker: `${items.length} NEW`, mark: "circle" },
    });
  }

  function cross(ctx) {
    const pool = summary(ctx).listed;
    const o = otherEntry(ctx.list);
    if (!pool.length || o.score == null) return null;
    const e = pick(pool);
    const v = entryVars(e, ctx.list, o);
    v.winner = e.score >= o.score ? e.name : o.name;
    const items = T.crossRounds.map(([title, text], i) => ({ title, text: fill(text, v), media: i % 2 ? media(o) : media(e) }));
    const vars = { ...v, n: items.length };
    return article("cross", ctx, vars, {
      items,
      pool: [e],
      outro: conclusion(ctx, e),
      thumb: { layout: "versus", m: [media(e), media(o)], sticker: "VS", tier: e.tier, tier2: o.tier },
    });
  }

  function report(ctx) {
    const s = summary(ctx);
    if (!s.ranked.length) return null;
    const items = TIER_ORDER.filter((t) => s.by[t].length).map((t) => ({
      title: `${tierName(t)}: ${s.by[t].length} ${s.by[t].length === 1 ? "Entry" : "Entries"}`,
      text: `${s.by[t].slice(0, 6).map((x) => x.name).join(", ")}${s.by[t].length > 6 ? " and more" : ""}. ${pick(T.blurbs[t])}`,
      media: media(s.by[t][0]),
      tier: t,
    }));
    const vars = { ...listVars(ctx), n: items.length };
    return article("state", ctx, vars, {
      items,
      pool: s.ranked,
      outro: conclusion(ctx, s.sorted[0]),
      thumb: { layout: "strip", rows: tierRows(ctx, 5), sticker: `LIVE ${clock(ctx.time)}`, mark: "circle" },
    });
  }

  function collapse(ctx) {
    const s = summary(ctx);
    if (!s.ranked.length) return null;
    const last = [...s.by.X].sort((a, b) => b.score - a.score)[0];
    const peaks = s.ranked
      .map((e) => ({ e, peak: Math.max(e.score, ...ctx.hist(e).map((ev) => ev.score)) }))
      .sort((a, b) => b.peak - a.peak)
      .slice(0, 3);
    const v = { ...listVars(ctx), last: last.name, lastScore: last.score };
    const items = T.collapseLines.map((line, i) => ({ title: ["The Last One Standing", "The Final Minutes", "The Striped Zone", "What Happens Now"][i], text: fill(line, v), media: i === 0 ? media(last) : null }));
    items.splice(1, 0, { title: "Hall Of Fame", text: `Highest scores ever reached in this round: ${peaks.map((p) => `${p.e.name} (${p.peak})`).join(", ")}. All of them are in RAUS now.`, media: media(peaks[0].e) });
    const vars = { ...v, n: items.length };
    return article("collapse", ctx, vars, {
      items,
      pool: s.ranked,
      outro: "The next round has already started. New numbers, same chaos.",
      thumb: { layout: "strip", rows: tierRows(ctx, 6), sticker: "ALL OUT", mark: "down" },
    });
  }

  function build(job, ctx) {
    switch (job.type) {
      case "shocking": return job.e.tier && job.e.tier !== "X" ? shocking(ctx, job.e) : null;
      case "raus": return job.e.tier === "X" ? raus(ctx, job.e) : null;
      case "stier": return job.e.tier === "S" ? stier(ctx, job.e) : null;
      case "batch": return batch(ctx, job.batch);
      case "cross": return cross(ctx);
      case "state": return report(ctx);
      case "collapse": return collapse(ctx);
    }
    return null;
  }

  // ── Verbindung zum Server ──
  async function post(path, body) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  function snapshotOf(list, entries) {
    const listed = entries.filter((e) => e.tier && e.tier !== "X").sort((a, b) => b.score - a.score);
    return { id: list.id, label: en(list).label, one: en(list).one, time: Date.now(), entries: listed.slice(0, 40).map((e) => ({ ...media(e), score: e.score, tier: e.tier })) };
  }

  function saveMemory() {
    if (!ready || !session) return Promise.resolve();
    const { list, entries } = state();
    const snap = snapshotOf(list, entries);
    if (snap.entries.length) memory.snapshots[list.id] = snap;
    return post("/api/memory", memory).catch((err) => console.warn("RankFeed:", err));
  }

  async function publish(a) {
    lastArticle = Date.now();
    articleCount++;
    try {
      await post("/api/articles", a);
      saveMemory();
    } catch (err) {
      console.warn("RankFeed: Artikel nicht gespeichert", err);
    }
  }

  // ── Live-Betrieb ──
  function liveCtx() {
    const { list, entries } = state();
    return { list, entries, hist: (e) => session.hist.get(e.id) || [] };
  }

  function canCross() {
    return Object.values(memory.snapshots).some((s) => s.id !== session.list.id && s.entries.length);
  }

  function queueJob(type, prio, data) {
    pending = pending.filter((p) => !(p.type === type && p.key === data.key));
    pending.push({ type, prio, at: Date.now(), ...data });
  }

  function record(e, ev) {
    const h = session.hist.get(e.id) || [];
    h.push({ t: Date.now(), ...ev });
    session.hist.set(e.id, h);
  }

  function tick(force) {
    if (!ready || !session) return;
    const now = Date.now();
    pending = pending.filter((p) => now - p.at < 300000);
    if (!force && now - lastArticle < MIN_GAP) return;
    pending.sort((a, b) => b.prio - a.prio || b.at - a.at);
    let job = pending[0];
    if (!force && articleCount % CROSS_EVERY === CROSS_EVERY - 1 && canCross() && (!job || job.prio < 5)) job = { type: "cross" };
    if (!job && now - lastArticle >= IDLE_GAP && session.placed >= 5) job = { type: "state" };
    if (!job) return;
    pending = pending.filter((p) => p !== job);
    const a = build(job, liveCtx());
    if (a) publish(a);
    else if (job.type === "cross") articleCount++; // kein Vergleich möglich, nicht jedes Mal neu versuchen
  }

  // ── Erfundene Vorgeschichte für den allerersten Start ──
  function fakeRanking(list) {
    const hist = new Map();
    const entries = shuffle(list.items).slice(0, Math.min(list.items.length, int(14, 30))).map((item, id) => {
      const e = { ...item, id, v: rollValues() };
      e.score = calcScore(e.v);
      e.tier = tierOfScore(e.score);
      const h = [{ kind: "placed", score: e.score, tier: e.tier }];
      for (let k = int(0, 7); k > 0 && e.tier !== "X"; k--) {
        const before = e.score;
        const from = e.tier;
        const d = int(1, 15) * (Math.random() < 0.5 ? -1 : 1);
        e.v = e.v.map((x) => clamp(x + d));
        e.score = calcScore(e.v);
        e.tier = tierOfScore(e.score);
        h.push({ kind: "drift", delta: e.score - before, score: e.score, tier: e.tier, from });
      }
      hist.set(id, h);
      return e;
    });
    return { list, entries, hist: (e) => hist.get(e.id) || [] };
  }

  // used: Einträge, die schon einen eigenen Startartikel haben
  function seedJob(type, f, used) {
    const ranked = f.entries.filter((e) => e.tier && !used.has(e));
    const most = (pool) => pool.sort((a, b) => f.hist(b).length - f.hist(a).length)[0];
    if (type === "shocking") {
      const e = most(ranked.filter((x) => x.tier !== "X"));
      if (e) return { type, e };
    }
    if (type === "stier") {
      const e = pick(ranked.filter((x) => x.tier === "S"));
      if (e) return { type, e };
    }
    if (type === "raus") {
      const e = most(ranked.filter((x) => x.tier === "X"));
      if (e) return { type, e };
    }
    if (type === "batch") return { type, batch: shuffle(ranked).slice(0, int(8, 12)) };
    if (type === "cross") return { type };
    return { type: "state" };
  }

  async function seed() {
    const fakes = shuffle(lists).slice(0, 5).map(fakeRanking);
    fakes.forEach((f) => (memory.snapshots[f.list.id] = snapshotOf(f.list, f.entries)));
    const now = Date.now();
    let back = 0;
    const out = [];
    const used = new Set();
    SEED_TYPES.forEach((type, i) => {
      back += int(25, 150) * 60000;
      const f = fakes[i % fakes.length];
      const job = seedJob(type, f, used);
      if (job.e) used.add(job.e);
      const a = build(job, { ...f, time: now - back });
      if (a) out.push(a);
    });
    out.sort((a, b) => a.time - b.time);
    for (const a of out) await post("/api/articles", a);
    memory.seeded = true;
    await post("/api/memory", memory);
  }

  async function boot() {
    try {
      memory = await (await fetch("/api/memory")).json();
      memory.snapshots = memory.snapshots || {};
      const { latest } = await (await fetch("/api/articles?since=999999999")).json();
      if (!latest && !memory.seeded) await seed();
      ready = true;
      lastArticle = Date.now() - MIN_GAP + FIRST_GAP;
      setInterval(tick, 5000);
      setInterval(saveMemory, 60000);
    } catch (err) {
      // Der Server startet vielleicht erst nach der Tierlist: weiter versuchen
      console.warn("RankFeed: kein Server erreichbar, neuer Versuch in 5 s", err);
      setTimeout(boot, 5000);
    }
  }

  // ── Schnittstelle für die Tierlist ──
  window.RankFeedGen = {
    init(opts) {
      lists = opts.lists;
      state = opts.state;
      if (ONLINE) boot();
    },
    listStart(list) {
      session = { list, placed: 0, batch: [], hist: new Map() };
      pending = [];
    },
    placed(e) {
      if (!session) return;
      record(e, { kind: "placed", score: e.score, tier: e.tier });
      session.placed++;
      session.batch.push(e);
      if (e.tier === "S") queueJob("stier", 3, { key: e.id, e });
      if (e.tier === "X") queueJob("raus", 4, { key: e.id, e });
      if (session.batch.length >= BATCH) {
        queueJob("batch", 2, { key: "batch" + session.placed, batch: session.batch });
        session.batch = [];
      }
    },
    drift(e, delta, from) {
      if (!session || !delta) return;
      record(e, { kind: "drift", delta, score: e.score, tier: e.tier, from });
      if (e.tier === "X") queueJob("raus", 5, { key: e.id, e });
      else if (e.tier === "S" && from !== "S") queueJob("stier", 3, { key: e.id, e });
      else if (session.hist.get(e.id).length >= 4 && (from !== e.tier || Math.abs(delta) >= 10)) queueJob("shocking", 3, { key: e.id, e });
    },
    // Alle sind in RAUS: sofort berichten, solange die alte Runde noch zu sehen ist
    collapse() {
      if (!session) return;
      queueJob("collapse", 9, { key: "collapse" });
      tick(true);
    },
  };
})();
