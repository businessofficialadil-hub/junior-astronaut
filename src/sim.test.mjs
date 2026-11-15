// Self-check for the outpost rules:  node src/sim.test.mjs
import assert from 'node:assert/strict';
import { newMission, endSol, adjust, toggleComms, spending, available, grade, fit, RULES } from './sim.js';

const fixed = (seq) => { let i = 0; return () => seq[i++ % seq.length]; };
const quiet = () => { const m = newMission(fixed([0.99])); m.storms = m.storms.map(() => null); m.sun = m.sun.map(() => 'normal'); return m; };

// 1. full air + full greenhouse exactly feeds the crew; anything less slowly runs supplies down
{
  const m = quiet(); m.alloc = { life: 10, green: 10, shield: 0, science: 0, comms: false };
  endSol(m); assert.equal(m.supplies.toFixed(2), RULES.supplies.start.toFixed(2));
  m.alloc.green = 0; endSol(m); assert.ok(m.supplies < RULES.supplies.start);
}
// 2. you can't spend power you don't have, and no job goes over its cap
{
  const m = quiet(); m.alloc = { life: 10, green: 10, shield: 10, science: 0, comms: false };
  assert.equal(spending(m.alloc), 30); assert.ok(available(m) >= 30);
  while (adjust(m, 'science', 1));
  assert.ok(spending(m.alloc) <= available(m));
  assert.equal(adjust(m, 'life', 1), false);   // already at max
}
// 3. the shield really trades power for safety: same strong storm, very different dose
{
  const storm = { date: '2012-03-07', severity: 3 };
  const a = quiet(); a.storms[0] = storm; a.alloc.shield = 0; endSol(a);
  const b = quiet(); b.storms[0] = storm; b.alloc.shield = 10; endSol(b);
  assert.ok(a.dose > 80 && b.dose < 15, `unshielded ${a.dose} shielded ${b.dose}`);
}
// 4. starving the life support ends the mission; too much radiation ends it too
{
  const m = quiet(); m.alloc = { life: 0, green: 0, shield: 0, science: 0, comms: false };
  for (let i = 0; i < 7 && !m.over; i++) endSol(m);
  assert.equal(m.over, 'supplies');
  const d = quiet(); d.storms = d.storms.map(() => ({ date: 'x', severity: 3 })); d.alloc.shield = 0;
  for (let i = 0; i < 7 && !d.over; i++) endSol(d);
  assert.equal(d.over, 'dose');
}
// 5. comms costs power and brings back tomorrow's forecast
{
  const m = quiet(); m.storms[1] = { date: '2014-01-07', severity: 3 };
  assert.ok(toggleComms(m)); const r = endSol(m);
  assert.equal(r.forecast.date, '2014-01-07');
}
// 6. a balanced plan finishes the mission and earns stars
{
  const m = newMission(fixed([0.3, 0.5, 0.9, 0.1, 0.7]));
  m.alloc = { life: 10, green: 10, shield: 6, science: 4, comms: false };
  for (let i = 0; i < 7 && !m.over; i++) endSol(m);
  assert.equal(m.over, 'complete', `ended: ${m.over} dose ${m.dose.toFixed(1)} supplies ${m.supplies.toFixed(2)}`);
  assert.ok(grade(m) >= 1);
}
// 7. task decisions: repair load costs power today, weak filter makes less air, potatoes pay off later, shelter blocks more
{
  const a = quiet(), b = quiet(); b.todayLoad = 4; assert.equal(available(a) - available(b), 4);
  const q = quiet(); q.todayLoad = 4; q.alloc.science = 10; fit(q); assert.ok(spending(q.alloc) <= available(q));
  endSol(a); endSol(b); assert.equal(a.battery - b.battery, 4); assert.equal(b.todayLoad, 0);
  const c = quiet(), d = quiet(); d.lifeEff = 0.7; endSol(c); endSol(d); assert.ok(d.supplies < c.supplies);
  const p = quiet(); p.greenPlan = 'potato'; p.greenSince = 1; p.alloc.green = 10;
  const f = []; for (let i = 0; i < 4; i++) { const s0 = p.supplies; endSol(p); f.push(p.supplies - s0); }
  assert.ok(f[0] < f[2], `potato early ${f[0]} late ${f[2]}`);
  const storm = { date: 'x', severity: 3 };
  const e = quiet(); e.storms[0] = storm; e.alloc.shield = 0; e.alloc.science = 4; e.shelter = true; const r = endSol(e);
  assert.ok(r.blocked >= 0.3 && r.science === 4);
}
// 8. the end quiz only asks about things the player met, and marks the right answer after shuffling
{
  const { pickQuestions, QUESTIONS } = await import('./quiz.js');
  const qs = pickQuestions(['welcome', 'shelter@6'], Math.random, 3);
  assert.equal(qs.length, 3);
  for (const x of qs) {
    const src = QUESTIONS.find((y) => y.q === x.q);
    assert.ok(['always', 'shelter'].includes(src.from));
    assert.equal(x.options[x.right], src.a[0]);
  }
}
console.log('sim self-test: all passed');
