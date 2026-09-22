import { CFG } from './config.js';
import { achievementView, achievementsDebug, subscribeAchievements } from './achievements.js';

const el = id => document.getElementById(id);
let subscribed = false, queue = [], timer = null;
export function initAchievementUI() {
    if (subscribed) return;
    subscribed = true;
    subscribeAchievements(achievement => {
        queue.push(achievement);
        if (!timer) nextToast();
    });
}
function nextToast() {
    const a = queue.shift(), toast = el('achievementToast');
    if (!a) { toast.classList.remove('visible'); timer = null; return; }
    el('achievementToastName').textContent = a.name;
    el('achievementToastDescription').textContent = a.description;
    toast.classList.add('visible');
    timer = setTimeout(nextToast, CFG.achievements.toastSec * 1000);
}
export function renderAchievements() {
    const items = achievementView(), body = el('achievementsBody');
    body.replaceChildren();
    el('achievementsSummary').textContent = `${items.filter(a => a.unlockedAt).length} / ${items.length} unlocked`;
    el('achievementsStorage').textContent = achievementsDebug().saveAvailable
        ? 'Progress is saved in this browser. Milestones count across Campaign and Survival.'
        : 'Progress cannot be saved in this browser right now.';
    for (const a of items) {
        const row = document.createElement('article');
        row.className = 'achievementRow' + (a.unlockedAt ? ' unlocked' : '');
        const title = document.createElement('h4'); title.textContent = a.name;
        const description = document.createElement('p'); description.textContent = a.description;
        const status = document.createElement('span'); status.className = 'achievementStatus';
        status.textContent = a.unlockedAt ? 'UNLOCKED' : 'LOCKED';
        row.appendChild(title); row.appendChild(status); row.appendChild(description);
        if (a.goal) {
            const progress = document.createElement('progress'); progress.max = a.goal;
            progress.value = a.progress; progress.setAttribute('aria-label', `${a.name}: ${a.progress} of ${a.goal}`);
            const value = document.createElement('span'); value.className = 'achievementCount';
            value.textContent = `${a.progress} / ${a.goal}`;
            row.appendChild(progress); row.appendChild(value);
        }
        body.appendChild(row);
    }
}
