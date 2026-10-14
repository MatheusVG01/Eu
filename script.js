/* ============================================================================
 *  NEON PULSE — Jogo de Ritmo  (arquivo único: script.js)
 *  ---------------------------------------------------------------------------
 *  COMO USAR NA SUA PÁGINA PESSOAL:
 *
 *    <div id="rhythm-game"></div>
 *    <script src="script.js"></script>
 *
 *  Se a div não existir, o jogo é anexado ao <body> automaticamente.
 *  Também é possível montar manualmente:  RhythmGame.mount('#meu-container')
 *
 *  Sem dependências. Sem imagens. Sem áudio externo (a música é sintetizada
 *  em tempo real com a Web Audio API, perfeitamente sincronizada às notas).
 *
 *  Teclas: D F J K  (ou setas  ← ↓ ↑ →)   |   ESC/P = pausar   |   Toque = mobile
 * ==========================================================================*/
(function () {
  'use strict';

  /* ------------------------------------------------------------------ utils */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('np_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('np_' + k, JSON.stringify(v)); } catch (e) { } }
  };

  /* ---------------------------------------------------------------- músicas */
  const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];
  const SONGS = [
    {
      id: 'neon', name: 'Neon Pulse', artist: 'SYNTHCORE', bpm: 128, dur: 76, seed: 1337,
      key: 57, scale: SCALE_MINOR, prog: [0, 0, -4, -4, 3, 3, -2, -2],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: 2, hatAcc: 4,
      leadDen: 0.45, color: '#22d3ee', color2: '#a855f7', tag: 'SYNTHWAVE'
    },
    {
      id: 'rain', name: 'Cyber Rain', artist: 'NULL//VOID', bpm: 152, dur: 72, seed: 90210,
      key: 55, scale: SCALE_MINOR, prog: [0, 0, 5, 5, -4, -4, -2, -2],
      kick: 'x.......x.x.....', snare: '....x.......x...', hat: 1, hatAcc: 2,
      leadDen: 0.55, color: '#34d399', color2: '#38bdf8', tag: 'DRUM & BASS'
    },
    {
      id: 'star', name: 'Starlight Drive', artist: 'LUNA FM', bpm: 108, dur: 70, seed: 7777,
      key: 60, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 0, -3, -3, -5, -5, -7, -7],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: 2, hatAcc: 4,
      leadDen: 0.38, color: '#f472b6', color2: '#fbbf24', tag: 'CHILL POP'
    }
  ];

  const DIFFS = [
    { id: 'easy', name: 'Fácil', stars: 2, on: 0.50, off: 0.10, six: 0.00, jump: 0.00, speed: 0.80, color: '#4ade80' },
    { id: 'normal', name: 'Normal', stars: 4, on: 0.78, off: 0.32, six: 0.05, jump: 0.08, speed: 1.00, color: '#facc15' },
    { id: 'hard', name: 'Difícil', stars: 7, on: 0.92, off: 0.58, six: 0.22, jump: 0.22, speed: 1.22, color: '#fb7185' },
    { id: 'insane', name: 'Insano', stars: 10, on: 0.98, off: 0.78, six: 0.42, jump: 0.34, speed: 1.45, color: '#c084fc' }
  ];

  const LANE_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24'];
  const KEYMAP = { d: 0, f: 1, j: 2, k: 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3, s: 0, g: 1, h: 2, l: 3 };
  const KEY_LABELS = ['D', 'F', 'J', 'K'];

  const W_PERFECT = 0.045, W_GREAT = 0.090, W_GOOD = 0.140, W_MISS = 0.180;

  /* ------------------------------------------------------------------ áudio */
  const Audio2 = {
    ctx: null, master: null, noise: null, delay: null, ready: false, musicGain: null, sfxGain: null,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.85;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.9; this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.55; this.sfxGain.connect(this.master);
      // delay (ambiência do lead)
      this.delay = this.ctx.createDelay(1.0); this.delay.delayTime.value = 0.28;
      const fb = this.ctx.createGain(); fb.gain.value = 0.32;
      const dw = this.ctx.createGain(); dw.gain.value = 0.28;
      this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(dw); dw.connect(this.musicGain);
      // ruído
      const len = this.ctx.sampleRate * 1.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.ready = true;
    },
    now() { return this.ctx ? this.ctx.currentTime : 0; },
    env(t, a, dur, peak, dest) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(dest || this.musicGain);
      return g;
    },
    kick(t, v) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(165, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      const g = this.env(t, 0.004, 0.32, 1.0 * (v || 1));
      o.connect(g); o.start(t); o.stop(t + 0.35);
    },
    snare(t, v) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      const g = this.env(t, 0.003, 0.19, 0.5 * (v || 1));
      s.connect(hp); hp.connect(g); s.start(t); s.stop(t + 0.22);
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(190, t);
      const g2 = this.env(t, 0.003, 0.12, 0.28 * (v || 1));
      o.connect(g2); o.start(t); o.stop(t + 0.14);
    },
    hat(t, v) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      s.playbackRate.value = 1.6;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
      const g = this.env(t, 0.002, 0.05 + (v > 1 ? 0.05 : 0), 0.13 * (v || 1));
      s.connect(hp); hp.connect(g); s.start(t); s.stop(t + 0.14);
    },
    bass(t, note, dur) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(note);
      const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = midi(note) * 0.5;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
      f.Q.value = 7;
      const g = this.env(t, 0.008, dur, 0.34);
      o.connect(f); o2.connect(f); f.connect(g);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },
    lead(t, note, dur) {
      const g = this.env(t, 0.012, dur, 0.17);
      g.connect(this.delay);
      [0, 7].forEach((det, i) => {
        const o = this.ctx.createOscillator();
        o.type = i ? 'triangle' : 'sawtooth';
        o.frequency.value = midi(note) * Math.pow(2, det / 1200);
        o.connect(g); o.start(t); o.stop(t + dur + 0.05);
      });
    },
    pad(t, note, dur) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.musicGain);
      [0, 3, 7].forEach((iv) => {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = midi(note + iv);
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
        o.connect(f); f.connect(g); o.start(t); o.stop(t + dur + 0.1);
      });
    },
    hitSfx(kind) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 2.2;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'bandpass';
      hp.frequency.value = kind === 'perfect' ? 3600 : kind === 'great' ? 2600 : 1700; hp.Q.value = 1.2;
      const g = this.env(t, 0.001, 0.055, kind === 'perfect' ? 0.5 : 0.36, this.sfxGain);
      s.connect(hp); hp.connect(g); s.start(t); s.stop(t + 0.08);
    },
    missSfx() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
      const g = this.env(t, 0.004, 0.18, 0.18, this.sfxGain);
      o.connect(g); o.start(t); o.stop(t + 0.2);
    },
    ui(freq) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const g = this.env(t, 0.004, 0.11, 0.2, this.sfxGain);
      o.connect(g); o.start(t); o.stop(t + 0.14);
    }
  };

  /* ------------------------------------------------- gerador de chart/música */
  function buildChart(song, diff) {
    const spb = 60 / song.bpm, stepDur = spb / 4;
    const totalSteps = Math.floor(song.dur / stepDur);
    const rngN = mulberry32(song.seed + diff.id.length * 7919 + diff.stars * 131);
    const rngM = mulberry32(song.seed * 3 + 11);
    const notes = [], music = [];
    const introSteps = 32;               // 2 compassos de introdução
    const outroSteps = totalSteps - 24;
    let lastLane = 1, lastStep = -99;

    for (let s = 0; s < totalSteps; s++) {
      const t = s * stepDur;
      const inBar = s % 16;
      const bar = Math.floor(s / 16);
      const root = song.key + song.prog[bar % song.prog.length];

      /* ---- música ---- */
      const ev = { t: t };
      if (song.kick[inBar] === 'x') ev.kick = 1;
      if (song.snare[inBar] === 'x' && s >= 16) ev.snare = 1;
      if (s % song.hat === 0 && s >= 8) ev.hat = (s % song.hatAcc === 0) ? 1.25 : 0.8;
      if (inBar % 2 === 0 && s >= 16) ev.bass = root - 24 + (inBar % 8 === 6 ? 7 : 0);
      if (inBar === 0) ev.pad = root - 12;
      if (s >= introSteps - 16 && s % 2 === 0 && rngM() < song.leadDen) {
        const deg = song.scale[Math.floor(rngM() * song.scale.length)];
        const oct = rngM() < 0.3 ? 12 : 0;
        ev.lead = root + deg + oct;
      }
      music.push(ev);

      /* ---- notas ---- */
      if (s < introSteps || s > outroSteps) continue;
      let chance = (s % 4 === 0) ? diff.on : (s % 2 === 0) ? diff.off : diff.six;
      if (s % 16 === 0) chance = Math.min(1, chance + 0.15);
      if (bar % 8 === 7) chance *= 0.55;                       // respiro
      if (s < introSteps + 32) chance *= 0.6;                  // começo mais leve
      if (rngN() >= chance) continue;

      let lane;
      const stream = (s - lastStep) <= 1;
      if (stream) {
        const dir = rngN() < 0.5 ? -1 : 1;
        lane = clamp(lastLane + dir, 0, 3);
        if (lane === lastLane) lane = clamp(lastLane - dir, 0, 3);
      } else {
        do { lane = Math.floor(rngN() * 4); } while (lane === lastLane && rngN() < 0.72);
      }
      notes.push(mkNote(t, lane));
      // acorde duplo nos tempos fortes
      if (s % 8 === 0 && rngN() < diff.jump) {
        const pair = lane <= 1 ? (lane === 0 ? 3 : 2) : (lane === 3 ? 0 : 1);
        notes.push(mkNote(t, pair));
      }
      lastLane = lane; lastStep = s;
    }
    notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
    return { notes, music, stepDur, spb, duration: song.dur, bpm: song.bpm };
  }
  function mkNote(t, lane) { return { t: t, lane: lane, judged: false, hit: false }; }

  /* -------------------------------------------------------------------- CSS */
  const CSS = `
.np-root{position:relative;width:100%;max-width:1000px;margin:0 auto;aspect-ratio:16/10;min-height:460px;
  border-radius:18px;overflow:hidden;background:#05060f;color:#e5e7eb;
  font-family:'Orbitron',ui-sans-serif,system-ui,'Segoe UI',sans-serif;
  box-shadow:0 24px 70px -20px rgba(34,211,238,.35),0 0 0 1px rgba(148,163,184,.18);user-select:none;-webkit-user-select:none;touch-action:manipulation}
@media(max-width:640px){.np-root{aspect-ratio:3/4;min-height:520px}}
.np-root *{box-sizing:border-box}
.np-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.np-layer{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:18px;gap:14px;background:radial-gradient(90% 90% at 50% 0%,rgba(13,16,38,.92),rgba(5,6,15,.97));
  backdrop-filter:blur(6px);overflow:auto;z-index:5;animation:npFade .25s ease}
.np-layer.np-hide{display:none}
@keyframes npFade{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
.np-title{font-size:clamp(26px,5.2vw,48px);font-weight:900;letter-spacing:.14em;line-height:1;text-align:center;
  background:linear-gradient(90deg,#22d3ee,#a855f7 55%,#f472b6);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 16px rgba(168,85,247,.5))}
.np-sub{font-size:11px;letter-spacing:.35em;color:#64748b;text-transform:uppercase;text-align:center}
.np-songs{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;width:100%;max-width:720px}
.np-card{position:relative;text-align:left;padding:12px 14px;border-radius:12px;cursor:pointer;color:#cbd5e1;
  background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.16);transition:.18s;overflow:hidden}
.np-card:hover{transform:translateY(-2px);border-color:rgba(34,211,238,.5);background:rgba(34,211,238,.09)}
.np-card.np-on{border-color:var(--c,#22d3ee);background:linear-gradient(135deg,rgba(34,211,238,.18),rgba(168,85,247,.14));
  box-shadow:0 0 0 1px var(--c,#22d3ee),0 10px 28px -12px var(--c,#22d3ee)}
.np-card b{display:block;font-size:15px;color:#f1f5f9;letter-spacing:.06em}
.np-card span{font-size:10px;letter-spacing:.18em;color:#7c8aa3;text-transform:uppercase}
.np-card i{position:absolute;top:10px;right:12px;font-style:normal;font-size:9px;letter-spacing:.16em;color:#94a3b8}
.np-best{margin-top:6px;font-size:10px;letter-spacing:.1em;color:#5eead4}
.np-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.np-chip{padding:8px 15px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.12em;cursor:pointer;
  background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.2);color:#cbd5e1;transition:.15s}
.np-chip:hover{background:rgba(148,163,184,.18)}
.np-chip.np-on{color:#05060f;background:var(--c,#22d3ee);border-color:var(--c,#22d3ee);box-shadow:0 0 18px -4px var(--c,#22d3ee)}
.np-btn{padding:13px 40px;border-radius:999px;border:none;cursor:pointer;font-family:inherit;font-weight:900;
  font-size:15px;letter-spacing:.2em;color:#05060f;background:linear-gradient(90deg,#22d3ee,#a855f7);
  box-shadow:0 12px 34px -12px #a855f7;transition:.18s}
.np-btn:hover{transform:translateY(-2px);filter:brightness(1.12)}
.np-btn.np-ghost{background:transparent;color:#cbd5e1;border:1px solid rgba(148,163,184,.3);box-shadow:none;padding:11px 26px;font-size:12px}
.np-btn.np-ghost:hover{border-color:#22d3ee;color:#22d3ee}
.np-sliders{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;font-size:10px;letter-spacing:.16em;color:#94a3b8}
.np-sliders label{display:flex;flex-direction:column;gap:6px;align-items:center}
.np-sliders input{width:140px;accent-color:#22d3ee}
.np-keys{display:flex;gap:7px;justify-content:center}
.np-keys kbd{min-width:34px;padding:6px 0;text-align:center;border-radius:7px;font-family:inherit;font-size:12px;font-weight:700;
  background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.25);border-bottom-width:3px;color:#e2e8f0}
.np-rank{font-size:clamp(64px,16vw,130px);font-weight:900;line-height:.9;
  background:linear-gradient(180deg,#fff,#22d3ee 50%,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 26px rgba(34,211,238,.6));animation:npPop .5s cubic-bezier(.2,1.6,.4,1)}
@keyframes npPop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
.np-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px;width:100%;max-width:560px}
.np-stat{padding:9px;border-radius:10px;text-align:center;background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.14)}
.np-stat b{display:block;font-size:19px;color:#f1f5f9}
.np-stat span{font-size:9px;letter-spacing:.17em;color:#7c8aa3;text-transform:uppercase}
.np-foot{font-size:9px;letter-spacing:.22em;color:#475569;text-align:center}
`;

  /* ------------------------------------------------------------------- game */
  function Game(root) {
    const self = this;
    this.root = root;
    root.classList.add('np-root');
    root.innerHTML = `
      <canvas class="np-canvas"></canvas>

      <div class="np-layer" data-s="menu">
        <div class="np-title">NEON PULSE</div>
        <div class="np-sub">jogo de ritmo • 4 teclas</div>
        <div class="np-songs" data-el="songs"></div>
        <div class="np-row" data-el="diffs"></div>
        <div class="np-sliders">
          <label>VELOCIDADE <span data-el="spdv">1.0x</span><input data-el="spd" type="range" min="0.6" max="2" step="0.1"></label>
          <label>OFFSET <span data-el="offv">0 ms</span><input data-el="off" type="range" min="-150" max="150" step="5"></label>
        </div>
        <button class="np-btn" data-el="play">JOGAR</button>
        <div class="np-keys"><kbd>D</kbd><kbd>F</kbd><kbd>J</kbd><kbd>K</kbd></div>
        <div class="np-foot">setas também funcionam • toque na tela no celular • esc = pausa</div>
      </div>

      <div class="np-layer np-hide" data-s="pause">
        <div class="np-title" style="font-size:clamp(22px,4vw,36px)">PAUSADO</div>
        <div class="np-row">
          <button class="np-btn" data-el="resume">CONTINUAR</button>
        </div>
        <div class="np-row">
          <button class="np-btn np-ghost" data-el="restart">REINICIAR</button>
          <button class="np-btn np-ghost" data-el="quit">MENU</button>
        </div>
      </div>

      <div class="np-layer np-hide" data-s="result">
        <div class="np-sub" data-el="rtitle">resultado</div>
        <div class="np-rank" data-el="rank">S</div>
        <div class="np-stats" data-el="rstats"></div>
        <div class="np-row">
          <button class="np-btn" data-el="again">JOGAR DE NOVO</button>
          <button class="np-btn np-ghost" data-el="back">MENU</button>
        </div>
      </div>`;

    const $ = (n) => root.querySelector('[data-el="' + n + '"]');
    this.el = {
      canvas: root.querySelector('.np-canvas'),
      menu: root.querySelector('[data-s="menu"]'), pause: root.querySelector('[data-s="pause"]'),
      result: root.querySelector('[data-s="result"]'),
      songs: $('songs'), diffs: $('diffs'), play: $('play'), spd: $('spd'), spdv: $('spdv'),
      off: $('off'), offv: $('offv'), resume: $('resume'), restart: $('restart'), quit: $('quit'),
      rank: $('rank'), rstats: $('rstats'), again: $('again'), back: $('back'), rtitle: $('rtitle')
    };
    this.ctx = this.el.canvas.getContext('2d');
    this.state = 'menu';
    this.songIdx = store.get('song', 0);
    this.diffIdx = store.get('diff', 1);
    this.speed = store.get('speed', 1.2);
    this.offset = store.get('offset', 0);
    this.el.spd.value = this.speed; this.el.off.value = this.offset;
    this.el.spdv.textContent = (+this.speed).toFixed(1) + 'x';
    this.el.offv.textContent = this.offset + ' ms';
    this.keyHeld = [0, 0, 0, 0];
    this.laneFlash = [0, 0, 0, 0];
    this.particles = [];
    this.judges = [];
    this.pulse = 0;
    this.time = 0;
    this.bgT = 0;

    this.buildMenu();
    this.bind();
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  Game.prototype.buildMenu = function () {
    const self = this;
    this.el.songs.innerHTML = '';
    SONGS.forEach(function (s, i) {
      const d = document.createElement('div');
      d.className = 'np-card' + (i === self.songIdx ? ' np-on' : '');
      d.style.setProperty('--c', s.color);
      const best = store.get('best_' + s.id + '_' + DIFFS[self.diffIdx].id, null);
      d.innerHTML = '<i>' + s.bpm + ' BPM</i><b>' + s.name + '</b><span>' + s.artist + ' • ' + s.tag + '</span>' +
        '<div class="np-best">' + (best ? 'RECORDE ' + best.score.toLocaleString('pt-BR') + ' • ' + best.rank : 'sem recorde') + '</div>';
      d.onclick = function () { self.songIdx = i; store.set('song', i); Audio2.init(); Audio2.ui(660); self.buildMenu(); };
      self.el.songs.appendChild(d);
    });
    this.el.diffs.innerHTML = '';
    DIFFS.forEach(function (df, i) {
      const b = document.createElement('div');
      b.className = 'np-chip' + (i === self.diffIdx ? ' np-on' : '');
      b.style.setProperty('--c', df.color);
      b.textContent = df.name + ' ★' + df.stars;
      b.onclick = function () { self.diffIdx = i; store.set('diff', i); Audio2.init(); Audio2.ui(520); self.buildMenu(); };
      self.el.diffs.appendChild(b);
    });
  };

  Game.prototype.bind = function () {
    const self = this, el = this.el;
    el.play.onclick = function () { self.start(); };
    el.again.onclick = function () { self.start(); };
    el.back.onclick = function () { self.toMenu(); };
    el.resume.onclick = function () { self.setPause(false); };
    el.restart.onclick = function () { self.start(); };
    el.quit.onclick = function () { self.toMenu(); };
    el.spd.oninput = function () { self.speed = +this.value; el.spdv.textContent = self.speed.toFixed(1) + 'x'; store.set('speed', self.speed); };
    el.off.oninput = function () { self.offset = +this.value; el.offv.textContent = self.offset + ' ms'; store.set('offset', self.offset); };

    this.onKeyDown = function (e) {
      const k = e.key.toLowerCase();
      if (self.state === 'playing' || self.state === 'paused') {
        if (k === 'escape' || k === 'p') { e.preventDefault(); self.setPause(self.state === 'playing'); return; }
      }
      if (self.state !== 'playing') return;
      const lane = KEYMAP[k];
      if (lane === undefined || e.repeat) return;
      e.preventDefault();
      self.hit(lane);
    };
    this.onKeyUp = function (e) {
      const lane = KEYMAP[e.key.toLowerCase()];
      if (lane !== undefined) self.keyHeld[lane] = 0;
    };
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);

    el.canvas.addEventListener('pointerdown', function (e) {
      if (self.state !== 'playing') return;
      const r = el.canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const f = self.field(r.width);
      const lane = Math.floor((x - f.x) / f.lw);
      if (lane >= 0 && lane < 4) { e.preventDefault(); self.hit(lane); }
    });
    el.canvas.addEventListener('pointerup', function () { self.keyHeld = [0, 0, 0, 0]; });

    window.addEventListener('resize', function () { self.resize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { self.resize(); }).observe(this.root);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && self.state === 'playing') self.setPause(true);
    });
  };

  Game.prototype.field = function (w) {
    const pw = Math.min(w * 0.92, 460);
    return { x: (w - pw) / 2, w: pw, lw: pw / 4 };
  };

  Game.prototype.resize = function () {
    const r = this.root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height;
    this.el.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.el.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Game.prototype.show = function (which) {
    this.el.menu.classList.toggle('np-hide', which !== 'menu');
    this.el.pause.classList.toggle('np-hide', which !== 'pause');
    this.el.result.classList.toggle('np-hide', which !== 'result');
  };

  /* --------------------------------------------------------------- partidas */
  Game.prototype.start = function () {
    Audio2.init();
    if (Audio2.ctx.state === 'suspended') Audio2.ctx.resume();
    const song = SONGS[this.songIdx], diff = DIFFS[this.diffIdx];
    this.song = song; this.diff = diff;
    this.chart = buildChart(song, diff);
    this.notes = this.chart.notes;
    this.firstActive = 0;
    this.musicIdx = 0;
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.health = 100;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.particles = []; this.judges = [];
    this.lastJudge = null; this.judgeT = 0;
    this.endTime = (this.notes.length ? this.notes[this.notes.length - 1].t : song.dur) + 2.4;
    this.songStart = Audio2.now() + 0.45;
    this.time = -0.45;
    this.lastBeat = undefined;
    this.state = 'playing';
    this.failed = false;
    this.show(null);
    const self = this;
    clearInterval(this.schedId);
    this.schedId = setInterval(function () { self.schedule(); }, 25);
    this.schedule();
  };

  Game.prototype.schedule = function () {
    if (!Audio2.ctx || this.state !== 'playing') return;
    const look = Audio2.now() + 0.14;
    const m = this.chart.music, spb = this.chart.spb;
    while (this.musicIdx < m.length && this.songStart + m[this.musicIdx].t < look) {
      const ev = m[this.musicIdx], t = this.songStart + ev.t;
      if (t > Audio2.now() - 0.05) {
        if (ev.kick) Audio2.kick(t, 1);
        if (ev.snare) Audio2.snare(t, 1);
        if (ev.hat) Audio2.hat(t, ev.hat);
        if (ev.bass !== undefined) Audio2.bass(t, ev.bass, spb * 0.45);
        if (ev.lead !== undefined) Audio2.lead(t, ev.lead, spb * 0.42);
        if (ev.pad !== undefined) Audio2.pad(t, ev.pad, spb * 3.8);
      }
      this.musicIdx++;
    }
  };

  Game.prototype.setPause = function (on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      if (Audio2.ctx) Audio2.ctx.suspend();
      this.show('pause');
    } else if (!on && this.state === 'paused') {
      this.show(null);
      this.state = 'playing';
      if (Audio2.ctx) Audio2.ctx.resume();
    }
  };

  Game.prototype.toMenu = function () {
    this.state = 'menu';
    clearInterval(this.schedId);
    if (Audio2.ctx && Audio2.ctx.state === 'suspended') Audio2.ctx.resume();
    this.notes = [];
    this.buildMenu();
    this.show('menu');
  };

  /* ------------------------------------------------------------------ input */
  Game.prototype.hit = function (lane) {
    this.keyHeld[lane] = 1;
    this.laneFlash[lane] = 1;
    const now = this.time;
    let best = -1, bestDt = 1e9;
    for (let i = this.firstActive; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - now > W_GOOD) break;
      if (n.judged || n.lane !== lane) continue;
      const dt = Math.abs(n.t - now);
      if (dt < bestDt) { bestDt = dt; best = i; }
    }
    if (best < 0 || bestDt > W_GOOD) { this.spark(lane, 0.4); return; }
    const n = this.notes[best];
    n.judged = true; n.hit = true;
    let kind = bestDt <= W_PERFECT ? 'perfect' : bestDt <= W_GREAT ? 'great' : 'good';
    this.applyJudge(kind, lane);
  };

  Game.prototype.applyJudge = function (kind, lane) {
    const base = { perfect: 300, great: 200, good: 100, miss: 0 }[kind];
    if (kind === 'miss') {
      this.combo = 0; this.counts.miss++; this.health -= 7;
      Audio2.missSfx();
    } else {
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.counts[kind]++;
      const mult = 1 + Math.min(Math.floor(this.combo / 10), 10) * 0.1;
      this.score += Math.round(base * mult);
      this.health = Math.min(100, this.health + (kind === 'perfect' ? 1.4 : kind === 'great' ? 0.9 : 0.3));
      Audio2.hitSfx(kind);
      this.spark(lane, kind === 'perfect' ? 1 : kind === 'great' ? 0.75 : 0.5);
      this.pulse = Math.max(this.pulse, kind === 'perfect' ? 1 : 0.6);
    }
    this.lastJudge = kind; this.judgeT = 1;
    if (this.health <= 0) { this.health = 0; this.failed = true; this.finish(); }
  };

  Game.prototype.spark = function (lane, power) {
    const f = this.field(this.W);
    const x = f.x + f.lw * (lane + 0.5), y = this.hitY();
    const n = Math.round(6 + power * 14);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 90 + Math.random() * 320 * power;
      this.particles.push({
        x: x + (Math.random() - 0.5) * f.lw * 0.6, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, max: 0.35 + Math.random() * 0.4,
        r: 1.5 + Math.random() * 3 * power, c: LANE_COLORS[lane]
      });
    }
  };

  Game.prototype.hitY = function () { return this.H - Math.max(78, this.H * 0.17); };

  /* ----------------------------------------------------------------- update */
  Game.prototype.update = function (dt) {
    this.bgT += dt;
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    this.judgeT = Math.max(0, this.judgeT - dt * 1.6);
    for (let i = 0; i < 4; i++) this.laneFlash[i] = Math.max(0, this.laneFlash[i] - dt * 4.5);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt / p.max;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 680 * dt; p.vx *= 0.98;
    }
    if (this.state !== 'playing') return;

    this.time = Audio2.now() - this.songStart - this.offset / 1000;
    // misses
    while (this.firstActive < this.notes.length && this.notes[this.firstActive].judged) this.firstActive++;
    for (let i = this.firstActive; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - this.time > W_MISS) break;
      if (!n.judged && this.time - n.t > W_MISS) { n.judged = true; this.applyJudge('miss', n.lane); }
    }
    // pulso no beat
    const beat = this.time / this.chart.spb;
    if (this.lastBeat === undefined) this.lastBeat = Math.floor(beat);
    if (Math.floor(beat) > this.lastBeat) { this.lastBeat = Math.floor(beat); this.pulse = Math.max(this.pulse, 0.42); }

    if (this.time > this.endTime) this.finish();
  };

  Game.prototype.finish = function () {
    if (this.state !== 'playing') return;
    this.state = 'result';
    clearInterval(this.schedId);
    const c = this.counts;
    const total = c.perfect + c.great + c.good + c.miss || 1;
    const acc = (c.perfect + c.great * 0.65 + c.good * 0.3) / total;
    const rank = this.failed ? 'F' : acc >= 0.97 ? 'SS' : acc >= 0.93 ? 'S' : acc >= 0.87 ? 'A' : acc >= 0.78 ? 'B' : acc >= 0.68 ? 'C' : 'D';
    const key = 'best_' + this.song.id + '_' + this.diff.id;
    const prev = store.get(key, null);
    const isNew = !this.failed && (!prev || this.score > prev.score);
    if (isNew) store.set(key, { score: this.score, rank: rank, acc: Math.round(acc * 1000) / 10 });

    this.el.rank.textContent = rank;
    this.el.rtitle.textContent = this.failed ? 'VOCÊ FALHOU — ' + this.song.name : this.song.name + ' • ' + this.diff.name + (isNew ? ' • NOVO RECORDE!' : '');
    const st = [
      ['PONTOS', this.score.toLocaleString('pt-BR')],
      ['PRECISÃO', (acc * 100).toFixed(2) + '%'],
      ['COMBO MÁX', this.maxCombo + 'x'],
      ['PERFECT', c.perfect], ['GREAT', c.great], ['GOOD', c.good], ['MISS', c.miss]
    ];
    this.el.rstats.innerHTML = st.map(function (s) {
      return '<div class="np-stat"><b>' + s[1] + '</b><span>' + s[0] + '</span></div>';
    }).join('');
    this.show('result');
    if (Audio2.ctx) {
      const t = Audio2.now();
      const notes = this.failed ? [62, 58, 53] : [69, 73, 76, 81];
      notes.forEach(function (n, i) { Audio2.lead(t + i * 0.12, n, 0.5); });
    }
  };

  /* ------------------------------------------------------------------- draw */
  Game.prototype.draw = function () {
    const g = this.ctx, W = this.W, H = this.H;
    const song = this.song || SONGS[this.songIdx];
    g.clearRect(0, 0, W, H);

    // fundo
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0d22'); bg.addColorStop(0.55, '#07081a'); bg.addColorStop(1, '#04050e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // halo pulsante
    const pr = (0.3 + this.pulse * 0.7);
    const rg = g.createRadialGradient(W / 2, H * 0.22, 0, W / 2, H * 0.22, W * (0.45 + this.pulse * 0.25));
    rg.addColorStop(0, hexA(song.color, 0.20 * pr)); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);

    // grade em perspectiva
    g.save(); g.globalAlpha = 0.22; g.strokeStyle = hexA(song.color2, 0.5); g.lineWidth = 1;
    const hz = H * 0.34;
    for (let i = 0; i <= 14; i++) {
      const p = i / 14, x = lerp(-W * 0.6, W * 1.6, p);
      g.beginPath(); g.moveTo(W / 2 + (x - W / 2) * 0.12, hz); g.lineTo(x, H); g.stroke();
    }
    const scroll = (this.bgT * 0.35) % 1;
    for (let i = 0; i < 12; i++) {
      const p = ((i + scroll) / 12);
      const y = hz + (H - hz) * (p * p);
      g.globalAlpha = 0.16 * p;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.restore();

    if (this.state === 'menu') { this.drawMenuFx(); return; }
    if (!this.chart) return;

    const f = this.field(W), hitY = this.hitY();
    const pxPerSec = (H * 0.78) * this.speed * this.diff.speed * 0.9;

    // painel
    g.fillStyle = 'rgba(3,5,16,.62)'; g.fillRect(f.x, 0, f.w, H);
    g.strokeStyle = hexA(song.color, 0.35); g.lineWidth = 2;
    g.beginPath(); g.moveTo(f.x, 0); g.lineTo(f.x, H); g.moveTo(f.x + f.w, 0); g.lineTo(f.x + f.w, H); g.stroke();

    // lanes
    for (let i = 0; i < 4; i++) {
      const lx = f.x + i * f.lw;
      if (i > 0) { g.strokeStyle = 'rgba(148,163,184,.13)'; g.lineWidth = 1; g.beginPath(); g.moveTo(lx, 0); g.lineTo(lx, H); g.stroke(); }
      const fl = this.laneFlash[i];
      if (fl > 0) {
        const lg = g.createLinearGradient(0, hitY - H * 0.45, 0, hitY);
        lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, hexA(LANE_COLORS[i], 0.33 * fl));
        g.fillStyle = lg; g.fillRect(lx, hitY - H * 0.45, f.lw, H * 0.45);
      }
    }

    // linha de acerto
    g.save();
    g.shadowBlur = 22; g.shadowColor = song.color;
    g.strokeStyle = '#e2e8f0'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(f.x, hitY); g.lineTo(f.x + f.w, hitY); g.stroke();
    g.restore();

    // receptores
    for (let i = 0; i < 4; i++) {
      const cx = f.x + f.lw * (i + 0.5), fl = this.laneFlash[i];
      const w = f.lw * 0.78, h = 16 + fl * 6;
      g.save();
      g.shadowBlur = 14 + fl * 26; g.shadowColor = LANE_COLORS[i];
      g.fillStyle = fl > 0 ? hexA(LANE_COLORS[i], 0.85) : 'rgba(148,163,184,.22)';
      roundRect(g, cx - w / 2, hitY - h / 2, w, h, 7); g.fill();
      g.restore();
      g.fillStyle = fl > 0 ? '#05060f' : 'rgba(226,232,240,.55)';
      g.font = '700 11px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(KEY_LABELS[i], cx, hitY);
    }

    // notas
    const nh = Math.max(16, H * 0.028);
    for (let i = this.firstActive; i < this.notes.length; i++) {
      const n = this.notes[i];
      const dy = (n.t - this.time) * pxPerSec;
      if (dy > H + 60) break;
      if (n.judged) continue;
      const y = hitY - dy;
      if (y < -60) continue;
      const cx = f.x + f.lw * (n.lane + 0.5), w = f.lw * 0.80;
      const col = LANE_COLORS[n.lane];
      g.save();
      g.shadowBlur = 16; g.shadowColor = col;
      const ng = g.createLinearGradient(0, y - nh / 2, 0, y + nh / 2);
      ng.addColorStop(0, '#ffffff'); ng.addColorStop(0.35, col); ng.addColorStop(1, shade(col, -0.35));
      g.fillStyle = ng;
      roundRect(g, cx - w / 2, y - nh / 2, w, nh, 6); g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.65)';
      roundRect(g, cx - w / 2 + 3, y - nh / 2 + 2, w - 6, 2.5, 2); g.fill();
    }

    // partículas
    for (const p of this.particles) {
      g.globalAlpha = clamp(p.life, 0, 1);
      g.fillStyle = p.c;
      g.beginPath(); g.arc(p.x, p.y, p.r * p.life, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;

    this.drawHUD(f, hitY);
  };

  Game.prototype.drawHUD = function (f, hitY) {
    const g = this.ctx, W = this.W, H = this.H;
    const c = this.counts, total = c.perfect + c.great + c.good + c.miss;
    const acc = total ? (c.perfect + c.great * 0.65 + c.good * 0.3) / total : 1;

    // barra de vida
    g.fillStyle = 'rgba(148,163,184,.14)'; g.fillRect(0, 0, W, 6);
    const hg = g.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, '#f43f5e'); hg.addColorStop(0.45, '#fbbf24'); hg.addColorStop(1, '#34d399');
    g.fillStyle = hg; g.fillRect(0, 0, W * (this.health / 100), 6);

    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.fillStyle = '#e2e8f0'; g.font = '900 ' + Math.round(clamp(W * 0.034, 18, 30)) + 'px Orbitron, system-ui, sans-serif';
    g.fillText(this.score.toLocaleString('pt-BR'), 14, 16);
    g.fillStyle = '#64748b'; g.font = '700 9px Orbitron, system-ui, sans-serif';
    g.fillText('PONTOS', 15, 14 + clamp(W * 0.034, 18, 30) + 2);

    g.textAlign = 'right';
    g.fillStyle = '#93c5fd'; g.font = '700 ' + Math.round(clamp(W * 0.022, 13, 19)) + 'px Orbitron, system-ui, sans-serif';
    g.fillText((acc * 100).toFixed(2) + '%', W - 14, 16);
    g.fillStyle = '#64748b'; g.font = '700 9px Orbitron, system-ui, sans-serif';
    g.fillText(this.song.name.toUpperCase() + ' • ' + this.diff.name.toUpperCase(), W - 14, 40);

    // combo
    if (this.combo > 2) {
      const s = 1 + this.pulse * 0.18;
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(W / 2, H * 0.30); g.scale(s, s);
      g.shadowBlur = 22; g.shadowColor = this.song.color;
      g.fillStyle = '#f8fafc'; g.font = '900 ' + Math.round(clamp(W * 0.065, 30, 58)) + 'px Orbitron, system-ui, sans-serif';
      g.fillText(this.combo, 0, 0);
      g.shadowBlur = 0; g.fillStyle = hexA(this.song.color, 0.9);
      g.font = '700 11px Orbitron, system-ui, sans-serif';
      g.fillText('COMBO', 0, Math.round(clamp(W * 0.065, 30, 58)) * 0.62);
      g.restore();
    }

    // julgamento
    if (this.judgeT > 0 && this.lastJudge) {
      const txt = { perfect: 'PERFECT!', great: 'GREAT', good: 'GOOD', miss: 'MISS' }[this.lastJudge];
      const col = { perfect: '#22d3ee', great: '#4ade80', good: '#fbbf24', miss: '#f43f5e' }[this.lastJudge];
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = clamp(this.judgeT, 0, 1);
      g.translate(W / 2, hitY - 92 - (1 - this.judgeT) * 18);
      g.scale(1 + (1 - this.judgeT) * 0.12, 1 + (1 - this.judgeT) * 0.12);
      g.shadowBlur = 18; g.shadowColor = col; g.fillStyle = col;
      g.font = '900 ' + Math.round(clamp(W * 0.036, 18, 30)) + 'px Orbitron, system-ui, sans-serif';
      g.fillText(txt, 0, 0);
      g.restore(); g.globalAlpha = 1;
    }

    // progresso
    const prog = clamp(this.time / this.endTime, 0, 1);
    g.fillStyle = 'rgba(148,163,184,.16)'; g.fillRect(f.x, H - 10, f.w, 3);
    g.fillStyle = this.song.color; g.fillRect(f.x, H - 10, f.w * prog, 3);

    // contagem regressiva
    if (this.time < 0) {
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#e2e8f0'; g.font = '900 ' + Math.round(clamp(W * 0.05, 22, 40)) + 'px Orbitron, system-ui, sans-serif';
      g.fillText('PREPARE-SE', W / 2, H * 0.45); g.restore();
    }
  };

  Game.prototype.drawMenuFx = function () {
    const g = this.ctx, W = this.W, H = this.H, t = this.bgT;
    for (let i = 0; i < 26; i++) {
      const p = (i / 26);
      const x = ((p * 1.7 + Math.sin(i * 12.9) * 0.5 + t * (0.02 + (i % 5) * 0.012)) % 1.2 - 0.1) * W;
      const y = ((Math.sin(i * 7.3) * 0.5 + 0.5) * 1.1 - (t * (0.03 + (i % 3) * 0.02)) % 1.1) * H;
      g.globalAlpha = 0.25 + (i % 4) * 0.12;
      g.fillStyle = i % 2 ? '#22d3ee' : '#a855f7';
      g.beginPath(); g.arc(x, y + H, 1.4 + (i % 3), 0, 6.2832); g.fill();
      g.beginPath(); g.arc(x, y, 1.4 + (i % 3), 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
  };

  Game.prototype.loop = function (ts) {
    requestAnimationFrame(this.loop);
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000); this.lastTs = ts;
    this.update(dt);
    this.draw();
  };

  /* ------------------------------------------------------------- helpers gfx */
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function shade(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = clamp(Math.round(((n >> 16) & 255) * (1 + amt)), 0, 255);
    const gg = clamp(Math.round(((n >> 8) & 255) * (1 + amt)), 0, 255);
    const b = clamp(Math.round((n & 255) * (1 + amt)), 0, 255);
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  /* -------------------------------------------------------------- bootstrap */
  function injectAssets() {
    if (!document.getElementById('np-style')) {
      const st = document.createElement('style');
      st.id = 'np-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    if (!document.getElementById('np-font')) {
      const l = document.createElement('link');
      l.id = 'np-font'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap';
      document.head.appendChild(l);
    }
  }

  const API = {
    instances: [],
    mount(target) {
      injectAssets();
      let el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) { el = document.createElement('div'); document.body.appendChild(el); }
      if (el.__npGame) return el.__npGame;
      const gme = new Game(el);
      el.__npGame = gme; this.instances.push(gme);
      return gme;
    },
    autoMount() {
      this.mount(document.getElementById('rhythm-game') || document.querySelector('[data-rhythm-game]') || undefined);
    }
  };
  window.RhythmGame = API;

  function boot() {
    const el = document.getElementById('rhythm-game') || document.querySelector('[data-rhythm-game]');
    API.mount(el || undefined);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
