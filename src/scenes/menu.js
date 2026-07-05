// SCENE menu (DOM murni, sebelum dunia 3D dibangun): layar pilih mode
// (#modeSelect, z-index 30) + cutscene pembuka (z-index 20, khusus Survival).
// Dunia baru dibangun SETELAH mode dipilih — onPick(mode) memanggil startGame.

export function initMenu(onPick) {
    let picked = false;
    document.querySelectorAll('#modeSelect .modeCard').forEach(card => {
        card.addEventListener('click', () => {
            if (picked) return;   // jaga-jaga klik ganda
            picked = true;
            const mode = card.dataset.mode;
            document.getElementById('modeSelect').style.display = 'none';
            // Cutscene pembuka bertema Monas -> hanya untuk Survival; Campaign
            // langsung ke layar mulai (blocker) di bawahnya.
            if (mode === 'campaign') document.getElementById('cutscene').style.display = 'none';
            onPick(mode);
        });
    });

    initCutscene();
}

// Slideshow pembuka 4 slide (DOM/CSS murni — tak menyentuh state game;
// finish() hanya menyingkap blocker yang klik-nya meminta PointerLock).
function initCutscene() {
    const cutscene = document.getElementById('cutscene');
    const slides = cutscene.querySelectorAll('.slide');
    const caption = document.getElementById('cutsceneCaption');
    const nextBtn = document.getElementById('nextBtn');
    const skipBtn = document.getElementById('skipBtn');
    const dotsWrap = document.getElementById('cutsceneDots');

    const captions = [
        "Jakarta has fallen... a citizen flees from the zombies.",
        "But they are not alone — a whole horde has risen.",
        "He runs toward Monas, the last place of refuge.",
        "Facing the horde, he stops and turns around..."
    ];

    slides.forEach(() => {
        const d = document.createElement('div');
        d.className = 'dot';
        dotsWrap.appendChild(d);
    });
    const dots = dotsWrap.querySelectorAll('.dot');

    let idx = 0;
    function show(i) {
        slides.forEach((s, n) => s.classList.toggle('active', n === i));
        dots.forEach((d, n) => d.classList.toggle('on', n === i));
        caption.textContent = captions[i];
        nextBtn.textContent = (i === slides.length - 1) ? "START ⚔️" : "Next ▶";
    }

    function finish() {
        cutscene.style.display = 'none';  // blocker di bawahnya muncul -> klik untuk pointerlock
    }

    nextBtn.addEventListener('click', () => {
        if (idx < slides.length - 1) show(++idx);
        else finish();
    });
    skipBtn.addEventListener('click', finish);

    show(0);
}
