import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import './SurveyPreview.css';

export function SurveyPreview({ event, onClose }) {
    const { configuration, userAssignments } = useApp();
    const [previewData, setPreviewData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(null);

    useEffect(() => {
        if (event && configuration) {
            generatePreviewData();
        }
    }, [event, configuration]);

    const generatePreviewData = () => {
        setLoading(true);
        try {
            // detailed assignment structure: { trackedEntityInstance, orgUnit, orgUnitName, status }
            // Find assignment where orgUnit ID matches event.orgUnit
            const assignment = userAssignments?.find(a => a.orgUnit === event.orgUnit);
            const facilityName = assignment?.orgUnitName || 'Unknown Facility';

            const sectionData = {};
            const dataValueMap = {};

            if (event.dataValues) {
                event.dataValues.forEach(dv => dataValueMap[dv.dataElement] = dv.value);
            }
            // Handle draft data structure if different
            if (event._draftData && event._draftData.formData) {
                Object.assign(dataValueMap, event._draftData.formData);
            }


            if (configuration.programStage?.programStageSections) {
                configuration.programStage.programStageSections.forEach(section => {
                    const sectionName = section.displayName || section.name;
                    const sectionFields = [];

                    if (section.dataElements) {
                        section.dataElements.forEach(psde => {
                            // API structure check: is it psde.dataElement or just psde?
                            // Based on api.js getFormMetadata, it returns programStageSections with dataElements inside them directly
                            if (!psde) return;
                            const dataElementId = psde.id;
                            const value = dataValueMap[dataElementId];

                            if (value !== undefined && value !== null && value.toString().trim() !== '') {
                                sectionFields.push({
                                    id: dataElementId,
                                    name: psde.displayName || psde.displayFormName,
                                    value: value, // simplified formatting
                                    valueType: psde.valueType
                                });
                            }
                        });
                    }

                    if (sectionFields.length > 0) {
                        sectionData[sectionName] = {
                            name: sectionName,
                            fields: sectionFields,
                            fieldCount: sectionFields.length
                        };
                    }
                });
            }
            const sectionsWithData = Object.keys(sectionData);
            if (sectionsWithData.length > 0 && !activeSection) {
                setActiveSection(sectionsWithData[0]);
            }
            setPreviewData({
                event: {
                    id: event.event,
                    date: event.eventDate,
                    status: event.status || event.syncStatus,
                    createdAt: event.createdAt,
                    updatedAt: event.updatedAt
                },
                facility: { name: facilityName },
                sections: sectionData,
                totalFields: Object.values(sectionData).reduce((sum, section) => sum + section.fieldCount, 0),
                sectionsWithData: sectionsWithData.length
            });
        } catch (error) {
            console.error('Error generating preview:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="loading-preview">Loading preview...</div>;
    if (!previewData) return null;

    return (
        <div className="inspection-preview-overlay">
            <div className="inspection-preview-modal">
                <div className="preview-header">
                    <h2>Survey Preview</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="preview-content">
                    <div className="section-nav">
                        {Object.keys(previewData.sections).map(sectionName => (
                            <button
                                key={sectionName}
                                className={`section-nav-item ${activeSection === sectionName ? 'active' : ''}`}
                                onClick={() => setActiveSection(sectionName)}
                            >
                                {sectionName}
                            </button>
                        ))}
                    </div>

                    <div className="section-data">
                        {activeSection && previewData.sections[activeSection] && (
                            <div className="fields-list">
                                {previewData.sections[activeSection].fields.map(field => (
                                    <div key={field.id} className="field-item">
                                        <div className="field-question">{field.name}</div>
                                        <div className="field-answer">{field.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
