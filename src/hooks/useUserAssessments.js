import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import AssessmentTeamAssignmentService from '../services/assessment/teamAssignment.service';
import AssessmentSchedulingService from '../services/assessment/scheduling.service';
import { eventBus, EVENTS } from '../events';
import { getMetadata } from '../services/metadata.service';
import { api } from '../services/api';

/**
 * useUserAssessments hook ported and adapted for the Survey 2 environment.
 * Replaces useAuth with useApp for user context.
 */
export const useUserAssessments = (options = {}) => {
    const {
        year = null,
        autoFetch = true,
        includePast = true,
        includeCompleted = false,
        includeDeclined = false
    } = options;

    const { user } = useApp();
    const [data, setData] = useState({
        assignments: [],      // All user assignments
        schedules: [],        // Schedule details
        upcoming: [],         // Filtered upcoming assignments
        past: [],             // Filtered past assignments
        pending: [],          // Assignments needing response
        stats: {
            total: 0,
            upcoming: 0,
            pending: 0,
            completed: 0,
            declined: 0
        }
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [initialized, setInitialized] = useState(false);
	    const [debug, setDebug] = useState(null);

    // Initialize services
    useEffect(() => {
        const initServices = async () => {
            try {
	                console.log('[useUserAssessments] Initializing services...');
	                let metadata = null;
	                try {
	                    metadata = await getMetadata();
	                } catch (metaErr) {
	                    // Metadata is useful but *not required* just to fetch
	                    // assignments. If it fails (e.g. network hiccup), fall
	                    // back to an empty object so the rest of the
	                    // assignments pipeline can still run.
	                    console.warn('[useUserAssessments] getMetadata failed during init (non-fatal for assignments)', metaErr);
	                    metadata = {};
	                }
	                await AssessmentSchedulingService.init({ metadata });
	                await AssessmentTeamAssignmentService.init({ metadata });
	                setInitialized(true);
	                console.log('[useUserAssessments] Services initialized (metadata loaded:', !!metadata && Object.keys(metadata).length > 0, ')');
            } catch (err) {
	                console.error('[useUserAssessments] Failed to initialize services', err);
                setError(err);
            }
        };

        initServices();
    }, []);

    // Main fetch function
    const fetchUserAssessments = useCallback(async (filters = {}) => {
        if (!user?.id) {
            setError(new Error('No user authenticated'));
            return;
        }

        setLoading(true);
        setError(null);

        try {
            console.log('[useUserAssessments] Fetching user assessments for', user.id, user.username, 'with filters', {
                year: filters.year || year,
                includePast,
                includeCompleted,
                includeDeclined,
            });
            eventBus.emit(EVENTS.LOADING_SHOW, { source: 'useUserAssessments' });

            // 1. Get all assignments for the user
	            const assignments = await AssessmentTeamAssignmentService.getUserAssignmentsDomain({
	                userId: user.id,
	                username: user.username,
	                year: filters.year || year
	            });

            // 2. Get all schedules these assignments belong to
            const scheduleIds = [...new Set(assignments.map(a => a.scheduleTeiId))];

            let schedules = [];
            if (scheduleIds.length > 0) {
                schedules = await AssessmentSchedulingService.getTeisByIds(
                    scheduleIds,
                    { silent: true }
                );
            }

            // 3. Create schedule lookup map
            const scheduleMap = {};
            schedules.forEach(schedule => {
                scheduleMap[schedule.id] = schedule;
            });

            // 4. Enrich assignments with full schedule data
            const enrichedAssignments = assignments.map(assignment => ({
                ...assignment,
                schedule: scheduleMap[assignment.scheduleTeiId] || {},
                // Add computed fields
                requiresResponse: assignment.statusCode === 'FAC_ASS_ASSIGN_PENDING',
                isConfirmed: assignment.statusCode === 'FAC_ASS_ASSIGN_ACCEPTED',
                isDeclined: assignment.statusCode === 'FAC_ASS_ASSIGN_DECLINED',
                isCancelled: assignment.statusCode === 'FAC_ASS_ASSIGN_CANCELLED',
                isReplaced: assignment.statusCode === 'FAC_ASS_ASSIGN_REPLACED'
            }));

            // 5. Apply filters and categorize
            const today = new Date().toISOString().slice(0, 10);

            const filtered = enrichedAssignments.filter(assignment => {
                // Filter by status
	                // Treat only explicit COMPLETED status as completed; accepted
	                // assignments (FAC_ASS_ASSIGN_ACCEPTED) should still show up as
	                // active, even if their sortDate is in the past.
	                if (!includeCompleted && assignment.statusCode === 'FAC_ASS_ASSIGN_COMPLETED') {
	                    return false;
	                }
                if (!includeDeclined && assignment.isDeclined) {
                    return false;
                }
                if (!includePast && assignment.sortDate < today) {
                    return false;
                }
                return true;
            });

            // 6. Categorize assignments
	            const upcoming = filtered.filter(a =>
	                a.statusCode === 'FAC_ASS_ASSIGN_PENDING' ||
	                a.statusCode === 'FAC_ASS_ASSIGN_ACCEPTED'
	            );

            const past = filtered.filter(a =>
                a.sortDate < today ||
                a.statusCode === 'FAC_ASS_ASSIGN_COMPLETED'
            );

            const pending = filtered.filter(a =>
                a.statusCode === 'FAC_ASS_ASSIGN_PENDING'
            );

            // 7. Calculate stats
		    	    const stats = {
                total: filtered.length,
                upcoming: upcoming.length,
                pending: pending.length,
                completed: filtered.filter(a => a.isConfirmed && a.sortDate < today).length,
                declined: filtered.filter(a => a.isDeclined).length
            };

		            // Capture latest debug snapshot from the API (if any), plus
		            // local counts so we can see where items are being filtered.
		            const debugSnapshot = {
		                ...(api._schedulingDebug || {}),
		                assignmentsCount: assignments.length,
		                filteredCount: filtered.length,
		                upcomingCount: upcoming.length,
		                pendingCount: pending.length,
		            };
		            console.log('[useUserAssessments] Debug snapshot', debugSnapshot);
		            setDebug(debugSnapshot);

		            setData({
	                assignments: filtered,
	                schedules,
	                upcoming,
	                past,
	                pending,
	                stats,
	                enriched: enrichedAssignments // Keep original enriched data
	            });

		            console.log('[useUserAssessments] Completed fetch:', {
		                assignments: assignments.length,
		                schedules: schedules.length,
		                filtered: filtered.length,
		                upcoming: upcoming.length,
		                pending: pending.length,
		                past: past.length,
		            });

        } catch (err) {
            console.error('Error fetching user assessments:', err);
            setError(err);
        } finally {
            setLoading(false);
            eventBus.emit(EVENTS.LOADING_HIDE, { source: 'useUserAssessments' });
        }
    }, [user?.id, year, includePast, includeCompleted, includeDeclined]);

    // Auto-fetch on mount and when dependencies change
    useEffect(() => {
        if (autoFetch && initialized && user?.id) {
            fetchUserAssessments();
        }
    }, [autoFetch, initialized, user?.id, fetchUserAssessments]);

    // Action: Respond to assignment
    const respondToAssignment = useCallback(async (eventId, statusCode, reason = '') => {
        try {
            setLoading(true);
            await AssessmentTeamAssignmentService.respondToAssignment({
                eventId,
                statusCode,
                reason
            });

            // Refresh data after response
            await fetchUserAssessments();

            return { success: true };
        } catch (err) {
            console.error('Error responding to assignment:', err);
            setError(err);
            return { success: false, error: err };
        } finally {
            setLoading(false);
        }
    }, [fetchUserAssessments]);

    // Action: View assignment details
    const getAssignmentDetails = useCallback((assignmentId) => {
        return data.assignments.find(a => a.eventId === assignmentId);
    }, [data.assignments]);

    // Action: Refresh data
    const refresh = useCallback(() => {
        return fetchUserAssessments();
    }, [fetchUserAssessments]);

    return {
        ...data,
        loading,
        error,
        initialized,
	        debug,
        refresh,
        respondToAssignment,
        getAssignmentDetails,
        fetchUserAssessments
    };
};
