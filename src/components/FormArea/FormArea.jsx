import React, { useState } from 'react';
import './FormArea.css';
import { useIncrementalSave } from '../../hooks/useIncrementalSave';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import indexedDBService from '../../services/indexedDBService';

const FormArea = ({ activeSection, selectedFacility, user }) => {
    // DEBUG: Validate props on render
    React.useEffect(() => {
        if (!activeSection) console.warn("FormArea: No active section provided");
        if (activeSection) console.log(`FormArea Rendering Section: ${activeSection.name}, fields:`, activeSection.fields.map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options?.length })));
        if (!selectedFacility) console.warn("FormArea: No facility selected");
        if (!user) console.warn("FormArea: No user provided");
    }, [activeSection, selectedFacility, user]);

    // Generate Event ID safely
    const eventId = React.useMemo(() => {
        if (!selectedFacility || !selectedFacility.trackedEntityInstance) return null;
        return `draft-${selectedFacility.trackedEntityInstance}`;
    }, [selectedFacility]);

    const { configuration } = useApp();

    // Submit state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState(null); // { success, message }

    const {
        formData,
        saveField,
        loadFormData,
        isSaving,
        lastSaved
    } = useIncrementalSave(eventId, {
        user,
        onSaveSuccess: (details) => console.log('✅ FormArea: Saved field:', details),
        onSaveError: (error) => console.error('❌ FormArea: Save failed:', error)
    });
    // DUMMY DATA FOR DEBUGGING
    // const formData = {};
    // const saveField = (k, v) => console.log("Dummy Save:", k, v);
    // const loadFormData = () => { };
    // const isSaving = false;
    // const lastSaved = null;

    // Load data when eventId changes
    React.useEffect(() => {
        if (eventId) {
            console.log("FormArea: Loading data for event:", eventId);
            loadFormData();
        }
    }, [eventId, loadFormData]);

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

        let questionNumber = 0;

        return activeSection.fields.map((field) => {
            // Safety check for field
            if (!field || !field.id) {
                console.warn("FormArea: Invalid field in section:", field);
                return null;
            }

            if (field.type === 'header') {
                return (
                    <div key={field.id} className="form-header-separator">
                        <h3>{field.label}</h3>
                    </div>
                );
            }

            questionNumber++;

            return (
                <div key={field.id} className="form-field">
                    <label>{`${questionNumber}. ${field.label || 'Unnamed Field'}`}</label>
                    {field.type === 'select' ? (
                        <select
                            className="form-control"
                            value={formData[field.id] || ''}
                            onChange={(e) => handleInputChange(e, field.id)}
                            id={`field-${field.id}`} // Helper for testing
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
            if (eventId) {
                await indexedDBService.markAsSynced(eventId, payload.event);
            }
            setSubmitResult({ success: true, message: '✅ Submitted to DHIS2 successfully!' });
        } catch (err) {
            console.error('Submit failed:', err);
            if (eventId) await indexedDBService.markAsFailed(eventId, err.message);
            setSubmitResult({ success: false, message: `❌ Submit failed: ${err.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="form-area">
            <div className="form-header">
                <div className="header-content">
                    <h2>{activeSection.name}</h2>
                    {eventId && (
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
                    {isSubmitting ? '⏳ Submitting...' : '🚀 Submit to DHIS2'}
                </button>
            </div>
        </div>
    );
};

export default FormArea;
