import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import indexedDBService from '../services/indexedDBService';
import { useStorage } from '../hooks/useStorage';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [configuration, setConfiguration] = useState(null);
    const [userAssignments, setUserAssignments] = useState([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const storage = useStorage();

    // Stats
    const [stats, setStats] = useState({
        totalEvents: 0,
        pendingEvents: 0,
        syncedEvents: 0,
        errorEvents: 0
    });

    const [pendingEvents, setPendingEvents] = useState([]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Load initial user session and their facility assignments
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const currentUser = await api.getCurrentUser();
                setUser(currentUser);

                // Fetch facility assignments for this user:
                // Filter enrollments in program K9O5fdoBmKf where
                // attribute Rh87cVTZ8b6 (Inspection Final List) contains this user's ID,
                // then extract attribute R0e1pnpjkaW (Inspection Facility ID) as the assigned facility.
                if (currentUser?.id) {
                    try {
                        const assignments = await api.getAssignments('K9O5fdoBmKf', currentUser.id);
                        setUserAssignments(assignments);
                    } catch (assignErr) {
                        console.warn('Could not load user assignments:', assignErr);
                    }
                }
            } catch (error) {
                console.warn("No active session", error);
            }
        };
        checkAuth();
    }, []);

    const logout = async () => {
        await storage.clearAuth();
        setUser(null);
        // Additional cleanup if needed
    };

    const showToast = (message, type = 'info') => {
        console.log(`[TOAST] ${type.toUpperCase()}: ${message}`);
        // Implement actual toast UI here if needed
    };

    const refreshStats = useCallback(async () => {
        try {
            const drafts = await indexedDBService.getAllDrafts(user);
            const all = await indexedDBService.getAllDrafts(user);
            // getAllDrafts only returns isDraft=true; get synced count separately
            setStats({
                totalEvents: drafts.length,
                pendingEvents: drafts.filter(d => d.syncStatus !== 'synced').length,
                syncedEvents: drafts.filter(d => d.syncStatus === 'synced').length,
                errorEvents: drafts.filter(d => d.syncStatus === 'error').length,
            });
            setPendingEvents(drafts.filter(d => d.syncStatus !== 'synced'));
        } catch (err) {
            console.warn('Could not refresh stats:', err);
        }
    }, [user]);

    // Refresh stats whenever user changes
    useEffect(() => {
        if (user) refreshStats();
    }, [user, refreshStats]);

    const syncEvents = async () => {
        if (!isOnline) {
            showToast('You are offline. Cannot sync.', 'warning');
            return { synced: 0, failed: 0 };
        }
        if (!configuration) {
            showToast('Configuration not loaded yet.', 'warning');
            return { synced: 0, failed: 0 };
        }

        let synced = 0, failed = 0;
        try {
            const drafts = await indexedDBService.getAllDrafts(user);
            const pending = drafts.filter(d => d.syncStatus !== 'synced');
            console.log(`🔄 Syncing ${pending.length} pending draft(s) to DHIS2...`);

            for (const draft of pending) {
                try {
                    const orgUnit = draft.formData?.orgUnit || draft.orgUnit;
                    console.log(`🔄 AppContext: Syncing draft ${draft.eventId} via Tracker workflow...`);

                    const result = await api.submitTrackerAssessment(
                        draft.formData,
                        configuration,
                        orgUnit
                    );

                    // Extract the DHIS2 event ID using our unified helper
                    const dhis2Id = api.extractEventId(result);
                    await indexedDBService.markAsSynced(draft.eventId, dhis2Id);
                    synced++;
                } catch (err) {
                    console.error(`❌ Failed to sync draft ${draft.eventId}:`, err);
                    await indexedDBService.markAsFailed(draft.eventId, err.message);
                    failed++;
                }
            }

            showToast(`Sync complete: ${synced} synced, ${failed} failed.`, synced > 0 ? 'success' : 'warning');
            await refreshStats();
        } catch (err) {
            console.error('❌ syncEvents error:', err);
            showToast('Sync failed: ' + err.message, 'error');
        }
        return { synced, failed };
    };

    const retryEvent = async (eventId) => {
        if (!isOnline) { showToast('You are offline.', 'warning'); return false; }
        if (!configuration) { showToast('Configuration not loaded.', 'warning'); return false; }
        try {
            const draft = await indexedDBService.getFormData(eventId);
            if (!draft) throw new Error('Draft not found');
            const orgUnit = draft.formData?.orgUnit || draft.orgUnit;

            console.log(`🔄 AppContext: Retrying sync for ${eventId} via Tracker workflow...`);
            const result = await api.submitTrackerAssessment(
                draft.formData,
                configuration,
                orgUnit
            );

            // Extract the DHIS2 event ID using our unified helper
            const dhis2Id = api.extractEventId(result);
            await indexedDBService.markAsSynced(eventId, dhis2Id);
            await refreshStats();
            showToast('Event synced successfully.', 'success');
            return true;
        } catch (err) {
            await indexedDBService.markAsFailed(eventId, err.message);
            showToast('Retry failed: ' + err.message, 'error');
            return false;
        }
    };

    const deleteEvent = async (eventId) => {
        try {
            await indexedDBService.deleteDraft(eventId);
            await refreshStats();
        } catch (err) {
            console.error('Failed to delete draft:', err);
        }
    };

    const clearAllInspections = async () => {
        try {
            await indexedDBService.clearStore();
            await refreshStats();
            return true;
        } catch (err) {
            console.error('Failed to clear inspections:', err);
            return false;
        }
    };


    const value = useMemo(() => ({
        user,
        setUser,
        configuration,
        setConfiguration,
        userAssignments,
        setUserAssignments,
        isOnline,
        stats,
        pendingEvents,
        syncEvents,
        retryEvent,
        deleteEvent,
        clearAllInspections,
        showToast,
        logout
    }), [user, configuration, userAssignments, isOnline, stats, pendingEvents]);

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
