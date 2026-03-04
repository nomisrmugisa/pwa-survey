/**
 * Maps DHIS2 value types to our application's internal input types.
 */
const mapValueTypeToInputType = (vt, hasOpt) => {
    if (hasOpt) return 'select';
    switch (vt) {
        case 'NUMBER':
        case 'INTEGER':
        case 'INTEGER_POSITIVE':
        case 'INTEGER_ZERO_OR_POSITIVE': return 'number';
        case 'BOOLEAN':
        case 'TRUE_ONLY': return 'select';
        case 'DATE': return 'date';
        case 'LONG_TEXT': return 'textarea';
        default: return 'text';
    }
};

/**
 * Transforms DHIS2 Metadata into a grouped structure for the PWA.
 * Groups are currently restricted to "Mortuary" and "EMS".
 */
export const transformMetadata = (metadata) => {
    console.log("Transform: Starting metadata transformation...");
    if (!metadata || !metadata.programStageSections) {
        console.warn("Transform: No programStageSections found in metadata");
        return [];
    }

    // 1. Map Data Elements for quick lookup during section transformation
    const deMap = {};
    if (metadata.programStageDataElements) {
        metadata.programStageDataElements.forEach(psde => {
            const de = psde.dataElement || psde;
            if (de && de.id) deMap[de.id] = de;
        });
    }

    // Secondary pass to ensure all elements referenced in sections are hydrated
    if (metadata.programStageSections) {
        metadata.programStageSections.forEach(section => {
            const elements = section.dataElements || section.programStageDataElements || [];
            elements.forEach(rawDe => {
                const de = rawDe.dataElement || rawDe;
                if (de && de.id && !deMap[de.id]) {
                    if (de.displayName || de.formName || de.optionSet) deMap[de.id] = de;
                }
            });
        });
    }

    // Prefix helpers - identifies which group a section belongs to
    const detectPrefix = (sec) => {
        const code = (sec.code || '').toUpperCase();
        const name = (sec.name || '').toUpperCase();

        // Highest Priority: Explicit user-requested string for Mortuary
        if (name.includes('SURV_MORTUARY') || name.includes('SURV-MORTUARY') ||
            code.includes('MORTUARY')) {
            return 'MORTUARY';
        }

        // Standard EMS detection
        if (code.startsWith('EMS') || code.startsWith('SE') || name.startsWith('EMS')) {
            return 'SE';
        }

        // Generic prefix detection using shared patterns
        if (name.includes('SURV_') || name.includes('SURV-')) {
            const match = name.match(/SURV[_-]([A-Z0-9]+)/i);
            if (match && match[1]) return match[1].toUpperCase();
        }

        if (code.startsWith('SURV_') || code.startsWith('SURV-')) {
            const stripped = code.replace(/^SURV[-_]/, '');
            const part = stripped.split('_')[0];
            if (part) return part.toUpperCase();
        }

        if (code.includes('_')) return code.split('_')[0].toUpperCase();

        return null; // General section
    };

    const PREFIX_NAME_MAP = { 'SE': 'EMS', 'MORTUARY': 'Mortuary' };

    // Strips prefixes for clean UI display
    const stripPrefix = (str, allowEmpty = true) => {
        if (!str) return '';
        // Special case: remove SURV_MORTUARY blocks, allowing leading/trailing spaces, multiple underscores, and numbers
        let cleaned = str.replace(/^\s*SURV[-_]+MORTUARY[-_\d\s]*/i, '').trim();
        // Catch-all: remove generic SURV_ prefixes
        cleaned = cleaned.replace(/^\s*SURV[-_\d\s]*/i, '').trim();

        if (cleaned === '') {
            return allowEmpty ? '' : str; // Only revert to original if we forbid empty labels
        }
        return cleaned;
    };

    const transformedSections = metadata.programStageSections.map(section => {
        const fields = [];
        const sectionName = section.displayName || section.name || '';
        const sectionCode = section.code || '';

        let elements = section.dataElements || section.programStageDataElements || [];
        elements = [...elements].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        elements.forEach(rawDe => {
            let deId = rawDe.id || (rawDe.dataElement ? rawDe.dataElement.id : (typeof rawDe === 'string' ? rawDe : null));
            const de = deMap[deId] || rawDe.dataElement || rawDe;
            if (!de || (!de.id && !de.displayName)) return;

            const deName = de.formName || de.displayName || de.name || de.shortName;
            const isHeader = deName && (deName.includes('(--)') || deName.trim().endsWith('--'));

            if (isHeader) {
                fields.push({
                    id: de.id || deId || Math.random().toString(),
                    label: deName.replace(/\(--\)/g, '').replace(/--$/, '').trim(),
                    type: 'header',
                    code: de.code
                });
            } else {
                let options = [];
                const optionSet = de.optionSet || (deMap[deId] ? deMap[deId].optionSet : null);
                if (optionSet && optionSet.options) {
                    options = [...optionSet.options]
                        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                        .map(opt => ({ value: opt.code || opt.id, label: opt.displayName || opt.name }));
                }
                if (options.length === 0 && (de.valueType === 'BOOLEAN' || de.valueType === 'TRUE_ONLY')) {
                    options = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
                }
                const isComment = deName && (deName.toLowerCase().endsWith('-comments') || deName.toLowerCase().endsWith('-comment'));
                fields.push({
                    id: de.id || deId,
                    label: isComment ? 'Comment' : deName,
                    type: mapValueTypeToInputType(de.valueType, options.length > 0),
                    options: options,
                    compulsory: sectionName.toLowerCase().includes('assessment details') ? true : de.compulsory,
                    isComment: isComment,
                    code: de.code
                });
            }
        });

        const prefix = detectPrefix({ name: sectionName, code: sectionCode });
        const finalName = stripPrefix(sectionName, false);
        const finalCode = stripPrefix(sectionCode, true).replace(/^EMS/, 'SE');

        return {
            id: section.id,
            name: finalName,
            code: finalCode,
            fields: fields,
            _prefix: prefix,
            _originalName: sectionName
        };
    });

    const generalSections = [];
    const prefixSectionsByPrefix = {};

    transformedSections.forEach(sec => {
        const prefix = sec._prefix;
        const nl = (sec._originalName || '').toLowerCase();
        const isAD = nl.includes('assessment details') || nl.includes('assessment_details');

        // Restriction: Only EMS (SE) gets its own group. 
        // Everything else, including MORTUARY and unprefixied, goes to the general (Mortuary) group.
        const isEMS = prefix === 'SE' && !isAD;

        if (!isEMS) {
            sec.fields.forEach(f => { if (f.type !== 'header') f.compulsory = true; });
            generalSections.push(sec);
        } else {
            if (!prefixSectionsByPrefix['SE']) prefixSectionsByPrefix['SE'] = [];
            prefixSectionsByPrefix['SE'].push(sec);
        }
    });

    const sharedSections = generalSections.filter(s => {
        const nl = (s._originalName || '').toLowerCase();
        return nl.includes('assessment details') || nl.includes('assessment_details');
    });

    const nonSharedGeneralSections = generalSections.filter(s => !sharedSections.includes(s));

    // Sort non-shared Mortuary sections based on any numbers in their names/codes (e.g. SE 1, SE 2)
    const sortedNonSharedMortuarySections = [...nonSharedGeneralSections].sort((a, b) => {
        const ex = (s) => (s && s.match(/\d+/) ? parseInt(s.match(/\d+/)[0], 10) : 999);
        return ex(a.code || a.name) - ex(b.code || b.name);
    });

    // Ensure sharedSections (Assessment Details) are always at the very beginning
    const finalMortuarySections = [...sharedSections, ...sortedNonSharedMortuarySections];

    // Construct EMS Group
    const emsGroupSections = prefixSectionsByPrefix['SE'] || [];
    const sortedEmsSections = [...emsGroupSections].sort((a, b) => {
        const ex = (s) => (s.match(/\d+/) ? parseInt(s.match(/\d+/)[0], 10) : 0);
        return ex(a.code || a.name) - ex(b.code || b.name);
    });

    const allGroups = [];

    // Always include Mortuary (General) group
    allGroups.push({
        id: 'GENERAL',
        name: 'Mortuary',
        sections: finalMortuarySections
    });

    // Add EMS group if sections exist
    if (sortedEmsSections.length > 0) {
        allGroups.push({
            id: 'SE',
            name: 'EMS',
            sections: [...sharedSections, ...sortedEmsSections]
        });
    }

    // Final pass for linking comments and questions
    allGroups.forEach(group => {
        group.sections.forEach(section => {
            const fields = section.fields || [];
            for (let i = 0; i < fields.length - 1; i++) {
                if (!fields[i].isComment && fields[i].type !== 'header' && fields[i + 1].isComment) {
                    fields[i].commentFieldId = fields[i + 1].id;
                    fields[i + 1].questionFieldId = fields[i].id;
                }
            }
        });
    });

    return allGroups;
};
