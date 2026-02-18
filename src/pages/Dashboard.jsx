import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useStorage } from '../hooks/useStorage';
import { SurveyPreview } from '../components/SurveyPreview.jsx';
import indexedDBService from '../services/indexedDBService';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button
} from '@mui/material';
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
    }, [storage.isReady, user]);

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

            {/* Preview Modal */}
            {previewEvent && (
                <SurveyPreview event={previewEvent} onClose={() => setPreviewEvent(null)} />
            )}
        </div>
    );
}
