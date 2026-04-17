import React, { useState, useMemo } from 'react';
import './FormArea.css';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import indexedDBService from '../../services/indexedDBService';
import emsConfig from '../../assets/ems_config.json';
import mortuaryConfig from '../../assets/mortuary_config.json';
import clinicsConfig from '../../assets/clinics_config.json';
import hospitalConfig from '../../assets/hospital_config.json';
import emsLinks from '../../assets/ems_links.json';
import mortuaryLinks from '../../assets/mortuary_links.json';
import clinicsLinks from '../../assets/clinics_links.json';
import hospitalLinks from '../../assets/hospital_links.json';
import ScoreBadge from '../ScoreBadge';
import { classifyAssessment } from '../../utils/classification';
import { normalizeCriterionCode } from '../../utils/normalization';
import { createAssessmentSnapshot } from '../../utils/createAssessmentSnapshot';
import { calculatePointsForLink } from '../../utils/scoring';

// Build a fast lookup from criterion ID (e.g. "1.2.1.3") to its
// standard statement, intent text, critical flag, and severity.
	const buildCriterionIndex = (configData) => {
		    const index = {};
		    try {
		        // Support EMS, Mortuary, Clinics, and Hospital configs.
		        // Accept either a single array of SE objects or an object with *_full_configuration keys.
		        let seArray = [];

		        if (Array.isArray(configData)) {
		            seArray = configData;
		        } else if (configData && typeof configData === 'object') {
		            const possibleKeys = [
		                'ems_full_configuration',
		                'mortuary_full_configuration',
		                'clinics_full_configuration',
		                'hospital_full_configuration',
		            ];
		            possibleKeys.forEach((key) => {
		                if (Array.isArray(configData[key])) {
		                    seArray = seArray.concat(configData[key]);
		                }
		            });
		        }

		        seArray.forEach(se => {
		            (se.sections || []).forEach(section => {
		                (section.standards || []).forEach(standard => {
		                    const stdId = (standard.standard_id || standard.standardId || '').trim();
		                    // Add a lookup entry for the Standard itself (e.g. "7.1.1")
		                    // so that display-only x.x.x rows can show Intent tooltips.
		                    if (stdId && !index[stdId]) {
		                        index[stdId] = {
		                            statement: standard.statement || '',
		                            intent: standard.intent_tooltip || '',
		                            is_critical: false,
		                            severity: null,
		                        };
		                    }

		                    (standard.criteria || []).forEach(crit => {
		                        if (!crit || !crit.id) return;
		                        index[crit.id] = {
		                            statement: standard.statement || '',
		                            intent: standard.intent_tooltip || '',
		                            is_critical: crit.is_critical || false,
		                            severity: crit.severity || 1,
		                        };
		                    });
		                });
		            });
		        });
		    } catch (e) {
		        console.error('FormArea: Failed to build criterion index', e);
		    }
		    return index;
		};

// Default index for helper functions that don't have access to component state
const DEFAULT_CRITERION_INDEX = buildCriterionIndex(emsConfig);

// Shared utility normalizeCriterionCode is now imported

const SEVERITY_LABELS = {
    1: '1 – Minor',
    2: '2 – Moderate',
    3: '3 – Serious',
    4: '4 – Very Serious',
};

const formatSeverityLabel = (severity) => {
    if (severity === undefined || severity === null) return '';
    const sevNumber = parseInt(severity, 10);
    if (Number.isNaN(sevNumber)) return String(severity);
    return SEVERITY_LABELS[sevNumber] || `Severity ${sevNumber}`;
};

// Preserve full intent text (including paragraphing) from the source.
// We no longer try to break it into "Intent" vs "Overview" – the
// tooltip simply shows the complete text, and CSS handles newlines.
const splitIntentText = (fullIntent) => {
	    const text = (fullIntent || '').trim();
	    return text
	        ? { primaryIntent: text, overviewText: '' }
	        : { primaryIntent: '', overviewText: '' };
	};

	const getCriterionTooltip = (code, links, index, scoreResult) => {
		    const normalized = normalizeCriterionCode(code);
		    if (!normalized) return '';
		    const info = index[normalized];
		    if (!info) return '';
		
		    const isStandardCode = /^\d+(\.\d+){2}$/.test(normalized); // x.x.x display-only rows
		    const isCriterionCode = /^\d+(\.\d+){3}$/.test(normalized); // x.x.x.x question rows
		
			    const parts = [];
			    // For criterion (x.x.x.x) rows we no longer include the textual
			    // Standard / Intent / Overview blocks in the tooltip. Those remain
			    // only for higher-level rows (e.g. x.x.x display-only standards).
			    if (!isStandardCode && !isCriterionCode && info.statement) {
			        parts.push(`Standard:\n${info.statement.trim().replace(/^Standard\s*/i, '')}`);
			    }
		
			    if (!isCriterionCode && info.intent) {
			        const { primaryIntent, overviewText } = splitIntentText(info.intent);
			        if (primaryIntent) {
			            parts.push(`Intent:\n${primaryIntent}`);
			        }
			        if (!isStandardCode && overviewText) {
			            parts.push(`Overview:\n${overviewText}`);
			        }
			    }
		    if (!isStandardCode && info.severity !== undefined && info.severity !== null) {
        const sevLabel = formatSeverityLabel(info.severity);
        if (sevLabel) {
            parts.push(`Severity:\n${sevLabel}`);
        }

        // Explain how this severity level influences scoring thresholds
        const sevNumber = parseInt(info.severity, 10);
        if (!Number.isNaN(sevNumber)) {
            const cPts = calculatePointsForLink('C', sevNumber);
            const pcPts = calculatePointsForLink('PC', sevNumber);
            const ncPts = calculatePointsForLink('NC', sevNumber);

            if (cPts !== null && pcPts !== null && ncPts !== null) {
                parts.push(
                    `Severity impact on scoring:\n` +
                    `• C (Compliant): about ${cPts} pts\n` +
                    `• PC (Partial): about ${pcPts} pts\n` +
                    `• NC (Non-compliant): about ${ncPts} pts\n` +
                    `Higher severity means PC/NC scores are lower (stricter penalty).`
                );
            }
        }
    }

    // Add Linked Criteria if available
    if (links && Array.isArray(links)) {
        const linkInfo = links.find(l => normalizeCriterionCode(l.criteria) === normalized);
        if (linkInfo) {
            if (linkInfo.linked_criteria && linkInfo.linked_criteria.length > 0) {
                parts.push(`Linked Criteria:\n${linkInfo.linked_criteria.join(', ')}`);
            }
        }
    }

    // Add Score Traceability
    if (scoreResult && scoreResult.isRoot && scoreResult.rootSources && scoreResult.rootSources.length > 0) {
        const sourceDetails = scoreResult.rootSources.map(src => {
            const pts = (src.points !== null && src.isScored) ? (Number.isInteger(src.points) ? src.points : src.points.toFixed(1)) : '---';
            const res = src.response || 'Pending';
            return `• ${src.code}: ${pts} pts [${res}]`;
        }).join('\n');
        parts.push(`Score Traceability:\n${sourceDetails}`);
    }

    return parts.join('\n\n');
};

const ScoringGuideModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="scoring-modal-overlay" onClick={onClose}>
            <div className="scoring-modal-content" onClick={e => e.stopPropagation()}>
                <div className="scoring-modal-header">
                    <h2 style={{ margin: 0, color: '#2b3a8e' }}>Scoring Logic Guide</h2>
                    <button className="close-modal-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="scoring-modal-body">
                    <p style={{ marginBottom: '1.5rem', color: '#4a5568' }}>This table summarizes the hierarchical structure and expected behavior of the criteria as implemented:</p>
                    <table className="scoring-guide-table">
                        <thead>
                            <tr>
                                <th>Level</th>
                                <th>Criterion ID</th>
                                <th>Type</th>
                                <th>Severity</th>
                                <th>Expected Behavior</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ textAlign: 'center' }}><strong>3</strong></td>
                                <td><strong>1.1.2.1</strong></td>
                                <td>Mega-Root</td>
                                <td style={{ textAlign: 'center' }}>3</td>
                                <td><strong>Disabled.</strong> Calc: Avg of Level 2 results + other links.</td>
                            </tr>
                            <tr>
                                <td style={{ textAlign: 'center' }}><strong>2</strong></td>
                                <td><strong>1.2.2.1</strong></td>
                                <td>Intermediate Root</td>
                                <td style={{ textAlign: 'center' }}>3</td>
                                <td><strong>Disabled.</strong> Calc: Avg of Level 1 results.</td>
                            </tr>
                            <tr>
                                <td style={{ textAlign: 'center' }}><strong>1</strong></td>
                                <td><strong>1.4.1.2</strong></td>
                                <td>Data Point</td>
                                <td style={{ textAlign: 'center' }}>3</td>
                                <td><strong>Enabled.</strong> Manual Input (C, PC, NC).</td>
                            </tr>
                            <tr>
                                <td style={{ textAlign: 'center' }}><strong>1</strong></td>
                                <td><strong>1.4.1.3</strong></td>
                                <td>Data Point</td>
                                <td style={{ textAlign: 'center' }}>4</td>
                                <td><strong>Enabled.</strong> Manual Input (C, PC, NC).</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="scoring-guide-footer" style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#718096', fontStyle: 'italic' }}>
                            *The scoring engine handles this recursion automatically, ensuring that roots are only finalized when all children (at any depth) are fully assessed.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RootCalculationModal = ({ isOpen, onClose, rootCode, scoreResult }) => {
    if (!isOpen || !scoreResult) return null;

    const sources = scoreResult.rootSources || [];
    const points = scoreResult.points;
    const isDraft = scoreResult.isDraft;

    return (
        <div className="scoring-modal-overlay" onClick={onClose}>
            <div className="scoring-modal-content root-calc-modal" onClick={e => e.stopPropagation()}>
                <div className="scoring-modal-header">
                    <h2 style={{ margin: 0, color: '#2b3a8e' }}>Calculation Details: {rootCode}</h2>
                    <button className="close-modal-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="scoring-modal-body">
                    <div className="calc-summary-box">
                        <div className="calc-stat">
                            <span className="label">{isDraft ? 'Draft Average:' : 'Current Score:'}</span>
                            <span className="value">
                                {points !== null
                                    ? (Number.isInteger(points) ? points : points.toFixed(1))
                                    : (scoreResult.draftAvg !== null ? `${Number.isInteger(scoreResult.draftAvg) ? scoreResult.draftAvg : scoreResult.draftAvg.toFixed(1)} (Draft)` : '---')}
                                {isDraft ? '' : ' pts'}
                            </span>
                        </div>
                        <div className="calc-stat">
                            <span className="label">Status:</span>
                            <span className={`value status-${scoreResult.response.toLowerCase()}`}>{scoreResult.response}</span>
                        </div>
                    </div>

                    <h4 style={{ margin: '1.5rem 0 0.5rem', color: '#2d3748' }}>Contributing Criteria:</h4>
                    <table className="scoring-guide-table">
                        <thead>
                            <tr>
                                <th>Criterion</th>
                                <th>Response</th>
                                <th>Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sources.map((src, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <strong>{src.code}</strong> {src.isCritical && <span style={{ color: '#c53030', fontWeight: 'bold' }} title="Critical Criterion">þ</span>}
                                    </td>
                                    <td><span className={`status-pill status-${src.response?.toLowerCase()}`}>{src.response || 'Pending'}</span></td>
                                    <td style={{ textAlign: 'right' }}>
                                        {src.points !== null ? (Number.isInteger(src.points) ? src.points : src.points.toFixed(1)) : '---'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="calc-formula">
                        <strong>Formula:</strong> {isDraft ? "Draft average of completed items" : "Average of all linked criteria"}
                        {scoreResult.countScoredLinks > 0 && (
                            <div className="formula-work">
                                ({sources.filter(s => s.points !== null).map(s => Number.isInteger(s.points) ? s.points : s.points.toFixed(1)).join(' + ')}) / {scoreResult.countScoredLinks} = {(scoreResult.draftAvg || 0).toFixed(1)}
                            </div>
                        )}
                    </div>

                    {scoreResult.criticalFail && (
                        <div className="calc-warning" style={{ backgroundColor: '#fed7d7', borderColor: '#feb2b2', color: '#9b2c2c' }}>
                            ⛔ <strong>Critical Failure:</strong> One or more Critical Criteria (þ) linked to this root are Non-compliant. The entire score is forced to 0.
                        </div>
                    )}

                    {isDraft && !scoreResult.criticalFail && (
                        <div className="calc-warning">
                            ⚠️ This score is <strong>Pending</strong> because some contributing criteria have not been assessed yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Internal Input component to manage local state and prevent focus loss on re-renders
const FieldInput = ({ type, value, onChange, onBlur, disabled, id, className }) => {
    const [localValue, setLocalValue] = useState(value || '');

    // Sync local value with prop value when Prop value changes from outside
    React.useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const handleChange = (e) => {
        setLocalValue(e.target.value);
        onChange(e); // Still call parent onChange to update global state (debounced via saveField)
    };

    if (type === 'textarea') {
        return (
            <textarea
                id={id}
                className={className}
                value={localValue}
                onChange={handleChange}
                onBlur={onBlur}
                disabled={disabled}
                rows={3}
            />
        );
    }

    return (
        <input
            id={id}
            type={type || 'text'}
            className={className}
            value={localValue}
            onChange={handleChange}
            onBlur={onBlur}
            disabled={disabled}
        />
    );
};

const FormArea = ({
    activeSection,
    selectedFacility,
    user,
    groups,
    formData,
    saveField,
    isSaving,
    lastSaved,
    isADComplete,
    activeEventId,
    scoringResults
}) => {
    const [customLinks, setCustomLinks] = useState(null);
    const [customConfig, setCustomConfig] = useState(null);
    const [isScoringModalOpen, setIsScoringModalOpen] = useState(false);
    const [viewingRootCalc, setViewingRootCalc] = useState(null); // { code, result }
    const [currentSubsectionIndex, setCurrentSubsectionIndex] = useState(0);

    // Reset pagination when activeSection changes
    React.useEffect(() => {
        setCurrentSubsectionIndex(0);
    }, [activeSection?.id]);

    React.useEffect(() => {
        const savedLinks = localStorage.getItem('custom_ems_links');
        if (savedLinks) {
            try {
                setCustomLinks(JSON.parse(savedLinks));
            } catch (e) {
                console.error('FormArea: Failed to parse saved custom links');
            }
        }

        const savedConfig = localStorage.getItem('custom_ems_config');
        if (savedConfig) {
            try {
                setCustomConfig(JSON.parse(savedConfig));
            } catch (e) {
                console.error('FormArea: Failed to parse saved custom config');
            }
        }
    }, []);

	    const activeGroup = groups.find(g => g.sections?.some(s => s.id === activeSection?.id));

	    const programmeType = (() => {
	        if (activeGroup?.id === 'SURV-MORTUARY' || activeGroup?.id === 'GENERAL' || activeGroup?.name === 'Mortuary') {
	            return 'mortuary';
	        }
	        if (activeGroup?.id === 'CLINICS' || activeGroup?.name === 'Clinics') {
	            return 'clinics';
	        }
	        if (activeGroup?.id === 'HOSPITAL' || activeGroup?.name === 'Hospital') {
	            return 'hospital';
	        }
	        return 'ems';
	    })();

	    // Resolve configuration for the current programme (EMS, Mortuary, Clinics, Hospital)
	    const baseConfig = customConfig || { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig };
	    const configKeyMap = {
	        ems: 'ems_full_configuration',
	        mortuary: 'mortuary_full_configuration',
	        clinics: 'clinics_full_configuration',
	        hospital: 'hospital_full_configuration',
	    };
	    const activeConfigArray = (() => {
	        const key = configKeyMap[programmeType];
	        if (baseConfig && key && Array.isArray(baseConfig[key])) {
	            return baseConfig[key];
	        }
	        return Array.isArray(baseConfig) ? baseConfig : [];
	    })();

	    // Resolve links for the current programme
	    const staticLinksMap = {
	        ems: emsLinks,
	        mortuary: mortuaryLinks,
	        clinics: clinicsLinks,
	        hospital: hospitalLinks,
	    };
	    const activeLinks = (() => {
	        if (customLinks) {
	            // New-style customLinks stored as { ems: [...], mortuary: [...], clinics: [...], hospital: [...] }
	            if (!Array.isArray(customLinks) && typeof customLinks === 'object') {
	                return customLinks[programmeType] || staticLinksMap[programmeType] || [];
	            }
	            // Backwards-compat: treat array value as override for all programmes
	            if (Array.isArray(customLinks)) {
	                return customLinks;
	            }
	        }
	        return staticLinksMap[programmeType] || [];
	    })();
		
		    const criterionIndex = useMemo(() => buildCriterionIndex(activeConfigArray), [activeConfigArray]);
		
		    // Build an SE/Section overview object for the currently active section
		    // so we can render a narrative page similar to the source PDFs (SE
		    // title, Standard text, and Standard Intent paragraphs).
		    const seOverview = useMemo(() => {
		        if (!activeSection || !Array.isArray(activeConfigArray) || activeConfigArray.length === 0) {
		            return null;
		        }
		
		        const rawName = (activeSection._originalName || activeSection.name || '').trim();
		        const rawCode = (activeSection.code || '').trim();
		
		        // Try to pull out a numeric PI id like "9.1" from the metadata
		        // name/code so we can match it to section_pi_id in the
		        // *_full_configuration arrays.
		        const piMatch = rawName.match(/\b\d+\.\d+\b/) || rawCode.match(/\b\d+\.\d+\b/);
		        const hintedPiId = piMatch ? piMatch[0] : null;
		
		        let matchedSe = null;
		        let matchedSection = null;
		
		        outer: for (const se of activeConfigArray) {
		            const seSections = se.sections || [];
		            for (const sec of seSections) {
		                const secPi = (sec.section_pi_id || '').trim();
		                const secTitle = (sec.title || '').trim();
		
		                const numberMatches =
		                    !!secPi && (
		                        secPi === hintedPiId ||
		                        rawName.includes(secPi) ||
		                        rawCode.includes(secPi)
		                    );
		
		                const titleLc = secTitle.toLowerCase();
		                const nameLc = rawName.toLowerCase();
		                const titleMatches = titleLc && (nameLc.includes(titleLc) || titleLc.includes(nameLc));
		
		                if (numberMatches || titleMatches) {
		                    matchedSe = se;
		                    matchedSection = sec;
		                    break outer;
		                }
		            }
		        }
		
		        if (!matchedSe || !matchedSection) return null;
		
		        const standards = matchedSection.standards || [];
		        if (!standards.length) return null;
		
		        return {
		            seId: matchedSe.se_id,
		            seName: matchedSe.se_name,
		            sectionPiId: matchedSection.section_pi_id,
		            sectionTitle: matchedSection.title,
		            standards,
		        };
		    }, [activeSection, activeConfigArray]);
    // DEBUG: Validate props on render
    React.useEffect(() => {
        if (!activeSection) console.warn("FormArea: No active section provided");
        if (activeSection) console.log(`FormArea Rendering Section: ${activeSection.name}`);
    }, [activeSection]);

    const { configuration } = useApp();

    // Submit state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState(null); // { success, message }

    // Reset submit status if data changes after successful submission
    // This allows the user to "Update" DHIS2
    React.useEffect(() => {
        if (submitResult?.success) {
            console.log('📝 FormArea: Detected change after submission, resetting status to allow update.');
            setSubmitResult(null);
        }
    }, [formData]);

	    const isADSection = activeSection?.name === "Assessment Details";
	    // Sections are no longer locked based on Assessment Details
	    // completion; users can navigate and edit any section at any time.
	    const isLocked = false;

	    	    // Group fields into subsections ("pages").
	    	    //
	    	    // Desired behaviour:
	    	    //   - For coded assessment sections, treat each x.x.x "standard"
	    	    //     row as the start of a new page, and keep all following
	    	    //     fields (x.x.x.1 ... x.x.x.n, comments, etc.) on that same
	    	    //     page until the next x.x.x standard.
	    	    //   - For sections without such codes (e.g. Assessment Details),
	    	    //     fall back to header-based grouping.
	    	    const subsections = useMemo(() => {
	    	        if (!activeSection?.fields) return [];
	    	
	    	        const groups = [];
	    	        let currentGroup = [];
	    	        let hasStandardInCurrentGroup = false;
	    	
	    	        // Helper: detect if a field is a display-only x.x.x standard row.
	    	        const isStandardRow = (field) => {
	    	            if (!field || !field.code) return false;
	    	            const isCommentField = field.isComment || field.label === 'Comment' || field.id?.endsWith('-comments') || field.id?.endsWith('-comment');
	    	            if (isCommentField) return false;
	    	            const normalized = normalizeCriterionCode(field.code);
	    	            if (!normalized) return false;
	    	            // Exactly three numeric segments, e.g. "7.2.2".
	    	            return /^\d+(?:\.\d+){2}$/.test(normalized);
	    	        };
	    	
	    	        // First check whether this section actually has any standard rows.
	    	        const hasStandardRows = activeSection.fields.some((field) => isStandardRow(field));
	    	
	    	        activeSection.fields.forEach((field, index) => {
	    	            if (!field) return;
	    	
	    	            const isHeader = field.type === 'header';
	    	
	    	            if (!hasStandardRows) {
	    	                // Fallback: original header-based grouping when there
	    	                // are no coded standards in this section.
	    	                if (isHeader && index !== 0) {
	    	                    if (currentGroup.length > 0) {
	    	                        groups.push(currentGroup);
	    	                    }
	    	                    currentGroup = [field];
	    	                } else {
	    	                    currentGroup.push(field);
	    	                }
	    	                return;
	    	            }
	    	
	    	            const isStd = isStandardRow(field);
	    	
	    	            if (hasStandardRows) {
	    	                // Coded sections:
	    	                // - If we see a header *after* a standard has already
	    	                //   appeared in the current group, treat that header as
	    	                //   the start of the *next* page so that it sits above
	    	                //   the following x.x.x standard (e.g. "PATIENT SAFETY"
	    	                //   before 7.2.1).
	    	                if (isHeader && hasStandardInCurrentGroup && currentGroup.length > 0) {
	    	                    groups.push(currentGroup);
	    	                    currentGroup = [];
	    	                    hasStandardInCurrentGroup = false;
	    	                }
	    	
	    	                // When we hit a standard row:
	    	                // - if the current group already has a standard, this
	    	                //   is the *next* x.x.x → start a new page;
	    	                // - otherwise, just mark that this group now contains
	    	                //   a standard (any intro/header lines stay with it).
	    	                if (isStd) {
	    	                    if (hasStandardInCurrentGroup && currentGroup.length > 0) {
	    	                        groups.push(currentGroup);
	    	                        currentGroup = [];
	    	                    }
	    	                    hasStandardInCurrentGroup = true;
	    	                }
	    	            }
	    	
	    	            currentGroup.push(field);
	    	        });
	    	
	    	        if (currentGroup.length > 0) {
	    	            groups.push(currentGroup);
	    	        }
	    	
	    	        return groups;
	    	    }, [activeSection?.fields]);

    const activeSubsectionFields = subsections[currentSubsectionIndex] || [];
    const isLastSubsection = currentSubsectionIndex === subsections.length - 1 || subsections.length === 0;

    // Render Logic Helpers
    const renderFields = () => {
        if (!activeSection) return null;

        // Safety check for fields
        if (!activeSection.fields || !Array.isArray(activeSection.fields)) {
            console.error("FormArea: activeSection.fields is missing or not an array:", activeSection);
            return <div className="error-message">Error: Section data is malformed.</div>;
        }

        if (activeSubsectionFields.length === 0) {
            return <div className="empty-fields-message">No fields in this subsection.</div>;
        }

        // Pre-compute a draft standard-level score for the current subsection.
        // We treat the "standard" as the group of select fields (x.x.x.x
        // sub-criteria) that belong to this subsection and average their
        // computed points. This value is displayed next to the x.x.x
        // standard row as the user progresses, labelled as Not Saved.
        let subsectionStandardScore = null;
        if (scoringResults?.sections && activeSection) {
            const sectionScore = scoringResults.sections.find(s => s.id === activeSection.id);
            const standardResults = sectionScore?.standards?.[0];
            if (standardResults) {
                const criteriaScores = standardResults.criteriaScores || {};
                const subsectionFieldIds = (activeSubsectionFields || [])
                    .filter(f => f.type === 'select')
                    .map(f => f.id);

                let totalPoints = 0;
                let scoredCount = 0;
                let hasCriticalFail = false;

                subsectionFieldIds.forEach(id => {
                    const score = criteriaScores[id];
                    if (!score) return;
                    if (score.criticalFail) {
                        hasCriticalFail = true;
                    }
                    if (score.isScored && score.points !== null) {
                        totalPoints += score.points;
                        scoredCount += 1;
                    }
                });

                if (scoredCount > 0 || hasCriticalFail) {
                    let avgPercent = 0;
                    if (scoredCount > 0) {
                        avgPercent = totalPoints / scoredCount; // points are already 0–100
                    }
                    if (hasCriticalFail) {
                        avgPercent = 0;
                    }
                    subsectionStandardScore = {
                        percent: avgPercent,
                        criticalFail: hasCriticalFail,
                    };
                }
            }
        }


        return activeSubsectionFields.map((field) => {
            // Safety check for field
            if (!field || !field.id) {
                console.warn("FormArea: Invalid field in section:", field);
                return null;
            }

		            if (field.type === 'header') {
		                // Subheading within a section: show only the human-readable label, no codes
		                // and drop any leading prefixes that contain underscores (e.g. SURV_HOSP_1.1)
		                const displayLabel = (() => {
		                    const raw = field.label || '';
		                    if (!raw) return '';
		                    const parts = raw.split(/\s+/);
		                    const kept = [];
		                    let dropping = true;
		                    for (const p of parts) {
		                        if (dropping && p.includes('_')) continue;
		                        dropping = false;
		                        kept.push(p);
		                    }
		                    const cleaned = kept.join(' ').trim();
		                    return cleaned || raw.trim();
		                })();
		                return (
		                    <div key={field.id} className="form-header-separator">
		                        <h3>{displayLabel}</h3>
		                    </div>
		                );
		            }

            // Extract calculated score for this field if it exists
            let calculatedFieldScore = null;
            if (scoringResults?.sections) {
                const currentSectionScores = scoringResults.sections.find(s => s.id === activeSection.id);
                if (currentSectionScores?.standards) {
                    for (const standard of currentSectionScores.standards) {
                        if (standard.criteriaScores && standard.criteriaScores[field.id]) {
                            calculatedFieldScore = standard.criteriaScores[field.id];
                            break;
                        }
                    }
                }
            }

            const isRoot = calculatedFieldScore?.isRoot || false;

            const isCommentField = field.isComment || field.label === 'Comment' || field.id?.endsWith('-comments') || field.id?.endsWith('-comment');

            const associatedCommentId = field.commentFieldId;
            const currentCommentValue = associatedCommentId ? (formData[associatedCommentId] || '') : '';

	            // Logic to determine if it's critical: 
	            // 1. Check formData helper state
	            // 2. Fallback to index (from Config)
	            // 3. Fallback to comment tag presence
	            const normalizedCode = normalizeCriterionCode(field.code);
	            // Standards (x.x.x) should be display-only in the UI: no
	            // input controls, just bolded text. We detect them by a
	            // three-level numeric code (e.g. "1.2.3").
	            const isStandardCriterion =
	                !isCommentField &&
	                normalizedCode &&
	                /^\d+(\.\d+){2}$/.test(normalizedCode);
	            const configEntry = criterionIndex[normalizedCode] || {};
	            const configIsCritical = configEntry.is_critical || false;
	            const configSeverity = configEntry.severity;

            const isCritical = formData[`is_critical_${associatedCommentId}`] !== undefined
                ? formData[`is_critical_${associatedCommentId}`]
                : (configIsCritical || currentCommentValue.includes('[CRITICAL]'));

	            const questionValue = formData[field.id];
	            const isQuestionAnswered = questionValue !== undefined && questionValue !== null && questionValue !== '';

	            // Check if comment field is disabled (parent question not answered)
	            const parentQuestionId = field.questionFieldId;
	            const isParentAnswered = parentQuestionId ? (formData[parentQuestionId] !== undefined && formData[parentQuestionId] !== null && formData[parentQuestionId] !== '') : true;

	            // If this is a comment attached to a Standard (x.x.x), hide the
	            // comment row entirely in the UI.
	            if (isCommentField && parentQuestionId) {
	                const parentField = activeSection.fields.find(f => f.id === parentQuestionId);
	                const parentNorm = parentField?.code ? normalizeCriterionCode(parentField.code) : '';
	                const parentIsStandard = parentNorm && /^\d+(\.\d+){2}$/.test(parentNorm);
	                if (parentIsStandard) {
	                    return null;
	                }
	            }

	            // Check if this is a technical field that should be read-only
	            // (Enrollment ID, TEI ID, Assessor User ID, Facility Assessment
	            // Group) in the Assessment Details section. These are
	            // populated automatically and should not be editable by the
	            // assessor.
	            const rawLabel = field.label || '';
	            const labelLower = rawLabel.toLowerCase();
	            const labelUpper = rawLabel.toUpperCase();
	            const isEnrollmentField = labelLower.includes('enrollment');
	            const isTeiField = labelLower.includes('tei id');
	            const isAssessorUserField =
	                labelUpper.includes('FAC_ASS_ASSESSOR_USER_ID') ||
	                labelUpper.includes('ASSESSOR USER ID');
	            const isFacilityGroupField =
	                field.id === 'pzenrgsSny3' ||
	                labelLower.includes('facility assessment group');
	            const isTechnicalField =
	                isADSection &&
	                (isEnrollmentField ||
	                    isTeiField ||
	                    isAssessorUserField ||
	                    isFacilityGroupField);

	            // Look up EMS standard/intent tooltip for this data element code
	            const criterionTooltip = (!isCommentField && field.code) ? getCriterionTooltip(field.code, activeLinks, criterionIndex, calculatedFieldScore) : '';

	            // Compute the human-friendly label once, so we can reuse it
	            // for both normal and standard (display-only) rows.
	            const displayLabel = (() => {
	                // For all fields we want to hide any technical
	                // prefixes that appear before underscores in the
	                // underlying codes (e.g. "SURV_EMS_", "FAC_ASS_"),
	                // but we still allow a clean, human-readable
	                // criterion number such as "1.2.3.4".
	                const cleanedCode = field.code ? normalizeCriterionCode(field.code) : '';
	                const shouldShowCode = !!cleanedCode && /\d/.test(cleanedCode) && !cleanedCode.includes('_');

	                if (isCommentField) {
	                    return rawLabel || 'Unnamed Field';
	                }

	                // For Assessment Details, show only the human-friendly
	                // part of the label (e.g. "Facility Assessment Assessor
	                // User ID"), dropping any leading technical code such as
	                // "FAC_ASS_ASSESSOR_USER_ID".
	                if (isADSection) {
	                    const parts = rawLabel.split(/\s+/);
	                    if (parts.length > 1 && /^[A-Z0-9_]+$/.test(parts[0])) {
	                        return parts.slice(1).join(' ');
	                    }
	                    return rawLabel || 'Unnamed Field';
	                }

	                // For other sections, optionally prepend the
	                // cleaned criterion number (without any
	                // SURV_/FAC_/etc. prefixes) if it adds
	                // information and does not duplicate the
	                // start of the label.
	                if (shouldShowCode && rawLabel && !rawLabel.startsWith(cleanedCode)) {
	                    return `${cleanedCode} ${rawLabel}`;
	                }

	                return rawLabel || 'Unnamed Field';
	            })();

	            return (
	                <div
	                    key={field.id}
	                    className={`form-field ${isCritical ? 'is-critical' : ''} ${(!isParentAnswered && isCommentField) ? 'field-disabled' : ''}`}
	                    data-tooltip={(!isParentAnswered && isCommentField) ? "Please answer the main question first" : ""}
	                >
	                    <div className="field-label-container">
                        <div className="field-label-main">
                            <label>
                                {isStandardCriterion ? (
                                    <strong style={{ fontSize: '1.6em' }}>{displayLabel}</strong>
                                ) : (
                                    displayLabel
                                )}
                            </label>
                            {!isCommentField && configSeverity !== undefined && configSeverity !== null && (
                                <span className="severity-pill">
                                    {formatSeverityLabel(configSeverity)}
                                </span>
                            )}
                            {isStandardCriterion && subsectionStandardScore && (
                                <span
                                    className="standard-score-pill"
                                    style={{
                                        marginLeft: '10px',
                                        fontSize: '0.8em',
                                        fontWeight: 600,
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        backgroundColor: 'rgba(43, 58, 142, 0.1)',
                                        color: '#2b3a8e',
                                        border: '1px solid rgba(43, 58, 142, 0.35)'
                                    }}
                                >
                                    {subsectionStandardScore.percent.toFixed(1)}% Score (Not Saved)
                                </span>
                            )}
	                            {criterionTooltip && (
	                                <button
	                                    type="button"
	                                    className="ems-info-icon"
	                                    data-ems-tooltip={criterionTooltip}
	                                    aria-label="View EMS standard and intent"
	                                >
	                                    ?
	                                </button>
	                            )}
	                        </div>
	                        {isCritical && <span className="critical-badge">CRITICAL</span>}
	                    </div>
	                    {formData[`is_critical_${field.id}`] && isCommentField && (
	                        <div className="mandatory-label">Comment is required for Critical issues.</div>
	                    )}
	                    {!isStandardCriterion && (field.type === 'select' ? (
                        <>
                            {calculatedFieldScore && (calculatedFieldScore.points !== null || isRoot) && (
                                <div className={`${isRoot ? 'root-score-display' : 'linked-score-display'}`} style={{ marginBottom: '10px', padding: '10px', backgroundColor: isRoot ? '#e2e8f0' : '#f0f4f8', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: isRoot ? '1px solid #cbd5e1' : '1px dashed #cbd5e1' }}>
                                    <span style={{ fontWeight: '600', color: '#2d3748', fontSize: '0.9em' }}>
                                        {isRoot ? (calculatedFieldScore.response === 'Pending' ? 'Root Score Pending:' : 'Calculated Root Score:') : 'Criterion Score:'}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '1.05em', color: '#2b3a8e' }}>
                                            {calculatedFieldScore.response === 'Pending' ? '--- pts' : (calculatedFieldScore.points !== null ? `${Number.isInteger(calculatedFieldScore.points) ? calculatedFieldScore.points : calculatedFieldScore.points.toFixed(1)} pts` : '--- pts')}
                                        </span>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.75em',
                                            fontWeight: 'bold',
                                            backgroundColor: (calculatedFieldScore.response === 'NC' || calculatedFieldScore.response === 'NON') ? '#fed7d7' : ((calculatedFieldScore.response === 'PC' || calculatedFieldScore.response === 'PARTIAL' || calculatedFieldScore.response === 'SUBSTANTIAL') ? '#fefcbf' : (calculatedFieldScore.response === 'Pending' ? '#edf2f7' : '#c6f6d5')),
                                            color: (calculatedFieldScore.response === 'NC' || calculatedFieldScore.response === 'NON') ? '#c53030' : ((calculatedFieldScore.response === 'PC' || calculatedFieldScore.response === 'PARTIAL' || calculatedFieldScore.response === 'SUBSTANTIAL') ? '#b7791f' : (calculatedFieldScore.response === 'Pending' ? '#4a5568' : '#22543d'))
                                        }}>
                                            {calculatedFieldScore.response}
                                        </span>
                                        {isRoot && (
                                            <button
                                                type="button"
                                                className="view-calc-btn"
                                                onClick={() => setViewingRootCalc({ code: field.code, result: calculatedFieldScore })}
                                                title="View calculation details"
                                                style={{
                                                    background: '#2b3a8e',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '2px 8px',
                                                    fontSize: '0.75em',
                                                    cursor: 'pointer',
                                                    marginLeft: '8px'
                                                }}
                                            >
                                                ℹ️ Details
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <select
                                className="form-control"
                                value={isRoot && calculatedFieldScore ? (calculatedFieldScore.normalizedValue || calculatedFieldScore.response) : (formData[field.id] || '')}
                                onChange={(e) => handleInputChange(e, field.id)}
                                id={`field-${field.id}`} // Helper for testing
                                disabled={isRoot || (!isParentAnswered && isCommentField) || isTechnicalField}
                            >
                                <option value="">{isRoot ? "Auto-calculated from linked criteria..." : "Select..."}</option>
                                {isRoot && calculatedFieldScore?.response === 'Pending' && (
                                    <option value="Pending">Pending...</option>
                                )}
                                {(() => {
                                    const options = field.options || [];
                                    const groups = {};
                                    const ungrouped = [];

                                    options.forEach(opt => {
                                        const val = typeof opt === 'object' ? opt.value : opt;
                                        const label = typeof opt === 'object' ? opt.label : opt;

                                        if (typeof val === 'string' && val.includes('_')) {
                                            const prefix = val.split('_')[0];
                                            if (!groups[prefix]) groups[prefix] = [];
                                            groups[prefix].push({ val, label });
                                        } else {
                                            ungrouped.push({ val, label });
                                        }
                                    });

                                    const groupKeys = Object.keys(groups);
                                    if (groupKeys.length === 0) {
                                        // No grouped options, render normally
                                        return options.map((opt, idx) => {
                                            const val = typeof opt === 'object' ? opt.value : opt;
                                            const label = typeof opt === 'object' ? opt.label : opt;
                                            return (
                                                <option key={`${val}-${idx}`} value={val}>
                                                    {label}
                                                </option>
                                            );
                                        });
                                    }

                                    // Render grouped options
                                    return (
                                        <>
                                            {ungrouped.map((opt, idx) => (
                                                <option key={`ungrouped-${opt.val}-${idx}`} value={opt.val}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                            {groupKeys.map(group => (
                                                <optgroup key={group} label={group}>
                                                    {groups[group].map((opt, idx) => (
                                                        <option key={`${group}-${opt.val}-${idx}`} value={opt.val}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </>
                                    );
                                })()}
	                            </select>
	                        </>
	                    ) : (
	                        <FieldInput
	                            type={isCommentField ? 'textarea' : field.type}
	                            className={`form-control ${formData[`is_critical_${field.id}`] && (!questionValue || questionValue === '') ? 'mandatory-warning' : ''}`}
	                            value={formData[field.id] || ''}
	                            onChange={(e) => handleInputChange(e, field.id)}
	                            onBlur={isCommentField ? () => handleCommentBlur(field.id) : undefined}
	                            id={`field-${field.id}`}
	                            disabled={(!isParentAnswered && isCommentField) || isTechnicalField}
	                        />
	                    ))}
                </div>
            );
        });
    };

    if (!activeSection) {
        if (!selectedFacility) {
            return <div className="form-area-empty">Please select a facility and a section</div>;
        }
        return <div className="form-area-empty">Please select a section</div>;
    }

    const handleInputChange = (e, fieldId) => {
        const value = e.target.value;
        console.log(`Dropdown change detected: fieldId=${fieldId}, value=${value}`);

        // If it's a dropdown change (non-empty selection), trigger severity dialog FIRST
        const field = activeSection.fields.find(f => f.id === fieldId);
        console.log(`Field found: ${JSON.stringify(field)}`);

        saveField(fieldId, value);
    };

    React.useEffect(() => {
        if (!scoringResults?.sections || !activeSection?.fields) return;

        const currentSectionScores = scoringResults.sections.find(s => s.id === activeSection.id);
        if (!currentSectionScores?.standards) return;

        let hasUpdates = false;
        const updates = {};

        activeSection.fields.forEach(field => {
            if (field.type === 'select' && field.commentFieldId) {
                // Find calculated score for this criterion
                let calculatedScore = null;
                for (const standard of currentSectionScores.standards) {
                    if (standard.criteriaScores && standard.criteriaScores[field.id]) {
                        calculatedScore = standard.criteriaScores[field.id];
                        break;
                    }
                }

                if (calculatedScore && (calculatedScore.points !== null || calculatedScore.normalizedValue)) {
                    const commentFieldId = field.commentFieldId;
                    const currentComment = formData[commentFieldId] || '';
                    const isRoot = calculatedScore.isRoot || false;
                    const isDraft = calculatedScore.isDraft || false;

                    // Use normalized value if available for consistent tagging
                    const statusText = calculatedScore.normalizedValue || calculatedScore.response || 'NA';
                    const pointsText = calculatedScore.points !== null ? `${parseFloat(calculatedScore.points).toFixed(0)} pts` : '0 pts';

                    const rootSources = (calculatedScore.rootSources || []).map(s => typeof s === 'string' ? s : s.code);
                    const rootSuffix = rootSources.length > 0 ? ` -root(${rootSources.join(',')})` : '';

                    let scoreTag = `[SCORE: ${pointsText} - ${statusText}${rootSuffix}]`;
                    if (isRoot) {
                        if (isDraft) {
                            scoreTag = `[INCOMPLETE ROOT SCORE: ${pointsText} - ${statusText}${rootSuffix}]`;
                        } else {
                            scoreTag = `[ROOT SCORE: ${pointsText} - ${statusText}${rootSuffix}]`;
                        }
                    }

                    // Only update if there's an actual response value (not empty) or if it's an auto-calculated Root score
                    const hasResponse = isRoot || (formData[field.id] && formData[field.id] !== '' && formData[field.id] !== 'NA');

                    if (hasResponse) {
                        // Remove any old score/severity tags and also common junk like [object Object]
                        let newComment = currentComment
                            .replace(/\s*\[(INCOMPLETE )?((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '')
                            .replace(/\[object Object\](\)]*)?/g, '')
                            .trim();
                        // Append the new one
                        newComment = newComment ? `${newComment} ${scoreTag}` : scoreTag;

                        if (newComment !== currentComment) {
                            updates[commentFieldId] = newComment;
                            hasUpdates = true;
                        }
                    } else if (currentComment.match(/\[((ROOT )?SCORE|SEVERITY)[^\]]*\]/)) {
                        // Clear score tag if answer removed
                        let newComment = currentComment.replace(/\s*\[((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '').trim();
                        if (newComment !== currentComment) {
                            updates[commentFieldId] = newComment;
                            hasUpdates = true;
                        }
                    }
                }
            }
        });

        if (hasUpdates) {
            Object.entries(updates).forEach(([key, val]) => {
                saveField(key, val);
            });
        }
    }, [scoringResults, formData, activeSection, saveField]);



    const handleCommentBlur = (fieldId) => {
        const currentComment = formData[fieldId] || '';
        const parentField = activeSection.fields.find(f => f.commentFieldId === fieldId);
        const parentFieldId = parentField?.id;

        let newComment = currentComment;

        // Add [CRITICAL] tag if toggled
        if (formData[`is_critical_${fieldId}`] && !newComment.includes('[CRITICAL]')) {
            newComment = newComment ? `${newComment} [CRITICAL]` : '[CRITICAL]';
        }

        // Add Score Tag if calculated score exists for parent field
        if (parentFieldId && scoringResults?.sections) {
            const currentSectionScores = scoringResults.sections.find(s => s.id === activeSection.id);
            if (currentSectionScores?.standards) {
                let calculatedScore = null;
                for (const standard of currentSectionScores.standards) {
                    if (standard.criteriaScores && standard.criteriaScores[parentFieldId]) {
                        calculatedScore = standard.criteriaScores[parentFieldId];
                        break;
                    }
                }

                if (calculatedScore && calculatedScore.points !== null) {
                    const isRoot = calculatedScore.isRoot || false;
                    const hasParentResponse = isRoot || (formData[parentFieldId] && formData[parentFieldId] !== '');

                    if (hasParentResponse) {
                        const isDraft = calculatedScore.isDraft || false;
                        const rootSources = (calculatedScore.rootSources || []).map(s => typeof s === 'string' ? s : s.code);
                        const rootSuffix = rootSources.length > 0 ? ` -root(${rootSources.join(',')})` : '';

                        let scoreTag = `[SCORE: ${parseFloat(calculatedScore.points).toFixed(0)} pts - ${calculatedScore.response}${rootSuffix}]`;
                        if (isRoot) {
                            if (isDraft) {
                                scoreTag = `[INCOMPLETE ROOT SCORE: ${parseFloat(calculatedScore.points).toFixed(0)} pts - ${calculatedScore.response}${rootSuffix}]`;
                            } else {
                                scoreTag = `[ROOT SCORE: ${parseFloat(calculatedScore.points).toFixed(0)} pts - ${calculatedScore.response}${rootSuffix}]`;
                            }
                        }

                        // Remove any old score tags first and also common junk
                        newComment = newComment
                            .replace(/\s*\[(INCOMPLETE )?((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '')
                            .replace(/\[object Object\](\)]*)?/g, '')
                            .trim();
                        // Append the new one
                        newComment = newComment ? `${newComment} ${scoreTag}` : scoreTag;
                    }
                }
            }
        }

        if (newComment !== currentComment) {
            saveField(fieldId, newComment);
        }
    };

    const handleCriticalToggle = (fieldId, commentFieldId, isChecked) => {
        const currentComment = formData[commentFieldId] || '';
        let newComment = currentComment;

        // Save a helper state to track if critical is toggled, so we can make it mandatory
        saveField(`is_critical_${commentFieldId}`, isChecked);

        if (!isChecked) {
            // If turning off, remove the tag immediately
            newComment = currentComment.replace(/\s?\[CRITICAL\]/g, '').trim();
            saveField(commentFieldId, newComment);
        }
    };

    const handleSubmit = async () => {
        if (!configuration) {
            setSubmitResult({ success: false, message: 'Form configuration not loaded yet.' });
            return;
        }
	        // Use the program-level orgUnit attached to the scheduling enrollment
	        // when submitting the main survey program. This is typically a
	        // district/administrative OU (e.g. Gaborone) that is actually
	        // assigned to the survey program in DHIS2. We still display the
	        // facility name from the team-assignment orgUnit.
	        const orgUnit =
	            selectedFacility?.programOrgUnitId ||
	            selectedFacility?.orgUnitId ||
	            (typeof selectedFacility?.orgUnit === 'string' ? selectedFacility.orgUnit : selectedFacility?.orgUnit?.id) ||
	            selectedFacility?.facilityId;
        if (!orgUnit) {
            setSubmitResult({ success: false, message: 'No facility selected.' });
            return;
        }

        setIsSubmitting(true);
        setSubmitResult(null);

        // Validation: Check for mandatory critical comments
        const missingComments = activeSection.fields
            .filter(f => formData[`is_critical_${f.id}`])
            .filter(f => {
                const val = formData[f.id] || '';
                return val.replace('[CRITICAL]', '').trim() === '';
            });

        if (missingComments.length > 0) {
            setSubmitResult({ success: false, message: '❌ Please provide comments for all items marked as Critical.' });
            setIsSubmitting(false);
            return;
        }

        try {
            // Priority 1: Official Assignment IDs (The Source of Truth)
            // Priority 2: Locally saved internal IDs (From previous successes)
	            const enrichedData = {
	                ...formData,
	                // Reuse the facility TEI from the scheduling workflow if
	                // available, but NEVER reuse its enrollment ID for the
	                // main survey program. That enrollment belongs to the
	                // scheduling program (K9O5fdoBmKf), so we let DHIS2 create
	                // a fresh enrollment for G2gULe4jsfs. If a survey-specific
	                // enrollment already exists, it will be stored in
	                // formData.enrollmentId_internal from a previous
	                // successful submission.
	                teiId_internal: selectedFacility?.trackedEntityInstance || formData.teiId_internal,
	                enrollmentId_internal: formData.enrollmentId_internal,
	                // Add point-in-time scoring snapshot for auditing
	                scoringSnapshot: createAssessmentSnapshot(scoringResults)
	            };

            console.log('🚀 Starting Tracker Enrollment Workflow...');
            // Capture generated IDs to prevent duplicates on retry
            const result = await api.submitTrackerAssessment(
                enrichedData,
                configuration,
                orgUnit,
                (key, id) => {
                    console.log(`💾 Persisting ${key} to draft: ${id}`);
                    saveField(key, id);
                }
            );

            // Extract the Event ID using our unified helper (handles v41 tracker vs legacy)
            const dhis2EventId = api.extractEventId(result);

	            if (activeEventId) {
	                await indexedDBService.markAsSynced(activeEventId, dhis2EventId || 'synced');
	            }
	
	            setSubmitResult({ success: true, message: '✅ Saved successfully (data will sync to DHIS2 when online).' });
        } catch (err) {
            console.error('❌ Tracker workflow failed:', err);
            if (activeEventId) await indexedDBService.markAsFailed(activeEventId, err.message);
            setSubmitResult({ success: false, message: `❌ Submit failed: ${err.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

	    return (
	        <div className="form-area">
		            <div className="form-header">
		                <div className="header-content">
			                    <h2>
			                        {(() => {
			                            const raw = activeSection?.name || '';
			                            if (!raw) return '';
			                            const upper = raw.toUpperCase();
			                            // If already starts with SE, just use it
			                            if (upper.trim().startsWith('SE')) return raw.trim();
			                            // Try to derive SE code from HOSP patterns, e.g. "1-HOSPITAL_1 HOSP_SE1 ..." or "SURV_HOSP_1.1 ..."
			                            const hospMatch = upper.match(/HOSP[_\s-]*(SE)?(\d+(?:\.\d+)*)/);
			                            if (hospMatch) {
			                                const numPart = hospMatch[2]; // e.g. "1" or "1.1"
			                                const seToken = `SE${numPart}`;
			                                const rest = raw
			                                    .slice(hospMatch.index + hospMatch[0].length)
			                                    .replace(/^[\s\-_:]+/, '');
			                                return rest ? `${seToken} ${rest}` : seToken;
			                            }
			                            return raw.trim();
			                        })()}
	                        {subsections.length > 1 && (
                            <span style={{ fontSize: '0.6em', opacity: 0.8, marginLeft: '10px', verticalAlign: 'middle', backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                                Part {currentSubsectionIndex + 1} of {subsections.length}
                            </span>
                        )}
                    </h2>
                    {activeEventId && (
                        <div className="save-status-container">
                            {isSaving ? (
                                <span className="save-status saving">
                                    <span className="spinner"></span> Saving...
                                </span>
                            ) : lastSaved ? (
                                <span className="save-status saved">
                                    Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            ) : (
                                <span className="save-status ready">Ready to save</span>
                            )}
                        </div>
                    )}
	                    {/* Section-level scoring summary was previously shown here.
	                        The standard-level draft score is now displayed inline
	                        next to the x.x.x standard row within the form body. */}
                    <div className="header-actions" style={{ marginLeft: 'auto' }}>
                        <button
                            className="scoring-logic-btn"
                            onClick={() => setIsScoringModalOpen(true)}
                            title="View Scoring Logic Summary"
                        >
                            📊 Scoring Logic
                        </button>
                    </div>
                </div>
            </div>
            <ScoringGuideModal
                isOpen={isScoringModalOpen}
                onClose={() => setIsScoringModalOpen(false)}
            />
	            <RootCalculationModal
	                isOpen={!!viewingRootCalc}
	                rootCode={viewingRootCalc?.code}
	                scoreResult={viewingRootCalc?.result}
	                onClose={() => setViewingRootCalc(null)}
	            />
		            {/* Top pager: duplicate of the bottom Previous/Next controls so
		                assessors can navigate subsections without scrolling all the
		                way down. */}
		            {subsections.length > 1 && (
		                <div
		                    className="subsection-nav subsection-nav-top"
		                    style={{
		                        display: 'flex',
		                        justifyContent: 'space-between',
		                        alignItems: 'center',
		                        width: '100%',
		                        margin: '0 0 0.75rem 0',
		                    }}
		                >
		                    <button
		                        className="nav-btn"
		                        onClick={() => {
		                            setCurrentSubsectionIndex((curr) => Math.max(0, curr - 1));
		                            window.scrollTo(0, 0);
		                        }}
		                        disabled={currentSubsectionIndex === 0}
		                        style={{ opacity: currentSubsectionIndex === 0 ? 0.5 : 1 }}
		                    >
		                        
		                        
		                        
		                        
		                        
		                        
		                        
		                        ← Previous Page
		                    </button>
		                    <span
		                        className="page-indicator"
		                        style={{ fontWeight: 600, color: '#4a5568' }}
		                    >
		                        Subsection {currentSubsectionIndex + 1} of {subsections.length}
		                    </span>
		                    <button
		                        className="nav-btn"
		                        onClick={() => {
		                            setCurrentSubsectionIndex((curr) =>
		                                Math.min(subsections.length - 1, curr + 1),
		                            );
		                            window.scrollTo(0, 0);
		                        }}
		                        disabled={isLastSubsection}
		                        style={{ opacity: isLastSubsection ? 0.5 : 1 }}
		                    >
		                        Next Page →
		                    </button>
		                </div>
		            )}
		            <div className="form-content">
		                {renderFields()}
		            </div>
            <div className="form-footer">
                {submitResult && (
                    <div style={{
                        padding: '8px 12px',
                        marginBottom: '8px',
                        borderRadius: '4px',
                        background: submitResult.success ? '#d4edda' : '#f8d7da',
                        color: submitResult.success ? '#155724' : '#721c24',
                        fontSize: '0.9em'
                    }}>
                        {submitResult.message}
                    </div>
                )}
                {subsections.length > 1 && (
                    <div className="subsection-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1rem' }}>
                        <button
                            className="nav-btn"
                            onClick={() => {
                                setCurrentSubsectionIndex(curr => Math.max(0, curr - 1));
                                window.scrollTo(0, 0);
                            }}
                            disabled={currentSubsectionIndex === 0}
                            style={{ opacity: currentSubsectionIndex === 0 ? 0.5 : 1 }}
                        >
                            ← Previous Page
                        </button>
                        <span className="page-indicator" style={{ fontWeight: 600, color: '#4a5568' }}>
                            Subsection {currentSubsectionIndex + 1} of {subsections.length}
                        </span>
                        <button
                            className="nav-btn"
                            onClick={() => {
                                setCurrentSubsectionIndex(curr => Math.min(subsections.length - 1, curr + 1));
                                window.scrollTo(0, 0);
                            }}
                            disabled={isLastSubsection}
                            style={{ opacity: isLastSubsection ? 0.5 : 1 }}
                        >
                            Next Page →
                        </button>
                    </div>
                )}
	                {isLastSubsection && (
	                    <button
	                        className="nav-btn submit-btn"
	                        onClick={handleSubmit}
	                        disabled={isSubmitting || isSaving || submitResult?.success}
	                        style={{
	                            marginTop: '12px',
	                            width: '100%',
	                            background: (isSubmitting || isSaving) ? '#6c757d' : submitResult?.success ? '#2ecc71' : '#28a745',
	                            color: '#fff',
	                            border: 'none',
	                            padding: '10px',
	                            borderRadius: '4px',
	                            cursor: (isSubmitting || isSaving || submitResult?.success) ? 'not-allowed' : 'pointer',
	                            fontWeight: 600,
	                            fontSize: '1em',
	                            opacity: submitResult?.success ? 0.8 : 1
	                        }}
	                    >
	                        {isSubmitting
	                            ? 'Saving...'
	                            : submitResult?.success
	                                ? '✓ Successfully Saved'
	                                : 'Save'}
	                    </button>
	                )}
            </div>
        </div>
    );
};

export default FormArea;
