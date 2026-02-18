import React from 'react';
import './FormArea.css';

import { useIncrementalSave } from '../../hooks/useIncrementalSave';

const FormArea = ({ activeSection, selectedFacility, user }) => {
    // DEBUG: Validate props on render
    React.useEffect(() => {
        if (!activeSection) console.warn("FormArea: No active section provided");
        if (!selectedFacility) console.warn("FormArea: No facility selected");
        if (!user) console.warn("FormArea: No user provided");
    }, [activeSection, selectedFacility, user]);

    // Generate Event ID safely
    const eventId = React.useMemo(() => {
        if (!selectedFacility || !selectedFacility.trackedEntityInstance) return null;
        return `draft-${selectedFacility.trackedEntityInstance}`;
    }, [selectedFacility]);

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

        return activeSection.fields.map(field => {
            // Safety check for field
            if (!field || !field.id) {
                console.warn("FormArea: Invalid field in section:", field);
                return null;
            }

            return (
                <div key={field.id} className="form-field">
                    <label>{field.label || 'Unnamed Field'}</label>
                    {field.type === 'select' ? (
                        <select
                            className="form-control"
                            value={formData[field.id] || ''}
                            onChange={(e) => handleInputChange(e, field.id)}
                            id={`field-${field.id}`} // Helper for testing
                        >
                            <option value="">Select...</option>
                            {(field.options || []).map((opt, idx) => {
                                const val = typeof opt === 'object' ? opt.value : opt;
                                const label = typeof opt === 'object' ? opt.label : opt;
                                return (
                                    <option key={`${val}-${idx}`} value={val}>
                                        {label}
                                    </option>
                                );
                            })}
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
                <button className="nav-btn prev">Previous</button>
                <span>Page 1 of 1</span>
                <button className="nav-btn next">Next</button>
            </div>
        </div>
    );
};

export default FormArea;
