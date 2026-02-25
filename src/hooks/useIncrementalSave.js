/**
 * Custom hook for incremental field-by-field saving to IndexedDB
 * Provides debounced saving to avoid excessive writes
 */
import { useCallback, useRef, useEffect, useState } from 'react';
import indexedDBService from '../services/indexedDBService';

export const useIncrementalSave = (eventId, options = {}) => {
    const {
        debounceMs = 300,
        onSaveSuccess,
        onSaveError,
        enableLogging = true,
        user = null // Accept user object to avoid async lookup failures
    } = options;
    // Use refs for callbacks to keep internal functions stable
    const onSaveSuccessRef = useRef(onSaveSuccess);
    // Keep track of latest user to avoid stale closures in timeouts
    const userRef = useRef(user);
    useEffect(() => {
        userRef.current = user;
        if (enableLogging && user) console.log("🔧 useIncrementalSave: User updated in ref:", user.username);
    }, [user, enableLogging]);

    // Use refs for callbacks to keep internal functions stable
    const onSaveErrorRef = useRef(onSaveError);
    useEffect(() => {
        onSaveSuccessRef.current = onSaveSuccess;
        onSaveErrorRef.current = onSaveError;
    }, [onSaveSuccess, onSaveError]);

    // Form data state
    const [formData, setFormData] = useState({});

    // Store pending saves to batch them
    const pendingSaves = useRef(new Map());
    const saveTimeoutRef = useRef(null);
    const isInitialized = useRef(false);

    // Initialize IndexedDB on first use
    useEffect(() => {
        const initDB = async () => {
            if (!isInitialized.current) {
                try {
                    await indexedDBService.init();
                    isInitialized.current = true;
                    if (enableLogging) console.log('🔧 useIncrementalSave: IndexedDB initialized');
                } catch (error) {
                    console.error('❌ useIncrementalSave: Failed to initialize IndexedDB:', error);
                    if (onSaveError) onSaveError(error);
                }
            }
        };
        initDB();
    }, [onSaveError, enableLogging]);

    // Clear state immediately when eventId changes to prevent data leak between forms
    useEffect(() => {
        if (enableLogging) console.log(`🔄 useIncrementalSave: eventId changed to ${eventId}, clearing local state.`);
        setFormData({});
        setLastSaved(null);
        // Clear pending saves to prevent old data from being written to new ID
        pendingSaves.current.clear();
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    }, [eventId, enableLogging]);

    // Save status state
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

    // Debounced save function
    const debouncedSave = useCallback(async () => {
        if (pendingSaves.current.size === 0) return;

        setIsSaving(true);
        try {
            const updates = Array.from(pendingSaves.current.entries());

            // Get latest user from ref
            const currentUser = userRef.current;

            if (enableLogging) {
                console.log(`💾 Saving ${updates.length} field(s) to IndexedDB. User:`, currentUser?.username || 'anonymous');
            }

            // Save each field individually
            for (const [fieldKey, fieldValue] of updates) {
                // Pass user explicitly to service to ensure correct owner
                await indexedDBService.saveFormData(eventId, fieldKey, fieldValue, {}, currentUser);
            }
            // Clear pending saves
            pendingSaves.current.clear();

            const timestamp = new Date();
            setLastSaved(timestamp);
            setIsSaving(false);

            // Notify success
            if (onSaveSuccessRef.current) {
                onSaveSuccessRef.current({
                    eventId,
                    savedFields: updates.length,
                    timestamp: timestamp.toISOString()
                });
            }
        } catch (error) {
            console.error('❌ Failed to save fields to IndexedDB:', error);
            setIsSaving(false);
            if (onSaveErrorRef.current) onSaveErrorRef.current(error);
        }
    }, [eventId, enableLogging, user]); // Added user to dependencies

    // Save field function
    const saveField = useCallback((fieldKey, fieldValue) => {
        if (!eventId) {
            console.warn('⚠️ useIncrementalSave: No eventId provided, skipping save');
            return;
        }

        // Update local state immediately
        setFormData(prev => ({
            ...prev,
            [fieldKey]: fieldValue
        }));

        // Add to pending saves
        pendingSaves.current.set(fieldKey, fieldValue);
        setIsSaving(true); // Indicate pending save

        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        // Set new debounced save
        saveTimeoutRef.current = setTimeout(() => {
            debouncedSave();
        }, debounceMs);
    }, [eventId, debounceMs, debouncedSave]);

    // Load existing form data
    const loadFormData = useCallback(async () => {
        if (!eventId) {
            setFormData({});
            setLastSaved(null);
            return null;
        }
        try {
            const data = await indexedDBService.getFormData(eventId);
            if (data && data.formData) {
                if (enableLogging) console.log(`📂 useIncrementalSave: Loaded existing draft for ${eventId}`);
                setFormData(data.formData);
                if (data.lastUpdated) {
                    setLastSaved(new Date(data.lastUpdated));
                }
                return data;
            } else {
                if (enableLogging) console.log(`📂 useIncrementalSave: No draft found for ${eventId}, starting fresh.`);
                setFormData({});
                setLastSaved(null);
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to load form data:', error);
            setFormData({});
            setLastSaved(null);
            return null;
        }
    }, [eventId, enableLogging]);

    return {
        formData,
        setFormData,
        saveField,
        loadFormData,
        isSaving,
        lastSaved
    };
};
