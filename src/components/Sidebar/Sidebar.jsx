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
		          const nameLower = (sec.name || '').toLowerCase().trim();
		          const isADSection = nameLower === "assessment details" || nameLower === "assessment_details";
		          // Sections are now always accessible, even if Assessment
		          // Details is incomplete. We keep isADComplete only for
		          // potential informational use elsewhere.
		          const isSectionLocked = false;
		  
			          const label = (() => {
	            const raw = sec.name || '';
	            if (!raw) return '';
	            const upper = raw.toUpperCase();
	            // If already starts with SE, just use it
	            if (upper.trim().startsWith('SE')) return raw.trim();
	            // Try to derive SE code from HOSP patterns
	            const hospMatch = upper.match(/HOSP[_\s-]*(SE)?(\d+(?:\.\d+)*)/);
	            if (hospMatch) {
	              const numPart = hospMatch[2];
	              const seToken = `SE${numPart}`;
	              const rest = raw
	                .slice(hospMatch.index + hospMatch[0].length)
	                .replace(/^[\s\-_:]+/, '');
	              return rest ? `${seToken} ${rest}` : seToken;
	            }
	            return raw.trim();
	          })();

		          return (
		            <li
		              key={sec.id}
		              className={`section-item ${activeSection?.id === sec.id ? 'active' : ''}`}
		              onClick={() => onSelectSection(sec)}
		            >
		              <div className="section-info">
			                <span>{label}</span>
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
