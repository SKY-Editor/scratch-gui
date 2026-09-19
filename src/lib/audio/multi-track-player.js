// Multi-track preview player for the advanced sound editor mixer.
// Plays each track as its own BufferSource through a GainNode (volume) and a
// StereoPannerNode (pan), honoring mute / solo. Playback is realtime preview
// only — committing the mix goes through mixTracksToMono + submitNewSamples so
// the scratch-vm single-buffer model is never touched.
import SharedAudioContext from './shared-audio-context.js';

class MultiTrackPlayer {
    constructor (tracks, sampleRate) {
        this.audioContext = new SharedAudioContext();
        // Guard against an invalid sample rate: createBuffer with NaN / 0
        // throws NotSupportedError and crashes the whole editor.
        this.sampleRate = (typeof sampleRate === 'number' && isFinite(sampleRate) && sampleRate > 0) ?
            sampleRate : 44100;
        this.sources = [];
        this.gainNodes = [];
        this.pannerNodes = [];
        this.startTime = null;
        this.duration = 0;
        this.updateCallback = null;
        this.manuallyStopped = false;
        this._rebuildBuffers(tracks);
    }

    _rebuildBuffers (tracks) {
        this.buffers = [];
        let maxLen = 0;
        for (const t of tracks) {
            const len = t.samples ? t.samples.length : 0;
            const buffer = this.audioContext.createBuffer(1, Math.max(1, len), this.sampleRate);
            if (len > 0) {
                buffer.getChannelData(0).set(t.samples);
            }
            this.buffers.push(buffer);
            if (len > maxLen) {
                maxLen = len;
            }
        }
        this.duration = maxLen / this.sampleRate;
    }

    // (Re)create source/gain/panner graph and start playback from 0.
    play (tracks, onUpdate, onEnded) {
        this.stop();
        this._rebuildBuffers(tracks);
        this.manuallyStopped = false;
        this.startTime = Date.now();
        this.updateCallback = onUpdate;

        const soloActive = tracks.some(t => t.solo);
        for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            const source = this.audioContext.createBufferSource();
            source.buffer = this.buffers[i];
            const gain = this.audioContext.createGain();
            let panner;
            try {
                panner = this.audioContext.createStereoPanner();
            } catch (e) {
                // Older browsers without StereoPannerNode: fall back to gain-only.
                console.log('StereoPannerNode not supported, pan ignored.'); // eslint-disable-line no-console
                panner = null;
            }
            source.connect(gain);
            if (panner) {
                gain.connect(panner);
                panner.connect(this.audioContext.destination);
            } else {
                gain.connect(this.audioContext.destination);
            }
            source.onended = () => {
                if (this.manuallyStopped) return;
                // Stop when the longest track finishes.
                if (Date.now() - this.startTime >= this.duration * 1000 && onEnded) {
                    this.updateCallback = null;
                    onEnded();
                }
            };
            source.start(0);
            this.sources.push(source);
            this.gainNodes.push(gain);
            this.pannerNodes.push(panner);
            this._applyTrackParams(t, gain, panner, soloActive);
        }
        this._update();
    }

    _applyTrackParams (track, gain, panner, soloActive) {
        const audible = !track.muted && (!soloActive || track.solo);
        gain.gain.value = audible ? (typeof track.volume === 'number' ? track.volume : 1) : 0;
        try {
            panner.pan.value = Math.max(-1, Math.min(1, track.pan || 0));
        } catch (e) {
            // Older browsers without StereoPannerNode fall back to volume only.
            console.log('StereoPannerNode not supported, pan ignored.'); // eslint-disable-line no-console
        }
    }

    // Update gain/pan/mute/solo for already-playing tracks.
    updateTracks (tracks) {
        const soloActive = tracks.some(t => t.solo);
        for (let i = 0; i < tracks.length && i < this.gainNodes.length; i++) {
            this._applyTrackParams(tracks[i], this.gainNodes[i], this.pannerNodes[i], soloActive);
        }
    }

    _update () {
        if (this.manuallyStopped || !this.updateCallback) return;
        const elapsed = (Date.now() - this.startTime) / 1000;
        const pct = this.duration > 0 ? Math.min(1, elapsed / this.duration) : 1;
        this.updateCallback(pct);
        if (pct < 1) {
            requestAnimationFrame(this._update.bind(this));
        } else {
            this.updateCallback = null;
        }
    }

    stop () {
        this.manuallyStopped = true;
        this.updateCallback = null;
        for (const s of this.sources) {
            s.onended = null;
            try {
                s.stop();
            } catch (e) {
                // Already stopped (Safari quirk): ignore.
                console.log('Caught error while stopping multi-track source.'); // eslint-disable-line no-console
            }
        }
        this.sources = [];
        this.gainNodes = [];
        this.pannerNodes = [];
    }
}

export default MultiTrackPlayer;
