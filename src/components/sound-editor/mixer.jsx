// Mixer for the advanced sound editor.
// Multi-track strip UI: add / remove tracks, mute (M) / solo (S), per-track
// volume slider, pan slider, move tracks up / down. Preview playback is
// handled by MultiTrackPlayer in the container; committing the mix downmixes
// everything to one mono buffer through mixTracksToMono + submitNewSamples.
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import styles from './mixer.css';

const messages = defineMessages({
    mixer: {
        id: 'tw.soundEditor.mixer',
        description: 'Mixer panel heading',
        defaultMessage: 'Mixer'
    },
    addTrack: {
        id: 'tw.soundEditor.mixerAddTrack',
        description: 'Button to add a new track',
        defaultMessage: 'Add Track'
    },
    removeTrack: {
        id: 'tw.soundEditor.mixerRemoveTrack',
        description: 'Button to remove a track',
        defaultMessage: 'Remove Track'
    },
    mute: {
        id: 'tw.soundEditor.mixerMute',
        description: 'Button to mute a track',
        defaultMessage: 'M'
    },
    solo: {
        id: 'tw.soundEditor.mixerSolo',
        description: 'Button to solo a track',
        defaultMessage: 'S'
    },
    volume: {
        id: 'tw.soundEditor.mixerVolume',
        description: 'Volume slider label',
        defaultMessage: 'Vol'
    },
    pan: {
        id: 'tw.soundEditor.mixerPan',
        description: 'Pan slider label',
        defaultMessage: 'Pan'
    },
    moveUp: {
        id: 'tw.soundEditor.mixerMoveUp',
        description: 'Button to move a track up',
        defaultMessage: 'Up'
    },
    moveDown: {
        id: 'tw.soundEditor.mixerMoveDown',
        description: 'Button to move a track down',
        defaultMessage: 'Down'
    },
    playMix: {
        id: 'tw.soundEditor.mixerPlay',
        description: 'Button to play the mix',
        defaultMessage: 'Play Mix'
    },
    stopMix: {
        id: 'tw.soundEditor.mixerStop',
        description: 'Button to stop the mix',
        defaultMessage: 'Stop'
    },
    commitMix: {
        id: 'tw.soundEditor.mixerCommit',
        description: 'Button to downmix all tracks into the sound',
        defaultMessage: 'Commit Mix to Sound'
    },
    commitHint: {
        id: 'tw.soundEditor.mixerCommitHint',
        description: 'Hint under the commit button',
        defaultMessage: 'Commit downmixes all audible tracks to one mono sound (undoable).'
    },
    empty: {
        id: 'tw.soundEditor.mixerEmpty',
        description: 'Empty state message when no tracks exist',
        defaultMessage: 'No tracks. Click "Add Track" to create one.'
    }
});

const Mixer = props => {
    const {formatMessage} = props.intl;
    return (
        <div className={styles.mixerContainer}>
            <div className={styles.mixerHeader}>
                {formatMessage(messages.mixer)}
            </div>
            {props.tracks.length === 0 && (
                <div className={styles.mixerEmpty}>
                    {formatMessage(messages.empty)}
                </div>
            )}
            {props.tracks.map((track, index) => (
                <div
                    className={styles.mixerTrack}
                    key={track.id}
                >
                    <span
                        className={styles.mixerTrackName}
                        title={track.name}
                    >
                        {track.name}
                    </span>
                    <button
                        className={track.muted ? styles.muteButtonActive : styles.muteButton}
                        title={formatMessage(messages.mute)}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => props.onToggleMute(track.id)}
                    >
                        {formatMessage(messages.mute)}
                    </button>
                    <button
                        className={track.solo ? styles.soloButtonActive : styles.soloButton}
                        title={formatMessage(messages.solo)}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => props.onToggleSolo(track.id)}
                    >
                        {formatMessage(messages.solo)}
                    </button>
                    <label className={styles.mixerSliderLabel}>
                        {formatMessage(messages.volume)}
                        <input
                            className={styles.mixerSlider}
                            type="range"
                            min="0"
                            max="2"
                            step="0.05"
                            value={track.volume}
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => props.onVolumeChange(track.id, Number(e.target.value))}
                        />
                        <span className={styles.mixerSliderValue}>
                            {`${Math.round(track.volume * 100)}%`}
                        </span>
                    </label>
                    <label className={styles.mixerSliderLabel}>
                        {formatMessage(messages.pan)}
                        <input
                            className={styles.mixerSlider}
                            type="range"
                            min="-1"
                            max="1"
                            step="0.05"
                            value={track.pan}
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => props.onPanChange(track.id, Number(e.target.value))}
                        />
                        <span className={styles.mixerSliderValue}>
                            {track.pan === 0 ? 'C' : track.pan < 0 ?
                                `L${Math.round(-track.pan * 100)}` :
                                `R${Math.round(track.pan * 100)}`}
                        </span>
                    </label>
                    <div className={styles.mixerTrackActions}>
                        <button
                            className={styles.smallButton}
                            disabled={index === 0}
                            title={formatMessage(messages.moveUp)}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => props.onMoveTrack(track.id, 'up')}
                        >
                            {'▲'}
                        </button>
                        <button
                            className={styles.smallButton}
                            disabled={index === props.tracks.length - 1}
                            title={formatMessage(messages.moveDown)}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => props.onMoveTrack(track.id, 'down')}
                        >
                            {'▼'}
                        </button>
                        <button
                            className={styles.smallButton}
                            disabled={props.tracks.length <= 1}
                            title={formatMessage(messages.removeTrack)}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => props.onRemoveTrack(track.id)}
                        >
                            {'✕'}
                        </button>
                    </div>
                </div>
            ))}
            <div className={styles.mixerFooter}>
                <button
                    className={styles.footerButton}
                    onClick={props.onAddTrack}
                >
                    {'+'} {formatMessage(messages.addTrack)}
                </button>
                {props.isPlaying ? (
                    <button
                        className={styles.footerButton}
                        onClick={props.onStopMix}
                    >
                        {formatMessage(messages.stopMix)}
                    </button>
                ) : (
                    <button
                        className={styles.footerButton}
                        onClick={props.onPlayMix}
                    >
                        {formatMessage(messages.playMix)}
                    </button>
                )}
                <button
                    className={styles.commitButton}
                    onClick={props.onCommitMix}
                >
                    {formatMessage(messages.commitMix)}
                </button>
            </div>
            <div className={styles.commitHint}>
                {formatMessage(messages.commitHint)}
            </div>
        </div>
    );
};

Mixer.propTypes = {
    intl: intlShape,
    tracks: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        name: PropTypes.string,
        volume: PropTypes.number,
        pan: PropTypes.number,
        muted: PropTypes.bool,
        solo: PropTypes.bool
    })).isRequired,
    isPlaying: PropTypes.bool,
    onAddTrack: PropTypes.func.isRequired,
    onRemoveTrack: PropTypes.func.isRequired,
    onMoveTrack: PropTypes.func.isRequired,
    onToggleMute: PropTypes.func.isRequired,
    onToggleSolo: PropTypes.func.isRequired,
    onVolumeChange: PropTypes.func.isRequired,
    onPanChange: PropTypes.func.isRequired,
    onPlayMix: PropTypes.func.isRequired,
    onStopMix: PropTypes.func.isRequired,
    onCommitMix: PropTypes.func.isRequired
};

Mixer.defaultProps = {
    isPlaying: false
};

export default injectIntl(Mixer);
