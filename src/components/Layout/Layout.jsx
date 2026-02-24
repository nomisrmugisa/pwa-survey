import React from 'react';
import Sidebar from '../Sidebar/Sidebar';
import Header from '../Header/Header';
import './Layout.css';

const Layout = ({
    groups,
    activeGroup,
    onSelectGroup,
    activeSection,
    onSelectSection,
    isADComplete,
    children,
    assignments,
    selectedFacility,
    onSelectFacility
}) => {
    return (
        <div className="layout-container">
            <Header
                assignments={assignments}
                selectedFacility={selectedFacility}
                onSelectFacility={onSelectFacility}
            />
            <div className="layout-body">
                <Sidebar
                    groups={groups}
                    activeGroup={activeGroup}
                    onSelectGroup={onSelectGroup}
                    activeSection={activeSection}
                    onSelectSection={onSelectSection}
                    isADComplete={isADComplete}
                />
                <main className="main-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
