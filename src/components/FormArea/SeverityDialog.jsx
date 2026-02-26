import React from 'react';
import './FormArea.css';

const SeverityDialog = ({ onSelect }) => {
    const severities = [
        { id: 'MINOR', label: 'Minor', class: 'severity-minor' },
        { id: 'MODERATE', label: 'Moderate', class: 'severity-moderate' },
        { id: 'MAJOR', label: 'Major', class: 'severity-major' },
        { id: 'EXTREME', label: 'Extreme', class: 'severity-extreme' }
    ];

    return (
        <div className="severity-options">
            <p>Please select the severity level for this finding:</p>
            <div className="severity-grid">
                {severities.map((s) => (
                    <button
                        key={s.id}
                        className={`severity-btn ${s.class}`}
                        onClick={() => onSelect(s.id)}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default SeverityDialog;
