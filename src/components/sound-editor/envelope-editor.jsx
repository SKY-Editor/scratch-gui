// Envelope editor for the advanced sound editor.
// Canvas component: draws the waveform (chunk RMS) as a background and an
// editable piecewise-linear volume envelope on top. The envelope is a list of
// {t: 0..1, value: 0..1} control points.
// Interactions:
//   - drag a control point to move it
//   - click near the line (not on a point) to add a control point
//   - right-click a control point to delete it (endpoints are protected)
//   - double-click to reset to a flat 1.0 envelope
import PropTypes from 'prop-types';
import React, {useEffect, useMemo, useRef} from 'react';

import {computeChunkedRMS} from '../../lib/audio/audio-util.js';

import styles from './envelope-editor.css';

const POINT_RADIUS = 6;
const HIT_RADIUS = 10;
const LINE_WIDTH = 2;

const distanceToSegment = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = (dx * dx) + (dy * dy);
    if (lenSq === 0) {
        return Math.hypot(px - ax, py - ay);
    }
    let t = ((((px - ax) * dx) + ((py - ay) * dy)) / lenSq);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + (t * dx)), py - (ay + (t * dy)));
};

const EnvelopeEditor = props => {
    const canvasRef = useRef(null);
    const dragIndexRef = useRef(null);
    const {chunkLevels, envelope, samples, width, height} = props;

    // Waveform background levels: prefer precomputed chunkLevels, otherwise
    // compute RMS chunks from the raw samples (deep-copied by the container
    // when submitting edits, so this stays in sync with the main buffer).
    const levels = useMemo(
        () => chunkLevels || computeChunkedRMS(samples),
        [chunkLevels, samples]
    );

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

        // Background waveform (chunk RMS).
        const n = levels.length;
        if (n > 0) {
            ctx.strokeStyle = 'rgba(145, 145, 255, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const mid = height / 2;
            for (let i = 0; i < n; i++) {
                const x = (i / Math.max(1, n - 1)) * width;
                const rms = Math.max(0, Math.min(1, levels[i])) * ((height / 2) - 4);
                ctx.moveTo(x, mid - rms);
                ctx.lineTo(x, mid + rms);
            }
            ctx.stroke();
            // Center line.
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.beginPath();
            ctx.moveTo(0, mid);
            ctx.lineTo(width, mid);
            ctx.stroke();
        }

        // Envelope polyline.
        if (envelope && envelope.length > 0) {
            ctx.strokeStyle = '#4c97ff';
            ctx.lineWidth = LINE_WIDTH;
            ctx.beginPath();
            for (let i = 0; i < envelope.length; i++) {
                const x = envelope[i].t * width;
                const y = (1 - envelope[i].value) * height;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // Control points.
            for (let i = 0; i < envelope.length; i++) {
                const x = envelope[i].t * width;
                const y = (1 - envelope[i].value) * height;
                ctx.beginPath();
                ctx.arc(x, y, POINT_RADIUS, 0, 2 * Math.PI);
                ctx.fillStyle = i === 0 || i === envelope.length - 1 ? '#ffab19' : '#4c97ff';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
    };

    useEffect(() => {
        draw();
    });

    const pointFromEvent = e => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        return {
            t: Math.max(0, Math.min(1, x / width)),
            value: Math.max(0, Math.min(1, 1 - (y / height))),
            x,
            y
        };
    };

    const hitTestPoint = (x, y) => {
        if (!props.envelope) return -1;
        for (let i = 0; i < props.envelope.length; i++) {
            const px = props.envelope[i].t * width;
            const py = (1 - props.envelope[i].value) * height;
            if (Math.hypot(x - px, y - py) <= HIT_RADIUS) {
                return i;
            }
        }
        return -1;
    };

    const hitTestLine = (x, y) => {
        if (!props.envelope || props.envelope.length < 2) return -1;
        for (let i = 0; i < props.envelope.length - 1; i++) {
            const ax = props.envelope[i].t * width;
            const ay = (1 - props.envelope[i].value) * height;
            const bx = props.envelope[i + 1].t * width;
            const by = (1 - props.envelope[i + 1].value) * height;
            if (distanceToSegment(x, y, ax, ay, bx, by) <= HIT_RADIUS) {
                return i;
            }
        }
        return -1;
    };

    const handleMouseDown = e => {
        e.preventDefault();
        const {x, y} = pointFromEvent(e);
        const pointIndex = hitTestPoint(x, y);
        if (pointIndex >= 0) {
            dragIndexRef.current = pointIndex;
            return;
        }
        // Clicking the line (or empty space) adds a control point.
        const segIndex = hitTestLine(x, y);
        const {t, value} = pointFromEvent(e);
        const newEnvelope = props.envelope.slice();
        if (segIndex >= 0) {
            newEnvelope.splice(segIndex + 1, 0, {t, value});
        } else {
            newEnvelope.push({t, value});
            newEnvelope.sort((a, b) => a.t - b.t);
        }
        const found = newEnvelope.find(
            p => Math.abs(p.t - t) < 1e-6 && Math.abs(p.value - value) < 1e-6
        );
        dragIndexRef.current = newEnvelope.indexOf(found);
        props.onChange(newEnvelope);
    };

    const handleMouseMove = e => {
        if (dragIndexRef.current === null) return;
        const {t, value} = pointFromEvent(e);
        const newEnvelope = props.envelope.slice();
        newEnvelope[dragIndexRef.current] = {t, value};
        props.onChange(newEnvelope);
    };

    const handleMouseUp = () => {
        dragIndexRef.current = null;
    };

    const handleContextMenu = e => {
        e.preventDefault();
        const {x, y} = pointFromEvent(e);
        const pointIndex = hitTestPoint(x, y);
        if (pointIndex <= 0 || pointIndex >= props.envelope.length - 1) {
            return; // Endpoints are protected.
        }
        const newEnvelope = props.envelope.slice();
        newEnvelope.splice(pointIndex, 1);
        props.onChange(newEnvelope);
    };

    const handleDoubleClick = () => {
        props.onChange([{t: 0, value: 1}, {t: 1, value: 1}]);
    };

    return (
        <canvas
            className={styles.envelopeCanvas}
            ref={canvasRef}
            style={{width, height}}
            // eslint-disable-next-line react/jsx-no-bind
            onContextMenu={handleContextMenu}
            // eslint-disable-next-line react/jsx-no-bind
            onDoubleClick={handleDoubleClick}
            // eslint-disable-next-line react/jsx-no-bind
            onMouseDown={handleMouseDown}
            // eslint-disable-next-line react/jsx-no-bind
            onMouseLeave={handleMouseUp}
            // eslint-disable-next-line react/jsx-no-bind
            onMouseMove={handleMouseMove}
            // eslint-disable-next-line react/jsx-no-bind
            onMouseUp={handleMouseUp}
        />
    );
};

EnvelopeEditor.propTypes = {
    chunkLevels: PropTypes.arrayOf(PropTypes.number),
    envelope: PropTypes.arrayOf(PropTypes.shape({
        t: PropTypes.number,
        value: PropTypes.number
    })).isRequired,
    onChange: PropTypes.func.isRequired,
    samples: PropTypes.instanceOf(Float32Array),
    width: PropTypes.number,
    height: PropTypes.number
};

EnvelopeEditor.defaultProps = {
    width: 600,
    height: 160
};

export default EnvelopeEditor;
