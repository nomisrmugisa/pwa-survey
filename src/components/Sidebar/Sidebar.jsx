import React from 'react';
import './Sidebar.css';

const Sidebar = ({ groups, activeGroup, onSelectGroup, activeSection, onSelectSection, isADComplete }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Group</h3>
        <select
          className="category-select"
          value={activeGroup?.id || ''}
          onChange={(e) => {
            const selected = groups.find(g => g.id === e.target.value);
            onSelectGroup(selected);
          }}
        >
          {groups.map(group => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
      </div>
      <div className="sidebar-subheader">
        <h4>Sections</h4>
      </div>
      <ul className="section-list">
        {activeGroup?.sections?.map((sec, index) => {
          const isADSection = sec.name === "Assessment Details";
          const isSectionLocked = !isADSection && !isADComplete;

          return (
            <li
              key={sec.id}
              className={`section-item ${activeSection?.id === sec.id ? 'active' : ''} ${isSectionLocked ? 'locked' : ''}`}
              onClick={() => !isSectionLocked && onSelectSection(sec)}
              title={isSectionLocked ? "Please complete Assessment Details first" : ""}
            >
              <div className="section-info">
                <span>{sec.code ? `${sec.code} ${sec.name}` : sec.name}</span>
                {isSectionLocked && <span className="lock-badge">🔒</span>}
              </div>
              <span className="status">{sec.fields.length}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default Sidebar;
