/**
 * spec-10 §4.5: синтез звуков клиента (собственные, CC0) → client/src/sound/assets/*.mp3.
 * Моно 44.1 кГц, 96 кбит/с, пик нормализован. Энкодер не входит в зависимости проекта:
 *
 *   npx -y -p @breezystack/lamejs@1 node scripts/synth-sounds.mjs client/src/sound/assets
 *   (или: npm i --no-save @breezystack/lamejs && node scripts/synth-sounds.mjs client/src/sound/assets)
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import { writeFileSync } from 'node:fs';
const SR = 44100;
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
const buf = (sec) => new Float32Array(Math.round(SR * sec));
function normalize(x, peak = 0.7) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  for (let i = 0; i < x.length; i++) x[i] = (x[i] / m) * peak;
  // короткие фейды против щелчков
  const f = Math.min(64, x.length >> 2);
  for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f;
  return x;
}
// бипол. резонансный фильтр (bandpass)
function bandpass(x, f0, q) {
  const w = (2 * Math.PI * f0) / SR,
    a = Math.sin(w) / (2 * q),
    c = Math.cos(w);
  const b0 = a,
    b2 = -a,
    a0 = 1 + a,
    a1 = -2 * c,
    a2 = 1 - a;
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
function tile() {
  // стук кости о стол
  const x = buf(0.12);
  for (let i = 0; i < x.length; i++) x[i] = rnd() * Math.exp(-i / (SR * 0.006));
  const click = bandpass(x, 2400, 4);
  const y = buf(0.12);
  for (let i = 0; i < y.length; i++) {
    const t = i / SR;
    y[i] =
      click[i] * 1.0 +
      0.6 * Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.02) +
      0.25 * Math.sin(2 * Math.PI * 1150 * t) * Math.exp(-t / 0.015);
  }
  return normalize(y);
}
function draw() {
  // шорох: кость скользит по столу
  const n = buf(0.22),
    y = buf(0.22);
  for (let i = 0; i < n.length; i++) n[i] = rnd();
  const chunk = 512;
  for (let s = 0; s < n.length; s += chunk) {
    const t = s / n.length;
    const seg = bandpass(n.subarray(s, s + chunk), 900 + 2200 * t, 1.2);
    for (let k = 0; k < seg.length; k++) {
      const tt = (s + k) / n.length;
      y[s + k] = seg[k] * Math.sin(Math.PI * Math.min(1, tt * 1.15)) ** 1.5;
    }
  }
  return normalize(y, 0.55);
}
const tone = (y, f, start, dur, amp = 1) => {
  const s0 = Math.round(start * SR);
  for (let i = 0; i < dur * SR && s0 + i < y.length; i++) {
    const t = i / SR,
      env = Math.min(1, t / 0.005) * Math.exp(-t / (dur / 3));
    y[s0 + i] += amp * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t));
  }
};
function turn() {
  // двухтоновый сигнал «Ваш ход»
  const y = buf(0.45);
  tone(y, 659.25, 0, 0.3);
  tone(y, 987.77, 0.11, 0.33);
  return normalize(y, 0.6);
}
function roundEnd() {
  // арпеджио до-мажор
  const y = buf(1.2);
  [523.25, 659.25, 783.99].forEach((f, i) => tone(y, f, i * 0.12, 0.45, 0.8));
  tone(y, 1046.5, 0.36, 0.8, 1);
  return normalize(y, 0.6);
}
for (const [name, fn] of Object.entries({ tile, draw, turn, 'round-end': roundEnd })) {
  const f = fn();
  const pcm = Int16Array.from(f, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767))));
  const enc = new Mp3Encoder(1, SR, 96);
  const parts = [];
  for (let i = 0; i < pcm.length; i += 1152)
    parts.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)));
  parts.push(enc.flush());
  const out = Buffer.concat(parts.map((p) => Buffer.from(p)));
  writeFileSync(process.argv[2] + '/' + name + '.mp3', out);
  console.log(name, (pcm.length / SR).toFixed(2) + 's', out.length + 'B');
}
