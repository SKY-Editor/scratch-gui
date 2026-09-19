// Sky Audio DSP helpers for the advanced sound editor (Gandi-style features).
// Pure functions only — no DOM / Web Audio / React dependencies, so they can
// be used by offline rendering, canvas views and MIDI export alike.
//
// Feature map:
//   1. applyEnvelopeToSamples  -> volume envelope applied to a deep copy
//   2. computeSpectrumFrames   -> FFT-style per-band energy frames for the spectrum view
//   3. mixTracksToMono         -> mixer downmix (volume / pan / M / S) to one mono buffer
//   4. renderMidiToSamples     -> piano-roll notes synthesized (oscillator + ADSR) to a buffer
//   5. exportMidiSMF           -> notes exported as a Standard MIDI File (format 0)

// ---------------------------------------------------------------------------
// 1. Volume envelope
// Envelope point: {t: 0..1 (fraction of the sound), value: 0..2 (linear gain)}.
// Returns a NEW Float32Array — the input samples are never mutated.
// ---------------------------------------------------------------------------
const applyEnvelopeToSamples = (samples, envelope) => {
    if (!samples || samples.length === 0) {
        return new Float32Array(samples || []);
    }
    if (!envelope || envelope.length === 0) {
        return new Float32Array(samples);
    }
    // Normalize + sort by t, clamp value to [0, 2].
    const points = envelope
        .map(p => ({
            t: Math.max(0, Math.min(1, p.t)),
            value: Math.max(0, Math.min(2, p.value))
        }))
        .sort((a, b) => a.t - b.t);
    // Guarantee endpoints so the envelope always covers the full sound.
    if (points[0].t > 0) {
        points.unshift({t: 0, value: points[0].value});
    }
    if (points[points.length - 1].t < 1) {
        points.push({t: 1, value: points[points.length - 1].value});
    }
    const out = new Float32Array(samples.length);
    const n = samples.length;
    let seg = 0;
    for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        while (seg < points.length - 2 && t > points[seg + 1].t) {
            seg++;
        }
        const p0 = points[seg];
        const p1 = points[seg + 1];
        const span = Math.max(1e-9, p1.t - p0.t);
        const f = Math.max(0, Math.min(1, (t - p0.t) / span));
        const gain = p0.value + ((p1.value - p0.value) * f);
        out[i] = samples[i] * gain;
    }
    return out;
};

// ---------------------------------------------------------------------------
// 2. Spectrum (spectrogram) frames
// Log-spaced frequency bands; each band is measured with a Goertzel filter per
// window. Returns {frames, bandLabels, numWindows, sampleRate} where
// frames[w][b] is normalized energy 0..1 and bandLabels[b] is a display label.
// ---------------------------------------------------------------------------
const SPECTRUM_LOG_MIN = 40; // Hz
const SPECTRUM_LOG_MAX = 16000; // Hz
const SPECTRUM_WINDOW = 2048; // FFT-ish window size
const SPECTRUM_HOP = 512; // hop between windows
const SPECTRUM_MAX_WINDOWS = 300;

const formatFrequencyLabel = freq => {
    if (freq >= 1000) {
        return `${(freq / 1000).toFixed(1)}k`;
    }
    return `${Math.round(freq)}`;
};

const goertzelPower = (samples, start, len, freq, sampleRate) => {
    const w = 2 * Math.PI * freq / sampleRate;
    const coeff = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < len; i++) {
        const s0 = samples[start + i] + (coeff * s1) - s2;
        s2 = s1;
        s1 = s0;
    }
    const power = (s1 * s1) + (s2 * s2) - (coeff * s1 * s2);
    return Math.sqrt(Math.max(0, power)) / len;
};

const computeSpectrumFrames = (samples, sampleRate, bandCount = 48) => {
    const n = samples ? samples.length : 0;
    // Guard against invalid sample rates (0 / NaN / undefined) which would
    // produce NaN bins through the Goertzel filter.
    const validRate = typeof sampleRate === 'number' && isFinite(sampleRate) && sampleRate > 0;
    if (!validRate || n < 64) {
        return {frames: [], bandLabels: [], numWindows: 0, sampleRate};
    }
    const windowSize = Math.min(SPECTRUM_WINDOW, Math.max(64, Math.floor(n / 8)));
    const hopSize = Math.min(SPECTRUM_HOP, Math.max(64, Math.floor(windowSize / 4)));
    const numWindows = Math.max(1, Math.min(
        SPECTRUM_MAX_WINDOWS,
        Math.floor((n - windowSize) / hopSize) + 1
    ));
    // Log-spaced center frequencies.
    const freqs = [];
    const bandLabels = [];
    for (let b = 0; b < bandCount; b++) {
        const f = SPECTRUM_LOG_MIN * Math.pow(SPECTRUM_LOG_MAX / SPECTRUM_LOG_MIN, b / (bandCount - 1));
        freqs.push(f);
        bandLabels.push(formatFrequencyLabel(f));
    }
    const frames = [];
    let globalMax = 1e-9;
    for (let w = 0; w < numWindows; w++) {
        const start = w * hopSize;
        const row = new Array(bandCount);
        for (let b = 0; b < bandCount; b++) {
            const power = goertzelPower(samples, start, windowSize, freqs[b], sampleRate);
            // Convert to dB-ish scale, floor at -80 dB.
            const db = 20 * Math.log10(power + 1e-8);
            const normalized = Math.max(0, Math.min(1, (db + 80) / 80));
            row[b] = normalized;
            if (normalized > globalMax) {
                globalMax = normalized;
            }
        }
        frames.push(row);
    }
    // Normalize across all windows so the hottest bin is 1.0.
    if (globalMax > 0 && globalMax < 1) {
        for (let w = 0; w < numWindows; w++) {
            for (let b = 0; b < bandCount; b++) {
                frames[w][b] /= globalMax;
            }
        }
    }
    return {frames, bandLabels, numWindows, sampleRate};
};

// ---------------------------------------------------------------------------
// 3. Mixer downmix
// track: {samples: Float32Array, volume: 0..2, pan: -1..1, muted: bool,
//         solo: bool}. Returns a NEW mono Float32Array (length = longest track)
// with a light soft-clip to avoid harsh clipping.
// ---------------------------------------------------------------------------
const mixTracksToMono = tracks => {
    if (!tracks || tracks.length === 0) {
        return null;
    }
    let maxLen = 0;
    for (const t of tracks) {
        if (t.samples && t.samples.length > maxLen) {
            maxLen = t.samples.length;
        }
    }
    if (maxLen === 0) {
        return null;
    }
    const out = new Float32Array(maxLen);
    const soloActive = tracks.some(t => t.solo);
    for (const t of tracks) {
        if (!t.samples || t.samples.length === 0) {
            continue;
        }
        const audible = !t.muted && (!soloActive || t.solo);
        if (!audible) {
            continue;
        }
        // Equal-power pan collapsed into mono: pan=0 -> factor 1.
        const theta = ((t.pan || 0) + 1) * Math.PI / 4;
        const monoFactor = (Math.cos(theta) + Math.sin(theta)) / Math.SQRT2;
        const g = (typeof t.volume === 'number' ? t.volume : 1) * monoFactor;
        for (let i = 0; i < t.samples.length; i++) {
            out[i] += t.samples[i] * g;
        }
    }
    // Soft clip (tanh) to keep the mix from clipping harshly.
    for (let i = 0; i < out.length; i++) {
        out[i] = Math.tanh(out[i]);
    }
    return out;
};

// ---------------------------------------------------------------------------
// 4. Piano-roll -> audio rendering
// note: {note: MIDI note number (60 = middle C), startBeat, durationBeat,
//        velocity: 0..1}. Synthesized with a simple oscillator + ADSR.
// ---------------------------------------------------------------------------
const midiToFrequency = midi => 440 * Math.pow(2, (midi - 69) / 12);

const renderMidiToSamples = (notes, sampleRate, {
    beatsPerBar = 4,
    bars = 4,
    bpm = 120,
    waveform = 'sine'
} = {}) => {
    // Guard against an invalid sample rate: Float32Array(NaN) would throw
    // RangeError and crash the editor, so fall back to a sane default.
    const rate = (typeof sampleRate === 'number' && isFinite(sampleRate) && sampleRate > 0) ?
        sampleRate : 44100;
    const totalBeats = beatsPerBar * bars;
    const secondsPerBeat = 60 / bpm;
    const totalSeconds = totalBeats * secondsPerBeat;
    const totalSamples = Math.max(1, Math.ceil(totalSeconds * rate));
    const out = new Float32Array(totalSamples);
    if (!notes || notes.length === 0) {
        return out;
    }
    for (const n of notes) {
        const startSec = n.startBeat * secondsPerBeat;
        const durSec = Math.max(0.05, n.durationBeat * secondsPerBeat);
        const startSample = Math.max(0, Math.floor(startSec * rate));
        const endSample = Math.min(totalSamples, Math.ceil((startSec + durSec) * rate));
        const freq = midiToFrequency(n.note);
        const attack = Math.min(0.02, durSec * 0.5);
        const decay = Math.min(0.1, durSec * 0.3);
        const sustain = 0.7;
        const release = Math.min(0.15, durSec * 0.5);
        const amp = 0.5 * Math.max(0, Math.min(1, n.velocity || 0.8));
        for (let i = startSample; i < endSample; i++) {
            const t = (i - startSample) / rate;
            let env;
            if (t < attack) {
                env = t / attack;
            } else if (t < attack + decay) {
                env = 1 - (((1 - sustain) * (t - attack)) / decay);
            } else if (t < durSec - release) {
                env = sustain;
            } else {
                env = sustain * (1 - ((t - (durSec - release)) / release));
            }
            env = Math.max(0, Math.min(1, env));
            const phase = 2 * Math.PI * freq * t;
            let v;
            switch (waveform) {
            case 'square':
                v = Math.sign(Math.sin(phase));
                break;
            case 'sawtooth':
                v = (2 * ((freq * t) % 1)) - 1;
                break;
            case 'triangle':
                v = (2 * Math.abs((2 * ((freq * t) % 1)) - 1)) - 1;
                break;
            default:
                v = Math.sin(phase);
            }
            out[i] += v * env * amp;
        }
    }
    for (let i = 0; i < out.length; i++) {
        out[i] = Math.tanh(out[i]);
    }
    return out;
};

// ---------------------------------------------------------------------------
// 5. MIDI export (Standard MIDI File, format 0)
// Returns a Uint8Array ready to be saved as a .mid file.
// ---------------------------------------------------------------------------
const vlq = value => {
    let v = Math.max(0, Math.round(value));
    const bytes = [v & 0x7F];
    v >>= 7;
    while (v > 0) {
        bytes.unshift((v & 0x7F) | 0x80);
        v >>= 7;
    }
    return bytes;
};

const exportMidiSMF = (notes, {
    bpm = 120,
    ticksPerBeat = 480
} = {}) => {
    const trackEvents = []; // {tick, data: byte[]}
    // Tempo meta event (always at tick 0).
    const tempoUsPerQuarter = Math.round(60000000 / bpm);
    trackEvents.push({
        tick: 0,
        data: [0xFF, 0x51, 0x03,
            (tempoUsPerQuarter >> 16) & 0xFF,
            (tempoUsPerQuarter >> 8) & 0xFF,
            tempoUsPerQuarter & 0xFF]
    });
    const sorted = (notes || [])
        .slice()
        .sort((a, b) => (a.startBeat * ticksPerBeat) - (b.startBeat * ticksPerBeat));
    for (const n of sorted) {
        const startTick = Math.max(0, Math.round(n.startBeat * ticksPerBeat));
        const durTicks = Math.max(1, Math.round(n.durationBeat * ticksPerBeat));
        const vel = Math.max(1, Math.min(127, Math.round((n.velocity || 0.8) * 127)));
        trackEvents.push({tick: startTick, data: [0x90, n.note, vel]});
        trackEvents.push({tick: startTick + durTicks, data: [0x80, n.note, 0]});
    }
    trackEvents.sort((a, b) => a.tick - b.tick);
    // End-of-track meta event.
    trackEvents.push({tick: 0, data: [0xFF, 0x2F, 0x00]});

    // Serialize track chunk with running deltas.
    const trackBytes = [];
    let lastTick = 0;
    for (const ev of trackEvents) {
        const delta = Math.max(0, ev.tick - lastTick);
        trackBytes.push(...vlq(delta), ...ev.data);
        lastTick = ev.tick;
    }

    const header = [
        0x4D, 0x54, 0x68, 0x64, // "MThd"
        0x00, 0x00, 0x00, 0x06, // header length
        0x00, 0x00, // format 0
        0x00, 0x01, // one track
        (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF // division
    ];
    const trackHeader = [
        0x4D, 0x54, 0x72, 0x6B, // "MTrk"
        (trackBytes.length >> 24) & 0xFF,
        (trackBytes.length >> 16) & 0xFF,
        (trackBytes.length >> 8) & 0xFF,
        trackBytes.length & 0xFF
    ];
    const bytes = new Uint8Array(header.length + trackHeader.length + trackBytes.length);
    bytes.set(header, 0);
    bytes.set(trackHeader, header.length);
    bytes.set(trackBytes, header.length + trackHeader.length);
    return bytes;
};

export {
    applyEnvelopeToSamples,
    computeSpectrumFrames,
    mixTracksToMono,
    renderMidiToSamples,
    exportMidiSMF,
    midiToFrequency
};
