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

    const syncEvents = async () => {
        if (!isOnline) {
            showToast("You are offline. Cannot sync.", "warning");
            return;
        }
        // Placeholder for sync logic
        console.log("Syncing events...");
        showToast("Sync logic to be implemented", "info");
    };

    const retryEvent = async (eventId) => {
        console.log("Retrying event", eventId);
        return true;
    };

    const deleteEvent = async (eventId) => {
        console.log("Deleting event", eventId);
        // Implement deletion logic (IndexedDB)
    };

    const clearAllInspections = async () => {
        console.log("Clearing all inspections");
        // Implement clear all logic
        return true;
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
