// Spectrum (spectrogram) view for the advanced sound editor.
// Renders FFT-style per-band energy frames computed by computeSpectrumFrames
// as a heat map: horizontal axis = time, vertical axis = log frequency
// (low at the bottom), color = energy (dark blue -> cyan -> yellow -> red).
import PropTypes from 'prop-types';
import React, {useEffect, useRef} from 'react';

import styles from './spectrum-view.css';

const energyToColor = v => {
    const t = Math.max(0, Math.min(1, v));
    // Dark blue (low) -> cyan -> yellow -> red (high).
    const hue = (1 - t) * 240;
    const lightness = 8 + (t * 42);
    return `hsl(${hue}, 100%, ${lightness}%)`;
};

const SpectrumView = props => {
    const canvasRef = useRef(null);
    const {frames, bandLabels, playhead, width, height} = props;

    useEffect(() => {
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
        ctx.fillStyle = '#101030';
        ctx.fillRect(0, 0, width, height);

        const numWindows = frames.length;
        const bandCount = bandLabels.length;
        if (numWindows === 0 || bandCount === 0) {
            return;
        }
        const cellW = width / numWindows;
        const cellH = height / bandCount;
        for (let w = 0; w < numWindows; w++) {
            for (let b = 0; b < bandCount; b++) {
                const v = frames[w][b] || 0;
                ctx.fillStyle = energyToColor(v);
                // Low frequency at the bottom: y grows upward in canvas coords
                // is downward, so band b (low freq) maps to the bottom.
                ctx.fillRect(w * cellW, height - ((b + 1) * cellH), cellW + 0.5, cellH + 0.5);
            }
        }

        // Frequency labels (left edge, top = highest frequency).
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        const labelEvery = Math.max(1, Math.floor(bandCount / 5));
        for (let b = 0; b < bandCount; b += labelEvery) {
            const y = height - ((b + 0.5) * cellH);
            ctx.fillText(bandLabels[b], 4, y + 3);
        }

        // Playhead line.
        if (typeof playhead === 'number' && playhead >= 0 && playhead <= 1) {
            const x = playhead * width;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }, [frames, bandLabels, playhead, width, height]);

    return (
        <div
            className={styles.spectrumContainer}
            style={{width, height}}
        >
            <canvas
                className={styles.spectrumCanvas}
                ref={canvasRef}
                style={{width, height}}
            />
        </div>
    );
};

SpectrumView.propTypes = {
    frames: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
    bandLabels: PropTypes.arrayOf(PropTypes.string).isRequired,
    playhead: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number
};

SpectrumView.defaultProps = {
    playhead: null,
    width: 600,
    height: 160
};

export default SpectrumView;
