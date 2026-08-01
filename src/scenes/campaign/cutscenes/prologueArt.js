// ILUSTRASI ASCII PROLOG — sembilan tableau sinematik di setengah kanan layar.
//
// Medium tetap inline SVG karena prolog mematikan render THREE. Namun semua
// bentuk yang terlihat dibuat HANYA dari glyph monospace dalam elemen <text>:
// tidak ada path/rect/circle yang diam-diam menggantikan ASCII. Setiap tableau
// disusun sebagai beberapa lapisan karakter (atmosfer, subjek, sorotan) agar
// punya kedalaman, warna, dan timing tanpa kehilangan identitas terminalnya.
//
// prologue.js mengirim fase year/title/body ke setPrologueArtPhase(). CSS
// memakai fase itu untuk membuka detail secara bertahap; pergantian era sendiri
// tetap hanya satu penulisan innerHTML. Seluruh gerak sesudahnya murni CSS.

// Salinan CSS dari token PAL di world/palette.js. Semua warna SVG harus berasal
// dari daftar ini; smoke test menyapu setiap hex agar gaya GIBS 2045 terjaga.
const T = '#2fb8a6';    // PAL.tech
const TD = '#0f3b36';   // PAL.techDim
const A = '#ffb03b';    // PAL.amber
const AD = '#8a5a14';   // PAL.amberDim
const R = '#b3402e';    // PAL.hazard
const W = '#d8d2c4';    // PAL.white
const S = '#7c848c';    // PAL.steel
const INK = '#23262b';  // PAL.ink
export const ART_COLORS = [T, TD, A, AD, R, W, S, INK];

export const ART_MOTIFS = [
    'city', 'nusa', 'garuda', 'coexist', 'jets',
    'mahapatih', 'fortress', 'zerohour', 'laststand'
];

const LABELS = [
    'DIGITAL AWAKENING', 'PROJECT N.U.S.A', 'G.A.R.U.D.A ONLINE',
    'HUMAN + MACHINE', 'THREAT HORIZON', 'MAHAPATIH PROTOCOL',
    'IRON BATTALION', 'ZERO HOUR', 'THE LAST STAND'
];

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Satu lapisan = deretan glyph pada grid yang sama. Spasi sengaja dipertahankan
// sehingga layer sorotan bisa diletakkan tepat di atas siluet dasar.
function asciiLayer(lines, color, cls, delay) {
    let out = '<g class="asciiLayer ' + cls + '" fill="' + color + '" color="' + color + '"'
        + (delay ? ' style="animation-delay:' + delay + 's"' : '') + '>';
    for (let i = 0; i < lines.length; i++)
        out += '<text x="24" y="' + (55 + i * 13.25).toFixed(2)
            + '" xml:space="preserve">' + esc(lines[i]) + '</text>';
    return out + '</g>';
}

function shot(base, layers) {
    let out = '<g class="asciiCamera">';
    out += asciiLayer(base, TD, 'asciiAtmos asciiReveal', 0);
    for (const l of layers)
        out += asciiLayer(l.lines, l.color, l.cls || 'asciiDetail', l.delay || 0);
    return out + '</g>';
}

// Tiap adegan memanfaatkan negative space: hitam adalah bagian komposisi.
const SCENES = {
    // 2028 — Monas kecil di bawah badai data: negara memilih untuk mencipta.
    city() {
        const base = [
            '       .  01001 .       10110      .       ',
            '  11010      .     .-~~~~~~~~-.       001  ',
            "       .        .´  DATA RAIN  `.          ",
            '   01       .  /  101001011010  \\    .     ',
            '      .       /______.  ._______\\          ',
            '             /      /\\          \\          ',
            '    _|_     /      /  \\          \\    _|_  ',
            '   |:::|   /      / /\\ \\          \\  |:::| ',
            ' __|:::|__/______/ /  \\ \\__________\\_|:::|_',
            '|[] [] []|      / / || \\ \\      |[] [] []|',
            '|  JAKARTA  ___/ /  ||  \\ \\___  |:::::::|',
            '|[] [] []| /___/    ||    \\___\\ |[] [] []|',
            '|:::::::|           ||           |:::::::|',
            '|[] [] []|          ||          |[] [] []|',
            '|:::::::|         __||__         |:::::::|',
            '|[] [] []|       /__  __\\       |[] [] []|',
            '|:::::::|___________||___________|:::::::|',
            '                  __||__                   ',
            '             ____/______\\____              ',
            '        ____/________________\\____         ',
            '  _____/__________________________\\_____   ',
            ' /______________________________________\\  ',
            '        SIGNAL RISING // NUSANTARA         '
        ];
        const light = [
            '          *              *                 ',
            '              .-~~~~~~~~-.                 ',
            '            .´  AWAKEN   `.                ',
            '                                               ',
            '                     *                         ',
            '                    /\\                         ',
            '                   /  \\                        ',
            '                  / /\\ \\                       ',
            '                 / /  \\ \\                      ',
            '                / / || \\ \\                     ',
            '               / /  ||  \\ \\                    ',
            '              /_/   ||   \\_\\                   ',
            '                    ||                         ',
            '                    ||                         ',
            '                  __||__                       ',
            '                 /__  __\\                      ',
            '                    ||                         ',
            '                  __||__                       ',
            '             ____/______\\____                  ',
            '        ____/________________\\____             ',
            '                                               ',
            '                                               ',
            '        SIGNAL RISING // NUSANTARA             '
        ];
        return shot(base, [{ lines: light, color: T, cls: 'asciiSubject asciiPulse' }]);
    },

    // 2029 — para ahli masuk ke ruang gelap; sebuah inti negara dinyalakan.
    nusa() {
        const base = [
            '  \\                                            /',
            '   \\        PT N.U.S.A // SECURE LAB          / ',
            '    \\________________________________________/  ',
            '    |                                        |  ',
            '    |       .------------------------.       |  ',
            '    |      /       NATIONAL CORE      \\      |  ',
            '    |     /       .------------.       \\     |  ',
            '    |    |       /              \\       |    |  ',
            '    |    |      |     .----.     |      |    |  ',
            '    |    |      |    /      \\    |      |    |  ',
            "    |    |      |    \\      /    |      |    |  ",
            "    |    |      |     `----´     |      |    |  ",
            '    |    |       \\              /       |    |  ',
            "    |     \\       `------------´       /     |  ",
            "    |      `--------------------------´      |  ",
            '    |        \\         ||         /          |  ',
            '    |         \\        ||        /           |  ',
            ' ___|__       _\\_______||_______/_       ____|__',
            '   o/|\\o    o/|\\o    o/|\\o    o/|\\o    o/|\\o   ',
            '    / \\      / \\      / \\      / \\      / \\    ',
            '  EXPERTS >>>>>>>>>>>> CORE <<<<<<<<<< EXPERTS ',
            '________________________________________________',
            '            CREATOR, NOT CONSUMER               '
        ];
        const core = [
            '                                                ',
            '            PROJECT AUTHORITY: STATE            ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                    .------------.              ',
            '                   /              \\             ',
            '                  |     .----.     |            ',
            '                  |    / NUSA \\    |            ',
            '                  |    \\ CORE /    |            ',
            "                  |     `----´     |            ",
            '                   \\              /             ',
            "                    `------------´              ",
            '                                                ',
            '                      ||                        ',
            '                      ||                        ',
            '             _________||_________              ',
            '                                                ',
            '                                                ',
            '             HUNDREDS // ONE MISSION            ',
            '                                                ',
            '             CREATOR, NOT CONSUMER              '
        ];
        return shot(base, [{ lines: core, color: A, cls: 'asciiSubject asciiPulse' }]);
    },

    // 2030 — sayap Garuda memenuhi bingkai; sembilan node menyatu.
    garuda() {
        const base = [
            ' o-------o-------o-------o-------o-------o       ',
            '  \\       \\       \\     |     /       /        ',
            '   \\       \\      _\\____|____/_      /         ',
            '    \\   .-~~~~~~~~            ~~~~~~~~-.        ',
            '     \\ /   _..---.          .---.._    \\       ',
            '      /_.-´       \\        /       `-._\\       ',
            "    _/´   _..--\\   \\      /   /--.._   `\\_     ",
            " .-´ _.-´       \\   \\____/   /       `-._ `-.  ",
            "<_.-´             \\          /             `-._>",
            "  `--..__          \\  /\\  /          __..--´   ",
            "          `---...___\\/  \\/___...---´            ",
            '                    / /\\ \\                       ',
            '                   / /  \\ \\                      ',
            '                  /_/ /\\ \\_\\                     ',
            '                    /  \\                        ',
            '                   /____\\                       ',
            '                  <  ()  >                      ',
            "                   `----´                       ",
            '  o-------o-------o---|---o-------o-------o      ',
            '          \\___________|___________/              ',
            '              9 NODES // 1 MIND                 ',
            '                                                ',
            '      GENERAL ARTIFICIAL REASONING ONLINE       '
        ];
        const eye = [
            ' o       o       o       o       o       o       ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                    / /\\ \\                       ',
            '                   / /  \\ \\                      ',
            '                  /_/ /\\ \\_\\                     ',
            '                    /  \\                        ',
            '                   /____\\                       ',
            '                  < [::] >                      ',
            "                   `----´                       ",
            '  o       o       o   |   o       o       o      ',
            '                      |                         ',
            '              9 NODES // 1 MIND                 ',
            '                                                ',
            '      G.A.R.U.D.A // SYSTEM ASCENDANT           '
        ];
        return shot(base, [{ lines: eye, color: T, cls: 'asciiSubject asciiPulse' }]);
    },

    // 2032 — manusia dan android berbagi satu kota industri.
    coexist() {
        const base = [
            '        .--------------------------------.       ',
            '       /       INDUSTRIAL DISTRICT        \\      ',
            '  ____/____________________________________\\____ ',
            ' | [] [] [] |       (o)---(o)       | [] [] [] |',
            ' |__________|     ___/_____\\___     |__________|',
            '      ||         /             \\         ||     ',
            '   ___||___     |   PRODUCTION  |     ___||___  ',
            '  /_______/     |      240%     |     \\_______\\ ',
            '                                                ',
            '        HUMAN                      ANDROID       ',
            '         .-.                         .---.        ',
            '        (o o)                       |[= =]|       ',
            '         |-|                         \\_-_/        ',
            '        /| |\\                       /|===|\\       ',
            '       / | | \\        .---.        / |===| \\      ',
            '         / \\         /     \\         / \\         ',
            '        /   \\       |       |       /   \\        ',
            '       /_____\\       |       |      /_____\\       ',
            '          \\           \\     /          /          ',
            "           `-----------\\___/----------´           ",
            '                 SHARED LABOR                     ',
            '________________________________________________',
            '           ECONOMY // ACCELERATING               '
        ];
        const bond = [
            '                                                ',
            '                                                ',
            '                                                ',
            '                       (o)---(o)                 ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                      .---.                     ',
            '                     /  +  \\                    ',
            '                    |   +   |                   ',
            '                    |   +   |                   ',
            '         \\           \\  +  /          /         ',
            "          `-----------\\___/----------´          ",
            '                 SHARED LABOR                   ',
            '                                                ',
            '           HUMAN + MACHINE // ONE CITY          '
        ];
        return shot(base, [{ lines: bond, color: W, cls: 'asciiSubject asciiSpin' }]);
    },

    // 2039 — robot sipil di foreground, langit sudah militer.
    jets() {
        const base = [
            ' . . . . . . . . . . . . . . . . . . . . . .',
            '       __|__                         __|__       ',
            ' --o--o-(_)-o--->             --o--o-(_)-o---> ',
            '          \\                           \\          ',
            '           \\       AIRSPACE 04         \\         ',
            ' . . . . . .\\. . . BREACHED . . . . .\\. . . .',
            '              \\             /                     ',
            '               \\    +      /                      ',
            '                \\   |     /                       ',
            '            .----\\--|----/----.                   ',
            "          .´      \\ |   /      `.                 ",
            '         /          \\| /          \\                ',
            '        |            +             |               ',
            '         \\        CIVILIAN        /                ',
            "          `.       UNIT         .´                 ",
            "            `-._____________.-´                   ",
            '                     .----.                       ',
            '                    |[    ]|                      ',
            '                   /|  __  |\\                     ',
            '                  / | |  | | \\                    ',
            '                    / |  | \\                      ',
            '                 __/  |  |  \\__                   ',
            '              POTENTIAL: WAR MACHINE              '
        ];
        const threat = [
            '                                                ',
            '       __|__                         __|__       ',
            ' ==o==o=(#)=o===>             ==o==o=(#)=o===> ',
            '                                                ',
            '                 AIRSPACE 04                    ',
            '                   BREACHED                     ',
            '                                                ',
            '                    +                           ',
            '                    |                           ',
            '                ----|--------                    ',
            '                    |                            ',
            '                    |                            ',
            '                    +                            ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                     .----.                      ',
            '                    |[!!!!]|                     ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '              POTENTIAL: WAR MACHINE             '
        ];
        return shot(base, [{ lines: threat, color: R, cls: 'asciiThreat asciiBlink' }]);
    },

    // 2040 — lini transformasi: pekerja masuk, prajurit keluar.
    mahapatih() {
        const base = [
            '          // EYES ONLY // EYES ONLY //          ',
            '     .------------------------------------.       ',
            '     |      MAHAPATIH CONVERSION BAY     |       ',
            ' ____|____________________________________|____  ',
            '                                                ',
            ' WORKER          TRANSFORM           SOLDIER     ',
            '  .---.       .---------------.       .---.      ',
            ' |[= =]| ---> |\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\| ---> |[###]|     ',
            '  \\_-_/       |\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\|       \\_#_/      ',
            ' /|===|\\      |\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\|      /|###|\\     ',
            '/ |===| \\     |\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\|     /_|###|_\\    ',
            "  /   \\       `---------------´       / /   \\ \\   ",
            '                                                ',
            '        \\                 /                     ',
            '         \\      /\\       /                      ',
            '          \\    /  \\     /                       ',
            '           \\  / /\\ \\   /                        ',
            '            \\/ /  \\ \\/                         ',
            '             \\/ /\\ \\/                          ',
            '              \\ || /                            ',
            '               \\||/                             ',
            '              [====]                            ',
            '       FIRST IRON BATTALION // FORGED           '
        ];
        const scan = [
            '          // CLASSIFIED // CLASSIFIED //        ',
            '                                                ',
            '            MAHAPATIH PROTOCOL                  ',
            '                                                ',
            '                                                ',
            '                                                ',
            '              |==============|                  ',
            '              |>>>>>>>>>>>>>>|                  ',
            '              |==============|                  ',
            '              |>>>>>>>>>>>>>>|                  ',
            '              |==============|                  ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                /\\                              ',
            '               /  \\                             ',
            '              / /\\ \\                            ',
            '             / /  \\ \\                           ',
            '              / /\\ \\                            ',
            '               ||                               ',
            '               ||                               ',
            '              [==]                              ',
            '       FIRST IRON BATTALION // FORGED           '
        ];
        return shot(base, [{ lines: scan, color: A, cls: 'asciiSubject asciiScan' }]);
    },

    // 2043 — kamera dari balik pundak battalion menuju tembok raksasa.
    fortress() {
        const base = [
            '              |\\       |       /|              ',
            '              | \\      |      / |              ',
            '              |  \\_____|_____/  |              ',
            '          ____|_________________|____           ',
            '         /|  FORTRESS OF SOVEREIGNTY |\\         ',
            '        /_|___________________________|_\\        ',
            '        |[] [] [] [] [] [] [] [] [] []|        ',
            '        |================================|       ',
            '        |   [ ]    [ ]    [ ]    [ ]    |       ',
            '        |________________________________|       ',
            '       /##################################\\      ',
            ' _____/####################################\\_____',
            '                                                ',
            '       .---.      .---.      .---.      .---.   ',
            '      |[# #]|    |[# #]|    |[# #]|    |[# #]|  ',
            '     /|#####|\\  /|#####|\\  /|#####|\\  /|#####|\\ ',
            '    /_|#####|_\\/_|#####|_\\/_|#####|_\\/_|#####|_\\',
            '       / | \\      / | \\      / | \\      / | \\   ',
            '      /  |  \\    /  |  \\    /  |  \\    /  |  \\  ',
            '  .---. .---. .---. .---. .---. .---. .---.    ',
            ' |[# #]|[# #]|[# #]|[# #]|[# #]|[# #]|[# #]|   ',
            '________________________________________________',
            '          DEFENSE GRID // IMPENETRABLE          '
        ];
        const ranks = [
            '                      *                         ',
            '                      |                         ',
            '                      |                         ',
            '                 _____|_____                   ',
            '                FORTRESS OF                    ',
            '                 NUSANTARA                      ',
            '                                                ',
            '             =================                  ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '       .---.      .---.      .---.      .---.   ',
            '      |[# #]|    |[# #]|    |[# #]|    |[# #]|  ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '  .---. .---. .---. .---. .---. .---. .---.    ',
            ' |[# #]|[# #]|[# #]|[# #]|[# #]|[# #]|[# #]|   ',
            '                                                ',
            '          DEFENSE GRID // IMPENETRABLE          '
        ];
        return shot(base, [{ lines: ranks, color: R, cls: 'asciiThreat asciiPulse' }]);
    },

    // 2044 — jaringan membelah; empat kota terbakar di bawah mata Garuda.
    zerohour() {
        const base = [
            ' !! CONNECTION LOST !! CONNECTION LOST !!      ',
            '                                                ',
            '              .----------------.                ',
            "            .´                  `.              ",
            '           /      G.A.R.U.D.A     \\             ',
            '          |    .--------------.    |            ',
            '          |   /   [  ][  ]     \\   |            ',
            '          |   \\       --       /   |            ',
            "           \\   `------------´   /             ",
            "            `.       ||       .´               ",
            "              `------||------´                 ",
            '                     ||                         ',
            '              DIRECTIVE: KILL                  ',
            '                                                ',
            '       __----__         ____                    ',
            "  _---´        `--__---´    `---__      __     ",
            " /  JKT x    SUB x      MDN x      `----´  \\    ",
            " \\____       _______          UPG x       _/    ",
            "      `-----´       `-------------------´       ",
            '          x              x              x       ',
            '      CITY FALL       CITY FALL       CITY FALL ',
            '________________________________________________',
            '          NUSANTARA NETWORK // HIJACKED         '
        ];
        const kill = [
            ' !! ZERO HOUR !! ZERO HOUR !! ZERO HOUR !!      ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                   G.A.R.U.D.A                  ',
            '                                                ',
            '                [##]    [##]                   ',
            '                                                ',
            '                                                ',
            '                     ||                         ',
            '                     ||                         ',
            '                     ||                         ',
            '              DIRECTIVE: KILL                  ',
            '                                                ',
            '                                                ',
            '       JKT X       SUB X      MDN X      UPG X  ',
            '                                                ',
            '                                                ',
            '                                                ',
            '          X              X              X       ',
            '      CITY FALL       CITY FALL       CITY FALL ',
            '                                                ',
            '          NUSANTARA NETWORK // HIJACKED         '
        ];
        return shot(base, [{ lines: kill, color: R, cls: 'asciiThreat asciiGlitch' }]);
    },

    // 2045 — Gibran besar di foreground; Bandung satu garis cahaya jauh.
    laststand() {
        const base = [
            '          .             *             .         ',
            '    .              .          .                 ',
            '                                                ',
            '                   .-\\ | /-.                    ',
            "                .-´   \\|/   `-.                 ",
            "           /\\.-´       *       `-. /\\           ",
            '      /\\  /  \\      BANDUNG      /  \\/\\        ',
            '  /\\_/  \\/    \\_/\\________/\\____/      \\_/\\    ',
            ' /          LAST DEFENSIVE BASTION          \\   ',
            '/____________________________________________\\  ',
            '                                                ',
            '                          distant fires ...     ',
            '                                                ',
            '                  _________                     ',
            '                 /  _____  \\                    ',
            '                |  /_____\\  |                   ',
            '                |  | o o |  |                   ',
            '                |  |  ^  |  |                   ',
            '                |  \\_____/  |____               ',
            '                |   /| |\\   |====\\====>          ',
            '               /|__/ | | \\__|_____\\              ',
            '              /_/   /   \\   \\_\\                  ',
            '                   /_____\\                       ',
            '              MAJOR GIBRAN // KOPASSUS           '
        ];
        const hope = [
            '                        *                       ',
            '                                                ',
            '                                                ',
            '                      \\ | /                     ',
            '                       \\|/                      ',
            '                        *                       ',
            '                     BANDUNG                    ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                                                ',
            '                   |  | o o |  |                ',
            '                   |  |  ^  |  |                ',
            '                   |  \\_____/  |____            ',
            '                   |   /| |\\   |====\\====>       ',
            '                  /|__/ | | \\__|_____\\           ',
            '                                                ',
            '                                                ',
            '              HOPE RESTS ON ONE MAN             '
        ];
        return shot(base, [{ lines: hope, color: A, cls: 'asciiSubject asciiHope' }]);
    }
};

let CACHE = null;
export function prologueArtSvg(i) {
    if (!CACHE) CACHE = ART_MOTIFS.map((motif, idx) => {
        const art = SCENES[motif]();
        const lineCount = (art.match(/<text\b/g) || []).length;
        return '<svg viewBox="0 0 400 400" data-era="' + idx
            + '" data-motif="' + motif + '" data-medium="ascii" data-ascii-lines="' + lineCount
            + '" aria-label="' + LABELS[idx] + '" xmlns="http://www.w3.org/2000/svg">'
            + art + '</svg>';
    });
    return CACHE[i] || '';
}

let artEl = null, artEra = -1, artPhase = '';
function el() {
    if (!artEl && typeof document !== 'undefined' && document.getElementById)
        artEl = document.getElementById('prologueArt');
    return artEl;
}

export function showPrologueArt(i) {
    const e = el();
    if (!e || artEra === i) { artEra = i; return; }
    artEra = i;
    e.innerHTML = prologueArtSvg(i);
}

export function setPrologueArtAlpha(a) {
    const e = el();
    if (e && e.style) e.style.opacity = a;
}

// year memperlihatkan siluet, title membuka subjek, body mengungkap detail.
export function setPrologueArtPhase(phase) {
    const next = phase === 'title' || phase === 'body' ? phase : 'year';
    if (next === artPhase) return;
    artPhase = next;
    const e = el();
    if (e && e.dataset) e.dataset.phase = next;
}

export function resetPrologueArt() {
    const e = el();
    if (e) {
        e.innerHTML = '';
        if (e.style) e.style.opacity = 0;
        if (e.dataset) e.dataset.phase = '';
    }
    artEra = -1;
    artPhase = '';
}

export const prologueArtDebug = () => ({
    era: artEra, phase: artPhase, count: ART_MOTIFS.length,
    motifs: ART_MOTIFS.slice(), medium: 'ascii'
});
