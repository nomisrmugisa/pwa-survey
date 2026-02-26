import React, { useState } from 'react';
import './FormArea.css';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import indexedDBService from '../../services/indexedDBService';
import emsConfig from '../../assets/ems_config.json';
import emsLinks from '../../assets/ems_links.json';
import ScoreBadge from '../ScoreBadge';
import { classifyAssessment } from '../../utils/classification';
import { createAssessmentSnapshot } from '../../utils/createAssessmentSnapshot';
import Modal from './Modal';
import SeverityDialog from './SeverityDialog';

// Build a fast lookup from EMS criterion ID (e.g. "1.2.1.3") to its
// standard statement and intent text.
const buildCriterionIndex = () => {
    const index = {};
    try {
        const config = emsConfig?.ems_full_configuration || [];
        config.forEach(se => {
            (se.sections || []).forEach(section => {
                (section.standards || []).forEach(standard => {
                    (standard.criteria || []).forEach(crit => {
                        if (!crit || !crit.id) return;
                        index[crit.id] = {
                            statement: standard.statement || '',
                            intent: standard.intent_tooltip || ''
                        };
                    });
                });
            });
        });
    } catch (e) {
        console.error('FormArea: Failed to build EMS criterion index', e);
    }
    return index;
};

const EMS_CRITERION_INDEX = buildCriterionIndex();

const normalizeCriterionCode = (rawCode) => {
    if (!rawCode) return '';
    let code = String(rawCode).trim();
    // Strip known prefixes like "EMS_" or "SE " if present
    code = code.replace(/^EMS_/, '');
    if (code.startsWith('SE ')) {
        code = code.slice(3).trim();
    }
    // If any spaces remain, take the first token (e.g. "1.1.1.1 extra" -> "1.1.1.1")
    code = code.split(/\s+/)[0];
    return code;
};

const getCriterionTooltip = (code, links) => {
    const normalized = normalizeCriterionCode(code);
    if (!normalized) return '';
    const info = EMS_CRITERION_INDEX[normalized];
    if (!info) return '';

    const parts = [];
    if (info.statement) parts.push(`Statement:\n${info.statement.trim()}`);
    if (info.intent) parts.push(`Intent:\n${info.intent.trim()}`);

    // Add Linked Criteria if available
    if (links && Array.isArray(links)) {
        const linkInfo = links.find(l => normalizeCriterionCode(l.criteria) === normalized);
        if (linkInfo) {
            console.log(`Tooltip Match Found for ${normalized}:`, linkInfo);
            if (linkInfo.linked_criteria && linkInfo.linked_criteria.length > 0) {
                parts.push(`Linked Criteria:\n${linkInfo.linked_criteria.join(', ')}`);
            }
        }
    }

    return parts.join('\n\n');
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

    React.useEffect(() => {
        const savedLinks = localStorage.getItem('custom_ems_links');
        if (savedLinks) {
            try {
                setCustomLinks(JSON.parse(savedLinks));
            } catch (e) {
                console.error('FormArea: Failed to parse saved custom links');
            }
        }
    }, []);

    const activeLinks = customLinks || emsLinks;
    // DEBUG: Validate props on render
    React.useEffect(() => {
        if (!activeSection) console.warn("FormArea: No active section provided");
        if (activeSection) console.log(`FormArea Rendering Section: ${activeSection.name}`);
    }, [activeSection]);

    const { configuration } = useApp();

    // Submit state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState(null); // { success, message }

    // Severity Dialog State
    const [severityTargetField, setSeverityTargetField] = useState(null); // { fieldId, commentFieldId }

    React.useEffect(() => {
        console.log('severityTargetField state changed:', severityTargetField);
    }, [severityTargetField]);

    // Reset submit status if data changes after successful submission
    // This allows the user to "Update" DHIS2
    React.useEffect(() => {
        if (submitResult?.success) {
            console.log('📝 FormArea: Detected change after submission, resetting status to allow update.');
            setSubmitResult(null);
        }
    }, [formData]);

    const isADSection = activeSection?.name === "Assessment Details";
    const isLocked = !isADSection && !isADComplete;

    // Render Logic Helpers
    const renderFields = () => {
        if (!activeSection) return null;

        // Safety check for fields
        if (!activeSection.fields || !Array.isArray(activeSection.fields)) {
            console.error("FormArea: activeSection.fields is missing or not an array:", activeSection);
            return <div className="error-message">Error: Section data is malformed.</div>;
        }

        if (activeSection.fields.length === 0) {
            return <div className="empty-fields-message">No fields in this section.</div>;
        }


        return activeSection.fields.map((field) => {
            // Safety check for field
            if (!field || !field.id) {
                console.warn("FormArea: Invalid field in section:", field);
                return null;
            }

            if (field.type === 'header') {
                return (
                    <div key={field.id} className="form-header-separator">
                        <h3>{field.code ? `${field.code} ${field.label}` : field.label}</h3>
                    </div>
                );
            }

            const isCommentField = field.isComment || field.label === 'Comment' || field.id?.endsWith('-comments') || field.id?.endsWith('-comment');

            const associatedCommentId = field.commentFieldId;
            const currentCommentValue = associatedCommentId ? (formData[associatedCommentId] || '') : '';
            const isCritical = currentCommentValue.includes('[CRITICAL]');
            const questionValue = formData[field.id];
            const isQuestionAnswered = questionValue !== undefined && questionValue !== null && questionValue !== '';

            // Check if comment field is disabled (parent question not answered)
            const parentQuestionId = field.questionFieldId;
            const isParentAnswered = parentQuestionId ? (formData[parentQuestionId] !== undefined && formData[parentQuestionId] !== null && formData[parentQuestionId] !== '') : true;

            // Look up EMS standard/intent tooltip for this data element code
            const criterionTooltip = (!isCommentField && field.code) ? getCriterionTooltip(field.code, activeLinks) : '';

            return (
                <div
                    key={field.id}
                    className={`form-field ${isCritical ? 'is-critical' : ''} ${(!isParentAnswered && isCommentField) ? 'field-disabled' : ''}`}
                    data-tooltip={(!isParentAnswered && isCommentField) ? "Please answer the main question first" : ""}
                >
                    <div className="field-label-container">
                        <div className="field-label-main">
                            <label>
                                {isCommentField
                                    ? (field.label || 'Unnamed Field')
                                    : (field.code ? `${field.code} ${field.label || 'Unnamed Field'}` : field.label || 'Unnamed Field')}
                            </label>
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
                        {associatedCommentId && !isCommentField && (
                            <div
                                className={`critical-toggle-container ${!isQuestionAnswered ? 'disabled' : ''}`}
                                data-tooltip={!isQuestionAnswered ? "Please answer the main question first" : ""}
                            >
                                <span className="toggle-label">Critical?</span>
                                <label className="switch">
                                    <input
                                        type="checkbox"
                                        checked={formData[`is_critical_${associatedCommentId}`] || isCritical}
                                        onChange={(e) => handleCriticalToggle(field.id, associatedCommentId, e.target.checked)}
                                        disabled={!isQuestionAnswered}
                                    />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        )}
                    </div>
                    {formData[`is_critical_${field.id}`] && isCommentField && (
                        <div className="mandatory-label">Comment is required for Critical issues.</div>
                    )}
                    {field.type === 'select' ? (
                        <select
                            className="form-control"
                            value={formData[field.id] || ''}
                            onChange={(e) => handleInputChange(e, field.id)}
                            id={`field-${field.id}`} // Helper for testing
                            disabled={!isParentAnswered && isCommentField}
                        >
                            <option value="">Select...</option>
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
                    ) : (
                        <FieldInput
                            type={isCommentField ? 'textarea' : field.type}
                            className={`form-control ${formData[`is_critical_${field.id}`] && (!questionValue || questionValue === '') ? 'mandatory-warning' : ''}`}
                            value={formData[field.id] || ''}
                            onChange={(e) => handleInputChange(e, field.id)}
                            onBlur={isCommentField ? () => handleCommentBlur(field.id) : undefined}
                            id={`field-${field.id}`}
                            disabled={!isParentAnswered && isCommentField}
                        />
                    )}
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

        if (field?.type === 'select' && value && value !== '') {
            console.log('Triggering severity dialog...');
            setSeverityTargetField({
                fieldId,
                commentFieldId: field.commentFieldId
            });
        }

        saveField(fieldId, value);
    };

    const handleSeveritySelect = (severity) => {
        if (severityTargetField) {
            saveField(`severity_${severityTargetField.fieldId}`, severity);
            setSeverityTargetField(null);
        }
    };

    const handleCommentBlur = (fieldId) => {
        const currentComment = formData[fieldId] || '';
        // Find if this field is linked to a toggled "Critical" state or has a selected "Severity"
        const parentField = activeSection.fields.find(f => f.commentFieldId === fieldId);
        const parentFieldId = parentField?.id;

        let newComment = currentComment;

        // Add [CRITICAL] tag if toggled
        if (formData[`is_critical_${fieldId}`] && !newComment.includes('[CRITICAL]')) {
            newComment = newComment ? `${newComment} [CRITICAL]` : '[CRITICAL]';
        }

        // Add [SEVERITY: ...] tag if selected
        const severity = parentFieldId ? formData[`severity_${parentFieldId}`] : null;
        if (severity) {
            const severityTag = `[SEVERITY: ${severity}]`;
            // Remove any existing severity tags first to allow updates
            newComment = newComment.replace(/\[SEVERITY: [^\]]+\]/g, '').trim();
            newComment = newComment ? `${newComment} ${severityTag}` : severityTag;
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
        const orgUnit = selectedFacility?.orgUnit || selectedFacility?.facilityId || selectedFacility?.trackedEntityInstance;
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
                teiId_internal: selectedFacility?.trackedEntityInstance || formData.teiId_internal,
                enrollmentId_internal: selectedFacility?.enrollment || formData.enrollmentId_internal,
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

            setSubmitResult({ success: true, message: '✅ DHIS2 Sync Successful (Data persists under original IDs)!' });
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
                    <h2>{activeSection.code ? `${activeSection.code} ${activeSection.name}` : activeSection.name}</h2>
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
                    {scoringResults && (
                        <div className="section-scoring-summary">
                            {(() => {
                                const sectionScore = scoringResults.sections?.find(s => s.id === activeSection?.id);
                                if (!sectionScore) return null;

                                const classification = classifyAssessment({
                                    percent: sectionScore.percent,
                                    criticalFail: sectionScore.criticalFail
                                });

                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                                        <ScoreBadge
                                            percent={sectionScore.percent}
                                            criticalFail={sectionScore.criticalFail}
                                        />
                                        <span className="compliance-label" style={{ fontSize: '0.85em', fontWeight: '500', color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                            {classification.statusLabel}
                                        </span>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>
            <div className="form-content">
                {isLocked ? (
                    <div className="blocking-overlay">
                        <div className="overlay-message">
                            <span className="lock-icon">🔒</span>
                            <h3>Section Locked</h3>
                            <p>Please complete <strong>"Assessment Details"</strong> questions first to proceed.</p>
                        </div>
                    </div>
                ) : renderFields()}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <button className="nav-btn prev">Previous</button>
                    <span>Page 1 of 1</span>
                    <button className="nav-btn next">Next</button>
                </div>
                <button
                    className="nav-btn"
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
                    {isSubmitting ? 'Submitting...' : submitResult?.success ? '✓ Successfully Submitted' : 'Submit to DHIS2'}
                </button>
            </div>

            <Modal
                isOpen={!!severityTargetField}
                onClose={() => setSeverityTargetField(null)}
                title="Select Severity"
            >
                <SeverityDialog onSelect={handleSeveritySelect} />
            </Modal>
        </div>
    );
};

export default FormArea;
