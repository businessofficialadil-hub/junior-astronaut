// Outpost simulation: the trade-off core of the game. No DOM, no 3D: plain rules so it can be tested.
// Three things to keep alive: ⚡ battery power, 🌱 supplies (air, water, food, in days) and ☢️ radiation dose.
// Every sol (lunar day of the mission) the player splits the solar power between five jobs. Nothing is free:
// power spent on the shield or on science is power not spent on air or food.
import SEP from './data/donki_sep.json' with { type: 'json' };   // real DONKI radiation-storm days (curated archive)

export const RULES = {
  sols: 7,
  battery: { start: 10, max: 20 },
  solar: { normal: 28, shadow: 18, dust: 22 },        // ⚡ per sol from the panels
  supplies: { start: 4, max: 6, use: 1.0 },           // days of air+water+food; the crew uses 1 day per sol
  lifeEach: 0.06, greenEach: 0.04,                    // supplies made per ⚡ (air/water recycler, greenhouse)
  maxPer: 10,                                         // most ⚡ any one job can take
  dose: { limit: 150, base: 1.4 },                    // mSv; 1.4 mSv/sol background on the lunar surface
  storm: { 1: 5, 2: 25, 3: 90 },                      // extra mSv for an unshielded crew, by storm strength
  shieldEach: 0.09,                                   // each ⚡ in the shield blocks 9% (10 ⚡ -> 90%)
  comms: 3,                                           // ⚡ to send the daily report (and get tomorrow's forecast)
  stormChance: 0.4,
  eva: { suppliesPerSec: 0.0008, dosePerSec: 0.01, stormDosePerSec: 0.6 },
};

// Storm schedule for one playthrough: real DONKI radiation-storm days, picked at random so every game differs.
export function planStorms(rand = Math.random, liveRecentStorm = false) {
  const plan = [];
  for (let s = 1; s <= RULES.sols; s++) {
    const forced = s === 1 && liveRecentStorm;          // a real storm happened in the last days -> start with one
    plan.push(forced || rand() < RULES.stormChance ? SEP[Math.floor(rand() * SEP.length)] : null);
  }
  return plan;
}

export function newMission(rand = Math.random, liveRecentStorm = false) {
  return {
    sol: 1, battery: RULES.battery.start, supplies: RULES.supplies.start, dose: 0, science: 0,
    storms: planStorms(rand, liveRecentStorm),
    sun: Array.from({ length: RULES.sols }, () => (rand() < 0.2 ? 'shadow' : rand() < 0.15 ? 'dust' : 'normal')),
    forecastKnown: false,                               // did yesterday's report to Earth bring back today's forecast?
    alloc: { life: 10, green: 6, shield: 4, science: 4, comms: false },
    over: null, log: [],
    // crew-task decisions (src/tasks.js) change these
    batteryMax: RULES.battery.max, lifeEff: 1, greenPlan: null, greenSince: 0, todayLoad: 0, shelter: false, done: [],
  };
}

export const solarToday = (m) => RULES.solar[m.sun[m.sol - 1]];
export const available = (m) => solarToday(m) + m.battery - m.todayLoad;
// potatoes: half the food while they grow (2 sols), then 80% more than lettuce
export const greenFactor = (m) => m.greenPlan !== 'potato' ? 1 : m.sol < m.greenSince + 2 ? 0.5 : 1.8;
export const spending = (a) => a.life + a.green + a.shield + a.science + (a.comms ? RULES.comms : 0);

// change one job's power by +/-1, refused if it would overspend or go out of range
export function adjust(m, job, delta) {
  const v = m.alloc[job] + delta;
  if (v < 0 || v > RULES.maxPer) return false;
  if (delta > 0 && spending(m.alloc) + delta > available(m)) return false;
  m.alloc[job] = v; return true;
}
export function toggleComms(m) {
  if (!m.alloc.comms && spending(m.alloc) + RULES.comms > available(m)) return false;
  m.alloc.comms = !m.alloc.comms; return true;
}

// trim the plan until it fits the power left (science first, life support last)
export function fit(m) {
  const a = m.alloc;
  while (spending(a) > available(m)) {
    const j = ['science', 'shield', 'green', 'life'].find((k) => a[k] > 0);
    if (a.comms && !j) a.comms = false; else if (j) a[j]--; else break;
  }
}

// walking or driving outside the base costs suit air and adds dose (a lot during a storm)
// stormsOn = false: the storm only counts at the end of the sol (used while the tutorial explains it)
export function eva(m, dt, stormsOn = true) {
  if (m.over) return;
  const storm = stormsOn ? m.storms[m.sol - 1] : null;
  m.supplies -= RULES.eva.suppliesPerSec * dt;
  m.dose += (storm && storm.severity >= 2 ? RULES.eva.stormDosePerSec : RULES.eva.dosePerSec) * dt;
  check(m);
}

function check(m) {
  if (m.supplies <= 0) { m.supplies = 0; m.over = 'supplies'; }
  else if (m.dose >= RULES.dose.limit) m.over = 'dose';
}

// run the sol with the current allocation; returns a plain-language report of what happened and why
export function endSol(m) {
  const a = m.alloc, R = RULES, sun = m.sun[m.sol - 1], gen = solarToday(m), storm = m.storms[m.sol - 1];
  const report = { sol: m.sol, sun, gen, storm, lines: [] };
  const spend = spending(a);
  m.battery = Math.min(m.batteryMax, m.battery + gen - spend - m.todayLoad);

  const made = a.life * R.lifeEach * m.lifeEff + a.green * R.greenEach * greenFactor(m);
  m.supplies = Math.min(R.supplies.max, m.supplies + made - R.supplies.use);
  report.supplies = made - R.supplies.use;

  const blocked = Math.min(0.95, Math.min(0.9, a.shield * R.shieldEach) + (m.shelter ? 0.3 : 0));
  const stormDose = storm ? R.storm[storm.severity] * (1 - blocked) : 0;
  report.dose = R.dose.base + stormDose; report.blocked = blocked; report.stormDose = stormDose;
  m.dose += report.dose;

  const sci = a.science * 2 * (m.shelter ? 0.5 : 1);   // crew in the shelter can't work in the lab
  m.science += sci; report.science = sci; report.shelter = m.shelter;
  m.todayLoad = 0; m.shelter = false;
  report.forecast = a.comms ? m.storms[m.sol] ?? null : undefined;   // undefined = no report sent
  m.forecastKnown = a.comms;

  check(m);
  if (!m.over && m.sol >= R.sols) m.over = 'complete';
  if (!m.over) m.sol++;
  // the battery can't cover the same plan tomorrow if the sun is weaker: trim the plan to fit
  if (!m.over) fit(m);
  m.log.push(report);
  return report;
}

// stars at the end: science done, crew health and supplies left
export function grade(m) {
  if (m.over !== 'complete') return 0;
  let s = 1;
  if (m.science >= 50) s++;
  if (m.dose < RULES.dose.limit / 2) s++;
  return s;
}
