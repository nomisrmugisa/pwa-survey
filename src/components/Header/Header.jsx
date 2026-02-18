import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Header.css';
import logo from '../../assets/logo.png';

const Header = ({ assignments = [], selectedFacility, onSelectFacility }) => {
    const navigate = useNavigate();

    return (
        <header className="app-header">
            <div className="header-left">
                <img src={logo} alt="Ministry of Health" className="header-logo" />
                <div className="header-dropdown">
                    {assignments.length > 0 ? (
                        <select
                            className="facility-select"
                            value={selectedFacility?.trackedEntityInstance || ''}
                            onChange={(e) => {
                                const selected = assignments.find(a => a.trackedEntityInstance === e.target.value);
                                onSelectFacility(selected);
                            }}
                        >
                            {assignments.map(a => (
                                <option key={a.trackedEntityInstance} value={a.trackedEntityInstance}>
                                    {a.orgUnitName || 'Unknown Facility'}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className="no-facilities">No Assigned Facilities</span>
                    )}
                </div>
            </div>

            <div className="header-right">
                <nav className="header-nav">
                    <button className="nav-link-btn" onClick={() => navigate('/')}>Dashboard</button>
                    <button className="action-btn sync-btn">↻ Sync</button>
                    <button className="action-btn logout-btn">Logout</button>
                </nav>
            </div>
        </header >
    );
};

export default Header;
