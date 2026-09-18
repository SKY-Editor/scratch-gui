import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import WavEncoder from 'wav-encoder';
import VM from 'scratch-vm';

import {connect} from 'react-redux';

import {
    computeChunkedRMS,
    encodeAndAddSoundToVM,
    downsampleIfNeeded,
    dropEveryOtherSample
} from '../lib/audio/audio-util.js';
import AudioEffects from '../lib/audio/audio-effects.js';
import SoundEditorComponent from '../components/sound-editor/sound-editor.jsx';
import AudioBufferPlayer from '../lib/audio/audio-buffer-player.js';
import MultiTrackPlayer from '../lib/audio/multi-track-player.js';
import {
    applyEnvelopeToSamples,
    computeSpectrumFrames,
    mixTracksToMono,
    renderMidiToSamples,
    exportMidiSMF
} from '../lib/audio/sky-audio-dsp.js';
import log from '../lib/log.js';

const UNDO_STACK_SIZE = 99;

const MAX_RMS = 1.2;

// Minimum visible width (as a fraction of the whole sound) when zoomed in.
const MIN_ZOOM_WIDTH = 0.02;

class SoundEditor extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'copy',
            'copyCurrentBuffer',
            'handleCopyToNew',
            'handleStoppedPlaying',
            'handleChangeName',
            'handlePlay',
            'handleStopPlaying',
            'handleUpdatePlayhead',
            'handleDelete',
            'handleDeleteInverse',
            'handleCut',
            'handleUpdateTrim',
            'handlePause',
            'handleResume',
            'handleToggleLoop',
            'handleEffect',
            'handleUndo',
            'handleRedo',
            'submitNewSamples',
            'handleCopy',
            'handlePaste',
            'paste',
            'handleKeyPress',
            'handleContainerClick',
            'setRef',
            'resampleBufferToRate',
            'handleZoomToSelection',
            'handleZoomIn',
            'handleZoomOut',
            'handleZoomReset',
            'handleZoomSlider',
            'handleGainSliderChange',
            'handleGainSliderCommit',
            'handleApplyGain',
            'handleNormalize',
            'handleKeepSelection',
            'handleSilenceSelection',
            'handleSetActiveView',
            'handleEnvelopeChange',
            'handleApplyEnvelope',
            'ensureTracks',
            'ensureSpectrumFrames',
            'handleTrackAdd',
            'handleRemoveTrack',
            'handleMoveTrack',
            'handleToggleMute',
            'handleToggleSolo',
            'handleVolumeChange',
            'handlePanChange',
            'updateMultiTrackPlayback',
            'handleMixerPlay',
            'handleMixerStop',
            'stopMultiTrack',
            'handleCommitMix',
            'handleNotesChange',
            'handleRenderNotes',
            'handleExportMidi'
        ]);
        this.state = {
            copyBuffer: null,
            chunkLevels: computeChunkedRMS(this.props.samples),
            playhead: null, // null is not playing, [0 -> 1] is playing percent
            paused: false, // true if playback is paused at the current playhead
            isLooping: false, // true if playback should loop
            trimStart: null,
            trimEnd: null,
            zoomStart: 0,
            zoomEnd: 1,
            previewGainDb: 0,
            activeView: 'wave', // 'wave' | 'spectrum' | 'pianoroll' | 'mixer'
            envelope: [{t: 0, value: 1}, {t: 1, value: 1}],
            tracks: null, // mixer tracks, lazily initialized on first use
            spectrumFrames: null, // computed lazily for the spectrum view
            notes: [], // piano-roll notes
            mixerPlaying: false
        };

        this.redoStack = [];
        this.undoStack = [];
        this.currentEncodedWav = null; // Cached WAV data for the current buffer state

        this.ref = null;
        this.multiTrackPlayer = null;
        this.nextTrackId = 2; // Track 1 is created by ensureTracks
    }
    componentDidMount () {
        this.audioBufferPlayer = new AudioBufferPlayer(this.props.samples, this.props.sampleRate);

        document.addEventListener('keydown', this.handleKeyPress);
    }
    componentWillReceiveProps (newProps) {
        if (newProps.soundId !== this.props.soundId) { // A different sound has been selected
            this.redoStack = [];
            this.undoStack = [];
            this.resetState(newProps.samples, newProps.sampleRate);
            this.setState({
                trimStart: null,
                trimEnd: null,
                zoomStart: 0,
                zoomEnd: 1,
                previewGainDb: 0,
                activeView: 'wave',
                envelope: [{t: 0, value: 1}, {t: 1, value: 1}],
                tracks: null,
                spectrumFrames: null,
                notes: [],
                mixerPlaying: false
            });
            this.stopMultiTrack();
        }
    }
    componentWillUnmount () {
        this.audioBufferPlayer.stop();
        if (this.multiTrackPlayer) {
            this.multiTrackPlayer.stop();
            this.multiTrackPlayer = null;
        }

        document.removeEventListener('keydown', this.handleKeyPress);
    }
    handleKeyPress (event) {
        if (event.target instanceof HTMLInputElement) {
            // Ignore keyboard shortcuts if a text input field is focused
            return;
        }
        if (this.props.isFullScreen) {
            // Ignore keyboard shortcuts if the stage is fullscreen mode
            return;
        }
        if (event.key === ' ') {
            event.preventDefault();
            if (this.state.paused) {
                this.handleResume();
            } else if (this.state.playhead) {
                this.handlePause();
            } else {
                this.handlePlay();
            }
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            if (event.shiftKey) {
                this.handleDeleteInverse();
            } else {
                this.handleDelete();
            }
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.handleUpdateTrim(null, null);
        }
        if (event.metaKey || event.ctrlKey) {
            if (event.shiftKey && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (this.redoStack.length > 0) {
                    this.handleRedo();
                }
            } else if (event.key === 'z') {
                if (this.undoStack.length > 0) {
                    event.preventDefault();
                    this.handleUndo();
                }
            } else if (event.key === 'c') {
                event.preventDefault();
                this.handleCopy();
            } else if (event.key === 'v') {
                event.preventDefault();
                this.handlePaste();
            } else if (event.key === 'a') {
                event.preventDefault();
                this.handleUpdateTrim(0, 1);
            }
        }
    }
    resetState (samples, sampleRate) {
        this.audioBufferPlayer.stop();
        this.audioBufferPlayer = new AudioBufferPlayer(samples, sampleRate);
        this.setState({
            chunkLevels: computeChunkedRMS(samples),
            playhead: null
        });
    }
    submitNewSamples (samples, sampleRate, skipUndo, cachedWavBuffer) {
        const encodePromise = cachedWavBuffer ?
            Promise.resolve({
                wavBuffer: cachedWavBuffer,
                newSamples: samples,
                newSampleRate: sampleRate
            }) :
            downsampleIfNeeded({samples, sampleRate}, this.resampleBufferToRate)
                .then(({samples: newSamples, sampleRate: newSampleRate}) =>
                    WavEncoder.encode({
                        sampleRate: newSampleRate,
                        channelData: [newSamples]
                    }).then(wavBuffer => ({wavBuffer, newSamples, newSampleRate})));
        return encodePromise
            .then(({wavBuffer, newSamples, newSampleRate}) => {
                if (!skipUndo) {
                    this.redoStack = [];
                    if (this.undoStack.length >= UNDO_STACK_SIZE) {
                        this.undoStack.shift(); // Drop the first element off the array
                    }
                    this.undoStack.push(this.getUndoItem());
                }
                this.currentEncodedWav = wavBuffer;
                this.resetState(newSamples, newSampleRate);
                // Keep track 0 in sync with the committed main buffer, so the
                // mixer always starts from the latest sound.
                if (this.state.tracks) {
                    this.setState({
                        tracks: this.state.tracks.map((t, i) => (i === 0 ?
                            {...t, samples: new Float32Array(newSamples)} : t))
                    });
                }
                this.props.vm.updateSoundBuffer(
                    this.props.soundIndex,
                    this.audioBufferPlayer.buffer,
                    new Uint8Array(wavBuffer));
                return true; // Edit was successful
            })
            .catch(e => {
                // Encoding failed, or the sound was too large to save so edit is rejected
                log.error(`Encountered error while trying to encode sound update: ${e.message}`);
                return false; // Edit was not applied
            });
    }
    handlePlay () {
        this.audioBufferPlayer.stop();
        this.audioBufferPlayer.play(
            this.state.trimStart || 0,
            this.state.trimEnd || 1,
            this.handleUpdatePlayhead,
            this.handleStoppedPlaying);
    }
    handleStopPlaying () {
        this.audioBufferPlayer.stop();
        this.handleStoppedPlaying();
    }
    handleStoppedPlaying () {
        this.setState({playhead: null, paused: false});
    }
    handleUpdatePlayhead (playhead) {
        this.setState({playhead});
    }
    handleChangeName (name) {
        this.props.vm.renameSound(this.props.soundIndex, name);
    }
    handleDelete () {
        const {samples, sampleRate} = this.copyCurrentBuffer();
        const sampleCount = samples.length;
        const startIndex = Math.floor(this.state.trimStart * sampleCount);
        const endIndex = Math.floor(this.state.trimEnd * sampleCount);
        const firstPart = samples.slice(0, startIndex);
        const secondPart = samples.slice(endIndex, sampleCount);
        const newLength = firstPart.length + secondPart.length;
        let newSamples;
        if (newLength === 0) {
            newSamples = new Float32Array(1);
        } else {
            newSamples = new Float32Array(newLength);
            newSamples.set(firstPart, 0);
            newSamples.set(secondPart, firstPart.length);
        }
        this.submitNewSamples(newSamples, sampleRate).then(() => {
            this.setState({
                trimStart: null,
                trimEnd: null
            });
        });
    }
    handleDeleteInverse () {
        // Delete everything outside of the trimmers
        const {samples, sampleRate} = this.copyCurrentBuffer();
        const sampleCount = samples.length;
        const startIndex = Math.floor(this.state.trimStart * sampleCount);
        const endIndex = Math.floor(this.state.trimEnd * sampleCount);
        let clippedSamples = samples.slice(startIndex, endIndex);
        if (clippedSamples.length === 0) {
            clippedSamples = new Float32Array(1);
        }
        this.submitNewSamples(clippedSamples, sampleRate).then(success => {
            if (success) {
                this.setState({
                    trimStart: null,
                    trimEnd: null
                });
            }
        });
    }
    handleCut () {
        if (this.state.trimStart === null) return;
        this.copy(() => {
            this.handleDelete();
        });
    }
    handlePause () {
        if (!this.state.playhead) return;
        this.audioBufferPlayer.pause();
        this.setState({paused: true});
    }
    handleResume () {
        if (!this.state.paused) return;
        this.audioBufferPlayer.resume(
            this.state.trimStart || 0,
            this.state.trimEnd || 1,
            this.handleUpdatePlayhead,
            this.handleStoppedPlaying);
        this.setState({paused: false});
    }
    handleToggleLoop () {
        const isLooping = !this.state.isLooping;
        this.audioBufferPlayer.setLoop(isLooping);
        this.setState({isLooping});
    }
    handleUpdateTrim (trimStart, trimEnd) {
        this.setState({trimStart, trimEnd});
        this.handleStopPlaying();
    }
    effectFactory (name) {
        return () => this.handleEffect(name);
    }
    copyCurrentBuffer () {
        // Cannot reliably use props.samples because it gets detached by Firefox
        return {
            samples: this.audioBufferPlayer.buffer.getChannelData(0),
            sampleRate: this.audioBufferPlayer.buffer.sampleRate
        };
    }
    handleEffect (name) {
        const trimStart = this.state.trimStart === null ? 0.0 : this.state.trimStart;
        const trimEnd = this.state.trimEnd === null ? 1.0 : this.state.trimEnd;

        // Offline audio context needs at least 2 samples
        if (this.audioBufferPlayer.buffer.length < 2) {
            return;
        }

        const effects = new AudioEffects(this.audioBufferPlayer.buffer, name, trimStart, trimEnd);
        effects.process((renderedBuffer, adjustedTrimStart, adjustedTrimEnd) => {
            const samples = renderedBuffer.getChannelData(0);
            const sampleRate = renderedBuffer.sampleRate;
            this.submitNewSamples(samples, sampleRate).then(success => {
                if (success) {
                    if (this.state.trimStart === null) {
                        this.handlePlay();
                    } else {
                        this.setState({trimStart: adjustedTrimStart, trimEnd: adjustedTrimEnd}, this.handlePlay);
                    }
                }
            });
        });
    }
    tooLoud () {
        const numChunks = this.state.chunkLevels.length;
        const startIndex = this.state.trimStart === null ?
            0 : Math.floor(this.state.trimStart * numChunks);
        const endIndex = this.state.trimEnd === null ?
            numChunks - 1 : Math.ceil(this.state.trimEnd * numChunks);
        const trimChunks = this.state.chunkLevels.slice(startIndex, endIndex);
        let max = 0;
        for (const i of trimChunks) {
            if (i > max) {
                max = i;
            }
        }
        return max > MAX_RMS;
    }
    getUndoItem () {
        return {
            ...this.copyCurrentBuffer(),
            trimStart: this.state.trimStart,
            trimEnd: this.state.trimEnd,
            encodedWav: this.currentEncodedWav
        };
    }
    handleUndo () {
        this.redoStack.push(this.getUndoItem());
        const {samples, sampleRate, trimStart, trimEnd, encodedWav} = this.undoStack.pop();
        if (samples) {
            return this.submitNewSamples(samples, sampleRate, true, encodedWav).then(success => {
                if (success) {
                    this.setState({trimStart: trimStart, trimEnd: trimEnd}, this.handlePlay);
                }
            });
        }
    }
    handleRedo () {
        const {samples, sampleRate, trimStart, trimEnd, encodedWav} = this.redoStack.pop();
        if (samples) {
            this.undoStack.push(this.getUndoItem());
            return this.submitNewSamples(samples, sampleRate, true, encodedWav).then(success => {
                if (success) {
                    this.setState({trimStart: trimStart, trimEnd: trimEnd}, this.handlePlay);
                }
            });
        }
    }
    handleCopy () {
        this.copy();
    }
    copy (callback) {
        const trimStart = this.state.trimStart === null ? 0.0 : this.state.trimStart;
        const trimEnd = this.state.trimEnd === null ? 1.0 : this.state.trimEnd;

        const newCopyBuffer = this.copyCurrentBuffer();
        const trimStartSamples = trimStart * newCopyBuffer.samples.length;
        const trimEndSamples = trimEnd * newCopyBuffer.samples.length;
        newCopyBuffer.samples = newCopyBuffer.samples.slice(trimStartSamples, trimEndSamples);

        this.setState({
            copyBuffer: newCopyBuffer
        }, callback);
    }
    handleCopyToNew () {
        this.copy(() => {
            encodeAndAddSoundToVM(this.props.vm, this.state.copyBuffer.samples,
                this.state.copyBuffer.sampleRate, this.props.name);
        });
    }
    resampleBufferToRate (buffer, newRate) {
        return new Promise((resolve, reject) => {
            const sampleRateRatio = newRate / buffer.sampleRate;
            const newLength = sampleRateRatio * buffer.samples.length;
            let offlineContext;
            // Try to use either OfflineAudioContext or webkitOfflineAudioContext to resample
            // The constructors will throw if trying to resample at an unsupported rate
            // (e.g. Safari/webkitOAC does not support lower than 44khz).
            try {
                if (window.OfflineAudioContext) {
                    offlineContext = new window.OfflineAudioContext(1, newLength, newRate);
                } else if (window.webkitOfflineAudioContext) {
                    offlineContext = new window.webkitOfflineAudioContext(1, newLength, newRate);
                }
            } catch {
                // If no OAC available and downsampling by 2, downsample by dropping every other sample.
                if (newRate === buffer.sampleRate / 2) {
                    return resolve(dropEveryOtherSample(buffer));
                }
                return reject(new Error('Could not resample'));
            }
            const source = offlineContext.createBufferSource();
            const audioBuffer = offlineContext.createBuffer(1, buffer.samples.length, buffer.sampleRate);
            audioBuffer.getChannelData(0).set(buffer.samples);
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();
            offlineContext.startRendering();
            offlineContext.oncomplete = ({renderedBuffer}) => {
                resolve({
                    samples: renderedBuffer.getChannelData(0),
                    sampleRate: newRate
                });
            };
        });
    }
    paste () {
        // If there's no selection, paste at the end of the sound
        const {samples} = this.copyCurrentBuffer();
        if (this.state.trimStart === null) {
            const newLength = samples.length + this.state.copyBuffer.samples.length;
            const newSamples = new Float32Array(newLength);
            newSamples.set(samples, 0);
            newSamples.set(this.state.copyBuffer.samples, samples.length);
            this.submitNewSamples(newSamples, this.props.sampleRate, false).then(success => {
                if (success) {
                    this.handlePlay();
                }
            });
        } else {
            // else replace the selection with the pasted sound
            const trimStartSamples = this.state.trimStart * samples.length;
            const trimEndSamples = this.state.trimEnd * samples.length;
            const firstPart = samples.slice(0, trimStartSamples);
            const lastPart = samples.slice(trimEndSamples);
            const newLength = firstPart.length + this.state.copyBuffer.samples.length + lastPart.length;
            const newSamples = new Float32Array(newLength);
            newSamples.set(firstPart, 0);
            newSamples.set(this.state.copyBuffer.samples, firstPart.length);
            newSamples.set(lastPart, firstPart.length + this.state.copyBuffer.samples.length);

            const trimStartSeconds = trimStartSamples / this.props.sampleRate;
            const trimEndSeconds = trimStartSeconds +
                (this.state.copyBuffer.samples.length / this.state.copyBuffer.sampleRate);
            const newDurationSeconds = newSamples.length / this.state.copyBuffer.sampleRate;
            const adjustedTrimStart = trimStartSeconds / newDurationSeconds;
            const adjustedTrimEnd = trimEndSeconds / newDurationSeconds;
            this.submitNewSamples(newSamples, this.props.sampleRate, false).then(success => {
                if (success) {
                    this.setState({
                        trimStart: adjustedTrimStart,
                        trimEnd: adjustedTrimEnd
                    }, this.handlePlay);
                }
            });
        }
    }
    handlePaste () {
        if (!this.state.copyBuffer) return;
        if (this.state.copyBuffer.sampleRate === this.props.sampleRate) {
            this.paste();
        } else {
            this.resampleBufferToRate(this.state.copyBuffer, this.props.sampleRate).then(buffer => {
                this.setState({
                    copyBuffer: buffer
                }, this.paste);
            });
        }
    }
    setRef (element) {
        this.ref = element;
    }
    handleContainerClick (e) {
        // If the click is on the sound editor's div (and not any other element), delesect
        if (e.target === this.ref && this.state.trimStart !== null) {
            this.handleUpdateTrim(null, null);
        }
    }
    // Zooming (advanced style). zoomStart/zoomEnd are fractions [0,1] of the
    // whole sound currently visible in the waveform.
    handleZoomIn () {
        this.setState(prevState => {
            const range = prevState.zoomEnd - prevState.zoomStart;
            const newRange = Math.max(MIN_ZOOM_WIDTH, range / 2);
            const center = (prevState.zoomStart + prevState.zoomEnd) / 2;
            const zoomStart = Math.max(0, center - (newRange / 2));
            const zoomEnd = Math.min(1, zoomStart + newRange);
            return {zoomStart, zoomEnd};
        });
    }
    handleZoomOut () {
        this.setState(prevState => {
            const range = prevState.zoomEnd - prevState.zoomStart;
            const newRange = Math.min(1, range * 2);
            const center = (prevState.zoomStart + prevState.zoomEnd) / 2;
            let zoomStart = Math.max(0, center - (newRange / 2));
            const zoomEnd = Math.min(1, zoomStart + newRange);
            if (zoomEnd - zoomStart < 1) {
                zoomStart = Math.max(0, zoomEnd - newRange);
            }
            return {zoomStart, zoomEnd};
        });
    }
    handleZoomReset () {
        this.setState({
            zoomStart: 0,
            zoomEnd: 1
        });
    }
    handleZoomToSelection () {
        const {trimStart, trimEnd} = this.state;
        if (trimStart === null || trimEnd === null) {
            this.handleZoomIn();
            return;
        }
        const range = trimEnd - trimStart;
        const newRange = Math.max(MIN_ZOOM_WIDTH, range * 1.1);
        const center = (trimStart + trimEnd) / 2;
        let zoomStart = Math.max(0, center - (newRange / 2));
        const zoomEnd = Math.min(1, zoomStart + newRange);
        if (zoomEnd - zoomStart < newRange) {
            zoomStart = Math.max(0, zoomEnd - newRange);
        }
        this.setState({zoomStart, zoomEnd});
    }
    handleZoomSlider (level) {
        // `level` is 0 (whole sound) .. 1 (maximum zoom), mapped logarithmically.
        this.setState(prevState => {
            const newRange = Math.max(MIN_ZOOM_WIDTH, Math.pow(MIN_ZOOM_WIDTH, 1 - level));
            const center = (prevState.zoomStart + prevState.zoomEnd) / 2;
            let zoomStart = Math.max(0, center - (newRange / 2));
            const zoomEnd = Math.min(1, zoomStart + newRange);
            if (zoomEnd - zoomStart < newRange) {
                zoomStart = Math.max(0, zoomEnd - newRange);
            }
            return {zoomStart, zoomEnd};
        });
    }
    // Gain preview & apply (advanced style). The slider previews the gain
    // change with an offline render; the Apply button commits it through the
    // normal submitNewSamples / undo stack.
    handleGainSliderChange (gainDb) {
        this.setState({previewGainDb: gainDb});
    }
    handleGainSliderCommit (gainDb) {
        this.setState({previewGainDb: gainDb});
        this.handleApplyGain(gainDb);
    }
    handleApplyGain (gainDb) {
        const gainFactor = Math.pow(10, gainDb / 20);
        const buffer = this.copyCurrentBuffer();
        // copyCurrentBuffer returns a live view of the audio buffer, so make a
        // copy before mutating samples.
        const samples = new Float32Array(buffer.samples);
        const {trimStart, trimEnd} = this.state;
        const startIndex = trimStart === null ? 0 : Math.round(trimStart * samples.length);
        const endIndex = trimEnd === null ? samples.length : Math.round(trimEnd * samples.length);
        for (let i = startIndex; i < endIndex; i++) {
            samples[i] *= gainFactor;
        }
        this.submitNewSamples(samples, buffer.sampleRate, false).then(success => {
            if (success) {
                this.setState({previewGainDb: 0});
            }
        });
    }
    // Normalize to 0dBFS: scale the selection (or whole sound) so that its
    // peak sample reaches 1.0, then soft-clip the result.
    handleNormalize () {
        const buffer = this.copyCurrentBuffer();
        const samples = new Float32Array(buffer.samples);
        const {trimStart, trimEnd} = this.state;
        const startIndex = trimStart === null ? 0 : Math.round(trimStart * samples.length);
        const endIndex = trimEnd === null ? samples.length : Math.round(trimEnd * samples.length);
        let peak = 0;
        for (let i = startIndex; i < endIndex; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > peak) peak = abs;
        }
        if (peak <= 0) {
            return;
        }
        const scale = 1 / peak;
        for (let i = startIndex; i < endIndex; i++) {
            samples[i] = Math.tanh(samples[i] * scale * 0.9) / Math.tanh(0.9);
        }
        this.submitNewSamples(samples, buffer.sampleRate, false);
    }
    // Keep only the selection: cut away everything outside trimStart/trimEnd.
    handleKeepSelection () {
        if (this.state.trimStart === null || this.state.trimEnd === null) {
            return;
        }
        const buffer = this.copyCurrentBuffer();
        const trimStartSamples = Math.round(this.state.trimStart * buffer.samples.length);
        const trimEndSamples = Math.round(this.state.trimEnd * buffer.samples.length);
        const newSamples = buffer.samples.slice(trimStartSamples, trimEndSamples);
        this.submitNewSamples(newSamples, buffer.sampleRate, false);
    }
    // Silence the selection: zero out the samples, keeping the duration.
    handleSilenceSelection () {
        const buffer = this.copyCurrentBuffer();
        // Live view -> copy before mutating.
        const samples = new Float32Array(buffer.samples);
        const {trimStart, trimEnd} = this.state;
        const startIndex = trimStart === null ? 0 : Math.round(trimStart * samples.length);
        const endIndex = trimEnd === null ? samples.length : Math.round(trimEnd * samples.length);
        for (let i = startIndex; i < endIndex; i++) {
            samples[i] = 0;
        }
        this.submitNewSamples(samples, buffer.sampleRate, false);
    }
    // -----------------------------------------------------------------------
    // Gandi-style advanced features (advanced style only):
    // volume envelope / spectrum view / multi-track mixer / piano roll + MIDI
    // -----------------------------------------------------------------------
    handleSetActiveView (view) {
        if (view === 'spectrum') {
            this.ensureSpectrumFrames();
        } else if (view === 'mixer' || view === 'pianoroll') {
            this.ensureTracks();
        }
        if (view !== 'mixer' && this.state.mixerPlaying) {
            this.stopMultiTrack();
        }
        this.setState({activeView: view});
    }
    // --- Volume envelope ---------------------------------------------------
    handleEnvelopeChange (envelope) {
        this.setState({envelope});
    }
    handleApplyEnvelope () {
        const buffer = this.copyCurrentBuffer();
        // applyEnvelopeToSamples returns a deep copy; the live buffer is never
        // mutated, and the result goes through the normal undo stack.
        const samples = applyEnvelopeToSamples(buffer.samples, this.state.envelope);
        this.submitNewSamples(samples, buffer.sampleRate, false);
    }
    // --- Spectrum view -----------------------------------------------------
    ensureSpectrumFrames () {
        if (this.state.spectrumFrames) {
            return this.state.spectrumFrames;
        }
        const buffer = this.copyCurrentBuffer();
        const frames = computeSpectrumFrames(buffer.samples, buffer.sampleRate);
        this.setState({spectrumFrames: frames});
        return frames;
    }
    // --- Multi-track mixer -------------------------------------------------
    ensureTracks () {
        if (this.state.tracks) {
            return this.state.tracks;
        }
        const buffer = this.copyCurrentBuffer();
        const tracks = [{
            id: 1,
            name: 'Track 1',
            samples: new Float32Array(buffer.samples), // deep copy of the live view
            sampleRate: buffer.sampleRate,
            volume: 0.8,
            pan: 0,
            muted: false,
            solo: false
        }];
        this.setState({tracks});
        return tracks;
    }
    handleTrackAdd () {
        const tracks = this.ensureTracks();
        let maxLen = 1;
        for (const t of tracks) {
            if (t.samples && t.samples.length > maxLen) {
                maxLen = t.samples.length;
            }
        }
        const newTrack = {
            id: this.nextTrackId++,
            name: `Track ${tracks.length + 1}`,
            samples: new Float32Array(maxLen), // silent track
            sampleRate: tracks[0] ? tracks[0].sampleRate : this.props.sampleRate,
            volume: 0.8,
            pan: 0,
            muted: false,
            solo: false
        };
        this.setState({tracks: [...tracks, newTrack]});
    }
    handleRemoveTrack (id) {
        const tracks = this.state.tracks || [];
        if (tracks.length <= 1) {
            return; // Always keep at least one track.
        }
        this.setState({tracks: tracks.filter(t => t.id !== id)});
    }
    handleMoveTrack (id, dir) {
        const tracks = (this.state.tracks || []).slice();
        const index = tracks.findIndex(t => t.id === id);
        const target = dir === 'up' ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= tracks.length) {
            return;
        }
        const [track] = tracks.splice(index, 1);
        tracks.splice(target, 0, track);
        this.setState({tracks});
        this.updateMultiTrackPlayback(tracks);
    }
    handleToggleMute (id) {
        const tracks = this.ensureTracks().map(t => (t.id === id ? {...t, muted: !t.muted} : t));
        this.setState({tracks});
        this.updateMultiTrackPlayback(tracks);
    }
    handleToggleSolo (id) {
        const tracks = this.ensureTracks().map(t => (t.id === id ? {...t, solo: !t.solo} : t));
        this.setState({tracks});
        this.updateMultiTrackPlayback(tracks);
    }
    handleVolumeChange (id, volume) {
        const tracks = this.ensureTracks().map(t => (t.id === id ? {...t, volume} : t));
        this.setState({tracks});
        this.updateMultiTrackPlayback(tracks);
    }
    handlePanChange (id, pan) {
        const tracks = this.ensureTracks().map(t => (t.id === id ? {...t, pan} : t));
        this.setState({tracks});
        this.updateMultiTrackPlayback(tracks);
    }
    updateMultiTrackPlayback (tracks) {
        if (this.multiTrackPlayer && this.state.mixerPlaying) {
            this.multiTrackPlayer.updateTracks(tracks);
        }
    }
    handleMixerPlay () {
        const tracks = this.ensureTracks();
        this.handleStopPlaying(); // Stop single-buffer playback first.
        if (!this.multiTrackPlayer) {
            this.multiTrackPlayer = new MultiTrackPlayer(tracks, tracks[0].sampleRate);
        }
        this.multiTrackPlayer.play(tracks, () => {}, () => {
            this.setState({mixerPlaying: false});
        });
        this.setState({mixerPlaying: true});
    }
    handleMixerStop () {
        this.stopMultiTrack();
    }
    stopMultiTrack () {
        if (this.multiTrackPlayer) {
            this.multiTrackPlayer.stop();
        }
        this.multiTrackPlayer = null;
        if (this.state.mixerPlaying) {
            this.setState({mixerPlaying: false});
        }
    }
    handleCommitMix () {
        const tracks = this.state.tracks;
        if (!tracks || tracks.length === 0) {
            return;
        }
        const mixed = mixTracksToMono(tracks);
        if (!mixed) {
            return;
        }
        const sampleRate = tracks[0].sampleRate;
        this.stopMultiTrack();
        // Clear the multi-track state BEFORE submitting, so the track-0 sync in
        // submitNewSamples does not copy the mix back into a track.
        this.setState({tracks: null, activeView: 'wave'});
        this.submitNewSamples(mixed, sampleRate, false);
    }
    // --- Piano roll / MIDI -------------------------------------------------
    handleNotesChange (notes) {
        this.setState({notes});
    }
    handleRenderNotes () {
        const notes = this.state.notes;
        if (!notes || notes.length === 0) {
            return;
        }
        const tracks = this.ensureTracks();
        const sampleRate = tracks[0].sampleRate;
        // Offline synthesis: oscillator + ADSR into a mono Float32Array that
        // replaces track 0's samples. No scratch-vm involvement until the user
        // commits the mix.
        const samples = renderMidiToSamples(notes, sampleRate);
        const updated = tracks.map((t, i) => (i === 0 ? {...t, samples} : t));
        this.setState({tracks: updated});
    }
    handleExportMidi () {
        const notes = this.state.notes;
        if (!notes || notes.length === 0) {
            return;
        }
        const midiBytes = exportMidiSMF(notes);
        const blob = new Blob([midiBytes.buffer], {type: 'audio/midi'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.props.name || 'sound'}.mid`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    render () {
        const {effectTypes} = AudioEffects;
        return (
            <SoundEditorComponent
                isStereo={this.props.isStereo}
                isAdvancedStyle={this.props.audioEditorStyle === 'advanced'}
                duration={this.props.duration}
                size={this.props.size}
                samples={this.props.samples}
                sampleRate={this.props.sampleRate}
                canPaste={this.state.copyBuffer !== null}
                canRedo={this.redoStack.length > 0}
                canUndo={this.undoStack.length > 0}
                chunkLevels={this.state.chunkLevels}
                isLooping={this.state.isLooping}
                name={this.props.name}
                paused={this.state.paused}
                playhead={this.state.playhead}
                setRef={this.setRef}
                tooLoud={this.tooLoud()}
                trimEnd={this.state.trimEnd}
                trimStart={this.state.trimStart}
                zoomEnd={this.state.zoomEnd}
                zoomStart={this.state.zoomStart}
                previewGainDb={this.state.previewGainDb}
                activeView={this.state.activeView}
                envelope={this.state.envelope}
                spectrumFrames={this.state.spectrumFrames}
                tracks={this.state.tracks}
                notes={this.state.notes}
                mixerPlaying={this.state.mixerPlaying}
                onChangeName={this.handleChangeName}
                onContainerClick={this.handleContainerClick}
                onCopy={this.handleCopy}
                onCopyToNew={this.handleCopyToNew}
                onCut={this.handleCut}
                onDelete={this.handleDelete}
                onDeleteInverse={this.handleDeleteInverse}
                onEcho={this.effectFactory(effectTypes.ECHO)}
                onFadeIn={this.effectFactory(effectTypes.FADEIN)}
                onFadeOut={this.effectFactory(effectTypes.FADEOUT)}
                onFaster={this.effectFactory(effectTypes.FASTER)}
                onGainSliderChange={this.handleGainSliderChange}
                onGainSliderCommit={this.handleGainSliderCommit}
                onApplyGain={this.handleApplyGain}
                onNormalize={this.handleNormalize}
                onKeepSelection={this.handleKeepSelection}
                onSilenceSelection={this.handleSilenceSelection}
                onLouder={this.effectFactory(effectTypes.LOUDER)}
                onMute={this.effectFactory(effectTypes.MUTE)}
                onPaste={this.handlePaste}
                onPause={this.handlePause}
                onPlay={this.handlePlay}
                onResume={this.handleResume}
                onToggleLoop={this.handleToggleLoop}
                onRedo={this.handleRedo}
                onReverse={this.effectFactory(effectTypes.REVERSE)}
                onRobot={this.effectFactory(effectTypes.ROBOT)}
                onSetTrim={this.handleUpdateTrim}
                onSlower={this.effectFactory(effectTypes.SLOWER)}
                onSofter={this.effectFactory(effectTypes.SOFTER)}
                onStop={this.handleStopPlaying}
                onUndo={this.handleUndo}
                onZoomIn={this.handleZoomIn}
                onZoomOut={this.handleZoomOut}
                onZoomReset={this.handleZoomReset}
                onZoomToSelection={this.handleZoomToSelection}
                onZoomSlider={this.handleZoomSlider}
                onSetActiveView={this.handleSetActiveView}
                onEnvelopeChange={this.handleEnvelopeChange}
                onApplyEnvelope={this.handleApplyEnvelope}
                onTrackAdd={this.handleTrackAdd}
                onTrackRemove={this.handleRemoveTrack}
                onTrackMove={this.handleMoveTrack}
                onToggleMute={this.handleToggleMute}
                onToggleSolo={this.handleToggleSolo}
                onVolumeChange={this.handleVolumeChange}
                onPanChange={this.handlePanChange}
                onPlayMix={this.handleMixerPlay}
                onStopMix={this.handleMixerStop}
                onCommitMix={this.handleCommitMix}
                onNotesChange={this.handleNotesChange}
                onRenderNotes={this.handleRenderNotes}
                onExportMidi={this.handleExportMidi}
            />
        );
    }
}

SoundEditor.propTypes = {
    isStereo: PropTypes.bool,
    audioEditorStyle: PropTypes.string,
    duration: PropTypes.number,
    size: PropTypes.number,
    isFullScreen: PropTypes.bool,
    name: PropTypes.string.isRequired,
    sampleRate: PropTypes.number,
    samples: PropTypes.instanceOf(Float32Array),
    soundId: PropTypes.string,
    soundIndex: PropTypes.number,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = (state, {soundIndex}) => {
    const sprite = state.scratchGui.vm.editingTarget.sprite;
    // Make sure the sound index doesn't go out of range.
    const index = soundIndex < sprite.sounds.length ? soundIndex : sprite.sounds.length - 1;
    const sound = state.scratchGui.vm.editingTarget.sprite.sounds[index];
    const audioBuffer = state.scratchGui.vm.getSoundBuffer(index);
    return {
        isStereo: audioBuffer.numberOfChannels !== 1,
        duration: sound.sampleCount / sound.rate,
        size: sound.asset ? sound.asset.data.byteLength : 0,
        soundId: sound.soundId,
        sampleRate: audioBuffer.sampleRate,
        samples: audioBuffer.getChannelData(0),
        isFullScreen: state.scratchGui.mode.isFullScreen,
        audioEditorStyle: state.scratchGui.audioEditorStyle,
        name: sound.name,
        vm: state.scratchGui.vm
    };
};

export default connect(
    mapStateToProps
)(SoundEditor);
