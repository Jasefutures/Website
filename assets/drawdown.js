/* Trailing Drawdown Visualizer — scripted scenarios, scrubbed on a canvas. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const START = 50000, DD = 2000, DLL = 1000;

  /* Each scenario: days = arrays of equity waypoints (P&L vs start, $).
     Waypoints are interpolated to a smooth path. notes fire at fractions of the timeline. */
  const SCENARIOS = [
    {
      key: "spike",
      title: "The winner that killed the account",
      blurb: "Day 1: a monster runner you didn't take profit on. It closes small green — feels fine. Day 2: an ordinary pullback. Watch which floor is waiting for you.",
      days: [
        [0, 300, 800, 1500, 2600, 2100, 1200, 600, 400],
        [400, 250, 100, -100, -200, 50, -100, -250],
        [-250, -100, 150, 300, 450, 600]
      ],
      notes: [
        { f: 0.10, text: "Long is working. Unrealized equity climbing — and the <b>intraday floor climbs with it</b>, tick for tick." },
        { f: 0.20, text: "Peak: <b>+$2,600 unrealized</b>. Intraday floor has trailed up to $50,000 and locked at start. Your cushion is no longer $2,000 — it's whatever you close above $50k." },
        { f: 0.41, text: "Closed +$400. Feels like a green day. Intraday cushion: <b class='neg'>$400</b>. EOD floor only now updates — to $48,400: cushion <b class='pos'>$2,000</b>. Same trades." },
        { f: 0.52, text: "<b class='neg'>Intraday account is DEAD</b> — an ordinary dip touched the $50,000 floor. The EOD account shrugs it off and trades on." },
        { f: 0.97, text: "EOD account finishes the week fine. The intraday account died a day ago <b>because of a trade that WON</b>. That's the mechanic almost nobody reads before paying." }
      ]
    },
    {
      key: "grind",
      title: "The boring grind (why small wins are safe)",
      blurb: "No hero trades. Small consistent days. Watch both floors rise slowly and lock at breakeven — after that, the eval is nearly unkillable.",
      days: [
        [0, 200, -100, 350, 500],
        [500, 700, 400, 900, 1100],
        [1100, 900, 1300, 1600, 1800],
        [1800, 2100, 1900, 2300, 2600],
        [2600, 2400, 2800, 3100]
      ],
      notes: [
        { f: 0.12, text: "Small day, small floor movement. Nothing dramatic — that's the point." },
        { f: 0.45, text: "Floors creep up behind the highs, but the equity never gives back enough to touch them." },
        { f: 0.78, text: "Peak passed +$2,000 → <b>both floors are now locked at $50,000</b>. You literally cannot trail anymore; only a full $2,000 giveback from peak kills you." },
        { f: 0.97, text: "Target hit. Boring got funded. The spike scenario made more money by day 1 and still died." }
      ]
    },
    {
      key: "revenge",
      title: "The revenge spiral vs the daily loss limit",
      blurb: "Three losers before lunch. Topstep's $1,000 DLL flattens you for the day — annoying, but it's a seatbelt. The dashed line is the same trader without one.",
      days: [
        [0, 150, 400, 300, 500],
        [500, 150, -200, -550, -520],
        [-520, -300, -50, 200, 400],
        [400, 650, 900, 1200]
      ],
      ghost: {
        fromDay: 1,
        days: [
          [500, 150, -200, -550, -900, -1250, -1600],
          [-1600, -1750, -1900, -2100],
          [-2100, -2100, -2100, -2100]
        ]
      },
      notes: [
        { f: 0.28, text: "Day 2: loser, loser, loser. Down $1,050 from yesterday's close → <b>DLL hit. Flat for the day.</b> Not a violation — a timeout." },
        { f: 0.5, text: "Dashed line: the version of you that 'had to make it back'. Fourth loser, fifth, sixth — sizing up the whole way." },
        { f: 0.75, text: "The DLL'd trader comes back Wednesday with a clear head and a live account. The dashed line is <b class='neg'>$2,100 down — through the floor. Eval over.</b>" },
        { f: 0.97, text: "The rule you hate on a red morning is the only reason there's an account left on Friday." }
      ]
    }
  ];

  // ---------- build paths ----------
  const PTS_PER_SEG = 14;
  function interp(waypoints) {
    const out = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      for (let k = 0; k < PTS_PER_SEG; k++) {
        const t = k / PTS_PER_SEG;
        // slight ease + wiggle so it looks like price, not CAD
        const v = waypoints[i] + (waypoints[i + 1] - waypoints[i]) * t;
        const wiggle = Math.sin((i * PTS_PER_SEG + k) * 2.7) * Math.min(60, Math.abs(waypoints[i + 1] - waypoints[i]) * 0.15);
        out.push(v + (k === 0 ? 0 : wiggle));
      }
    }
    out.push(waypoints[waypoints.length - 1]);
    return out;
  }

  function buildScenario(sc) {
    const pts = []; // {eq, day, dayEnd}
    sc.days.forEach((wps, d) => {
      const seg = interp(wps);
      seg.forEach((v, i) => pts.push({ eq: START + v, day: d, dayEnd: i === seg.length - 1 }));
    });
    // floors
    let peakI = -Infinity, floorI = START - DD, peakE = START, floorE = START - DD;
    pts.forEach((p) => {
      if (p.eq > peakI) { peakI = p.eq; floorI = Math.min(peakI - DD, START); }
      p.floorI = floorI;
      p.floorE = floorE;
      if (p.dayEnd && p.eq > peakE) { peakE = p.eq; floorE = Math.min(peakE - DD, START); }
    });
    // ghost line (revenge scenario)
    let ghost = null;
    if (sc.ghost) {
      ghost = [];
      const offset = sc.days.slice(0, sc.ghost.fromDay).reduce((n, w) => n + (w.length - 1) * PTS_PER_SEG + 1, 0);
      for (let i = 0; i < offset; i++) ghost.push(null);
      sc.ghost.days.forEach((wps) => interp(wps).forEach((v) => ghost.push(START + v)));
    }
    return { pts, ghost };
  }

  const BUILT = SCENARIOS.map(buildScenario);

  // Node export for testing — everything below is DOM-only.
  if (typeof module === "object" && module.exports) {
    module.exports = { SCENARIOS, buildScenario, START, DD, DLL };
    return;
  }

  // ---------- UI ----------
  let cur = 0, playTimer = null;
  const tabs = $("scenarioTabs");
  SCENARIOS.forEach((sc, i) => {
    const b = document.createElement("button");
    b.textContent = sc.title.split(" ").slice(0, 2).join(" ");
    b.title = sc.title;
    b.addEventListener("click", () => select(i));
    tabs.appendChild(b);
  });

  function select(i) {
    cur = i;
    stop();
    [...tabs.children].forEach((b, k) => b.classList.toggle("on", k === i));
    $("scenarioBlurb").innerHTML = "<b>" + SCENARIOS[i].title + ".</b> " + SCENARIOS[i].blurb;
    const scrub = $("scrub");
    scrub.max = BUILT[i].pts.length - 1;
    scrub.value = 0;
    $("ddNote").innerHTML = "Drag the slider — or hit Play.";
    draw();
  }

  function activeNote(frac) {
    const notes = SCENARIOS[cur].notes;
    let n = null;
    for (const note of notes) if (frac >= note.f) n = note;
    return n;
  }

  // ---------- drawing ----------
  function draw() {
    const cv = $("ddChart"), ctx = cv.getContext("2d");
    const { pts, ghost } = BUILT[cur];
    const upto = +$("scrub").value;
    const W = cv.width, H = cv.height, padL = 56, padR = 10, padT = 12, padB = 20;

    let lo = START - DD, hi = START + 500;
    pts.forEach((p) => { lo = Math.min(lo, p.eq, p.floorI); hi = Math.max(hi, p.eq); });
    if (ghost) ghost.forEach((g) => { if (g != null) lo = Math.min(lo, g); });
    const span = hi - lo; lo -= span * 0.06; hi += span * 0.06;

    const X = (i) => padL + (W - padL - padR) * (i / (pts.length - 1));
    const Y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const css = getComputedStyle(document.documentElement);
    const C = (v) => css.getPropertyValue(v).trim();

    ctx.clearRect(0, 0, W, H);
    ctx.font = "11px monospace";

    // day separators
    ctx.strokeStyle = C("--border"); ctx.lineWidth = 1;
    pts.forEach((p, i) => {
      if (p.dayEnd && i < pts.length - 1) {
        ctx.beginPath(); ctx.moveTo(X(i), padT); ctx.lineTo(X(i), H - padB); ctx.stroke();
      }
    });

    // start balance line
    ctx.strokeStyle = C("--pos"); ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(padL, Y(START)); ctx.lineTo(W - padR, Y(START)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C("--muted");
    ctx.fillText("$50k start", 8, Y(START) + 4);
    ctx.fillText("$" + Math.round((START - DD) / 100) / 10 + "k", 8, Y(START - DD) + 4);

    function line(getV, color, width, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= upto; i++) {
        const v = getV(i);
        if (v == null) continue;
        const x = X(i), y = Y(v);
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        started = true;
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    line((i) => pts[i].floorE, C("--warn"), 1.5);
    line((i) => pts[i].floorI, C("--neg"), 1.5);
    if (ghost) line((i) => ghost[i], C("--muted"), 1.5, [4, 4]);
    line((i) => pts[i].eq, C("--accent"), 2.2);

    // bust marker: equity touching intraday floor
    for (let i = 1; i <= upto; i++) {
      if (pts[i].eq <= pts[i].floorI) {
        ctx.fillStyle = C("--neg");
        ctx.beginPath(); ctx.arc(X(i), Y(pts[i].eq), 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillText("intraday bust", Math.min(X(i) + 8, W - 90), Y(pts[i].eq) - 8);
        break;
      }
    }

    // playhead
    ctx.fillStyle = C("--accent");
    ctx.beginPath(); ctx.arc(X(upto), Y(pts[upto].eq), 4, 0, Math.PI * 2); ctx.fill();

    const note = activeNote(upto / (pts.length - 1));
    if (note) $("ddNote").innerHTML = note.text;
  }

  // ---------- play ----------
  function stop() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $("playBtn").textContent = "▶ Play"; }
  }
  $("playBtn").addEventListener("click", () => {
    if (playTimer) { stop(); return; }
    const scrub = $("scrub");
    if (+scrub.value >= +scrub.max) scrub.value = 0;
    $("playBtn").textContent = "❚❚ Pause";
    playTimer = setInterval(() => {
      scrub.value = +scrub.value + 1;
      draw();
      if (+scrub.value >= +scrub.max) stop();
    }, 40);
  });
  $("scrub").addEventListener("input", () => { stop(); draw(); });

  select(0);
})();
