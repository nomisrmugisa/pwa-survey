import React, { useState } from 'react';
import './FormArea.css';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import indexedDBService from '../../services/indexedDBService';
import emsConfig from '../../assets/ems_config.json';

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

const getCriterionTooltip = (code) => {
    const normalized = normalizeCriterionCode(code);
    if (!normalized) return '';
    const info = EMS_CRITERION_INDEX[normalized];
    if (!info) return '';

    const parts = [];
    if (info.statement) parts.push(`Statement:\n${info.statement.trim()}`);
    if (info.intent) parts.push(`Intent:\n${info.intent.trim()}`);
    return parts.join('\n\n');
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
    activeEventId
}) => {
    // DEBUG: Validate props on render
    React.useEffect(() => {
        if (!activeSection) console.warn("FormArea: No active section provided");
        if (activeSection) console.log(`FormArea Rendering Section: ${activeSection.name}, fields:`, activeSection.fields.map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options?.length })));
        if (!selectedFacility) console.warn("FormArea: No facility selected");
        if (!user) console.warn("FormArea: No user provided");
    }, [activeSection, selectedFacility, user]);

    const { configuration } = useApp();

    // Submit state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState(null); // { success, message }

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
            const criterionTooltip = (!isCommentField && field.code) ? getCriterionTooltip(field.code) : '';

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
                                        checked={isCritical}
                                        onChange={(e) => handleCriticalToggle(field.id, associatedCommentId, e.target.checked)}
                                        disabled={!isQuestionAnswered}
                                    />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        )}
                    </div>
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
                        <input
                            type={field.type || 'text'}
                            className="form-control"
                            value={formData[field.id] || ''}
                            onChange={(e) => handleInputChange(e, field.id)}
                            id={`field-${field.id}`} // Helper for testing
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
        saveField(fieldId, value);
    };

    const handleCriticalToggle = (fieldId, commentFieldId, isChecked) => {
        const currentComment = formData[commentFieldId] || '';
        let newComment = currentComment;

        if (isChecked) {
            if (!currentComment.includes('[CRITICAL]')) {
                newComment = currentComment ? `${currentComment} [CRITICAL]` : '[CRITICAL]';
            }
        } else {
            newComment = currentComment.replace(/\s?\[CRITICAL\]/g, '').trim();
        }

        saveField(commentFieldId, newComment);
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
        try {
            const payload = api.formatEventData(formData, configuration, orgUnit, null);
            await api.submitEvent(payload);
            if (activeEventId) {
                await indexedDBService.markAsSynced(activeEventId, payload.event);
            }
            setSubmitResult({ success: true, message: '✅ Submitted to DHIS2 successfully!' });
        } catch (err) {
            console.error('Submit failed:', err);
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button className="nav-btn prev">Previous</button>
                    <span>Page 1 of 1</span>
                    <button className="nav-btn next">Next</button>
                </div>
                <button
                    className="nav-btn"
                    onClick={handleSubmit}
                    disabled={isSubmitting || isSaving}
                    style={{
                        marginTop: '12px',
                        width: '100%',
                        background: isSubmitting ? '#6c757d' : '#28a745',
                        color: '#fff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '4px',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '1em'
                    }}
                >
                    {isSubmitting ? 'Submitting...' : 'Submit to DHIS2'}
                </button>
            </div>
        </div>
    );
};

export default FormArea;
