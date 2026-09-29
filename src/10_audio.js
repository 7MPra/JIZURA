/* ============================================================
   JIZURA — audio: decode, energy envelope, onset, BPM & beat grid
   ============================================================ */
(() => {
'use strict';

J.analyzeAudio = async (file) => {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  let audioBuffer;
  try { audioBuffer = await ac.decodeAudioData(buf.slice(0)); } finally { try { ac.close(); } catch (e) {} }
  const sr = audioBuffer.sampleRate, len = audioBuffer.length, ch = audioBuffer.numberOfChannels;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) { const d = audioBuffer.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / ch; }
  const rate = 50, hop = Math.round(sr / rate), n = Math.floor(len / hop);
  const energy = new Float32Array(n), flux = new Float32Array(n);
  let prevHP = 0, prevX = 0;
  for (let f = 0; f < n; f++) {
    let e = 0, eh = 0;
    for (let i = f * hop, end = Math.min(len, (f + 1) * hop); i < end; i++) {
      const x = mono[i]; e += x * x;
      const hp = 0.92 * (prevHP + x - prevX); prevHP = hp; prevX = x; eh += hp * hp;
    }
    energy[f] = Math.sqrt(e / hop);
    flux[f] = Math.sqrt(eh / hop);
  }
  // onset strength: positive change of log high-passed energy vs local mean
  const onset = new Float32Array(n);
  for (let f = 1; f < n; f++) {
    const cur = Math.log(1e-4 + flux[f]);
    let m = 0, k = 0; for (let j = Math.max(0, f - 4); j < f; j++) { m += Math.log(1e-4 + flux[j]); k++; }
    onset[f] = Math.max(0, cur - m / Math.max(1, k));
  }
  // tempo via autocorrelation (70..180 BPM)
  const tm = J.tempoFromOnset(onset, rate, 0, n);
  const lagF = tm.lag, period = lagF / rate, bestPh = tm.phase;
  const beats = [];
  for (let t = bestPh / rate; t < audioBuffer.duration; t += period) beats.push(+t.toFixed(4));
  // normalised energy (0..1, 95th percentile)
  const sorted = Array.from(energy).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  const energyN = new Float32Array(n);
  for (let f = 0; f < n; f++) energyN[f] = Math.min(1, energy[f] / p95);
  // waveform peaks for the timeline
  const bins = 1600, peaks = new Float32Array(bins), per = Math.max(1, Math.floor(len / bins));
  for (let b = 0; b < bins; b++) { let m = 0; for (let i = b * per, e = Math.min(len, (b + 1) * per); i < e; i += 4) { const v = Math.abs(mono[i]); if (v > m) m = v; } peaks[b] = m; }
  return {
    name: file.name, duration: audioBuffer.duration, sampleRate: sr, buffer: audioBuffer,
    bpm: Math.round(60 / period * 10) / 10, beats, energy: energyN, energyRate: rate, peaks, onset,
  };
};

/* beat period and phase from an onset-strength envelope (rate frames/s) over frames [f0, f1):
   autocorrelation over 70..180 BPM weighted towards `center` BPM, refined to a fractional lag, then the phase
   (frames from f0) whose comb collects the most onsets */
J.tempoFromOnset = (onset, rate, f0, f1, center = 125, lo = 70, hi = 180) => {
  const minLag = Math.round(rate * 60 / hi), maxLag = Math.round(rate * 60 / lo);
  let best = 0, bestLag = Math.round(rate * 0.5);
  const scores = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0; for (let f = f0 + lag; f < f1; f++) s += onset[f] * onset[f - lag];
    const bpm = 60 * rate / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / center) / 0.7, 2));
    s *= w; scores[lag] = s;
    if (s > best) { best = s; bestLag = lag; }
  }
  let lagF = bestLag;
  if (scores[bestLag - 1] != null && scores[bestLag + 1] != null) {
    const a = scores[bestLag - 1], b = scores[bestLag], c = scores[bestLag + 1];
    const d = (a - 2 * b + c); if (d !== 0) lagF = bestLag + 0.5 * (a - c) / d;
  }
  let bestPh = 0, bestPS = -1;
  for (let ph = 0; ph < lagF; ph += 0.5) {
    let s = 0; for (let t = f0 + ph; t < f1; t += lagF) s += onset[Math.round(t)] || 0;
    if (s > bestPS) { bestPS = s; bestPh = ph; }
  }
  return { lag: lagF, phase: bestPh, strength: best };
};

/* BPM グラフ: tempo of the song around time t (the next `span` seconds) — for a DJ mix, one section at a time.
   near: a BPM to stay close to (the tempo so far), so a half / double reading folds back. Returns { bpm, beat }
   with beat = the first detected beat at or after t, or null without an analysed song. */
/* BPM グラフ: a first tempo map for a whole song / DJ mix — the tempo read every 4 s over 12 s windows; a new point
   where it changes and the next reading agrees (a crossfade's mixed reading is skipped), on that section's first beat */
J.autoTempoMap = (audio, step = 4, span = 12) => {
  if (!audio || !audio.onset) return [];
  const reads = [];
  for (let t = 0; t + 6 < audio.duration; t += step) { const d = J.localTempo(audio, t, span, reads.length ? reads[reads.length - 1].bpm : 0); if (d) reads.push(Object.assign({ t }, d)); }
  const out = [], same = (a, b) => Math.abs(a - b) <= Math.max(0.8, a * 0.006);
  for (let i = 0; i < reads.length; i++) {
    const r = reads[i], last = out[out.length - 1], next = reads[i + 1];
    if (!last) { out.push({ t: r.beat, bpm: r.bpm, ramp: false, anchor: true }); continue; }
    if (same(r.bpm, last.bpm)) continue;
    if (next && !same(next.bpm, r.bpm)) continue;          // not settled yet
    out.push({ t: r.beat, bpm: r.bpm, ramp: false, anchor: true });
  }
  // where a new section really starts: walk its beat grid back from a settled reading while its beats are still
  // heard (two misses in a row end it) — a window that straddles the change is read as the new tempo too early
  const on = audio.onset, rate = audio.energyRate;
  const peakAt = (c, w) => { let v = 0; for (let f = Math.max(0, Math.round(c - w)); f <= Math.min(on.length - 1, Math.round(c + w)); f++) v = Math.max(v, on[f]); return v; };
  for (let k = 1; k < out.length; k++) {
    const p = out[k], P = 60 * rate / p.bpm, lo = out[k - 1].t * rate + P;
    const settled = reads.find(r => r.t >= p.t + span * 0.5 && same(r.bpm, p.bpm));
    let A = (settled ? settled.beat : p.t) * rate;
    let ref = 0; for (let j = 0; j < 8; j++) ref += peakAt(A + j * P, P * 0.12) / 8;
    let miss = 0;
    for (let f = A - P; f > lo && miss < 2; f -= P) { if (peakAt(f, P * 0.12) > ref * 0.35) { A = f; miss = 0; } else miss++; }
    p.t = +(A / rate).toFixed(3);
  }
  // a section's BPM: the average of the readings that agree with it (steadier than one window)
  out.forEach((p, k) => {
    const end = k + 1 < out.length ? out[k + 1].t : Infinity, xs = reads.filter(r => r.t >= p.t - 0.5 && r.t + span <= end + 0.5 && same(r.bpm, p.bpm)).map(r => r.bpm);
    if (xs.length) p.bpm = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100;
  });
  return out;
};

J.localTempo = (audio, t, span = 16, near = 0) => {
  if (!audio || !audio.onset || !audio.energyRate) return null;
  const rate = audio.energyRate, n = audio.onset.length;
  const f0 = Math.max(0, Math.floor(t * rate)), f1 = Math.min(n, Math.floor((t + span) * rate));
  if (f1 - f0 < rate * 5) return null;
  const on = audio.onset, r = J.tempoFromOnset(on, rate, f0, f1, near > 0 ? near : 125, 60, 200);
  if (!(r.strength > 0)) return null;
  // refine: the onset peak nearest each predicted beat (sub-frame), then a least-squares line through them
  let P = r.lag, A = f0 + r.phase;
  for (let pass = 0; pass < 3; pass++) {
    const ks = [], ys = [];
    for (let k = 0; A + k * P < f1; k++) {
      const c = A + k * P, w = P * 0.22;
      let bi = -1, bv = 0;
      for (let f = Math.max(f0, Math.round(c - w)); f <= Math.min(f1 - 1, Math.round(c + w)); f++) if (on[f] > bv) { bv = on[f]; bi = f; }
      if (bi < 1 || bv <= 0) continue;
      const a0 = on[bi - 1] || 0, b0 = on[bi], c0 = on[bi + 1] || 0, d = a0 - 2 * b0 + c0;
      ks.push(k); ys.push(bi + (d < 0 ? J.clamp(0.5 * (a0 - c0) / d, -0.5, 0.5) : 0));
    }
    if (ks.length < 6) break;
    const m = ks.length, sk = ks.reduce((x, y) => x + y, 0), sy = ys.reduce((x, y) => x + y, 0);
    const skk = ks.reduce((x, k) => x + k * k, 0), sky = ks.reduce((x, k, i) => x + k * ys[i], 0);
    const den = m * skk - sk * sk; if (!den) break;
    const P2 = (m * sky - sk * sy) / den, A2 = (sy - P2 * sk) / m;
    if (!(P2 > P * 0.8 && P2 < P * 1.25)) break;
    P = P2; A = A2;
  }
  while (A - P >= f0 - 0.5) A -= P;                          // the first beat at or after t
  while (A < f0 - 0.5) A += P;
  let bpm = 60 * rate / P;
  if (near > 0) { while (bpm < near / 1.42) bpm *= 2; while (bpm > near * 1.42) bpm /= 2; }
  return { bpm: Math.round(bpm * 100) / 100, beat: +(A / rate).toFixed(3) };
};

/* 16-bit PCM WAV of an AudioBuffer, cut / padded to `duration` seconds (the soundtrack next to an MP4 whose
   audio track some players cannot play, or when the browser has no audio encoder) */
J.audioWav = (buffer, duration, offset = 0) => {
  const sr = buffer.sampleRate, chn = Math.min(2, buffer.numberOfChannels);
  const n = Math.max(1, Math.round((duration > 0 ? duration : buffer.duration) * sr));
  const bytes = n * chn * 2, ab = new ArrayBuffer(44 + bytes), v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, chn, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * chn * 2, true); v.setUint16(32, chn * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, bytes, true);
  const ch = []; for (let c = 0; c < chn; c++) ch.push(buffer.getChannelData(c));
  const L = buffer.length, i0 = Math.max(0, Math.round(offset * sr)); let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < chn; c++) {
    const j = i + i0, x = j < L ? Math.max(-1, Math.min(1, ch[c][j])) : 0;
    v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
};

/* the last song, kept in this browser (IndexedDB) so a reload does not silently drop the audio from exports */
const IDB = { db: null };
IDB.open = () => IDB.db || (IDB.db = new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('no IndexedDB'));
  const r = indexedDB.open('jizura', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('files'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
J.saveSong = async (file) => {
  try {
    const db = await IDB.open(), data = await file.arrayBuffer();
    await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ name: file.name, type: file.type, data }, 'song'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    return true;
  } catch (e) { return false; }
};
J.loadSong = async () => {
  try {
    const db = await IDB.open();
    const rec = await new Promise((res, rej) => { const tx = db.transaction('files', 'readonly'); const q = tx.objectStore('files').get('song'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    if (!rec || !rec.data) return null;
    return new File([rec.data], rec.name || 'song', { type: rec.type || '' });
  } catch (e) { return null; }
};
J.saveFontData = async (key, data) => {
  try { const db = await IDB.open(); await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ data }, 'font:' + key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch (e) { return false; }
};
J.loadFontData = async (key) => {
  try { const db = await IDB.open(); const rec = await new Promise((res, rej) => { const tx = db.transaction('files', 'readonly'); const q = tx.objectStore('files').get('font:' + key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); return rec && rec.data ? rec.data : null; } catch (e) { return null; }
};
J.forgetSong = async () => {
  try { const db = await IDB.open(); await new Promise(res => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete('song'); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {}
};

/* rebuild a beat grid from a user BPM + first-beat offset */
J.beatGrid = (bpm, offset, duration) => {
  const out = []; if (!(bpm > 0)) return out;
  const p = 60 / bpm;
  for (let t = offset; t < duration + 0.01; t += p) if (t >= 0) out.push(+t.toFixed(4));
  return out;
};
})();
