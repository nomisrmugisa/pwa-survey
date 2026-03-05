import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import Login from './pages/Login/Login';
import Layout from './components/Layout/Layout';
import FormArea from './components/FormArea/FormArea';
import { Dashboard } from './pages/Dashboard';
import { AppProvider, useApp } from './contexts/AppContext';
import { api } from './services/api';
import { transformMetadata } from './utils/transformers';
import { useIncrementalSave } from './hooks/useIncrementalSave';
import { normalizeCriterionCode } from './utils/normalization';
import { useAssessmentScoring } from './hooks/useAssessmentScoring';
import emsConfig from './assets/ems_config.json';
import mortuaryConfig from './assets/mortuary_config.json';
import emsLinks from './assets/ems_links.json';
import mortuaryLinks from './assets/mortuary_links.json';
import './App.css';

const PrivateRoute = ({ children }) => {
  const { user } = useApp();
  const location = useLocation();
  return user ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

const AppContent = () => {
  const { user, setUser, setConfiguration, setUserAssignments, configuration } = useApp();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  // Navigation State
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeSection, setActiveSection] = useState(null);

  // Data State
  const [assignments, setAssignments] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);

  // Generate Event ID safely - unique per assessment if available
  const activeEventId = React.useMemo(() => {
    const assessmentId = searchParams.get('assessmentId');
    if (assessmentId) return `draft-assessment-${assessmentId}`;

    if (!selectedFacility || (!selectedFacility.trackedEntityInstance && !selectedFacility.orgUnit)) return null;
    const identifier = selectedFacility.trackedEntityInstance || selectedFacility.orgUnit;
    return `draft-facility-${identifier}`;
  }, [selectedFacility, searchParams]);

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

  // Auto-select facility based on URL parameter
  useEffect(() => {
    const assessmentId = searchParams.get('assessmentId');
    if (assessmentId && assignments.length > 0) {
      const matched = assignments.find(a => a.eventId === assessmentId);
      if (matched) {
        console.log(`🎯 App: Auto-selecting facility for assessment ${assessmentId}:`, matched.orgUnitName);
        setSelectedFacility(matched);
      }
    }
  }, [searchParams, assignments]);

  // Assessment Details Prerequisite Check
  const isADComplete = React.useMemo(() => {
    if (!groups || groups.length === 0 || !formData) return false;

    // Find AD section (usually first section of first group)
    const adSection = groups.flatMap(g => g.sections).find(s => {
      const nameLower = (s.name || '').toLowerCase().trim();
      return nameLower === "assessment details" || nameLower === "assessment_details";
    });
    if (!adSection) return true; // If AD section doesn't exist, don't block anything

    return adSection.fields
      .filter(f => f.type !== 'header')
      .every(f => {
        const val = formData[f.id];
        return val !== undefined && val !== null && val !== '' && String(val).trim() !== '';
      });
  }, [groups, formData]);

  // Scoring Integration: Map flat formData to hierarchical structure for the scoring hook
  const assessmentDetailsForScoring = React.useMemo(() => {
    if (!groups || groups.length === 0 || !formData) return { sections: [] };

    // Determine which configuration to use based on the active group
    const isMortuary = activeGroup?.id === 'GENERAL' || activeGroup?.id === 'MORTUARY' || activeGroup?.name === 'Mortuary';
    const isClinics = activeGroup?.id === 'CLINICS' || activeGroup?.name === 'Clinics';

    // Default to emsConfig for Clinics if no specific clinicsConfig is found
    const activeConfig = isMortuary ? mortuaryConfig : emsConfig;
    const configKey = isMortuary ? 'mortuary_full_configuration' : 'ems_full_configuration';

    // Get active links (default to emsLinks for Clinics)
    const activeLinks = isMortuary ? mortuaryLinks : emsLinks;

    // Quick lookup for links data
    const linksDataLookup = {};
    activeLinks.forEach(linkObj => {
      linksDataLookup[linkObj.criteria] = {
        roots: linkObj.root || [],
        linked_criteria: linkObj.linked_criteria || []
      };
    });

    // Quick lookup for severity from full config
    const severityLookup = {};
    try {
      (activeConfig[configKey] || []).forEach(se => {
        (se.sections || []).forEach(section => {
          (section.standards || []).forEach(standard => {
            (standard.criteria || []).forEach(crit => {
              if (crit && crit.id) {
                severityLookup[crit.id] = crit.severity || 1;
              }
            });
          });
        });
      });
    } catch (e) {
      console.error("App: Error building severity lookup", e);
    }

    const allSections = groups.flatMap(g => g.sections || []);

    return {
      sections: allSections.map(section => ({
        id: section.id,
        standards: [{
          id: section.code || section.id,
          // Only score select fields (dropdowns) as they correspond to criteria responses
          criteria: (section.fields || [])
            .filter(f => f.type === 'select')
            .map(f => {
              const code = f.code || f.id;
              const normalizedCode = normalizeCriterionCode(code);
              const linksData = linksDataLookup[normalizedCode] || linksDataLookup[code] || { roots: [], linked_criteria: [] };
              const isRoot = linksData.linked_criteria.length > 0; // Auto-calculated ONLY if it calculates from others
              const severity = severityLookup[normalizedCode] || severityLookup[code] || 1;

              return {
                id: f.id,
                code: code,
                response: formData[f.id] || 'NA',
                // Check for critical flag in formData (appended by FormArea toggle)
                isCritical: Boolean(formData[`is_critical_${f.commentFieldId}`] || formData[`is_critical_${f.id}`]),
                isRoot,
                links: linksData.linked_criteria,
                roots: linksData.roots,
                severity
              };
            })
        }]
      }))
    };
  }, [activeGroup, formData]);

  const scoringResults = useAssessmentScoring(assessmentDetailsForScoring);

  const handleGroupChange = (group) => {
    setActiveGroup(group);
    // Auto-select first section of the new group
    if (group.sections && group.sections.length > 0) {
      setActiveSection(group.sections[0]);
    } else {
      setActiveSection(null);
    }
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
                scoringResults={scoringResults}
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
                  scoringResults={scoringResults}
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
