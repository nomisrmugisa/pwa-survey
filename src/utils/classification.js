/**
 * Healthcare Accreditation Classification Utility
 * 
 * Maps scoring percentages to official compliance status labels.
 * Includes automatic downgrade logic for critical failures.
 */

/**
 * Classifies an assessment based on the score and critical failure status.
 * 
 * Thresholds:
 * >= 85% -> Fully Compliant
 * 70–84% -> Substantial Compliance
 * 50–69% -> Partial Compliance
 * < 50%  -> Non-Compliant
 * 
 * Rule: If criticalFail is true, downgrade the result by exactly one level.
 * (e.g., 85% + Critical Fail = Substantial Compliance)
 * 
 * @param {Object} params - { percent, criticalFail }
 * @returns {Object} { statusLabel, finalPercent, hasCriticalFailure }
 */
export const classifyAssessment = ({ percent = 0, criticalFail = false }) => {
    const levels = [
        { label: "Fully Compliant", min: 85 },
        { label: "Substantial Compliance", min: 70 },
        { label: "Partial Compliance", min: 50 },
        { label: "Non-Compliant", min: 0 }
    ];

    // 1. Find the base index
    let levelIndex = levels.findIndex(l => percent >= l.min);
    if (levelIndex === -1) levelIndex = levels.length - 1;

    // 2. Apply critical failure downgrade
    if (criticalFail) {
        levelIndex = Math.min(levelIndex + 1, levels.length - 1);
    }

    return {
        statusLabel: levels[levelIndex].label,
        finalPercent: percent,
        hasCriticalFailure: criticalFail
    };
};
