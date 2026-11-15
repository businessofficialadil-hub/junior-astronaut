// Mission Control: the dashboard where the player shares power between jobs, the end-of-sol report that
// explains what happened and why, the end screen, live NASA space weather and the science sources page.
import { RULES, newMission, endSol, adjust, toggleComms, spending, available, solarToday, eva, grade, greenFactor } from './sim.js';
import SEP from './data/donki_sep.json' with { type: 'json' };
import { openTasks } from './tasks.js';
import { pickQuestions } from './quiz.js';

const FACTS = [
  ['Each astronaut breathes about 0.84 kg of oxygen every day.', 'NASA Baseline Values and Assumptions Document (BVAD)'],
  ['The space station recycles about 98% of its water, even sweat and urine!', 'NASA ISS life support (ECLSS), 2023'],
  ['On the Moon a person soaks up about 1.4 mSv of radiation every day, about 2.6 times more than on the space station.', "Chang'e-4 radiation detector (LND), Zhang et al., Science Advances 2020"],
  ["NASA limits an astronaut's radiation dose over their whole career to 600 mSv.", 'NASA-STD-3001 (2022)'],
  ['A radio message takes about 1.3 seconds to reach Earth from the Moon. From Mars it takes 3 to 22 minutes!', 'NASA'],
  ['In 2015 astronauts on the space station ate red romaine lettuce they grew themselves in the Veggie garden.', 'NASA Veggie (VEG-01), data in NASA OSDR'],
  ['Solar storms throw fast protons out of the Sun. NASA records every one in its DONKI database.', 'NASA DONKI'],
  ["Near the Moon's south pole the Sun stays low in the sky, so some crater floors never see sunlight.", 'NASA Lunar Reconnaissance Orbiter'],
];
const JOBS = [
  ['life', '🫁', 'Air & water machine', (v) => `makes ${(v * RULES.lifeEach).toFixed(2)} day of air & water`],
  ['green', '🌱', 'Greenhouse (food)', (v) => `grows ${(v * RULES.greenEach).toFixed(2)} day of food`],
  ['shield', '🛡️', 'Radiation shield', (v) => `blocks ${Math.round(Math.min(0.9, v * RULES.shieldEach) * 100)}% of a solar storm`],
  ['science', '🔬', 'Science lab', (v) => `+${v * 2} science points`],
];
const SEV = { 1: 'weak', 2: 'medium', 3: 'STRONG' };
const SUN = { normal: '☀️ Full sunlight', shadow: '🌗 Long crater shadows (less sunlight)', dust: '🌫️ Dust on the solar panels' };

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function makeMission({ onOpen, onClose, tasksHtml }) {
  let m = newMission();
  let open = false, live = { status: 'loading' };
  let screen = 'plan';                                  // which dashboard page is showing: plan | report | end | sources

  // ---- tutorial. The first sol is guided and deliberately tight (empty battery, a real medium storm), so the
  // player must take power from science to feed the shield: the core trade-off, felt in the first two minutes.
  const TUT_KEY = 'astrophage.tutorialDone';
  let tut = 0;                                          // current step, -1 = finished or skipped
  try { if (localStorage.getItem(TUT_KEY)) tut = -1; } catch { /* storage blocked: just show it */ }
  const TUT_STORM = SEP.find((x) => x.severity === 2);
  const tutSetup = () => {
    if (tut < 0) return;
    m.battery = 0; m.sun[0] = 'normal'; m.storms[0] = TUT_STORM;
    m.alloc = { life: 6, green: 8, shield: 0, science: 8, comms: false };
  };
  tutSetup();
  const TUT = [
    { text: '👋 Welcome, base manager! Your job: keep the crew of 4 safe for 7 sols (mission days). First follow the <b>blue beam</b> to the <b>Commander</b> (yellow <b>!</b>) and press <b>E</b>.', done: () => m.done.includes('welcome') },
    { text: '✅ Every sol has crew tasks, and a sol can only end when they are done. Now press <b>Tab</b> to open <b>Mission Control</b>.', done: () => open },
    { text: '🌱 These are your <b>supplies</b>: air, water and food. The crew uses up <b>1 day</b> of supplies every sol.', hl: '.mc-bar.sup', next: true },
    { text: '⚡ Today the solar panels make <b>28 ⚡</b> and the battery is empty. That is <b>not enough</b> to run every machine!', hl: '.mc-panel h3, .mc-bar.bat', next: true },
    { text: '🫁 The crew needs air! Press <b>+</b> on the <b>Air &amp; water machine</b> until it has <b>10 ⚡</b>.', hl: '[data-k="life"][data-d="1"]', done: () => m.alloc.life >= 10 },
    { text: '⚠️ Earth warns: a <b>real solar storm</b> hits today! Give the <b>Radiation shield</b> at least <b>6 ⚡</b>. Out of power? Press <b>−</b> on the <b>Science lab</b> to free some.', hl: '[data-k="shield"][data-d="1"], [data-k="science"][data-d="-1"]', done: () => m.alloc.shield >= 6 },
    { text: '👍 That is a <b>trade-off</b>: less science today, but a safer crew. Real mission planners make choices like this every day. Now press <b>End sol 1</b>.', hl: '[data-act="end"]', done: () => m.log.length > 0 },
    { text: '📋 Your shield blocked most of the storm! Remember: every ⚡ you give one job is a ⚡ another job cannot use. Now run the next 6 sols yourself. Tip: crew with a yellow <b>!</b> have tasks, and going outside uses suit air.', next: 'Start playing ▶' },
  ];
  const coach = el('div', 'mc-coach');
  coach.addEventListener('click', (e) => {
    e.stopPropagation();                                // the coach sits inside the dashboard: don't trigger its buttons
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.t === 'skip') return endTut();
    if (b.dataset.t === 'next') { tut++; refreshTut(); }
  });
  function endTut() {
    tut = -1; coach.remove();
    try { localStorage.setItem(TUT_KEY, '1'); } catch { /* fine: it shows again next time */ }
    root.querySelectorAll('.mc-hl').forEach((x) => x.classList.remove('mc-hl'));
  }
  function refreshTut() {
    if (tut < 0) return;
    while (tut < TUT.length && TUT[tut].done?.()) tut++;
    if (tut >= TUT.length) return endTut();
    const playing = getComputedStyle(document.getElementById('start')).display === 'none';
    if (!playing && !open) { coach.remove(); return; }          // not over the start screen
    const s = TUT[tut], panel = open && root.querySelector('.mc-panel');
    coach.className = 'mc-coach' + (panel ? ' docked' : '');
    coach.innerHTML = `<div class="mc-coach-who">🧑‍🚀 Commander · tutorial ${tut + 1}/${TUT.length}</div><div>${s.text}</div>
      <div class="mc-coach-btns">${s.next ? `<button data-t="next" class="go">${s.next === true ? 'Next ▶' : s.next}</button>` : ''}<button data-t="skip">Skip tutorial</button></div>`;
    (panel || document.body).prepend(coach);
    root.querySelectorAll('.mc-hl').forEach((x) => x.classList.remove('mc-hl'));
    if (s.hl && panel) {
      const hit = root.querySelectorAll(s.hl);
      hit.forEach((x) => x.classList.add('mc-hl'));
      hit[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });   // small screens: keep the target visible
    }
  }

  const root = el('div', 'mc'); document.body.appendChild(root);
  const hud = el('div', 'mc-hud'); document.getElementById('hud').appendChild(hud);
  const warn = el('div', 'mc-warn'); document.getElementById('hud').appendChild(warn);

  // live space weather: NASA DONKI radiation storms (SEP) in the last 30 days
  (async () => {
    try {
      const end = new Date(), start = new Date(end - 30 * 864e5), d = (x) => x.toISOString().slice(0, 10);
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`https://api.nasa.gov/DONKI/SEP?startDate=${d(start)}&endDate=${d(end)}&api_key=${import.meta.env.VITE_NASA_KEY || 'DEMO_KEY'}`, { signal: ctl.signal });
      if (!r.ok) throw new Error(r.status);
      const list = await r.json();
      const last = list.length ? list[list.length - 1].eventTime.slice(0, 10) : null;
      const recent = !!last && (end - new Date(last)) < 7 * 864e5;
      live = { status: 'ok', count: list.length, last, recent };
      // a real storm in the past week: the first sol starts with one, so today's real Sun matters
      if (recent && m.sol === 1 && !m.log.length) { const keep = m.alloc; m = newMission(Math.random, true); m.alloc = keep; tutSetup(); }
    } catch { live = { status: 'off' }; }
    if (screen === 'plan') render();                  // never wipe a report the player is reading
  })();

  const liveText = () => live.status === 'ok'
    ? `<b>LIVE from NASA DONKI:</b> ${live.count ? `${live.count} radiation storm${live.count > 1 ? 's' : ''} in the last 30 days (latest ${live.last}).` : 'no radiation storms in the last 30 days. The Sun is calm.'}
       ${live.recent ? ' A real storm hit this week, so your mission starts with one!' : ''}`
    : live.status === 'loading' ? 'Checking real space weather from NASA DONKI…'
    : 'Live NASA data is not reachable right now, so the game uses real archived storms from NASA DONKI.';

  function bar(label, value, max, unit, cls, explain) {
    const pct = Math.max(0, Math.min(100, value / max * 100));
    return `<div class="mc-bar ${cls}"><div class="mc-bl">${label} <b>${value.toFixed(cls === 'dose' ? 0 : 1)}${unit}</b> <small>${explain}</small></div>
      <div class="mc-track"><div style="width:${pct}%"></div></div></div>`;
  }

  function forecastText() {
    const s = m.storms[m.sol - 1];
    if (!m.forecastKnown && m.sol > 1) return '❔ Unknown. Nobody sent a report to Earth yesterday, so there is no forecast. A storm could hit without warning!';
    if (m.sol === 1 && !m.forecastKnown) return s ? `⚠️ Earth warns: a <b>${SEV[s.severity]}</b> solar storm today (based on a real NASA DONKI storm of ${s.date}).` : '✅ Earth says the Sun looks calm today.';
    return s ? `⚠️ Forecast from Earth: a <b>${SEV[s.severity]}</b> solar storm today (real NASA DONKI storm of ${s.date}).` : '✅ Forecast from Earth: the Sun is calm today.';
  }

  const updateHud = () => {
    hud.innerHTML = `SOL ${m.sol}/${RULES.sols} · 🔋${m.battery.toFixed(0)} · 🌱${m.supplies.toFixed(1)} days · ☢️${m.dose.toFixed(0)} mSv · 🔬${m.science} <small>[Tab] Mission Control</small>`;
  };
  function render() {
    const a = m.alloc, avail = available(m), used = spending(a);
    updateHud();
    if (!open) { root.style.display = 'none'; refreshTut(); return; }
    screen = 'plan';
    root.style.display = 'flex';
    root.innerHTML = '';
    const p = el('div', 'mc-panel');
    p.innerHTML = `
      <div class="mc-head"><h2>🛰️ MISSION CONTROL · SOL ${m.sol} of ${RULES.sols}</h2>
        <small>A <b>sol</b> is one mission day. Keep your crew of 4 safe until sol ${RULES.sols}.</small></div>
      <div class="mc-live">${liveText()}</div>
      ${bar('🌱 Supplies', m.supplies, RULES.supplies.max, ' days', 'sup', 'air, water and food left. The crew uses 1 day every sol.')}
      ${bar('☢️ Radiation dose', m.dose, RULES.dose.limit, ' mSv', 'dose', `mSv = how much radiation the body soaked up. Game limit ${RULES.dose.limit}.`)}
      ${bar('🔋 Battery', m.battery, m.batteryMax, ' ⚡', 'bat', 'power saved for darker days.')}
      <div class="mc-today"><div>${SUN[m.sun[m.sol - 1]]}: panels make <b>${solarToday(m)} ⚡</b> today.</div><div>${forecastText()}</div></div>
      <h3>Share your power <span class="${used > avail ? 'bad' : ''}">${used} / ${avail} ⚡ used</span></h3>
      ${m.todayLoad ? `<small>🧰 ${m.todayLoad} ⚡ already promised to today's crew task.</small>` : ''}${m.shelter ? `<small> 🛡️ Crew in the storm shelter: +30% protection, half science.</small>` : ''}`;
    for (const [k, icon, name, says] of JOBS) {
      const row = el('div', 'mc-job');
      row.innerHTML = `<span class="mc-jn">${icon} ${name}</span>
        <button data-k="${k}" data-d="-1" aria-label="less power to ${name}">−</button>
        <span class="mc-pips">${'<i class="on"></i>'.repeat(a[k])}${'<i></i>'.repeat(RULES.maxPer - a[k])}</span>
        <button data-k="${k}" data-d="1" aria-label="more power to ${name}">+</button>
        <span class="mc-v">${a[k]} ⚡</span><small>${says(a[k])}</small>`;
      p.appendChild(row);
    }
    const comms = el('div', 'mc-job');
    comms.innerHTML = `<span class="mc-jn">📡 Report to Earth</span><button class="mc-toggle ${a.comms ? 'on' : ''}" data-comms="1">${a.comms ? 'ON' : 'OFF'}</button>
      <span class="mc-v">${RULES.comms} ⚡</span><small>Earth sends back tomorrow's storm forecast. Radio takes 1.3 s each way.</small>`;
    p.appendChild(comms);
    const tip = el('div', 'mc-tip', `💡 ${m.supplies + a.life * RULES.lifeEach * m.lifeEff + a.green * RULES.greenEach * greenFactor(m) - 1 < m.supplies
      ? 'With this plan your supplies will go <b>down</b> today.' : 'With this plan your supplies stay level or grow.'}
      Every ⚡ you give one job is a ⚡ another job doesn't get.`);
    p.appendChild(tip);
    const tasks = el('details', 'mc-tasks', `<summary>Crew tasks (walk to the crew with a yellow ! and press E)</summary><ol>${tasksHtml()}</ol>`);
    tasks.open = true;   // the tasks were easy to miss when folded
    p.appendChild(tasks);
    const btns = el('div', 'mc-btns');
    const wait = decisionsLeft();
    btns.innerHTML = `${wait.length ? `<div class="mc-block">🔒 Before ending sol ${m.sol}, finish your crew tasks: <b>${wait.map((t) => t.title).join(', ')}</b>. Press Back to base and follow the blue beam.</div>` : ''}
      <button class="mc-go" data-act="end" ${wait.length ? 'disabled' : ''}>End sol ${m.sol} ▶</button><button data-act="close">Back to base</button><button data-act="sources">📚 Science sources</button>`;
    p.appendChild(btns);
    root.appendChild(p);
    refreshTut();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) adjust(m, b.dataset.k, +b.dataset.d);
    else if (b.dataset.comms) toggleComms(m);
    else if (b.dataset.act === 'close') return api.close();
    else if (b.dataset.act === 'sources') return showSources();
    else if (b.dataset.act === 'end') { if (!decisionsLeft().length) runSol(); return; }
    else if (b.dataset.act === 'next') { m.over ? showEnd() : render(); return; }
    else if (b.dataset.qa) return answer(+b.dataset.qa);
    else if (b.dataset.act === 'qnext') return quiz.i < quiz.qs.length ? showQuestion() : showEnd();
    else if (b.dataset.act === 'again') return location.reload();
    render();
  });

  // a sol can't end while any crew task of this sol (or an earlier one) is still open
  const decisionsLeft = () => openTasks(m);

  function runSol() {
    screen = 'report';
    const r = endSol(m);
    const f = FACTS[(r.sol - 1) % FACTS.length];
    root.innerHTML = '';
    const p = el('div', 'mc-panel mc-report');
    const storm = r.storm
      ? `☢️ A <b>${SEV[r.storm.severity]}</b> solar storm hit! It is based on a <b>real</b> storm NASA recorded on <b>${r.storm.date}</b> (DONKI, ${r.storm.instrument}).
         Your ${r.shelter ? 'shield and the storm shelter' : 'shield'} blocked <b>${Math.round(r.blocked * 100)}%</b>, so the crew got <b>+${r.dose.toFixed(1)} mSv</b>.
         ${r.blocked < 0.5 ? 'More shield power would have protected them better.' : 'Good shielding!'}`
      : `☀️ The Sun was calm. The crew got only the normal background radiation: <b>+${r.dose.toFixed(1)} mSv</b>.`;
    p.innerHTML = `<h2>📋 Sol ${r.sol} report</h2>
      <p>${SUN[r.sun]}: the panels made <b>${r.gen} ⚡</b>. Battery now <b>${m.battery.toFixed(0)} ⚡</b>.</p>
      <p>🌱 Supplies ${r.supplies >= 0 ? 'grew' : 'went down'} by <b>${Math.abs(r.supplies).toFixed(2)} day</b>. ${m.supplies.toFixed(1)} days left.
        ${r.supplies < 0 ? 'The machines made less than the crew used.' : ''}</p>
      <p>${storm}</p>
      <p>🔬 The science lab earned <b>+${r.science}</b> points (total ${m.science}).${r.shelter ? ' Half, because the crew sat in the shelter.' : ''}</p>
      <p class="mc-comms">${r.forecast === undefined ? '📡 No report was sent to Earth, so tomorrow is a surprise.' : '📡 Sending report to Earth… <span class="mc-wait">waiting for the reply (light delay)</span>'}</p>
      <div class="mc-fact">🧑‍🚀 <b>Real fact:</b> ${f[0]} <small>Source: ${f[1]}</small></div>
      <div class="mc-btns"><button class="mc-go" data-act="next">${m.over ? 'See how the mission ended ▶' : `Plan sol ${m.sol} ▶`}</button></div>`;
    root.appendChild(p);
    if (r.forecast !== undefined) setTimeout(() => {      // the reply really takes ~2.6 s: 1.3 s there + 1.3 s back
      const w = p.querySelector('.mc-comms');
      if (w) w.innerHTML = `📡 Earth replied after 2.6 s (1.3 s each way): ${r.forecast ? `⚠️ a <b>${SEV[r.forecast.severity]}</b> storm is coming tomorrow!` : '✅ tomorrow looks calm.'}`;
    }, 2600);
    refreshTut();
    updateHud();
  }

  // Crew Debrief: 3 questions about what this player met, before the stars. Wrong answers just get the reason.
  let quiz = null;
  function showQuestion() {
    screen = 'end';
    const x = quiz.qs[quiz.i];
    root.innerHTML = '';
    const p = el('div', 'mc-panel mc-report mc-quiz');
    p.innerHTML = `<h2>🧑‍🚀 Crew Debrief · question ${quiz.i + 1} of ${quiz.qs.length}</h2>
      <p class="mc-q">${x.q}</p>
      <div class="mc-qa">${x.options.map((o, i) => `<button data-qa="${i}">${'ABC'[i]}. ${o}</button>`).join('')}</div>
      <div class="mc-qwhy"></div>`;
    root.appendChild(p);
  }
  function answer(i) {
    const x = quiz.qs[quiz.i], p = root.querySelector('.mc-quiz');
    if (!p || p.dataset.answered) return;
    p.dataset.answered = '1';
    const ok = i === x.right; if (ok) quiz.score++;
    p.querySelectorAll('[data-qa]').forEach((b, j) => { b.disabled = true; if (j === x.right) b.classList.add('right'); else if (j === i) b.classList.add('wrong'); });
    p.querySelector('.mc-qwhy').innerHTML = `<p>${ok ? '✅ Correct!' : `❌ Not quite. The answer is <b>${x.options[x.right]}</b>.`} ${x.why}</p>
      <div class="mc-btns"><button class="mc-go" data-act="qnext">${quiz.i + 1 < quiz.qs.length ? 'Next question ▶' : 'See your mission result ▶'}</button></div>`;
    quiz.i++;
  }

  function showEnd() {
    if (!quiz) { quiz = { qs: pickQuestions(m.done), i: 0, score: 0 }; return showQuestion(); }
    screen = 'end';
    root.innerHTML = '';
    const p = el('div', 'mc-panel mc-report');
    const stars = grade(m);
    const why = {
      complete: `🎉 <b>Mission complete!</b> Your crew lived on the Moon for ${RULES.sols} sols.`,
      supplies: '😟 <b>The crew ran out of air, water and food</b> and had to fly home early. On a real base, mission planners always keep spare supplies for emergencies.',
      dose: `😟 <b>The crew soaked up too much radiation</b> (over ${RULES.dose.limit} mSv) and had to fly home early. Real astronauts have strict radiation limits, so planners protect them during solar storms.`,
    }[m.over];
    p.innerHTML = `<h2>${m.over === 'complete' ? '⭐'.repeat(stars) + '☆'.repeat(3 - stars) : 'Mission over'}</h2><p>${why}</p>
      <p>🔬 Science: <b>${m.science}</b> · ☢️ Dose: <b>${m.dose.toFixed(0)} mSv</b> · 🌱 Supplies left: <b>${m.supplies.toFixed(1)} days</b></p>
      <p>🧑‍🚀 Crew Debrief: <b>${quiz.score} of ${quiz.qs.length}</b> right${quiz.score === quiz.qs.length ? ' · 🏅 <b>Science Badge</b> earned!' : '. Play again to try for the 🏅 Science Badge.'}</p>
      <p>⭐ for finishing · ⭐ for 50+ science points · ⭐ for keeping the dose under ${RULES.dose.limit / 2} mSv.</p>
      <p>Every game has different real solar storms. Try another plan: more shield? more science? more food?</p>
      <div class="mc-btns"><button class="mc-go" data-act="again">Play again</button><button data-act="sources">📚 Science sources</button></div>`;
    root.appendChild(p);
  }

  function showSources() {
    screen = 'sources';
    root.innerHTML = '';
    const p = el('div', 'mc-panel mc-report');
    p.innerHTML = `<h2>📚 Where the science comes from</h2>
      <ul class="mc-src">
        <li><b>Solar storms:</b> every storm in the game is a real Solar Energetic Particle (SEP) event from NASA's
          <a href="https://kauai.ccmc.gsfc.nasa.gov/DONKI/" target="_blank" rel="noopener">DONKI</a> space weather database
          (35 storm days, 2012–2015, saved in the game). Storm strength comes from the instrument that saw it:
          GOES &gt;100 MeV protons = strong, GOES/SOHO = medium, only STEREO (far side of the Sun) = weak.
          The game also asks DONKI live for the last 30 days, and says clearly when that is not available.</li>
        <li><b>Background radiation on the Moon:</b> about 1.4 mSv per day, measured by the Chang'e-4 lander (Zhang et al., Science Advances, 2020).</li>
        <li><b>Radiation limits:</b> NASA-STD-3001 (2022) sets a 600 mSv career limit. The game's ${RULES.dose.limit} mSv limit and storm doses
          (weak 5, medium 25, strong 90 mSv without shielding) are simplified for play.</li>
        <li><b>Air and water:</b> about 0.84 kg of oxygen per astronaut per day (NASA BVAD). The space station recycles about 98% of its water (NASA, 2023).</li>
        <li><b>Growing food:</b> NASA's Veggie experiment grew lettuce on the space station (VEG-01, 2015). Results are in NASA's Open Science Data Repository (OSDR).</li>
        <li><b>Radio delay:</b> light needs about 1.3 s to go from the Moon to Earth (3 to 22 minutes from Mars).</li>
      </ul>
      <p><small>Power numbers, supply rates and shield strength are game values chosen so that every choice has a cost. They are not real habitat specs.</small></p>
      <div class="mc-btns"><button class="mc-go" data-act="${m.over ? 'again' : 'next'}">${m.over ? 'Play again' : 'Back to Mission Control'}</button></div>`;
    root.appendChild(p);
  }

  let warnCool = 0;
  const api = {
    get open() { return open; },
    get state() { return m; },
    get tutorial() { return tut; },
    skipTutorial: () => endTut(),
    toggle() { open ? api.close() : api.open_(); },
    open_() { if (m.over) return; open = true; render(); onOpen(); },
    close() { open = false; render(); onClose(); },
    // per-frame: being outside costs suit air and dose; a storm outside is dangerous
    tick(dt, outside) {
      if (m.over) return;
      if (outside) eva(m, dt, tut < 0);                 // no surprise dose while the tutorial is talking
      const storm = m.storms[m.sol - 1];
      const danger = outside && storm && storm.severity >= 2 && tut < 0;
      warn.style.display = danger ? 'block' : 'none';
      if (danger) warn.textContent = `☢️ Solar storm outside! Your suit has no shield. Get inside the base! (+${RULES.eva.stormDosePerSec * 60 | 0} mSv per minute)`;
      if ((warnCool -= dt) <= 0) { warnCool = 0.5; updateHud(); if (!open) refreshTut(); }
      if (m.over && !open) { open = true; onOpen(); showEnd(); }
    },
    refresh: () => render(),
    bonus(points, why) { m.science += points; m.log.push({ bonus: points, why }); render(); },
  };
  render();
  return api;
}
