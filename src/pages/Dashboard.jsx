import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useStorage } from '../hooks/useStorage';
import { useUserAssessments } from '../hooks/useUserAssessments';
import { SurveyPreview } from '../components/SurveyPreview.jsx';
import indexedDBService from '../services/indexedDBService';
import emsConfig from '../assets/ems_config.json';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    IconButton,
    Tooltip
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import './Dashboard.css';

export function Dashboard() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const {
        configuration,
        stats,
        pendingEvents,
        isOnline,
        syncEvents,
        retryEvent,
        deleteEvent,
        clearAllSurveys,
        showToast,
        userAssignments,
        user
    } = useApp();
    const storage = useStorage();
    const [searchTerm, setSearchTerm] = useState('');
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedFacilityId, setSelectedFacilityId] = useState(null);
    const [previewEvent, setPreviewEvent] = useState(null);
    const [mostRecentDraft, setMostRecentDraft] = useState(null);

    // State for success popup
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [isAssessmentsCollapsed, setIsAssessmentsCollapsed] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [selectedSE, setSelectedSE] = useState(null);
    const [isEditingJson, setIsEditingJson] = useState(false);
    const [editedJson, setEditedJson] = useState('');
    const [jsonError, setJsonError] = useState(null);
    const [customEmsConfig, setCustomEmsConfig] = useState(null);

    // Integrated Hook
    const assessmentHook = useUserAssessments();
    const {
        upcoming: upcomingAssessments,
        pending: pendingAssessments,
        stats: assessmentStats,
        loading: assessmentsLoading,
        respondToAssignment
    } = assessmentHook;

    const handleConfirmClear = async () => {
        const success = await clearAllSurveys();
        if (success) {
            setEvents([]);
            setMostRecentDraft(null);
        }
        setShowClearConfirm(false);
    };

    // Check for most recent draft on load
    useEffect(() => {
        // Placeholder logic for most recent draft until indexedDBService has this specific method
        // Or we implement it in the service
        const checkDraft = async () => {
            // implementation depends on service update
        };
        checkDraft();
    }, [user]);

    // Get facility filter from URL parameters
    useEffect(() => {
        const facilityId = searchParams.get('facility');
        if (facilityId) {
            setSelectedFacilityId(facilityId);
        }
    }, [searchParams]);

    // Load events from storage
    const loadEvents = async () => {
        if (!storage.isReady) return;
        try {
            setIsLoading(true);

            // Load auto-saved drafts
            console.log("Dashboard: Loading drafts...");
            // Pass current user to ensure we get their drafts
            const autoSavedDrafts = await indexedDBService.getAllDrafts(user);
            console.log("Dashboard: Drafts loaded raw:", autoSavedDrafts);

            // Convert drafts to event format for display
            const convertedAutoSavedDrafts = autoSavedDrafts
                .map(draft => {
                    // console.log("Dashboard: Converting draft:", draft.eventId, draft);
                    return {
                        event: draft.eventId,
                        orgUnit: draft.formData?.orgUnit,
                        eventDate: draft.formData?.eventDate || new Date(draft.createdAt).toISOString().split('T')[0],
                        status: 'draft',
                        syncStatus: 'draft',
                        createdAt: draft.createdAt,
                        updatedAt: draft.lastUpdated,
                        isDraft: true,
                        isAutoSaved: true,
                        dataValues: [], // Will need to map this for preview
                        _draftData: draft
                    };
                });

            console.log("Dashboard: Converted drafts:", convertedAutoSavedDrafts);

            // In a real app, we would merge with "submitted/synced" events here
            const allEvents = [...convertedAutoSavedDrafts];
            setEvents(allEvents);
        } catch (error) {
            console.error('Failed to load events:', error);
            showToast('Failed to load events', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
        // Load custom config from localStorage
        const savedConfig = localStorage.getItem('custom_ems_config');
        if (savedConfig) {
            try {
                setCustomEmsConfig(JSON.parse(savedConfig));
            } catch (e) {
                console.error('Failed to parse saved custom config');
            }
        }
    }, [storage.isReady, user]);

    // Use custom config if available, otherwise fallback to imported JSON
    const currentConfig = useMemo(() => {
        return customEmsConfig || emsConfig;
    }, [customEmsConfig]);

    // Filter events
    const filteredEvents = useMemo(() => {
        let filtered = events;
        if (selectedFacilityId) {
            // Filter by facility if implemented in draft data
            // Drafts might not have orgUnit set yet if it's in formData
        }
        if (searchTerm.trim()) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(event => {
                const eventDate = new Date(event.eventDate).toLocaleDateString().toLowerCase();
                return eventDate.includes(search) ||
                    (event.status || event.syncStatus || '').toLowerCase().includes(search);
            });
        }
        return filtered;
    }, [events, searchTerm, selectedFacilityId, configuration]);

    // Calculate dashboard stats
    const dashboardStats = useMemo(() => {
        return {
            totalEvents: events.length,
            pendingEvents: events.filter(e => e.status === 'draft').length,
            syncedEvents: 0,
            errorEvents: 0
        };
    }, [events]);

    const handleNewForm = () => {
        navigate('/form?new=true');
    };

    const handleEditForm = (event) => {
        // If it's a draft, logic to resume it
        if (event.status === 'draft') {
            // Need to parse facility from draft ID or data to route correctly 
            // For now, just route to form
            navigate(`/form`);
        }
    };

    const handleSync = async () => {
        await syncEvents();
        await loadEvents();
    };

    const handleDeleteEvent = async (eventId) => {
        // Implement delete
    };

    return (
        <div className="home-page dashboard-container">
            {/* Program Header */}
            <div className="program-header">
                <div className="program-info">
                    <h1 className="program-title">{configuration?.program?.displayName || 'MOH Survey Dashboard'}</h1>
                </div>
                <div className="quick-actions">
                    <Tooltip title="Refresh/Sync Data">
                        <IconButton onClick={handleSync} color="primary" className="action-icon-btn">
                            <CloudSyncIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="App Settings">
                        <IconButton onClick={() => setShowSettings(true)} color="primary" className="action-icon-btn">
                            <SettingsIcon />
                        </IconButton>
                    </Tooltip>
                    <button className="btn btn-primary btn-large new-form-btn" onClick={handleNewForm}>
                        New Survey
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-dashboard">
                <div className="stat-card total">
                    <div className="stat-icon">[T]</div>
                    <div className="stat-content">
                        <h3>{dashboardStats.totalEvents}</h3>
                        <p>Total Surveys</p>
                    </div>
                </div>
                <div className="stat-card pending">
                    <div className="stat-icon">⏱</div>
                    <div className="stat-content">
                        <h3>{dashboardStats.pendingEvents}</h3>
                        <p>Drafts</p>
                    </div>
                </div>
                <div className="stat-card upcoming">
                    <div className="stat-icon">📅</div>
                    <div className="stat-content">
                        <h3>{assessmentStats.upcoming}</h3>
                        <p>Upcoming Assessments</p>
                    </div>
                </div>
                <div className="stat-card urgent">
                    <div className="stat-icon">🔔</div>
                    <div className="stat-content">
                        <h3>{assessmentStats.pending}</h3>
                        <p>Pending Actions</p>
                    </div>
                </div>
            </div>

            {/* Assessments List */}
            <div className={`forms-section assessments-section ${isAssessmentsCollapsed ? 'collapsed' : ''}`}>
                <div className="section-header" onClick={() => setIsAssessmentsCollapsed(!isAssessmentsCollapsed)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            transform: isAssessmentsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                            display: 'inline-block'
                        }}>▼</span>
                        <h3>Assigned Assessments</h3>
                    </div>
                </div>
                {!isAssessmentsCollapsed && (
                    <div className="forms-list">
                        {assessmentsLoading ? (
                            <div className="loading">Loading Assessments...</div>
                        ) : (upcomingAssessments.length === 0 && pendingAssessments.length === 0) ? (
                            <div className="empty-state">No assessments assigned</div>
                        ) : (
                            [...pendingAssessments, ...upcomingAssessments].map(assessment => (
                                <div key={assessment.eventId} className="form-item assessment-item">
                                    <div className="form-info">
                                        <div className="form-header-row">
                                            <h4>{assessment.orgUnitName}</h4>
                                            <div className={`form-status ${assessment.requiresResponse ? 'error' : 'success'}`}>
                                                {assessment.requiresResponse ? 'ACTION REQUIRED' : 'CONFIRMED'}
                                            </div>
                                        </div>
                                        <p>Date: {assessment.sortDate} | ID: {assessment.eventId}</p>
                                    </div>
                                    <div className="form-actions">
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => navigate(`/form?assessmentId=${assessment.eventId}`)}
                                        >
                                            Conduct Survey
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Forms List */}
            <div className="forms-section">
                <div className="section-header">
                    <h3>Recent Surveys</h3>
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="forms-list">
                    {isLoading ? (
                        <div className="loading">Loading...</div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="empty-state">No Survey found</div>
                    ) : (
                        filteredEvents.map(event => (
                            <div key={event.event} className="form-item" onClick={() => handleEditForm(event)}>
                                <div className="form-info">
                                    <div className="form-header-row">
                                        <h4>Survey - {new Date(event.updatedAt).toLocaleDateString()}</h4>
                                        <div className="form-status warning">
                                            Draft
                                        </div>
                                    </div>
                                    <p>ID: {event.event}</p>
                                </div>
                                <div className="form-actions">
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={(e) => { e.stopPropagation(); setPreviewEvent(event); }}
                                    >
                                        Preview
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Dialogs */}
            <Dialog open={showClearConfirm} onClose={() => setShowClearConfirm(false)}>
                <DialogTitle>Confirm Data Wipe</DialogTitle>
                <DialogContent>Are you sure you want to delete all data?</DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowClearConfirm(false)}>Cancel</Button>
                    <Button onClick={handleConfirmClear} color="error">Delete All</Button>
                </DialogActions>
            </Dialog>

            {/* Settings Dialog */}
            <Dialog
                open={showSettings}
                onClose={() => { setShowSettings(false); setSelectedSE(null); }}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    {selectedSE ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Button onClick={() => setSelectedSE(null)} size="small">← Back</Button>
                            <span>SE {selectedSE.se_id}: {selectedSE.se_name}</span>
                        </div>
                    ) : 'App Settings'}
                </DialogTitle>
                <DialogContent dividers>
                    <div className="settings-content">
                        {!selectedSE ? (
                            <>
                                <div className="settings-section">
                                    <h4>Service Element Configuration</h4>
                                    <p className="settings-subtitle">EMS Standards (SE 1 - SE 10)</p>
                                    <div className="se-config-list">
                                        {currentConfig.ems_full_configuration.map(se => (
                                            <div
                                                key={se.se_id}
                                                className="se-config-item clickable"
                                                onClick={() => {
                                                    setSelectedSE(se);
                                                    setEditedJson(JSON.stringify(se, null, 2));
                                                    setIsEditingJson(false);
                                                }}
                                            >
                                                <span className="se-id-badge">SE {se.se_id}</span>
                                                <span className="se-name-text">{se.se_name}</span>
                                                <span className="chevron-right">›</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="config-status-tag success">STABLE</div>
                                </div>
                                <div className="settings-section">
                                    <h4>User Info</h4>
                                    <p>Logged in as: <strong>{user?.username || 'Guest'}</strong></p>
                                </div>
                                <div className="settings-section">
                                    <h4>Troubleshooting</h4>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        onClick={() => { setShowSettings(false); setShowClearConfirm(true); }}
                                        size="small"
                                        style={{ marginTop: '10px' }}
                                    >
                                        Reset Local Data
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="se-details-view raw-json-container">
                                <div className="json-header-actions">
                                    {isEditingJson ? (
                                        <>
                                            {jsonError && <span className="error-text json-error-msg">{jsonError}</span>}
                                            <Button
                                                size="small"
                                                variant="contained"
                                                color="success"
                                                onClick={() => {
                                                    try {
                                                        const parsed = JSON.parse(editedJson);
                                                        // Update full config
                                                        const newConfig = { ...currentConfig };
                                                        const index = newConfig.ems_full_configuration.findIndex(se => se.se_id === selectedSE.se_id);
                                                        if (index !== -1) {
                                                            newConfig.ems_full_configuration[index] = parsed;
                                                            setCustomEmsConfig(newConfig);
                                                            localStorage.setItem('custom_ems_config', JSON.stringify(newConfig));
                                                            setSelectedSE(parsed);
                                                            setIsEditingJson(false);
                                                            setJsonError(null);
                                                            showToast('Configuration saved successfully!', 'success');
                                                        }
                                                    } catch (e) {
                                                        setJsonError('Invalid JSON format');
                                                    }
                                                }}
                                                style={{ marginRight: '10px' }}
                                            >
                                                Save Changes
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => {
                                                    setIsEditingJson(false);
                                                    setEditedJson(JSON.stringify(selectedSE, null, 2));
                                                    setJsonError(null);
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => setIsEditingJson(true)}
                                                style={{ marginRight: '10px' }}
                                            >
                                                Edit Mode
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(JSON.stringify(selectedSE, null, 2));
                                                    showToast('JSON copied to clipboard!', 'success');
                                                }}
                                                style={{ marginRight: '10px' }}
                                            >
                                                Copy JSON
                                            </Button>
                                            {customEmsConfig && (
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    color="error"
                                                    onClick={() => {
                                                        if (window.confirm('Are you sure you want to reset this SE to default?')) {
                                                            const defaultConfig = emsConfig.ems_full_configuration.find(se => se.se_id === selectedSE.se_id);
                                                            const newCustomConfig = { ...customEmsConfig };
                                                            newCustomConfig.ems_full_configuration = newCustomConfig.ems_full_configuration.map(se =>
                                                                se.se_id === selectedSE.se_id ? defaultConfig : se
                                                            );
                                                            setCustomEmsConfig(newCustomConfig);
                                                            localStorage.setItem('custom_ems_config', JSON.stringify(newCustomConfig));
                                                            setSelectedSE(defaultConfig);
                                                            showToast('Reset to default', 'info');
                                                        }
                                                    }}
                                                >
                                                    Reset
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                                {isEditingJson ? (
                                    <textarea
                                        className="raw-json-editor"
                                        value={editedJson}
                                        onChange={(e) => setEditedJson(e.target.value)}
                                        spellCheck="false"
                                    />
                                ) : (
                                    <pre className="raw-json-viewer">
                                        {JSON.stringify(selectedSE, null, 2)}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setShowSettings(false); setSelectedSE(null); }}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Preview Modal */}
            {previewEvent && (
                <SurveyPreview event={previewEvent} onClose={() => setPreviewEvent(null)} />
            )}
        </div>
    );
}
