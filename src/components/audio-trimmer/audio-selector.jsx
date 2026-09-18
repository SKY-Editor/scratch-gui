import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import Box from '../box/box.jsx';
import styles from './audio-trimmer.css';
import SelectionHandle from './selection-handle.jsx';
import Playhead from './playhead.jsx';

// Convert a global percentage [0,1] of the whole sound into a local percentage
// [0,1] within the visible zoom window. Values outside the window map outside
// [0,1], so callers should clamp/ignore them.
const globalToLocal = (global, zoomStart, zoomEnd) => (global - zoomStart) / (zoomEnd - zoomStart);

const AudioSelector = props => {
    const zoomStart = props.zoomStart || 0;
    const zoomEnd = props.zoomEnd || 1;
    let selectionStyle = null;
    if (props.trimStart !== null) {
        const localStart = globalToLocal(props.trimStart, zoomStart, zoomEnd);
        const localEnd = globalToLocal(props.trimEnd, zoomStart, zoomEnd);
        const visibleStart = Math.max(0, Math.min(1, localStart));
        const visibleEnd = Math.max(0, Math.min(1, localEnd));
        if (visibleEnd - visibleStart > 0) {
            selectionStyle = {
                left: `${visibleStart * 100}%`,
                width: `${100 * (visibleEnd - visibleStart)}%`
            };
        }
    }
    let localPlayhead = null;
    if (props.playhead !== null && props.playhead !== undefined) {
        localPlayhead = globalToLocal(props.playhead, zoomStart, zoomEnd);
    }
    return (
        <div
            className={classNames(styles.absolute, styles.selector)}
            ref={props.containerRef}
            onMouseDown={props.onNewSelectionMouseDown}
            onTouchStart={props.onNewSelectionMouseDown}
        >
            {selectionStyle === null ? null : (
                <Box
                    className={classNames(styles.absolute)}
                    style={selectionStyle}
                >
                    <Box className={classNames(styles.absolute, styles.selectionBackground)} />
                    <SelectionHandle
                        handleStyle={styles.leftHandle}
                        onMouseDown={props.onTrimStartMouseDown}
                    />
                    <SelectionHandle
                        handleStyle={styles.rightHandle}
                        onMouseDown={props.onTrimEndMouseDown}
                    />
                </Box>
            )}
            {(localPlayhead !== null && localPlayhead >= 0 && localPlayhead <= 1) ? (
                <Playhead
                    playbackPosition={localPlayhead}
                />
            ) : null}
        </div>
    );
};

AudioSelector.propTypes = {
    containerRef: PropTypes.func,
    onNewSelectionMouseDown: PropTypes.func.isRequired,
    onTrimEndMouseDown: PropTypes.func.isRequired,
    onTrimStartMouseDown: PropTypes.func.isRequired,
    playhead: PropTypes.number,
    trimEnd: PropTypes.number,
    trimStart: PropTypes.number,
    zoomEnd: PropTypes.number,
    zoomStart: PropTypes.number
};

export default AudioSelector;
