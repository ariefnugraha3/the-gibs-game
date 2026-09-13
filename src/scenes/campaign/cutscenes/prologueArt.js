// ASCII film stills. One fixed grid owns both silhouettes and lighting.
// Every visible mark is a text glyph; typography never controls placement.
import { PAL } from '../../../world/palette.js';
const hex = n => '#' + n.toString(16).padStart(6, '0');
export const ART_COLORS = ['tech','techDim','amber','amberDim','hazard','white','steel','ink'].map(k => hex(PAL[k]));
export const ART_MOTIFS = ['city','nusa','garuda','coexist','jets','mahapatih','fortress','zerohour','laststand'];
export const ART_GRID = Object.freeze({ columns:76, rows:46, x:19.5, y:38, cellWidth:4.75, cellHeight:7.15, fontSize:8 });
const INKS = {
    shadow:[PAL.ink,'asciiAtmos'], distant:[PAL.steel,'asciiDistant'],
    surface:[PAL.steel,'asciiSubject'], light:[PAL.white,'asciiLight'],
    signal:[PAL.tech,'asciiAccent'], warm:[PAL.amber,'asciiAccent'],
    ember:[PAL.amberDim,'asciiDistant'], threat:[PAL.hazard,'asciiAccent'],
};
const SHOTS = [
    ['Monas before dawn, Jakarta waking around it',1.045,-2,1],
    ['Researchers beneath the national computing core',1.055,0,-3],
    ['G.A.R.U.D.A, a winged intelligence coming online',1.04,0,1],
    ['A technician and an android at the same workbench',1.035,-2,0],
    ['Strike aircraft crossing above a sleeping city',1.045,-4,2],
    ['A restrained combat chassis inside the conversion bay',1.065,0,1],
    ['The Iron Battalion beneath the fortress gates',1.045,0,-2],
    ['A machine watches over the burning capital',1.06,-2,0],
    ['Gibran overlooking the last lights of Bandung',1.04,2,-1],
];
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function drawing() {
    const cells=Array.from({length:ART_GRID.rows},()=>Array(ART_GRID.columns).fill(null));
    const put=(x,y,glyph,ink='surface')=>{
        x=Math.round(x);y=Math.round(y);
        if(x>=0&&x<ART_GRID.columns&&y>=0&&y<ART_GRID.rows) cells[y][x]=glyph===' '?null:{glyph,ink};
    };
    const line=(x0,y0,x1,y1,glyph='-',ink='surface')=>{
        const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0),1);
        for(let i=0;i<=steps;i++)put(x0+(x1-x0)*i/steps,y0+(y1-y0)*i/steps,glyph,ink);
    };
    const fill=(x,y,w,h,glyph=':',ink='shadow')=>{
        for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)put(col,row,glyph,ink);
    };
    const stamp=(x,y,art,ink='surface',solid=false)=>{
        const lines=art.replace(/^\n/,'').replace(/\n$/,'').split('\n');
        const width=Math.max(...lines.map(row=>row.length));
        lines.forEach((row,dy)=>[...(solid?row.padEnd(width):row)].forEach((ch,dx)=>{if(ch!==' '||solid)put(x+dx,y+dy,ch,ink);}));
    };
    const frame=(x,y,w,h,ink='surface')=>{
        fill(x,y,w,h,' ');line(x,y,x+w-1,y,'_',ink);line(x,y+h-1,x+w-1,y+h-1,'_',ink);
        line(x,y+1,x,y+h-1,'|',ink);line(x+w-1,y+1,x+w-1,y+h-1,'|',ink);
    };
    return {cells,put,line,fill,stamp,frame};
}
function cityBlock(d,x,top,w,bottom,lit=true,ink='distant') {
    d.frame(x,top,w,bottom-top+1,ink);d.line(x+w-3,top+1,x+w-3,bottom-1,'|','shadow');
    for(let y=top+3;y<bottom;y+=3)for(let c=x+2;c<x+w-3;c+=3)
        d.put(c,y,(c+y)%4?':':'=',lit&&(c+3*y)%7===0?'warm':'shadow');
    d.line(x+2,top-2,x+2,top,'|',ink);
}
function skyline(d,bottom=32,lit=true) {
    for(const [x,top,w] of [[0,23,10],[11,17,9],[21,25,8],[30,21,7],[48,23,10],[59,15,9],[69,22,7]])
        cityBlock(d,x,top+bottom-32,w,bottom,lit);
}
function hall(d) {
    d.line(1,2,24,14,'\\','distant');d.line(74,2,51,14,'/','distant');
    d.line(1,42,24,29,'/','distant');d.line(74,42,51,29,'\\','distant');d.frame(24,13,28,18,'shadow');
    for(const x of [4,15,27,49,61,72])d.line(x,44,38,29,x<38?'/':'\\','shadow');
    for(const x of [3,12,63,72])d.line(x,9,x,35,'|','distant');
    for(const y of [35,40,45])d.line(1,y,74,y,'_','shadow');
}
const ANDROID=String.raw`
     _______
    /_______\
    |[_____]|
    | :___: |
     \_____/
   ___|___|___
  /|  |:::|  |\
 /:|__|:::|__|:\
 |:|  |===|  |:|
 |:|__|___|__|:|
 |_/ /|___|\ \_|
    |:|   |:|
    |:|   |:|
   _|_|   |_|_
  /___|   |___\
`;
const SCENES={
    city(d) {
        for(let y=3;y<21;y+=4)for(let x=4;x<73;x+=11)if((x+y)%3)d.put(x+y%3,y,',','shadow');
        skyline(d,34);
        d.stamp(32,8,String.raw`
       ,
      /|
      \|
     _||_
     |==|
      ||
      ||
      ||
      ||
      ||
      ||
      ||
      ||
      ||
      ||
      ||
      ||
     _||_
    /____\
 ___|____|___
/____________\
`,'light',true);
        d.put(38,9,'*','warm');d.line(32,29,10,44,'/');d.line(46,29,69,44,'\\');d.line(38,31,36,45,':','warm');
        for(const y of [37,40,44])d.line(28-(y-37)*2,y,50+(y-37)*2,y,'_','shadow');
        cityBlock(d,0,28,9,45,false,'surface');cityBlock(d,67,25,9,45,false,'surface');
    },
    nusa(d) {
        hall(d);
        for(const x of [6,16,57,67]){d.frame(x,15,7,16,'distant');for(let y=18;y<29;y+=3)d.stamp(x+2,y,'[=]',y%2?'shadow':'signal');}
        d.frame(27,7,23,25);d.frame(30,10,17,19,'light');d.stamp(33,8,'N.U.S.A','signal');
        d.stamp(33,13,String.raw`
  .----.
 / .--. \
| /::::\ |
| |:[]:| |
| \::::/ |
 \ '--' /
  '----'
`,'signal');
        d.line(34,22,34,27,'|');d.line(42,22,42,27,'|');d.stamp(31,30,String.raw`_______|_______
\_____________/`,'light');
        d.stamp(14,31,String.raw`
  ___
 /___\
 |   |
 _\_/_
/|:::|\
| |:| |
  | |
 _| |_
`,'surface',true);
        d.stamp(53,34,String.raw`
  __
 /__\
 |__|
/|::|\
 |::|
 /  \
/_  _\
`,'distant',true);
    },
    garuda(d) {
        for(const x of [8,20,32,44,56,68]){d.put(x,6,'+','distant');d.line(x,7,38,32,'.','shadow');}
        d.stamp(5,13,String.raw`
.___                                                     ___.
 \  '---.___                                   ___.---'  /
  \::..     '---.___                     ___.---'     ..::/
   \::::::..       '---.___       ___.---'       ..::::::/
    \---.::::::..         \_____/         ..::::::.---/
     \   '---.::::::..     |:::|     ..::::::.---'   /
      \__.    '---.:::::.__|:::|__.:::::.---'    .__/
          '--.__   '---. /  ___  \ .---'   __.--'
                '--.___/  /   \  \___.--'
                      |  |   _>  |
                       \  \_/   /
                        \ :|: /
                         \:|:/
                         /:|:\
                        /::|::\
                       /___|___\
`,'light');
        d.put(37,22,'=','signal');
        for(let x=9;x<70;x+=7){d.put(x,40,'o','signal');d.line(x,39,38,32,'.','shadow');}
        d.stamp(31,35,'G.A.R.U.D.A','signal');
    },
    coexist(d) {
        d.frame(4,5,68,15,'shadow');for(const x of [15,29,43,57])d.line(x,6,x,18,'|','distant');d.line(4,12,70,12,'_','shadow');
        d.stamp(9,18,String.raw`
     ______
    /______\
    |      |
     \____/
    __|__|__
   /::|  |::\
  /:::|  |:::\
  |:::|__|:::|
  |:::|  |:::|__
  |___|  |___|__>
    | |__| |
    |:|  |:|
    |:|  |:|
   _|_|  |_|_
`,'surface',true);
        d.stamp(49,18,ANDROID,'light',true);d.stamp(54,20,'[===]','signal');
        d.line(22,27,32,30,'\\','light');d.line(51,27,44,30,'/','light');
        d.stamp(29,29,String.raw`
     __||__
 ___/______\___
/_______________\
|_______________|
 |             |
 |             |
_|_____________|_
`,'surface',true);d.stamp(34,30,'[::]','warm');
        for(const x of [4,22,40,58,74])d.line(x,44,38,35,x<38?'/':'\\','shadow');
    },
    jets(d) {
        skyline(d,44,false);d.line(2,1,22,21,'/','shadow');d.line(8,1,27,21,'/','shadow');d.line(64,1,54,13,'\\','shadow');
        for(const [x,y] of [[4,7],[56,3]])d.stamp(x,y,String.raw`
    |
 ___|___
--\___/--
   / \
`,'distant');
        d.stamp(17,10,String.raw`
                    /\
                   /::\
                  /::::\
                  |:[]:|
                  |::::|
                 /|::::|\
              __/ |::::| \__
          ___/::::|::::|::::\___
      ___/::::::::|::::|::::::::\___
  ___/____________|::::|____________\___
 /_________  _____|::::|_____  _________\
           |/     |::::|     \|
                  |::::|
                 /|::::|\
                /_|::::|_\
               /__|____|__\
                  :    :
`,'surface',true);d.stamp(36,13,'[]','light');d.put(35,26,':','threat');d.put(40,26,':','threat');
    },
    mahapatih(d) {
        hall(d);d.frame(21,4,34,37,'distant');for(const x of [25,50])d.line(x,7,x,37,'|','light');
        d.stamp(30,12,ANDROID,'surface',true);d.stamp(35,14,'[===]','threat');
        for(const y of [18,23]){d.line(25,y,30,y,'=','light');d.line(47,y,50,y,'=','light');}
        for(const x of [32,38,44])d.line(x,5,x,11,'|','distant');
        d.stamp(32,29,'|:::::::::::|\n|___________|','shadow');d.line(27,34,49,34,'_','light');
        d.stamp(7,22,' ________\n|:: :: ::|\n|________|\n| [OFF]  |\n|________|','distant');
        d.stamp(60,24,' ____\n|====|\n|::::|\n|____|','ember');d.line(38,39,38,44,':','threat');
    },
    fortress(d) {
        d.line(0,20,23,12,'_','distant');d.line(52,12,75,20,'_','distant');
        d.frame(4,16,19,18,'distant');d.frame(53,16,19,18,'distant');d.frame(23,10,30,26);d.frame(28,16,20,20,'light');
        d.fill(30,18,16,17,':','shadow');d.line(38,18,38,34,'|');d.stamp(33,11,String.raw` _/\_
 \||/
  \/`,'light');
        for(const x of [8,17,58,67]){d.line(x,19,x,31,'|','shadow');d.put(x,22,'=','threat');}
        for(let y=33;y<41;y+=3)for(let x=13-(y-33);x<66;x+=9)d.stamp(x,y,String.raw`[=]
/|\
`,'distant');
        for(const x of [2,29,56])d.stamp(x,39,String.raw`
    _____
   /_____\
   |[===]|
 ___\___/___
/:::|:::|:::\
|:::|:::|:::|
|___|___|___|
`,'surface',true);
    },
    zerohour(d) {
        skyline(d,41,false);
        for(const [x,y] of [[9,16],[24,26],[4,33]]){d.stamp(x,y,String.raw`  .
 ;|;
/:|\
:::::`,'ember');d.put(x+2,y+1,'*','threat');}
        d.stamp(32,5,String.raw`
          ______________
       __/______________\__
      /:::::|::::::|:::::::\
     /::::::|::::::|::::::::\
    /_______|______|_________\
    |  ___________________  |
    | /___________________\ |
    ||:::::::|   |:::::::::||
    ||_______|   |_________||
    |\______     _________/|
    |::::::| |   | |:::::::|
    |::::::| |___| |:::::::|
    |::::::|_______|:::::::|
     \::::/_______\::::::/
      \::|_________|::::/
       \_|_________|___/
          |:::::::|
       ___|:::::::|___
   ___/___|_______|___\___
 _/::::::::|::::|:::::::::\_
/::::::::::|::::|:::::::::::\
|::::::::::|::::|:::::::::::|
|__________|____|___________|
`,'surface',true);d.stamp(38,12,'=======','threat');d.stamp(50,12,'=========','threat');
        for(let x=2;x<74;x+=5)d.put(x,44,x%3?'_':'.','shadow');
    },
    laststand(d) {
        const ridge=[[0,20],[9,15],[15,18],[26,10],[36,16],[43,13],[56,21],[64,17],[75,22]];
        for(let i=1;i<ridge.length;i++)d.line(...ridge[i-1],...ridge[i],ridge[i][1]<ridge[i-1][1]?'/':'\\','distant');
        d.line(0,25,75,25,'_','shadow');for(const x of [40,45,51,56,61,68]){d.stamp(x,23,'_\n|','distant');d.put(x,25,'=','warm');}
        d.stamp(12,23,String.raw`
          __...__
        .'/______'.
        | /////// |_
         \   _   .-'
          |  _) /
          \___/|
        ___/|  |__
     .-':::/|  |::'-.
    /:::::/ |__|:::::\
   /:::::/  / /|::::::|
   |::::|__/ / |::::::|       __
   |::::|// /__|::::::|______/__]===||
   |::::|__/:::|:::::/_=====/
   \___/:::::::|___/      /
     |::::::::::::|______/
     |:::::/\:::::|
     |::::/  \::::|
     |:::/    |:::|
    _|::|     |:::|
   /____|     |:::|_
              \_____\
`,'surface',true);
        // A small warm rim catches the beret and fabric; the face stays human,
        // in profile, rather than inheriting the android's square visor.
        for (let y=23;y<44;y++) {
            const row=d.cells[y];
            const x=row.findIndex((c,i)=>i>=12&&i<48&&c?.ink==='surface');
            if(x>=0)row[x].ink='light';
        }
        d.stamp(35,30,String.raw`\
 \
  \
`,'warm');d.line(0,45,75,45,'_','shadow');
        for(const [x,y] of [[54,4],[19,6],[68,9]])d.put(x,y,'.','distant');
    },
};
function renderDrawing(d) {
    let out='<g class="asciiCamera">';
    for(const [ink,[fill,cls]] of Object.entries(INKS)){
        out+=`<g class="asciiLayer ${cls}" fill="${hex(fill)}">`;
        for(let row=0;row<ART_GRID.rows;row++){
            const xs=[],glyphs=[];
            d.cells[row].forEach((cell,col)=>{if(cell&&cell.ink===ink){
                xs.push((ART_GRID.x+col*ART_GRID.cellWidth).toFixed(2));glyphs.push(cell.glyph);
            }});
            if(glyphs.length)out+=`<text x="${xs.join(' ')}" y="${(ART_GRID.y+row*ART_GRID.cellHeight).toFixed(2)}">${esc(glyphs.join(''))}</text>`;
        }
        out+='</g>';
    }
    return out+'</g>';
}
const CACHE=new Map();
export function prologueArtSvg(i) {
    if(!ART_MOTIFS[i])return '';
    if(!CACHE.has(i)){
        const d=drawing();SCENES[ART_MOTIFS[i]](d);
        const art=renderDrawing(d),lines=(art.match(/<text\b/g)||[]).length;
        CACHE.set(i,`<svg viewBox="0 0 400 400" data-era="${i}" data-motif="${ART_MOTIFS[i]}" data-medium="ascii" data-ascii-lines="${lines}" role="img" aria-label="${SHOTS[i][0]}" xmlns="http://www.w3.org/2000/svg">${art}</svg>`);
    }
    return CACHE.get(i);
}
let artEl = null, cameraEl = null, artEra = -1, artPhase = '', artProgress = -1;
function el() {
    if (!artEl && typeof document !== 'undefined') artEl = document.getElementById('prologueArt');
    return artEl;
}
export function showPrologueArt(i) {
    const e = el();
    if (!e || artEra === i) return;
    artEra = i; artProgress = -1;
    e.innerHTML = prologueArtSvg(i);
    cameraEl = e.querySelector('.asciiCamera');
}
export function setPrologueArtAlpha(a) {
    const e = el();
    if (e) e.style.opacity = a;
}
export function setPrologueArtPhase(phase) {
    const next = phase === 'title' || phase === 'body' ? phase : 'year';
    if (next === artPhase) return;
    artPhase = next;
    const e = el();
    if (e) e.dataset.phase = next;
}
// One slow push, following the story clock and click skips. Every ink layer
// moves together. Reduced-motion CSS disables this transform completely.
export function setPrologueArtProgress(progress) {
    const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    if (artProgress === p) return;
    artProgress = p;
    const shot = SHOTS[artEra];
    if (!cameraEl || !shot) return;
    const ease = p * p * (3 - 2 * p);
    const x = (shot[2] * ease).toFixed(3), y = (shot[3] * ease).toFixed(3);
    const scale = (1 + (shot[1] - 1) * ease).toFixed(5);
    cameraEl.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
export function resetPrologueArt() {
    const e = el();
    if (e) { e.innerHTML = ''; e.style.opacity = 0; e.dataset.phase = ''; }
    cameraEl = null; artEra = -1; artPhase = ''; artProgress = -1;
}
export const prologueArtDebug = () => ({
    era: artEra, phase: artPhase, count: ART_MOTIFS.length,
    motifs: ART_MOTIFS.slice(), medium: 'ascii', progress: artProgress,
    grid: ART_GRID, font: 'Prologue ASCII', cameraTransform: cameraEl?.style.transform || '',
});
