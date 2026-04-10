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
import clinicsConfig from './assets/clinics_config.json';
import hospitalConfig from './assets/hospital_config.json';
import emsLinks from './assets/ems_links.json';
import mortuaryLinks from './assets/mortuary_links.json';
import clinicsLinks from './assets/clinics_links.json';
import hospitalLinks from './assets/hospital_links.json';
import './App.css';

const PrivateRoute = ({ children }) => {
	  const { user, authInitializing } = useApp();
	  const location = useLocation();

	  // While we're still checking for an existing session (e.g. after a
	  // refresh with stored auth), render a lightweight loading state rather
	  // than redirecting to /login immediately.
	  if (authInitializing) {
	    return <div className="loading-screen">Checking session...</div>;
	  }

	  return user ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

const AppContent = () => {
  const { user, setUser, setConfiguration, setUserAssignments, configuration } = useApp();
	  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // Navigation State
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeSection, setActiveSection] = useState(null);

	  // Data State
	  const [assignments, setAssignments] = useState([]);
	  const [selectedFacility, setSelectedFacility] = useState(null);
	
	  // Data element ID for "SURV-Facility Assessment Group"
	  const FACILITY_GROUP_DE_ID = 'pzenrgsSny3';
	
	  const getGroupLabelForStorage = (group) => {
	    if (!group) return '';
	    // Prefer human-readable name for clarity in the Assessment Details section
	    return group.name || group.id || '';
	  };
	
	  // Generate Event ID safely - unique per assessment *and group*
	  // so each (assessment, group) gets its own draft/event.
	  const activeEventId = React.useMemo(() => {
	    const assessmentId = searchParams.get('assessmentId');
	    const groupKey = activeGroup?.id || 'no-group';
	
	    if (assessmentId) return `draft-assessment-${assessmentId}-group-${groupKey}`;
	
	    if (!selectedFacility || (!selectedFacility.trackedEntityInstance && !selectedFacility.orgUnit)) return null;
	    const identifier = selectedFacility.trackedEntityInstance || selectedFacility.orgUnit;
	    return `draft-facility-${identifier}-group-${groupKey}`;
	  }, [selectedFacility, searchParams, activeGroup]);

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

	  // Always store a friendly facility name in the draft so the
	  // Dashboard and Survey Preview can display it instead of
	  // falling back to "Unknown Facility".
	  const facilityNameInternal = formData?.facilityName_internal;
	  useEffect(() => {
	    if (!selectedFacility) return;

	    const targetName =
	      selectedFacility.orgUnitName ||
	      selectedFacility.name ||
	      selectedFacility.facilityId ||
	      selectedFacility.orgUnitId ||
	      (typeof selectedFacility.orgUnit === 'string'
	        ? selectedFacility.orgUnit
	        : selectedFacility.orgUnit?.id) ||
	      'Unknown Facility';

	    if (facilityNameInternal === targetName) return;

	    console.log('📝 App: Storing facilityName_internal:', targetName);
	    saveField('facilityName_internal', targetName);
	  }, [selectedFacility, facilityNameInternal, saveField]);

  // Load data when activeEventId changes
  useEffect(() => {
    if (activeEventId) {
      loadFormData();
    }
  }, [activeEventId, loadFormData]);

	  const location = useLocation();
	  const assessmentIdParam = searchParams.get('assessmentId');

  // Load initial data once when the user is available. This is resilient to
  // hot-reloads or remounts where `configuration` or `groups` might be reset.
  useEffect(() => {
    if (!user) return;
    if (initialDataLoaded) return;
    loadInitialData();
  }, [user, initialDataLoaded]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [metadata, msgAssignments] = await Promise.all([
        api.getFormMetadata(),
        api.getAssignments()
      ]);

      const transformedGroups = transformMetadata(metadata);
      setGroups(transformedGroups);

      // Prefer the program object returned by metadata so that we have the
      // correct program id and trackedEntityType id for tracker submission.
      const programFromMetadata = metadata.program || { id: 'G2gULe4jsfs', displayName: 'MOH Survey Dashboard' };

      setConfiguration({
        programStage: metadata,
        program: programFromMetadata,
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
      setInitialDataLoaded(true);
    }
  };

	  // Auto-select facility based on navigation state or URL parameter
	  useEffect(() => {
	    const stateAssignment = location.state && location.state.selectedAssignment;
	    if (stateAssignment) {
	      console.log('🎯 App: Auto-selecting facility from navigation state:', stateAssignment.orgUnitName);
	      setSelectedFacility(stateAssignment);
	      return;
	    }

	    const assessmentId = searchParams.get('assessmentId');
	    if (assessmentId && assignments.length > 0) {
	      // Fallback: match against locally loaded assignments (older workflow)
	      const matched = assignments.find(a => (a.eventId || a.enrollment) === assessmentId);
	      if (matched) {
	        console.log(`🎯 App: Auto-selecting facility for assessment ${assessmentId}:`, matched.orgUnitName);
	        setSelectedFacility(matched);
	      }
	    }
	  }, [location.state, searchParams, assignments]);

	  // Auto-populate Assessment Details from selected assessment
	  useEffect(() => {
	    const nameLower = (activeSection?.name || '').toLowerCase().trim();
	    const isADSection = nameLower === "assessment details" || nameLower === "assessment_details";
	
	    // Corrected keys for raw data from api.getAssignments
	    const enrollmentId = selectedFacility?.enrollment || selectedFacility?.eventId;
	    const teiId = selectedFacility?.trackedEntityInstance || selectedFacility?.scheduleTeiId;
	
	    if (selectedFacility && isADSection && enrollmentId) {
	      const adFields = activeSection.fields || [];
	
	      // Find fields for TEI ID, Enrollment, and Facility Assessment Group
	      const teiField = adFields.find(f => (f.label || '').includes('TEI ID'));
	      const enrField = adFields.find(f => (f.label || '').toLowerCase().includes('enrollment'));
	      const groupField = adFields.find(
	        f => f.id === FACILITY_GROUP_DE_ID || (f.label || '').toLowerCase().includes('facility assessment group')
	      );
	
	      if (teiField && teiId && !formData[teiField.id]) {
	        console.log(`📝 App: Auto-populating TEI ID: ${teiId}`);
	        saveField(teiField.id, teiId);
	      }
	      if (enrField && enrollmentId && !formData[enrField.id]) {
	        console.log(`📝 App: Auto-populating Enrollment ID: ${enrollmentId}`);
	        saveField(enrField.id, enrollmentId);
	      }
	      if (groupField && activeGroup && !formData[groupField.id]) {
	        const groupLabel = getGroupLabelForStorage(activeGroup);
	        if (groupLabel) {
	          console.log(`📝 App: Auto-populating Facility Assessment Group: ${groupLabel}`);
	          saveField(groupField.id, groupLabel);
	        }
	      }
	    }
	  }, [selectedFacility, activeSection, activeGroup, saveField, formData]);

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
    const isMortuary =
      activeGroup?.id === 'GENERAL' ||
      activeGroup?.id === 'MORTUARY' ||
      activeGroup?.name === 'Mortuary';
    const isClinics =
      activeGroup?.id === 'CLINICS' || activeGroup?.name === 'Clinics';
    const isHospital =
      activeGroup?.id === 'HOSPITAL' || activeGroup?.name === 'Hospital';

    const programmeType = isMortuary
      ? 'mortuary'
      : isClinics
      ? 'clinics'
      : isHospital
      ? 'hospital'
      : 'ems';

    const configMap = {
      ems: { config: emsConfig, key: 'ems_full_configuration' },
      mortuary: { config: mortuaryConfig, key: 'mortuary_full_configuration' },
      clinics: { config: clinicsConfig, key: 'clinics_full_configuration' },
      hospital: { config: hospitalConfig, key: 'hospital_full_configuration' },
    };

    const { config: activeConfig, key: configKey } = configMap[programmeType];

    // Get active links
    const linksMap = {
      ems: emsLinks,
      mortuary: mortuaryLinks,
      clinics: clinicsLinks,
      hospital: hospitalLinks,
    };
    const activeLinks = linksMap[programmeType] || [];

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

	  // Simple group change handler: switch active group and reset section
	  // to the first section of that group (if any). The event ID is already
	  // group-aware via activeEventId, so each group gets its own draft/event.
	  const handleGroupChange = (group) => {
	    setActiveGroup(group);
	    if (group?.sections && group.sections.length > 0) {
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
	                isAssignedAssessment={Boolean(assessmentIdParam)}
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
