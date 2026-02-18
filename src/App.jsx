import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login/Login';
import Layout from './components/Layout/Layout';
import FormArea from './components/FormArea/FormArea';
import { Dashboard } from './pages/Dashboard';
import { AppProvider, useApp } from './contexts/AppContext';
import { api } from './services/api';
import { transformMetadata } from './utils/transformers';
import './App.css';

const AppContent = () => {
  const { user, setUser, setConfiguration, setUserAssignments, configuration } = useApp();
  const [isLoading, setIsLoading] = useState(false);

  // Navigation State
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeSubsection, setActiveSubsection] = useState(null);

  // Data State
  const [assignments, setAssignments] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);

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

      const transformedCategories = transformMetadata(metadata);
      setCategories(transformedCategories);
      setConfiguration({
        programStage: metadata,
        program: { displayName: 'MOH Survey Dashboard' },
        organisationUnits: msgAssignments.map(a => a.orgUnit)
      });

      // Set Defaults
      if (transformedCategories.length > 0) {
        const firstCat = transformedCategories[0];
        setActiveCategory(firstCat);
        if (firstCat.subsections.length > 0) {
          setActiveSubsection(firstCat.subsections[0]);
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

  const handleCategoryChange = (category) => {
    setActiveCategory(category);
    // Auto-select first subsection
    if (category.subsections && category.subsections.length > 0) {
      setActiveSubsection(category.subsections[0]);
    } else {
      setActiveSubsection(null);
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
                categories={categories}
                activeCategory={activeCategory}
                onSelectCategory={handleCategoryChange}
                activeSubsection={activeSubsection}
                onSelectSubsection={setActiveSubsection}

                // Header Props
                assignments={assignments}
                selectedFacility={selectedFacility}
                onSelectFacility={setSelectedFacility}
              >
                <FormArea
                  activeSection={activeSubsection}
                  selectedFacility={selectedFacility}
                  user={user}
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
    <Router>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </Router>
  );
};

export default App;
