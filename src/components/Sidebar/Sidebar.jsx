import React from 'react';
import './Sidebar.css';

const Sidebar = ({ categories, activeCategory, onSelectCategory, activeSubsection, onSelectSubsection }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Category</h3>
        <select
          className="category-select"
          value={activeCategory?.id || ''}
          onChange={(e) => {
            const selected = categories.find(c => c.id === e.target.value);
            onSelectCategory(selected);
          }}
        >
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>
      <div className="sidebar-subheader">
        <h4>Sections</h4>
      </div>
      <ul className="section-list">
        {activeCategory?.subsections?.map(sub => (
          <li
            key={sub.id}
            className={`section-item ${activeSubsection?.id === sub.id ? 'active' : ''}`}
            onClick={() => onSelectSubsection(sub)}
          >
            <span>{sub.name}</span>
            <span className="status">{sub.fields.length}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Sidebar;
