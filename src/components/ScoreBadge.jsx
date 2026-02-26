import React from 'react';

/**
 * ScoreBadge Component
 * 
 * Displays a color-coded badge based on accreditation percentage.
 * Thresholds:
 * >= 85% -> Green
 * 70-84% -> Yellow
 * 50-69% -> Orange
 * < 50%  -> Red
 * Critical Fail -> Forced Red
 * 
 * @param {Object} props
 * @param {number} props.percent - 0 to 100
 * @param {boolean} props.criticalFail - Whether a critical standard has failed
 */
const ScoreBadge = ({ percent = 0, criticalFail = false }) => {
    const getColors = () => {
        if (criticalFail) {
            return { bg: '#fee2e2', text: '#991b1b', border: '#f87171', label: 'CRITICAL FAILURE' };
        }

        if (percent >= 85) return { bg: '#dcfce7', text: '#166534', border: '#4ade80' };
        if (percent >= 70) return { bg: '#fef9c3', text: '#854d0e', border: '#facc15' };
        if (percent >= 50) return { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' };
        return { bg: '#fee2e2', text: '#991b1b', border: '#f87171' };
    };

    const colors = getColors();
    const displayPercent = Number(percent).toFixed(1);

    const style = {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: '16px',
        fontSize: '0.875rem',
        fontWeight: '600',
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: 'nowrap'
    };

    return (
        <div style={style} className="score-badge">
            {displayPercent}% {criticalFail && <span style={{ marginLeft: '6px', fontSize: '0.75rem' }}>• {colors.label}</span>}
        </div>
    );
};

export default ScoreBadge;
