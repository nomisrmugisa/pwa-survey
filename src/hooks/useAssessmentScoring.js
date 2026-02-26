import { useMemo } from 'react';
import {
    calculateStandardScore,
    calculateSectionScore,
    calculateOverallScore
} from '../utils/scoring';

/**
 * Hook for calculating hierarchical assessment scores.
 * 
 * Takes a full assessment object and returns a computed tree of results.
 * Optimized with useMemo to handle 500+ criteria efficiently.
 * 
 * @param {Object} assessment - { sections: [{ id, standards: [{ id, criteria: [] }] }] }
 * @returns {Object} Computed scores for overall, sections, and standards.
 */
export const useAssessmentScoring = (assessment) => {
    return useMemo(() => {
        // Graceful handling of empty or undefined assessment
        if (!assessment || !Array.isArray(assessment.sections)) {
            const emptyResult = { percent: 0, totalScore: 0, maxScore: 0, criticalFail: false };
            return {
                overall: emptyResult,
                sections: []
            };
        }

        const sectionResults = assessment.sections.map(section => {
            const standardResults = (section.standards || []).map(standard => {
                const result = calculateStandardScore(standard.criteria);
                return {
                    id: standard.id,
                    ...result
                };
            });

            const sectionResult = calculateSectionScore(standardResults);

            return {
                id: section.id,
                ...sectionResult,
                standards: standardResults
            };
        });

        const overallResult = calculateOverallScore(sectionResults);

        return {
            overall: overallResult,
            sections: sectionResults
        };
    }, [assessment?.sections]);
};
