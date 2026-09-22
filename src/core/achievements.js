// Persistent achievements are independent of score, checkpoints and stage retries.
// The factory keeps persistence/run rules testable without a renderer or DOM.
import { CFG } from './config.js';

export const ACHIEVEMENT_KEY = 'gibsAchievementsV1';
export const ACHIEVEMENT_RUN_KEY = 'gibsAchievementRunV1';
const BOSSES = [
    ['tank', 'Steel Breaker', 'Defeat the Stage 4 Tank.'],
    ['locomotive', 'End of the Line', 'Destroy the hostile locomotive miniboss.'],
    ['gunship', 'Grounded', 'Destroy the Combat Gunship.'],
    ['bomber', 'Clear Skies', 'Destroy the Heavy Siege Bomber.'],
    ['warden', 'Root Access', 'Defeat the Nusantara Warden.'],
    ['mahapatih', 'End of the Mandate', 'Defeat M-0 Mahapatih.'],
];
export function achievementCatalog(tuning = CFG.achievements) {
    const milestone = (counter, targets, names, noun) => targets.map((goal, i) => ({
        id: `${counter}_${goal}`, name: names[i] || `${noun}: ${goal}`, counter, goal,
        description: `${counter === 'lootBoxes' ? 'Destroy' : 'Kill'} ${goal === 1 ? 'your first' : goal}
            ${noun.toLowerCase()}${goal === 1 ? '' : counter === 'lootBoxes' ? 'es' : 's'} across Campaign and Survival.`.replace(/\s+/g, ' '),
        group: 'Milestones', hidden: false,
    }));
    return [
        ...milestone('lootBoxes', tuning.lootBoxes, ['First Find', 'Supply Hunter', 'Salvage Expert', 'Leave No Crate Behind'], 'Loot Box'),
        ...milestone('robots', tuning.robots, ['First Contact', 'Resistance', 'Decommissioner', 'One-Person Army'], 'Robot'),
        ...BOSSES.map(([id, name, description]) => ({ id: `boss_${id}`, name, description,
            group: 'Bosses', hidden: false })),
        { id: 'campaign_deathless', name: 'Still Standing', group: 'Secrets', hidden: true,
            description: 'Complete the entire campaign from Stage 1 without dying.' },
        { id: 'campaign_untouched', name: 'Untouchable', group: 'Secrets', hidden: true,
            description: 'Complete the entire campaign from Stage 1 without taking a single hit.' },
    ];
}

export function createAchievementTracker({ storage, catalog, now = Date.now }) {
    const validIds = new Set(catalog.map(a => a.id));
    const listeners = new Set();
    let session = null, run = null, saveAvailable = true;
    const read = key => {
        let value;
        try { value = storage.getItem(key); } catch { saveAvailable = false; return null; }
        try { return JSON.parse(value); } catch { return null; }
    };
    const loaded = read(ACHIEVEMENT_KEY);
    const saved = loaded?.version === 1 ? loaded : null;
    const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
    const totals = { lootBoxes: count(saved?.totals?.lootBoxes), robots: count(saved?.totals?.robots) };
    const unlocked = {};
    if (saved?.version === 1 && saved.unlocked && typeof saved.unlocked === 'object') {
        for (const [id, date] of Object.entries(saved.unlocked))
            if (validIds.has(id) && Number.isFinite(date) && date > 0) unlocked[id] = date;
    }
    function write(key, value) {
        try { storage.setItem(key, JSON.stringify(value)); return true; }
        catch { saveAvailable = false; return false; }
    }
    function persist() { write(ACHIEVEMENT_KEY, { version: 1, totals, unlocked }); }
    function saveRun() { if (run) write(ACHIEVEMENT_RUN_KEY, { version: 1, ...run }); }
    function unlock(id) {
        if (!validIds.has(id) || unlocked[id]) return false;
        unlocked[id] = Math.max(1, now()); persist();
        for (const listener of listeners) listener(catalog.find(a => a.id === id));
        return true;
    }
    function campaignActive() { return session === 'campaign' && run && !run.finished; }
    function validRun(value, stage) {
        return value?.version === 1 && value.stage === stage
            && Number.isInteger(value.completed) && [stage - 1, stage].includes(value.completed)
            && value.fromStart === true && value.finished === false
            && ['valid', 'dead', 'hit'].every(k => typeof value[k] === 'boolean');
    }
    const api = {
        start(mode, stage = 1) {
            session = mode === 'campaign' || mode === 'survival' ? mode : null;
            run = null;
            if (session !== 'campaign') return;
            if (stage === 1) {
                run = { fromStart: true, stage: 1, completed: 0, valid: true, dead: false, hit: false, finished: false };
            } else {
                const previous = read(ACHIEVEMENT_RUN_KEY);
                run = validRun(previous, stage) ? previous : {
                    fromStart: false, stage, completed: stage - 1, valid: false, dead: false, hit: false, finished: false,
                };
            }
            saveRun();
        },
        visitStage(stage) {
            if (!campaignActive()) return;
            if (stage !== run.stage && stage !== run.completed + 1) run.valid = false;
            run.stage = stage; saveRun();
        },
        completeStage(stage) {
            if (!campaignActive() || stage === run.completed) return;
            if (stage !== run.stage || stage !== run.completed + 1 || stage >= 12) run.valid = false;
            else run.completed = stage;
            saveRun();
        },
        hit() {
            if (!campaignActive() || run.hit) return;
            run.hit = true; saveRun();
        },
        death() {
            if (!campaignActive() || run.dead) return;
            run.dead = true; run.hit = true; saveRun();
        },
        invalidate() {
            if (!campaignActive() || !run.valid) return;
            run.valid = false; saveRun();
        },
        finish() {
            if (!campaignActive()) return;
            if (run.fromStart && run.valid && run.stage === 12 && run.completed === 11) {
                if (!run.dead) unlock('campaign_deathless');
                if (!run.dead && !run.hit) unlock('campaign_untouched');
            }
            run.finished = true; saveRun();
        },
        clearRun() {
            run = null;
            try { storage.removeItem(ACHIEVEMENT_RUN_KEY); } catch { saveAvailable = false; }
        },
        record(counter) {
            if (!session || !Object.hasOwn(totals, counter)) return;
            totals[counter] = Math.min(Number.MAX_SAFE_INTEGER, totals[counter] + 1);
            for (const a of catalog)
                if (a.counter === counter && totals[counter] >= a.goal) unlock(a.id);
            persist();
        },
        boss(id) { if (session) unlock(`boss_${id}`); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        view() {
            return catalog.map(a => {
                const date = unlocked[a.id] || null;
                if (a.hidden && !date) return { id: a.id, name: 'Hidden Achievement',
                    description: 'Keep playing to discover this achievement.', group: a.group,
                    hidden: true, unlockedAt: null, progress: null, goal: null };
                return { ...a, unlockedAt: date,
                    progress: a.counter ? Math.min(a.goal, totals[a.counter]) : null, goal: a.goal || null };
            });
        },
        debug() { return { totals: { ...totals }, unlocked: { ...unlocked }, run: run ? { ...run } : null,
            session, saveAvailable }; },
    };
    return api;
}

let tracker;
function current() {
    if (!tracker) tracker = createAchievementTracker({
        // Access inside methods too: browsers can reject the localStorage getter itself.
        storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
            removeItem: key => localStorage.removeItem(key) }, catalog: achievementCatalog(),
    });
    return tracker;
}
export const startAchievementSession = (mode, stage = 1) => current().start(mode, stage);
export const recordAchievementRobotKill = () => current().record('robots');
export const recordAchievementLootBox = () => current().record('lootBoxes');
export const recordBossAchievement = id => current().boss(id);
export const recordAchievementHit = () => current().hit();
export const recordAchievementDeath = () => current().death();
export const invalidateAchievementRun = () => current().invalidate();
export const visitAchievementStage = stage => current().visitStage(stage);
export const completeAchievementStage = stage => current().completeStage(stage);
export const completeAchievementCampaign = () => current().finish();
export const clearAchievementRun = () => current().clearRun();
export const achievementView = () => current().view();
export const subscribeAchievements = listener => current().subscribe(listener);
export const achievementsDebug = () => current().debug();
