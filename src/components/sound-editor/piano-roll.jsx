// Piano roll for the advanced sound editor.
// Canvas component: piano keys on the left, a beat grid with draggable note
// blocks on the right. Notes are {id, note (MIDI), startBeat, durationBeat,
// velocity}. Interactions:
//   - click empty grid cell: add a note of the selected length
//   - drag a note: move it (beat snap = 0.25, pitch snap = 1 semitone)
//   - right-click a note: delete it
//   - click a note: select it; Delete/Backspace deletes the selection
//   - double-click empty grid: clear all notes
import PropTypes from 'prop-types';
import React, {useEffect, useRef, useState} from 'react';

import styles from './piano-roll.css';

const KEY_WIDTH = 56;
const LOW_NOTE = 48; // C3
const HIGH_NOTE = 83; // B5
const NOTE_RANGE = HIGH_NOTE - LOW_NOTE + 1;
const BEATS_PER_BAR = 4;
const TOTAL_BEATS = 16; // 4 bars
const BEAT_SNAP = 0.25;
const LENGTH_OPTIONS = [0.25, 0.5, 1, 2, 4];

const isBlackKey = note => {
    const pc = note % 12;
    return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
};

const noteToY = (note, height) =>
    (HIGH_NOTE - note) / NOTE_RANGE * height;

const noteColor = note => {
    const t = (note - LOW_NOTE) / (NOTE_RANGE - 1);
    return `hsl(${Math.round(210 - (150 * t))}, 80%, 55%)`;
};

const PianoRoll = props => {
    const canvasRef = useRef(null);
    const nextIdRef = useRef(1);
    const dragRef = useRef(null); // {id, startBeat, note, offsetBeat}
    const [selectedId, setSelectedId] = useState(null);
    const [noteLength, setNoteLength] = useState(1);
    const {notes, onChange, width, height, bpm} = props;

    const gridWidth = width - KEY_WIDTH;
    const beatWidth = gridWidth / TOTAL_BEATS;
    const rowHeight = height / NOTE_RANGE;

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
            canvas.width = width * dpr;
            canvas.height = height * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // Piano keys.
        for (let note = HIGH_NOTE; note >= LOW_NOTE; note--) {
            const y = noteToY(note, height);
            const black = isBlackKey(note);
            ctx.fillStyle = black ? '#333333' : '#ffffff';
            ctx.fillRect(0, y, KEY_WIDTH, rowHeight + 0.5);
            ctx.strokeStyle = '#999999';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(0, y, KEY_WIDTH, rowHeight + 0.5);
            if (!black && note % 12 === 0) {
                ctx.fillStyle = '#444444';
                ctx.font = '10px sans-serif';
                ctx.fillText(`C${Math.round(note / 12) - 1}`, 6, y + rowHeight - 4);
            }
        }

        // Grid.
        ctx.fillStyle = '#f7f9ff';
        ctx.fillRect(KEY_WIDTH, 0, gridWidth, height);
        for (let b = 0; b <= TOTAL_BEATS; b++) {
            const x = KEY_WIDTH + (b * beatWidth);
            ctx.strokeStyle = b % BEATS_PER_BAR === 0 ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.1)';
            ctx.lineWidth = b % BEATS_PER_BAR === 0 ? 1.5 : 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        // Beat numbers.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.font = '10px sans-serif';
        for (let b = 0; b < TOTAL_BEATS; b++) {
            ctx.fillText(`${b + 1}`, KEY_WIDTH + (b * beatWidth) + 3, 12);
        }

        // Notes.
        for (const n of notes) {
            const x = KEY_WIDTH + (n.startBeat * beatWidth);
            const y = noteToY(n.note, height);
            const w = Math.max(beatWidth * BEAT_SNAP, (n.durationBeat * beatWidth) - 1);
            const h = rowHeight - 1;
            ctx.fillStyle = noteColor(n.note);
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = n.id === selectedId ? '#ffffff' : 'rgba(0, 0, 0, 0.35)';
            ctx.lineWidth = n.id === selectedId ? 2 : 1;
            ctx.strokeRect(x, y, w, h);
        }
    };

    useEffect(() => {
        draw();
    });

    const hitTestNote = (gridX, y) => {
        const beat = gridX / beatWidth;
        const note = HIGH_NOTE - Math.floor(y / rowHeight);
        for (let i = notes.length - 1; i >= 0; i--) {
            const n = notes[i];
            if (beat >= n.startBeat && beat < n.startBeat + n.durationBeat &&
                note === n.note) {
                return i;
            }
        }
        return -1;
    };

    const handleMouseDown = e => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x < KEY_WIDTH) return; // Clicked the piano keys.
        const gridX = x - KEY_WIDTH;
        const hit = hitTestNote(gridX, y);
        if (hit >= 0) {
            const n = notes[hit];
            setSelectedId(n.id);
            dragRef.current = {
                id: n.id,
                startBeat: n.startBeat,
                note: n.note,
                offsetBeat: (gridX / beatWidth) - n.startBeat
            };
            return;
        }
        // Empty grid -> add a note.
        setSelectedId(null);
        const snappedBeat = Math.round((gridX / beatWidth) / BEAT_SNAP) * BEAT_SNAP;
        const beat = Math.max(0, Math.min(TOTAL_BEATS - noteLength, snappedBeat));
        const note = HIGH_NOTE - Math.floor(y / rowHeight);
        const newNote = {
            id: nextIdRef.current++,
            note,
            startBeat: beat,
            durationBeat: noteLength,
            velocity: 0.8
        };
        onChange([...notes, newNote]);
        setSelectedId(newNote.id);
    };

    const handleMouseMove = e => {
        const drag = dragRef.current;
        if (!drag) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x < KEY_WIDTH) return;
        const gridX = x - KEY_WIDTH;
        const rawBeat = (gridX / beatWidth) - drag.offsetBeat;
        const beat = Math.max(0, Math.min(TOTAL_BEATS - 0.25, Math.round(rawBeat / BEAT_SNAP) * BEAT_SNAP));
        const note = Math.max(LOW_NOTE, Math.min(HIGH_NOTE, HIGH_NOTE - Math.floor(y / rowHeight)));
        onChange(notes.map(n => {
            if (n.id === drag.id) {
                return {...n, startBeat: beat, note};
            }
            return n;
        }));
    };

    const handleMouseUp = () => {
        dragRef.current = null;
    };

    const handleContextMenu = e => {
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x < KEY_WIDTH) return;
        const hit = hitTestNote(x - KEY_WIDTH, y);
        if (hit >= 0) {
            onChange(notes.filter((_, i) => i !== hit));
            setSelectedId(null);
        }
    };

    const handleKeyDown = e => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedId !== null) {
                e.preventDefault();
                onChange(notes.filter(n => n.id !== selectedId));
                setSelectedId(null);
            }
        }
    };

    const handleDoubleClick = () => {
        onChange([]);
        setSelectedId(null);
    };

    return (
        <div className={styles.pianoRollContainer}>
            <div className={styles.pianoRollToolbar}>
                <span className={styles.pianoRollLabel}>
                    {`${TOTAL_BEATS / BEATS_PER_BAR} bars · ${bpm} BPM`}
                </span>
                <div className={styles.noteLengthGroup}>
                    {LENGTH_OPTIONS.map(len => (
                        <button
                            className={len === noteLength ? styles.lengthButtonActive : styles.lengthButton}
                            key={len}
                            title={`Note length: ${len} beat${len === 1 ? '' : 's'}`}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => setNoteLength(len)}
                        >
                            {len < 1 ? `${len * 4}/4` : `${len}`}
                        </button>
                    ))}
                </div>
                <button
                    className={styles.actionButton}
                    onClick={props.onRenderToTrack}
                >
                    {'Render to Track'}
                </button>
                <button
                    className={styles.actionButton}
                    onClick={props.onExportMidi}
                >
                    {'Export MIDI'}
                </button>
            </div>
            <canvas
                className={styles.pianoRollCanvas}
                ref={canvasRef}
                tabIndex="0"
                style={{width, height}}
                // eslint-disable-next-line react/jsx-no-bind
                onContextMenu={handleContextMenu}
                // eslint-disable-next-line react/jsx-no-bind
                onDoubleClick={handleDoubleClick}
                // eslint-disable-next-line react/jsx-no-bind
                onKeyDown={handleKeyDown}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseDown={handleMouseDown}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseLeave={handleMouseUp}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseMove={handleMouseMove}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseUp={handleMouseUp}
            />
        </div>
    );
};

PianoRoll.propTypes = {
    notes: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        note: PropTypes.number,
        startBeat: PropTypes.number,
        durationBeat: PropTypes.number,
        velocity: PropTypes.number
    })).isRequired,
    onChange: PropTypes.func.isRequired,
    onRenderToTrack: PropTypes.func.isRequired,
    onExportMidi: PropTypes.func.isRequired,
    width: PropTypes.number,
    height: PropTypes.number,
    bpm: PropTypes.number
};

PianoRoll.defaultProps = {
    width: 600,
    height: 300,
    bpm: 120
};

export default PianoRoll;
