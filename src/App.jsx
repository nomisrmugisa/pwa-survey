import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login/Login';
import Layout from './components/Layout/Layout';
import FormArea from './components/FormArea/FormArea';
import { Dashboard } from './pages/Dashboard';
import { AppProvider, useApp } from './contexts/AppContext';
import { api } from './services/api';
import { transformMetadata } from './utils/transformers';
import { useIncrementalSave } from './hooks/useIncrementalSave';
import './App.css';

const AppContent = () => {
  const { user, setUser, setConfiguration, setUserAssignments, configuration } = useApp();
  const [isLoading, setIsLoading] = useState(false);

  // Navigation State
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeSection, setActiveSection] = useState(null);

  // Data State
  const [assignments, setAssignments] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);

  // Generate Event ID safely (Moved from FormArea)
  const activeEventId = React.useMemo(() => {
    if (!selectedFacility || !selectedFacility.trackedEntityInstance) return null;
    return `draft-${selectedFacility.trackedEntityInstance}`;
  }, [selectedFacility]);

  // Unified Incremental Save (Moved from FormArea)
  const {
    formData,
    saveField,
    loadFormData,
    isSaving,
    lastSaved
  } = useIncrementalSave(activeEventId, {
    user,
    onSaveSuccess: (details) => console.log('✅ App: Saved field:', details),
    onSaveError: (error) => console.error('❌ App: Save failed:', error)
  });

  // Load data when activeEventId changes
  useEffect(() => {
    if (activeEventId) {
      loadFormData();
    }
  }, [activeEventId, loadFormData]);

  const location = useLocation();

  // Load initial data when user is set
  useEffect(() => {
    if (user && !configuration) {
      loadInitialData();
    }
  }, [user]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [metadata, msgAssignments] = await Promise.all([
        api.getFormMetadata(),
        api.getAssignments()
      ]);

      const transformedGroups = transformMetadata(metadata);
      setGroups(transformedGroups);
      setConfiguration({
        programStage: metadata,
        program: { displayName: 'MOH Survey Dashboard' },
        organisationUnits: msgAssignments.map(a => a.orgUnit)
      });

      // Set Defaults
      if (transformedGroups.length > 0) {
        const firstGroup = transformedGroups[0];
        setActiveGroup(firstGroup);
        if (firstGroup.sections.length > 0) {
          setActiveSection(firstGroup.sections[0]);
        }
      }

      setAssignments(msgAssignments);
      setUserAssignments(msgAssignments); // Update context

      if (msgAssignments.length > 0) {
        setSelectedFacility(msgAssignments[0]);
      }

    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Assessment Details Prerequisite Check
  const isADComplete = React.useMemo(() => {
    if (!groups || groups.length === 0 || !formData) return false;

    // Find AD section (usually first section of first group)
    const adSection = groups.flatMap(g => g.sections).find(s => s.name === "Assessment Details");
    if (!adSection) return true; // If AD section doesn't exist, don't block anything

    return adSection.fields
      .filter(f => f.type !== 'header')
      .every(f => {
        const val = formData[f.id];
        return val !== undefined && val !== null && val !== '' && String(val).trim() !== '';
      });
  }, [groups, formData]);

  const handleGroupChange = (group) => {
    setActiveGroup(group);
    // Auto-select first section of the new group
    if (group.sections && group.sections.length > 0) {
      setActiveSection(group.sections[0]);
    } else {
      setActiveSection(null);
    }
  };

  const PrivateRoute = ({ children }) => {
    return user ? children : <Navigate to="/login" />;
  };

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={setUser} />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />

      <Route
        path="/form"
        element={
          <PrivateRoute>
            {isLoading ? (
              <div className="loading-screen">Loading Configuration...</div>
            ) : (
              <Layout
                // Navigation Props
                groups={groups}
                activeGroup={activeGroup}
                onSelectGroup={handleGroupChange}
                activeSection={activeSection}
                onSelectSection={setActiveSection}
                isADComplete={isADComplete}

                // Header Props
                assignments={assignments}
                selectedFacility={selectedFacility}
                onSelectFacility={setSelectedFacility}
              >
                <FormArea
                  activeSection={activeSection}
                  selectedFacility={selectedFacility}
                  user={user}
                  groups={groups}
                  formData={formData}
                  saveField={saveField}
                  isSaving={isSaving}
                  lastSaved={lastSaved}
                  isADComplete={isADComplete}
                  activeEventId={activeEventId}
                />
              </Layout>
            )}
          </PrivateRoute>
        }
      />
    </Routes>
  );
};

const App = () => {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </Router>
  );
};

export default App;
