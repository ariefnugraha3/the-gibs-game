import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { achievementCatalog, createAchievementTracker, ACHIEVEMENT_KEY, ACHIEVEMENT_RUN_KEY } from '../src/core/achievements.js';

const config = JSON.parse(fs.readFileSync(new URL('../config/gameplay.json', import.meta.url), 'utf8'));
const catalog = achievementCatalog(config.achievements);
function memory() {
    const values = new Map();
    return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
const make = (storage = memory()) => createAchievementTracker({ storage, catalog, now: () => 123456789 });
function travel(t, from = 1, to = 12) {
    for (let stage = from; stage < to; stage++) { t.completeStage(stage); t.visitStage(stage + 1); }
}
const unlocked = t => Object.keys(t.debug().unlocked);
const secrets = t => unlocked(t).filter(k => k.startsWith('campaign_'));

test('all milestones unlock exactly at their target, once, across both modes and reloads', () => {
    const storage = memory(); let t = make(storage); const notices = [];
    t.start('survival'); t.subscribe(a => notices.push(a.id));
    for (const counter of ['lootBoxes', 'robots']) {
        const targets = config.achievements[counter];
        for (let n = 1; n <= Math.max(...targets); n++) {
            t.record(counter);
            for (const goal of targets) assert.equal(unlocked(t).includes(`${counter}_${goal}`), n >= goal);
        }
        t.record(counter);
    }
    assert.equal(notices.length, config.achievements.lootBoxes.length + config.achievements.robots.length);
    const before = t.debug(); t = make(storage); t.start('campaign');
    assert.deepEqual(t.debug().totals, before.totals);
    assert.deepEqual(t.debug().unlocked, before.unlocked);
    t.clearRun(); assert.deepEqual(t.debug().unlocked, before.unlocked);
});
test('each boss/miniboss unlocks independently; repeats and unknown IDs are inert', () => {
    const t = make(), notices = []; t.start('campaign'); t.subscribe(a => notices.push(a.id));
    for (const a of catalog.filter(a => a.group === 'Bosses')) {
        t.boss(a.id.slice(5)); t.boss(a.id.slice(5));
        assert.ok(unlocked(t).includes(a.id));
    }
    t.boss('not-a-boss'); assert.equal(notices.length, catalog.filter(a => a.group === 'Bosses').length);
    assert.equal(t.debug().totals.robots, 0); // Vehicles are not regular robot kills.
});
test('hidden names, requirements and progress remain concealed until earned', () => {
    const t = make();
    for (const a of t.view().filter(a => a.hidden)) {
        assert.equal(a.name, 'Hidden Achievement'); assert.equal(a.goal, null);
        assert.equal(a.progress, null); assert.doesNotMatch(a.description, /dying|hit|Stage 1/i);
    }
    t.start('campaign'); travel(t); assert.deepEqual(secrets(t), []);
    t.finish(); t.finish();
    assert.deepEqual(secrets(t).sort(), ['campaign_deathless', 'campaign_untouched']);
    assert.equal(t.view().find(a => a.id === 'campaign_untouched').name, 'Untouchable');
});
test('one hit disqualifies untouched but still allows a deathless finish after Continue', () => {
    const store = memory(); let t = make(store); t.start('campaign'); travel(t, 1, 6); t.hit();
    t = make(store); t.start('campaign', 6); travel(t, 6); t.finish();
    assert.deepEqual(secrets(t), ['campaign_deathless']);
});
test('death survives stage retry and reload; starting an entirely new campaign resets only the attempt', () => {
    const store = memory(); let t = make(store); t.start('campaign'); travel(t, 1, 4); t.death(); t.visitStage(4);
    t = make(store); t.start('campaign', 4); travel(t, 4); t.finish(); assert.deepEqual(secrets(t), []);
    t.start('campaign'); travel(t); t.finish(); assert.equal(secrets(t).length, 2);
});
test('interrupted shop resumes the prior completed stage without erasing hit history', () => {
    const store = memory(); let t = make(store); t.start('campaign'); travel(t, 1, 4);
    t.hit(); t.completeStage(4); t = make(store); t.start('campaign', 4);
    t.visitStage(4); t.completeStage(4); t.visitStage(5); travel(t, 5); t.finish();
    assert.deepEqual(secrets(t), ['campaign_deathless']);
});
test('old checkpoints, skipped stages, cheated attempts and premature finish cannot award secrets', () => {
    for (const setup of [
        t => t.start('campaign', 12),
        t => { t.start('campaign'); t.visitStage(12); },
        t => { t.start('campaign'); t.invalidate(); travel(t); },
        t => { t.start('campaign'); travel(t, 1, 11); },
    ]) { const t = make(); setup(t); t.finish(); assert.deepEqual(secrets(t), []); }
});
test('Survival leaves an existing campaign attempt and unlocked achievements intact', () => {
    const store = memory(), t = make(store); t.start('campaign'); travel(t, 1, 5); t.hit();
    t.start('survival'); t.death(); t.hit(); t.finish(); t.record('robots');
    t.start('campaign', 5); assert.equal(t.debug().run.hit, true); assert.equal(t.debug().run.dead, false);
    travel(t, 5); t.finish(); assert.deepEqual(secrets(t), ['campaign_deathless']);
});
test('bootstrap stage saves before Continue cannot mutate the saved attempt', () => {
    const store = memory(); let t = make(store); t.start('campaign'); travel(t, 1, 8); t.death();
    t = make(store); t.visitStage(1); t.start('campaign', 8);
    assert.equal(t.debug().run.valid, true); assert.equal(t.debug().run.dead, true);
});
test('malformed data and unavailable storage never crash gameplay or expose secrets', () => {
    const store = memory(); store.setItem(ACHIEVEMENT_KEY, '{bad'); store.setItem(ACHIEVEMENT_RUN_KEY, '{}');
    let t = make(store); t.start('campaign', 12); t.finish(); assert.deepEqual(secrets(t), []);
    store.setItem(ACHIEVEMENT_KEY, JSON.stringify({ version: 1, totals: { robots: -8, lootBoxes: '200' },
        unlocked: { boss_fake: 1, campaign_untouched: 'yesterday' } }));
    t = make(store); assert.deepEqual(t.debug().totals, { robots: 0, lootBoxes: 0 }); assert.deepEqual(unlocked(t), []);
    const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); }, removeItem() { throw Error('blocked'); } };
    t = make(blocked); t.start('campaign'); t.hit(); t.record('robots'); t.boss('tank'); t.clearRun();
    assert.equal(t.debug().saveAvailable, false); assert.ok(unlocked(t).includes('boss_tank'));
});
