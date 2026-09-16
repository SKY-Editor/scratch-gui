import SharedAudioContext from './shared-audio-context.js';

class AudioBufferPlayer {
    constructor (samples, sampleRate) {
        this.audioContext = new SharedAudioContext();
        this.buffer = this.audioContext.createBuffer(1, samples.length, sampleRate);
        this.buffer.getChannelData(0).set(samples);
        this.source = null;

        this.startTime = null;
        this.updateCallback = null;
        this.trimStart = null;
        this.trimEnd = null;
        this.trimmedDuration = null;
        this.pausedOffset = 0; // Seconds into the trimmed region where playback was paused
        this.loop = false; // Whether playback should restart after reaching the end
        this.manuallyStopped = false;
    }

    play (trimStart, trimEnd, onUpdate, onEnded) {
        this.pausedOffset = 0;
        this._start(trimStart, trimEnd, onUpdate, onEnded);
    }

    resume (trimStart, trimEnd, onUpdate, onEnded) {
        // If playback was paused at (or near) the end, restart from the beginning
        if (this.pausedOffset >= (this.trimmedDuration || 0) - 0.01) {
            this.pausedOffset = 0;
        }
        this._start(trimStart, trimEnd, onUpdate, onEnded);
    }

    _start (trimStart, trimEnd, onUpdate, onEnded) {
        this.updateCallback = onUpdate;
        this.trimStart = trimStart;
        this.trimEnd = trimEnd;
        this.manuallyStopped = false;
        this.startTime = Date.now();

        const trimStartTime = this.buffer.duration * trimStart;
        this.trimmedDuration = (this.buffer.duration * trimEnd) - trimStartTime;
        const startOffset = trimStartTime + this.pausedOffset;
        const playDuration = Math.max(0, this.trimmedDuration - this.pausedOffset);

        this.source = this.audioContext.createBufferSource();
        this.source.onended = () => {
            if (this.loop && !this.manuallyStopped && this.updateCallback) {
                // Restart from the beginning of the trimmed region when looping
                this.pausedOffset = 0;
                this.play(trimStart, trimEnd, onUpdate, onEnded);
            } else if (onEnded) {
                onEnded();
            }
        };
        this.source.buffer = this.buffer;
        this.source.connect(this.audioContext.destination);
        this.source.start(0, startOffset, playDuration);

        this.update();
    }

    update () {
        const timeSinceStart = (Date.now() - this.startTime) / 1000;
        const percentage = (timeSinceStart + this.pausedOffset) / this.buffer.duration;
        if (percentage + this.trimStart < this.trimEnd && this.source.onended) {
            requestAnimationFrame(this.update.bind(this));
            this.updateCallback(percentage + this.trimStart);
        } else {
            this.updateCallback = null;
        }
    }

    pause () {
        if (!this.source) return;
        const elapsed = (Date.now() - this.startTime) / 1000;
        this.pausedOffset = Math.max(0, Math.min(elapsed, this.trimmedDuration || 0));
        this.updateCallback = null;
        this.source.onended = null;
        try {
            this.source.stop();
        } catch (e) {
            // This is probably Safari, which dies when you call stop more than once
            // which the spec says is allowed: https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
            console.log('Caught error while stopping buffer source node.'); // eslint-disable-line no-console
        }
    }

    setLoop (loop) {
        this.loop = Boolean(loop);
    }

    stop () {
        this.manuallyStopped = true;
        this.pausedOffset = 0;
        this.updateCallback = null;
        if (this.source) {
            this.source.onended = null; // Do not call onEnded callback if manually stopped
            try {
                this.source.stop();
            } catch (e) {
                // This is probably Safari, which dies when you call stop more than once
                // which the spec says is allowed: https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
                console.log('Caught error while stopping buffer source node.'); // eslint-disable-line no-console
            }
        }
    }
}

export default AudioBufferPlayer;
