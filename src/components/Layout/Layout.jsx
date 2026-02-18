import React from 'react';
import Sidebar from '../Sidebar/Sidebar';
import Header from '../Header/Header';
import './Layout.css';

const Layout = ({
    categories,
    activeCategory,
    onSelectCategory,
    activeSubsection,
    onSelectSubsection,
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
                    categories={categories}
                    activeCategory={activeCategory}
                    onSelectCategory={onSelectCategory}
                    activeSubsection={activeSubsection}
                    onSelectSubsection={onSelectSubsection}
                />
                <main className="main-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
