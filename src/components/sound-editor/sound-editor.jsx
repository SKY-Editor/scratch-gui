import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';

import Waveform from '../waveform/waveform.jsx';
import Label from '../forms/label.jsx';
import Input from '../forms/input.jsx';
import TWRenderRecoloredImage from '../../lib/tw-recolor/render.jsx';

import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import AudioSelector from '../../containers/audio-selector.jsx';
import IconButton from '../icon-button/icon-button.jsx';
import EnvelopeEditor from './envelope-editor.jsx';
import SpectrumView from './spectrum-view.jsx';
import Mixer from './mixer.jsx';
import PianoRoll from './piano-roll.jsx';
import {SOUND_BYTE_LIMIT} from '../../lib/audio/audio-util.js';

import styles from './sound-editor.css';

import playIcon from './icon--play.svg';
import stopIcon from './icon--stop.svg';
import redoIcon from '!../../lib/tw-recolor/build!./icon--redo.svg';
import undoIcon from '!../../lib/tw-recolor/build!./icon--undo.svg';
import fasterIcon from './icon--faster.svg';
import slowerIcon from './icon--slower.svg';
import louderIcon from './icon--louder.svg';
import softerIcon from './icon--softer.svg';
import robotIcon from './icon--robot.svg';
import echoIcon from './icon--echo.svg';
import reverseIcon from './icon--reverse.svg';
import fadeOutIcon from './icon--fade-out.svg';
import fadeInIcon from './icon--fade-in.svg';
import muteIcon from './icon--mute.svg';

import deleteIcon from '!../../lib/tw-recolor/build!./icon--delete.svg';
import deleteInverseIcon from './icon--delete-inverse.svg';
import copyIcon from '!../../lib/tw-recolor/build!./icon--copy.svg';
import pasteIcon from '!../../lib/tw-recolor/build!./icon--paste.svg';
import copyToNewIcon from '!../../lib/tw-recolor/build!./icon--copy-to-new.svg';
import cutIcon from './icon--cut.svg';
import pauseIcon from './icon--pause.svg';
import loopIcon from './icon--loop.svg';
import zoomInIcon from './icon--zoom-in.svg';
import zoomOutIcon from './icon--zoom-out.svg';
import zoomFitIcon from './icon--zoom-fit.svg';
import zoomResetIcon from './icon--zoom-reset.svg';
import normalizeIcon from './icon--normalize.svg';
import keepIcon from './icon--keep.svg';

const BufferedInput = BufferedInputHOC(Input);

const messages = defineMessages({
    sound: {
        id: 'gui.soundEditor.sound',
        description: 'Label for the name of the sound',
        defaultMessage: 'Sound'
    },
    play: {
        id: 'gui.soundEditor.play',
        description: 'Title of the button to start playing the sound',
        defaultMessage: 'Play'
    },
    stop: {
        id: 'gui.soundEditor.stop',
        description: 'Title of the button to stop the sound',
        defaultMessage: 'Stop'
    },
    copy: {
        id: 'gui.soundEditor.copy',
        description: 'Title of the button to copy the sound',
        defaultMessage: 'Copy'
    },
    paste: {
        id: 'gui.soundEditor.paste',
        description: 'Title of the button to paste the sound',
        defaultMessage: 'Paste'
    },
    copyToNew: {
        id: 'gui.soundEditor.copyToNew',
        description: 'Title of the button to copy the selection into a new sound',
        defaultMessage: 'Copy to New'
    },
    delete: {
        id: 'gui.soundEditor.delete',
        description: 'Title of the button to delete the sound',
        defaultMessage: 'Delete'
    },
    save: {
        id: 'gui.soundEditor.save',
        description: 'Title of the button to save trimmed sound',
        defaultMessage: 'Save'
    },
    undo: {
        id: 'gui.soundEditor.undo',
        description: 'Title of the button to undo',
        defaultMessage: 'Undo'
    },
    redo: {
        id: 'gui.soundEditor.redo',
        description: 'Title of the button to redo',
        defaultMessage: 'Redo'
    },
    faster: {
        id: 'gui.soundEditor.faster',
        description: 'Title of the button to apply the faster effect',
        defaultMessage: 'Faster'
    },
    slower: {
        id: 'gui.soundEditor.slower',
        description: 'Title of the button to apply the slower effect',
        defaultMessage: 'Slower'
    },
    echo: {
        id: 'gui.soundEditor.echo',
        description: 'Title of the button to apply the echo effect',
        defaultMessage: 'Echo'
    },
    robot: {
        id: 'gui.soundEditor.robot',
        description: 'Title of the button to apply the robot effect',
        defaultMessage: 'Robot'
    },
    louder: {
        id: 'gui.soundEditor.louder',
        description: 'Title of the button to apply the louder effect',
        defaultMessage: 'Louder'
    },
    softer: {
        id: 'gui.soundEditor.softer',
        description: 'Title of the button to apply thr.softer effect',
        defaultMessage: 'Softer'
    },
    reverse: {
        id: 'gui.soundEditor.reverse',
        description: 'Title of the button to apply the reverse effect',
        defaultMessage: 'Reverse'
    },
    fadeOut: {
        id: 'gui.soundEditor.fadeOut',
        description: 'Title of the button to apply the fade out effect',
        defaultMessage: 'Fade out'
    },
    fadeIn: {
        id: 'gui.soundEditor.fadeIn',
        description: 'Title of the button to apply the fade in effect',
        defaultMessage: 'Fade in'
    },
    mute: {
        id: 'gui.soundEditor.mute',
        description: 'Title of the button to apply the mute effect',
        defaultMessage: 'Mute'
    },
    pause: {
        id: 'gui.soundEditor.pause',
        description: 'Title of the button to pause playback',
        defaultMessage: 'Pause'
    },
    resume: {
        id: 'gui.soundEditor.resume',
        description: 'Title of the button to resume playback',
        defaultMessage: 'Resume'
    },
    loop: {
        id: 'gui.soundEditor.loop',
        description: 'Title of the button to toggle looping playback',
        defaultMessage: 'Loop'
    },
    cut: {
        id: 'gui.soundEditor.cut',
        description: 'Title of the button to cut the selection into the clipboard',
        defaultMessage: 'Cut'
    },
    deleteInverse: {
        id: 'gui.soundEditor.deleteInverse',
        description: 'Title of the button to delete everything outside of the selection',
        defaultMessage: 'Delete Outside Selection'
    },
    zoomToSelection: {
        id: 'tw.soundEditor.zoomToSelection',
        description: 'Title of the button to zoom the waveform into the selected area',
        defaultMessage: 'Zoom to Selection'
    },
    zoomIn: {
        id: 'tw.soundEditor.zoomIn',
        description: 'Title of the button to zoom the waveform in',
        defaultMessage: 'Zoom In'
    },
    zoomOut: {
        id: 'tw.soundEditor.zoomOut',
        description: 'Title of the button to zoom the waveform out',
        defaultMessage: 'Zoom Out'
    },
    zoomReset: {
        id: 'tw.soundEditor.zoomReset',
        description: 'Title of the button to show the whole sound again',
        defaultMessage: 'Show Whole Sound'
    },
    gain: {
        id: 'tw.soundEditor.gain',
        description: 'Label of the volume (gain) slider',
        defaultMessage: 'Volume'
    },
    applyGain: {
        id: 'tw.soundEditor.applyGain',
        description: 'Title of the button to apply the volume (gain) change',
        defaultMessage: 'Apply Volume'
    },
    normalize: {
        id: 'tw.soundEditor.normalize',
        description: 'Title of the button to make the sound as loud as possible without clipping',
        defaultMessage: 'Max Volume'
    },
    keepSelection: {
        id: 'tw.soundEditor.keepSelection',
        description: 'Title of the button to keep only the selected part of the sound',
        defaultMessage: 'Keep Only Selection'
    },
    silenceSelection: {
        id: 'tw.soundEditor.silenceSelection',
        description: 'Title of the button to make the selected part silent',
        defaultMessage: 'Silence Selection'
    },
    fadeInSoft: {
        id: 'tw.soundEditor.fadeIn',
        description: 'Child-friendly title of the button to apply the fade in effect',
        defaultMessage: 'Grow Louder'
    },
    fadeOutSoft: {
        id: 'tw.soundEditor.fadeOut',
        description: 'Child-friendly title of the button to apply the fade out effect',
        defaultMessage: 'Grow Softer'
    },
    viewWave: {
        id: 'tw.soundEditor.viewWave',
        description: 'Tab button for the waveform view',
        defaultMessage: 'Waveform'
    },
    viewSpectrum: {
        id: 'tw.soundEditor.viewSpectrum',
        description: 'Tab button for the spectrum view',
        defaultMessage: 'Spectrum'
    },
    viewPianoRoll: {
        id: 'tw.soundEditor.viewPianoRoll',
        description: 'Tab button for the piano roll view',
        defaultMessage: 'Piano Roll'
    },
    viewMixer: {
        id: 'tw.soundEditor.viewMixer',
        description: 'Tab button for the mixer view',
        defaultMessage: 'Mixer'
    },
    applyEnvelope: {
        id: 'tw.soundEditor.applyEnvelope',
        description: 'Title of the button to apply the volume envelope to the sound',
        defaultMessage: 'Apply Envelope'
    },
    envelopeHint: {
        id: 'tw.soundEditor.envelopeHint',
        description: 'Hint for the volume envelope editor',
        defaultMessage: 'Drag the curve to shape volume. Double-click to reset.'
    },
    pianoRollHint: {
        id: 'tw.soundEditor.pianoRollHint',
        description: 'Hint for the piano roll editor',
        defaultMessage: 'Click to add notes, drag to move, right-click to delete.'
    }
});

const formatTime = timeSeconds => {
    const minutes = (Math.floor(timeSeconds / 60))
        .toString()
        .padStart(2, '0');
    const seconds = (timeSeconds % 60)
        .toFixed(2)
        .padStart(5, '0');
    return `${minutes}:${seconds}`;
};

const formatDuration = (playheadPercent, trimStartPercent, trimEndPercent, durationSeconds) => {
    // If no selection, the trim is the entire sound.
    trimStartPercent = trimStartPercent === null ? 0 : trimStartPercent;
    trimEndPercent = trimEndPercent === null ? 1 : trimEndPercent;

    // If the playhead doesn't exist, assume it's at the start of the selection.
    playheadPercent = playheadPercent === null ? trimStartPercent : playheadPercent;

    // If selection has zero length, treat it as the entire sound being selected.
    // This happens when the user first clicks to start making a selection.
    const trimSize = (trimEndPercent - trimStartPercent) || 1;
    const trimDuration = trimSize * durationSeconds;

    const progressInTrim = (playheadPercent - trimStartPercent) / trimSize;
    const currentTime = progressInTrim * trimDuration;

    return `${formatTime(currentTime)} / ${formatTime(trimDuration)}`;
};

const formatSoundSize = bytes => {
    if (bytes > 1000 * 1000) {
        return `${(bytes / 1000 / 1000).toFixed(2)}MB`;
    }
    return `${(bytes / 1000).toFixed(2)}KB`;
};

// Zoom level <-> visible range mapping. Level 0 shows the whole sound,
// level 1 shows the smallest window (MIN_ZOOM_WIDTH of the sound).
const MIN_ZOOM_WIDTH = 0.02;
const zoomRangeToLevel = range => 1 - (Math.log(range) / Math.log(MIN_ZOOM_WIDTH));

const SoundEditor = props => (
    <div
        className={styles.editorContainer}
        ref={props.setRef}
        onMouseDown={props.onContainerClick}
    >
        <div className={styles.row}>
            <div className={styles.inputGroup}>
                <Label text={props.intl.formatMessage(messages.sound)}>
                    <BufferedInput
                        tabIndex="1"
                        type="text"
                        value={props.name}
                        onSubmit={props.onChangeName}
                        className={styles.nameInput}
                    />
                </Label>
                <div className={styles.buttonGroup}>
                    <button
                        className={styles.button}
                        disabled={!props.canUndo}
                        title={props.intl.formatMessage(messages.undo)}
                        onClick={props.onUndo}
                    >
                        <TWRenderRecoloredImage
                            className={styles.undoIcon}
                            draggable={false}
                            src={undoIcon}
                        />
                    </button>
                    <button
                        className={styles.button}
                        disabled={!props.canRedo}
                        title={props.intl.formatMessage(messages.redo)}
                        onClick={props.onRedo}
                    >
                        <TWRenderRecoloredImage
                            className={styles.redoIcon}
                            draggable={false}
                            src={redoIcon}
                        />
                    </button>
                </div>
            </div>
            <div className={styles.inputGroup}>
                <IconButton
                    className={styles.toolButton}
                    img={copyIcon}
                    title={props.intl.formatMessage(messages.copy)}
                    onClick={props.onCopy}
                />
                <IconButton
                    className={styles.toolButton}
                    disabled={props.canPaste === false}
                    img={pasteIcon}
                    title={props.intl.formatMessage(messages.paste)}
                    onClick={props.onPaste}
                />
                <IconButton
                    className={classNames(styles.toolButton, styles.flipInRtl)}
                    img={copyToNewIcon}
                    title={props.intl.formatMessage(messages.copyToNew)}
                    onClick={props.onCopyToNew}
                />
                {props.isAdvancedStyle && (
                    <IconButton
                        className={styles.toolButton}
                        disabled={props.trimStart === null}
                        img={cutIcon}
                        title={props.intl.formatMessage(messages.cut)}
                        onClick={props.onCut}
                    />
                )}
            </div>
            <IconButton
                className={styles.toolButton}
                disabled={props.trimStart === null}
                img={deleteIcon}
                title={props.intl.formatMessage(messages.delete)}
                onClick={props.onDelete}
            />
            {props.isAdvancedStyle && (
                <IconButton
                    className={styles.toolButton}
                    disabled={props.trimStart === null}
                    img={deleteInverseIcon}
                    title={props.intl.formatMessage(messages.deleteInverse)}
                    onClick={props.onDeleteInverse}
                />
            )}
        </div>
        <div className={styles.row}>
            <div className={styles.waveformContainer}>
                <Waveform
                    data={props.chunkLevels.slice(
                        Math.floor(props.zoomStart * props.chunkLevels.length),
                        Math.max(Math.floor(props.zoomStart * props.chunkLevels.length) + 1,
                            Math.ceil(props.zoomEnd * props.chunkLevels.length))
                    )}
                    height={160}
                    width={600}
                />
                <AudioSelector
                    playhead={props.playhead}
                    trimEnd={props.trimEnd}
                    trimStart={props.trimStart}
                    zoomEnd={props.zoomEnd}
                    zoomStart={props.zoomStart}
                    onPlay={props.onPlay}
                    onSetTrim={props.onSetTrim}
                    onStop={props.onStop}
                />
            </div>
        </div>
        {props.isAdvancedStyle && (
            <div className={styles.row}>
                <div className={styles.advancedTools}>
                    <div className={styles.zoomControls}>
                        <IconButton
                            className={styles.toolButton}
                            disabled={props.trimStart === null}
                            img={zoomFitIcon}
                            title={props.intl.formatMessage(messages.zoomToSelection)}
                            onClick={props.onZoomToSelection}
                        />
                        <IconButton
                            className={styles.toolButton}
                            img={zoomInIcon}
                            title={props.intl.formatMessage(messages.zoomIn)}
                            onClick={props.onZoomIn}
                        />
                        <IconButton
                            className={styles.toolButton}
                            img={zoomOutIcon}
                            title={props.intl.formatMessage(messages.zoomOut)}
                            onClick={props.onZoomOut}
                        />
                        <IconButton
                            className={styles.toolButton}
                            img={zoomResetIcon}
                            title={props.intl.formatMessage(messages.zoomReset)}
                            onClick={props.onZoomReset}
                        />
                        <input
                            aria-label={props.intl.formatMessage(messages.zoomIn)}
                            className={styles.zoomSlider}
                            max={1}
                            min={0}
                            step={0.01}
                            type="range"
                            value={zoomRangeToLevel(props.zoomEnd - props.zoomStart)}
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => props.onZoomSlider(Number(e.target.value))}
                        />
                    </div>
                    <div className={styles.selectionTools}>
                        <IconButton
                            className={styles.toolButton}
                            disabled={props.trimStart === null}
                            img={keepIcon}
                            title={props.intl.formatMessage(messages.keepSelection)}
                            onClick={props.onKeepSelection}
                        />
                        <IconButton
                            className={styles.toolButton}
                            disabled={props.trimStart === null}
                            img={muteIcon}
                            title={props.intl.formatMessage(messages.silenceSelection)}
                            onClick={props.onSilenceSelection}
                        />
                    </div>
                    <div className={styles.volumeTools}>
                        <IconButton
                            className={styles.toolButton}
                            img={normalizeIcon}
                            title={props.intl.formatMessage(messages.normalize)}
                            onClick={props.onNormalize}
                        />
                        <input
                            aria-label={props.intl.formatMessage(messages.gain)}
                            className={styles.gainSlider}
                            max={24}
                            min={-24}
                            step={1}
                            type="range"
                            value={props.previewGainDb}
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => props.onGainSliderChange(Number(e.target.value))}
                            // eslint-disable-next-line react/jsx-no-bind
                            onMouseUp={() => props.onGainSliderCommit(props.previewGainDb)}
                            // eslint-disable-next-line react/jsx-no-bind
                            onTouchEnd={() => props.onGainSliderCommit(props.previewGainDb)}
                        />
                        <span className={styles.gainValue}>
                            {props.previewGainDb > 0 ? `+${props.previewGainDb}` : props.previewGainDb}{' dB'}
                        </span>
                        <button
                            className={styles.gainApplyButton}
                            disabled={props.previewGainDb === 0}
                            title={props.intl.formatMessage(messages.applyGain)}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => props.onApplyGain(props.previewGainDb)}
                        >
                            {props.intl.formatMessage(messages.applyGain)}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {props.isAdvancedStyle && (
            <div className={styles.row}>
                <div className={styles.advancedViewTabs}>
                    <button
                        className={props.activeView === 'wave' ? styles.advancedTabActive : styles.advancedTab}
                        title={props.intl.formatMessage(messages.viewWave)}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => props.onSetActiveView('wave')}
                    >
                        {props.intl.formatMessage(messages.viewWave)}
                    </button>
                    <button
                        className={props.activeView === 'spectrum' ? styles.advancedTabActive : styles.advancedTab}
                        title={props.intl.formatMessage(messages.viewSpectrum)}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => props.onSetActiveView('spectrum')}
                    >
                        {props.intl.formatMessage(messages.viewSpectrum)}
                    </button>
                    <button
                        className={props.activeView === 'pianoroll' ? styles.advancedTabActive : styles.advancedTab}
                        title={props.intl.formatMessage(messages.viewPianoRoll)}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => props.onSetActiveView('pianoroll')}
                    >
                        {props.intl.formatMessage(messages.viewPianoRoll)}
                    </button>
                    <button
                        className={props.activeView === 'mixer' ? styles.advancedTabActive : styles.advancedTab}
                        title={props.intl.formatMessage(messages.viewMixer)}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => props.onSetActiveView('mixer')}
                    >
                        {props.intl.formatMessage(messages.viewMixer)}
                    </button>
                </div>
                <div className={styles.advancedViewPanel}>
                    {props.activeView === 'wave' && (
                        <React.Fragment>
                            <EnvelopeEditor
                                envelope={props.envelope}
                                onChange={props.onEnvelopeChange}
                                sampleRate={props.sampleRate}
                                samples={props.samples}
                                width={600}
                                height={180}
                            />
                            <div className={styles.envelopeToolbar}>
                                <span className={styles.advancedHint}>
                                    {props.intl.formatMessage(messages.envelopeHint)}
                                </span>
                                <button
                                    className={styles.envelopeApplyButton}
                                    title={props.intl.formatMessage(messages.applyEnvelope)}
                                    onClick={props.onApplyEnvelope}
                                >
                                    {props.intl.formatMessage(messages.applyEnvelope)}
                                </button>
                            </div>
                        </React.Fragment>
                    )}
                    {props.activeView === 'spectrum' && props.spectrumFrames && (
                        <SpectrumView
                            bandLabels={props.spectrumFrames.bandLabels}
                            frames={props.spectrumFrames.frames}
                            height={220}
                            playhead={props.playhead}
                            width={600}
                        />
                    )}
                    {props.activeView === 'pianoroll' && (
                        <React.Fragment>
                            <PianoRoll
                                bpm={120}
                                height={300}
                                notes={props.notes}
                                onChange={props.onNotesChange}
                                onExportMidi={props.onExportMidi}
                                onRenderToTrack={props.onRenderNotes}
                                width={600}
                            />
                            <div className={styles.advancedHint}>
                                {props.intl.formatMessage(messages.pianoRollHint)}
                            </div>
                        </React.Fragment>
                    )}
                    {props.activeView === 'mixer' && (
                        <Mixer
                            isPlaying={props.mixerPlaying}
                            tracks={props.tracks || []}
                            onAddTrack={props.onTrackAdd}
                            onCommitMix={props.onCommitMix}
                            onMoveTrack={props.onTrackMove}
                            onPanChange={props.onPanChange}
                            onPlayMix={props.onPlayMix}
                            onRemoveTrack={props.onTrackRemove}
                            onStopMix={props.onStopMix}
                            onToggleMute={props.onToggleMute}
                            onToggleSolo={props.onToggleSolo}
                            onVolumeChange={props.onVolumeChange}
                        />
                    )}
                </div>
            </div>
        )}
        <div className={classNames(styles.row, styles.rowReverse)}>
            <div className={classNames(styles.roundButtonOuter, styles.inputGroup)}>
                {props.isAdvancedStyle ? (
                    <React.Fragment>
                        {props.paused ? (
                            <button
                                className={classNames(styles.roundButton, styles.playButton)}
                                title={props.intl.formatMessage(messages.resume)}
                                onClick={props.onResume}
                            >
                                <img
                                    draggable={false}
                                    src={playIcon}
                                />
                            </button>
                        ) : props.playhead ? (
                            <button
                                className={classNames(styles.roundButton, styles.stopButtonn)}
                                title={props.intl.formatMessage(messages.pause)}
                                onClick={props.onPause}
                            >
                                <img
                                    draggable={false}
                                    src={pauseIcon}
                                />
                            </button>
                        ) : (
                            <button
                                className={classNames(styles.roundButton, styles.playButton)}
                                title={props.intl.formatMessage(messages.play)}
                                onClick={props.onPlay}
                            >
                                <img
                                    draggable={false}
                                    src={playIcon}
                                />
                            </button>
                        )}
                        <button
                            className={classNames(styles.loopButton, props.isLooping ? styles.loopButtonActive : null)}
                            title={props.intl.formatMessage(messages.loop)}
                            onClick={props.onToggleLoop}
                        >
                            <img
                                draggable={false}
                                src={loopIcon}
                            />
                        </button>
                        {(props.playhead || props.paused) && (
                            <button
                                className={classNames(styles.roundButton, styles.stopButtonn, styles.stopMiniButton)}
                                title={props.intl.formatMessage(messages.stop)}
                                onClick={props.onStop}
                            >
                                <img
                                    draggable={false}
                                    src={stopIcon}
                                />
                            </button>
                        )}
                    </React.Fragment>
                ) : (
                    props.playhead ? (
                        <button
                            className={classNames(styles.roundButton, styles.stopButtonn)}
                            title={props.intl.formatMessage(messages.stop)}
                            onClick={props.onStop}
                        >
                            <img
                                draggable={false}
                                src={stopIcon}
                            />
                        </button>
                    ) : (
                        <button
                            className={classNames(styles.roundButton, styles.playButton)}
                            title={props.intl.formatMessage(messages.play)}
                            onClick={props.onPlay}
                        >
                            <img
                                draggable={false}
                                src={playIcon}
                            />
                        </button>
                    )
                )}
            </div>
            <div className={styles.effects}>
                <IconButton
                    className={styles.effectButton}
                    img={fasterIcon}
                    title={<FormattedMessage {...messages.faster} />}
                    onClick={props.onFaster}
                />
                <IconButton
                    className={styles.effectButton}
                    img={slowerIcon}
                    title={<FormattedMessage {...messages.slower} />}
                    onClick={props.onSlower}
                />
                <IconButton
                    disabled={props.tooLoud}
                    className={classNames(styles.effectButton, styles.flipInRtl)}
                    img={louderIcon}
                    title={<FormattedMessage {...messages.louder} />}
                    onClick={props.onLouder}
                />
                <IconButton
                    className={classNames(styles.effectButton, styles.flipInRtl)}
                    img={softerIcon}
                    title={<FormattedMessage {...messages.softer} />}
                    onClick={props.onSofter}
                />
                <IconButton
                    className={classNames(styles.effectButton, styles.flipInRtl)}
                    img={muteIcon}
                    title={<FormattedMessage {...messages.mute} />}
                    onClick={props.onMute}
                />
                <IconButton
                    className={styles.effectButton}
                    img={fadeInIcon}
                    title={props.isAdvancedStyle ?
                        <FormattedMessage {...messages.fadeInSoft} /> :
                        <FormattedMessage {...messages.fadeIn} />}
                    onClick={props.onFadeIn}
                />
                <IconButton
                    className={styles.effectButton}
                    img={fadeOutIcon}
                    title={props.isAdvancedStyle ?
                        <FormattedMessage {...messages.fadeOutSoft} /> :
                        <FormattedMessage {...messages.fadeOut} />}
                    onClick={props.onFadeOut}
                />
                <IconButton
                    className={styles.effectButton}
                    img={reverseIcon}
                    title={<FormattedMessage {...messages.reverse} />}
                    onClick={props.onReverse}
                />
                <IconButton
                    className={styles.effectButton}
                    img={robotIcon}
                    title={<FormattedMessage {...messages.robot} />}
                    onClick={props.onRobot}
                />
                <IconButton
                    className={styles.effectButton}
                    img={echoIcon}
                    title={<FormattedMessage {...messages.echo} />}
                    onClick={props.onEcho}
                />
            </div>
        </div>
        <div className={styles.infoRow}>
            <div className={styles.duration}>
                {formatDuration(props.playhead, props.trimStart, props.trimEnd, props.duration)}
            </div>
            <div className={styles.advancedInfo}>
                {props.isStereo ? (
                    <FormattedMessage
                        defaultMessage="Stereo"
                        description="Refers to a 'Stereo Sound' (2 channels)"
                        id="tw.stereo"
                    />
                ) : (
                    <FormattedMessage
                        defaultMessage="Mono"
                        description="Refers to a 'Mono Sound' (1 channel)"
                        id="tw.mono"
                    />
                )}
                {` (${formatSoundSize(props.size)})`}
            </div>
        </div>
        {/* TODO: don't know whether this should be > or >=. Using >= for now to be safe */}
        {props.size >= SOUND_BYTE_LIMIT && (
            <div className={classNames(styles.alert, styles.tooLarge)}>
                <FormattedMessage
                    defaultMessage="This sound may be too large to upload to Scratch."
                    description="Message that appears when a sound exceeds the Scratch sound size limit."
                    id="tw.tooLarge"
                />
            </div>
        )}
        {props.isStereo && (
            <div className={classNames(styles.alert, styles.stereo)}>
                <FormattedMessage
                    defaultMessage="Editing this stereo sound will irreversibly convert it to mono."
                    description="Message that appears when editing a stereo sound."
                    id="tw.stereoAlert"
                />
            </div>
        )}
    </div>
);

SoundEditor.propTypes = {
    isStereo: PropTypes.bool.isRequired,
    isAdvancedStyle: PropTypes.bool,
    duration: PropTypes.number.isRequired,
    size: PropTypes.number.isRequired,
    canPaste: PropTypes.bool.isRequired,
    canRedo: PropTypes.bool.isRequired,
    canUndo: PropTypes.bool.isRequired,
    chunkLevels: PropTypes.arrayOf(PropTypes.number).isRequired,
    intl: intlShape,
    name: PropTypes.string.isRequired,
    onChangeName: PropTypes.func.isRequired,
    onContainerClick: PropTypes.func.isRequired,
    onCopy: PropTypes.func.isRequired,
    onCopyToNew: PropTypes.func.isRequired,
    onCut: PropTypes.func,
    onDelete: PropTypes.func,
    onDeleteInverse: PropTypes.func,
    onEcho: PropTypes.func.isRequired,
    onFadeIn: PropTypes.func.isRequired,
    onFadeOut: PropTypes.func.isRequired,
    onFaster: PropTypes.func.isRequired,
    onLouder: PropTypes.func.isRequired,
    onMute: PropTypes.func.isRequired,
    onPaste: PropTypes.func.isRequired,
    onPause: PropTypes.func,
    onPlay: PropTypes.func.isRequired,
    onRedo: PropTypes.func.isRequired,
    onReverse: PropTypes.func.isRequired,
    onResume: PropTypes.func,
    onRobot: PropTypes.func.isRequired,
    onSetTrim: PropTypes.func,
    onSlower: PropTypes.func.isRequired,
    onSofter: PropTypes.func.isRequired,
    onStop: PropTypes.func.isRequired,
    onToggleLoop: PropTypes.func,
    onUndo: PropTypes.func.isRequired,
    isLooping: PropTypes.bool,
    paused: PropTypes.bool,
    playhead: PropTypes.number,
    setRef: PropTypes.func,
    tooLoud: PropTypes.bool.isRequired,
    trimEnd: PropTypes.number,
    trimStart: PropTypes.number,
    zoomEnd: PropTypes.number,
    zoomStart: PropTypes.number,
    previewGainDb: PropTypes.number,
    onApplyGain: PropTypes.func,
    onGainSliderChange: PropTypes.func,
    onGainSliderCommit: PropTypes.func,
    onKeepSelection: PropTypes.func,
    onNormalize: PropTypes.func,
    onSilenceSelection: PropTypes.func,
    onZoomIn: PropTypes.func,
    onZoomOut: PropTypes.func,
    onZoomReset: PropTypes.func,
    onZoomSlider: PropTypes.func,
    onZoomToSelection: PropTypes.func,
    samples: PropTypes.instanceOf(Float32Array),
    sampleRate: PropTypes.number,
    activeView: PropTypes.string,
    envelope: PropTypes.arrayOf(PropTypes.shape({
        t: PropTypes.number,
        value: PropTypes.number
    })),
    spectrumFrames: PropTypes.shape({
        frames: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)),
        bandLabels: PropTypes.arrayOf(PropTypes.string)
    }),
    tracks: PropTypes.arrayOf(PropTypes.object),
    notes: PropTypes.arrayOf(PropTypes.object),
    mixerPlaying: PropTypes.bool,
    onSetActiveView: PropTypes.func,
    onEnvelopeChange: PropTypes.func,
    onApplyEnvelope: PropTypes.func,
    onTrackAdd: PropTypes.func,
    onTrackRemove: PropTypes.func,
    onTrackMove: PropTypes.func,
    onToggleMute: PropTypes.func,
    onToggleSolo: PropTypes.func,
    onVolumeChange: PropTypes.func,
    onPanChange: PropTypes.func,
    onPlayMix: PropTypes.func,
    onStopMix: PropTypes.func,
    onCommitMix: PropTypes.func,
    onNotesChange: PropTypes.func,
    onRenderNotes: PropTypes.func,
    onExportMidi: PropTypes.func
};

export default injectIntl(SoundEditor);
