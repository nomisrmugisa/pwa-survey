export const transformMetadata = (metadata) => {
    if (!metadata || !metadata.programStageSections) {
        console.warn("Transform: No programStageSections found in metadata");
        return [];
    }

    // 1. Map Program Stage Data Elements for quick lookup
    const deMap = {};
    if (metadata.programStageDataElements) {
        metadata.programStageDataElements.forEach(psde => {
            const de = psde.dataElement || psde;
            if (de && de.id) {
                deMap[de.id] = de;
            }
        });
    }
    console.log(`Transform: Hydrated ${Object.keys(deMap).length} data elements from programStageDataElements`);

    // 1b. Second pass: also hydrate deMap from section-level dataElements.
    //     This covers data elements (e.g. SURV-MORTUARY / Mortuary) that carry
    //     inline optionSets in the section response but are NOT listed under
    //     programStageDataElements — ensuring they get the same treatment as EMS.
    if (metadata.programStageSections) {
        metadata.programStageSections.forEach(section => {
            const elements = section.dataElements || [];
            elements.forEach(rawDe => {
                const de = rawDe.dataElement || rawDe;
                if (de && de.id && !deMap[de.id]) {
                    // Only add if it has meaningful data (name or optionSet)
                    if (de.displayName || de.formName || de.optionSet) {
                        deMap[de.id] = de;
                    }
                }
            });
        });
    }
    console.log(`Transform: deMap after section hydration: ${Object.keys(deMap).length} data elements`);

    // DIAGNOSTIC: Per-section optionSet coverage
    if (metadata.programStageSections) {
        metadata.programStageSections.forEach(section => {
            const elements = section.dataElements || [];
            const withOptSet = elements.filter(rawDe => {
                const de = rawDe.dataElement || rawDe;
                return de && deMap[de.id]?.optionSet;
            });
            if (elements.length > 0) {
                console.log(`[Transform Diag] Section "${section.displayName || section.name}" (code: ${section.code}): ${withOptSet.length}/${elements.length} data elements have optionSet in deMap`);
            }
        });
    }

    // Sort Sections by sortOrder
    const sortedSections = [...metadata.programStageSections].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const transformedSections = sortedSections.map(section => {
        const fields = [];
        // DHIS2 usually has programStageDataElements on the stage, but sections have dataElements
        let elements = section.dataElements || section.programStageDataElements || [];

        // Sort elements by sortOrder if they have it
        elements = [...elements].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        elements.forEach(rawDe => {
            // Robust lookup: handle object with ID, direct ID, or nested dataElement object
            let deId = rawDe.id;
            if (!deId && rawDe.dataElement) deId = rawDe.dataElement.id;
            if (!deId && typeof rawDe === 'string') deId = rawDe;

            const de = deMap[deId] || rawDe.dataElement || rawDe;

            if (!de || (!de.id && !de.displayName)) {
                console.warn("Transform: Could not resolve data element details for:", rawDe);
                return;
            }

            const name = de.formName || de.displayName || de.name || de.shortName;
            const isHeader = name && (name.includes('(--)') || name.trim().endsWith('--'));

            if (isHeader) {
                const cleanName = name.replace(/\(--\)/g, '').replace(/--$/, '').trim();
                fields.push({
                    id: de.id || deId || Math.random().toString(),
                    label: cleanName,
                    type: 'header',
                    code: de.code
                });
            } else {
                let options = [];
                // Check multiple locations for optionSet
                const optionSet = de.optionSet || (deMap[deId] ? deMap[deId].optionSet : null);

                if (optionSet && optionSet.options) {
                    options = [...optionSet.options]
                        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                        .map(opt => ({
                            value: opt.code || opt.id,
                            label: opt.displayName || opt.name
                        }));
                }

                // Fallback for Booleans
                if (options.length === 0 && (de.valueType === 'BOOLEAN' || de.valueType === 'TRUE_ONLY')) {
                    options = [
                        { value: 'true', label: 'Yes' },
                        { value: 'false', label: 'No' }
                    ];
                }

                const finalType = mapValueTypeToInputType(de.valueType, options.length > 0);

                if (options.length > 0) {
                    console.log(`  Dropdown Found: ${name} (${options.length} options)`);
                } else if (de.valueType === 'TEXT' || !de.valueType) {
                    // Possible missing optionSet — log it
                    const rawOptSet = de.optionSet || deMap[deId]?.optionSet;
                    if (!rawOptSet) {
                        console.warn(`  [Transform Diag] No optionSet for DE "${name}" (id: ${deId}, code: ${de.code}) in section "${section.displayName}". valueType=${de.valueType}`);
                    }
                }

                const isComment = name.toLowerCase().endsWith('-comments') || name.toLowerCase().endsWith('-comment');

                fields.push({
                    id: de.id || deId,
                    label: isComment ? 'Comment' : name,
                    type: finalType,
                    options: options,
                    compulsory: section.displayName === 'Assessment Details' ? true : de.compulsory,
                    isComment: isComment,
                    code: de.code // Added code property
                });
            }
        });

        return {
            id: section.id,
            name: section.displayName,
            code: (section.code || '').replace(/^EMS_/, 'SE '),
            fields: fields
        };
    });

    // ─── Prefix detection helpers ─────────────────────────────────────────────
    // Matches a compound ALL-CAPS prefix at the start of a section name,
    // e.g. "SURV-MORTUARY Section 1"  →  "SURV-MORTUARY"
    const COMPOUND_PREFIX_RE = /^([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]+)+)\b/;

    const detectPrefix = (sec) => {
        const code = sec.code || '';

        // 1. Code contains underscore: SURV-MORTUARY_1 → "SURV-MORTUARY"
        if (code.includes('_')) return code.split('_')[0];

        // 2. Code starts with 'SE ' (EMS sections already transformed from EMS_N)
        if (code.startsWith('SE ')) return 'SE';

        // 3. Fallback: compound hyphenated ALL-CAPS prefix in the display name
        //    e.g. "SURV-MORTUARY Section 1" → "SURV-MORTUARY"
        const nameMatch = sec.name.match(COMPOUND_PREFIX_RE);
        if (nameMatch) return nameMatch[1];

        return null; // no prefix detected → general section
    };

    // Human-readable name overrides for known prefix codes
    const PREFIX_NAME_MAP = {
        'SE': 'EMS',
        // add more here if needed, e.g. 'SURV-MORTUARY': 'Mortuary Survey'
    };

    // 1. Identify General vs Prefix sections
    //    "Assessment Details" is special — it belongs to ALL groups as a shared header.
    const generalSections = [];  // all non-prefixed sections (including AD)
    const prefixSectionsByPrefix = {};

    transformedSections.forEach(sec => {
        const prefix = detectPrefix(sec);
        const isGeneral =
            !prefix ||
            sec.name === 'Assessment Details' ||
            (sec.code || '').startsWith('GENERAL_');

        if (isGeneral) {
            // Force mandatory for general/global sections
            sec.fields.forEach(f => {
                if (f.type !== 'header') f.compulsory = true;
            });
            generalSections.push(sec);
        } else {
            if (!prefixSectionsByPrefix[prefix]) prefixSectionsByPrefix[prefix] = [];
            prefixSectionsByPrefix[prefix].push(sec);
        }
    });

    // Split: Assessment Details goes into every group; remaining general sections stay in Mortuary only
    // Use ALL generalSections (not just name-matched) so we don't miss AD if the DHIS2 name differs slightly
    const sharedSections = generalSections;

    // 2. Create a group per prefix.
    //    Each group starts with shared sections (Assessment Details etc.), then its own sections.
    const finalGroups = Object.keys(prefixSectionsByPrefix).map(prefix => {
        const groupSections = [...prefixSectionsByPrefix[prefix]].sort((a, b) => {
            const extractNum = (str) => {
                const match = (str || '').match(/\d+/);
                return match ? parseInt(match[0], 10) : 0;
            };
            return extractNum(a.code || a.name) - extractNum(b.code || b.name);
        });

        return {
            id: prefix,
            name: PREFIX_NAME_MAP[prefix] || prefix,
            // Shared sections (Assessment Details etc.) always come first
            sections: [...sharedSections, ...groupSections]
        };
    });

    // 3. Sort prefixed groups alphabetically
    const sortedGroups = finalGroups.sort((a, b) => a.name.localeCompare(b.name));

    // 4. Prepend the Mortuary group (contains Assessment Details + any other general sections)
    if (generalSections.length > 0) {
        sortedGroups.unshift({
            id: 'GENERAL',
            name: 'Mortuary',
            sections: generalSections
        });
    }

    // Fallback: If no categorized sections exist at all, return general sections as a solo group
    if (sortedGroups.length === 0) {
        return [{
            id: 'SURVEY',
            name: 'SURVEY',
            sections: generalSections
        }];
    }

    // 4. Post-process to link questions to their associated comment fields
    sortedGroups.forEach(group => {
        group.sections.forEach(section => {
            const fields = section.fields;
            for (let i = 0; i < fields.length - 1; i++) {
                // If this is a question (not a header or comment) and the next field is a comment
                if (!fields[i].isComment && fields[i].type !== 'header' && fields[i + 1].isComment) {
                    fields[i].commentFieldId = fields[i + 1].id;
                    fields[i + 1].questionFieldId = fields[i].id; // Link comment back to question
                }
            }
        });
    });

    return sortedGroups;
};

const mapValueTypeToInputType = (valueType, hasOptions) => {
    if (hasOptions) return 'select';

    switch (valueType) {
        case 'NUMBER':
        case 'INTEGER':
        case 'INTEGER_POSITIVE':
        case 'INTEGER_ZERO_OR_POSITIVE':
            return 'number';
        case 'BOOLEAN':
        case 'TRUE_ONLY':
            return 'select';
        case 'DATE':
            return 'date';
        case 'LONG_TEXT':
            return 'textarea';
        default:
            return 'text';
    }
};
