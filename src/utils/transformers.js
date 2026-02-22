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
                    type: 'header'
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
                }

                fields.push({
                    id: de.id || deId,
                    label: name.endsWith('-comment') || name.endsWith('comment') ? 'Comment' : name,
                    type: finalType,
                    options: options,
                    compulsory: section.displayName === 'Assessment Details' ? true : de.compulsory
                });
            }
        });

        return {
            id: section.id,
            name: section.displayName,
            code: section.code || '',
            fields: fields
        };
    });

    // 1. Identify General vs Prefix sections
    const generalSections = [];
    const prefixSectionsByPrefix = {};

    transformedSections.forEach(sec => {
        const isGeneral = !sec.code || !sec.code.includes('_') ||
            sec.name === 'Assessment Details' ||
            sec.code.startsWith('GENERAL_');

        if (isGeneral) {
            // Force mandatory for general/global sections
            sec.fields.forEach(f => {
                if (f.type !== 'header') f.compulsory = true;
            });
            generalSections.push(sec);
        } else {
            const prefix = sec.code.split('_')[0];
            if (!prefixSectionsByPrefix[prefix]) prefixSectionsByPrefix[prefix] = [];
            prefixSectionsByPrefix[prefix].push(sec);
        }
    });

    // 2. Create groups for each prefix, injecting general sections as defaults
    const finalGroups = Object.keys(prefixSectionsByPrefix).map(prefix => {
        return {
            id: prefix,
            name: prefix,
            // Prepend general sections to every category
            sections: [...generalSections, ...prefixSectionsByPrefix[prefix]]
        };
    });

    // 3. Sort groups alphabetically
    const sortedGroups = finalGroups.sort((a, b) => a.name.localeCompare(b.name));

    // Fallback: If no categorized sections exist, show general sections in a default group
    if (sortedGroups.length === 0 && generalSections.length > 0) {
        return [{
            id: 'SURVEY',
            name: 'SURVEY',
            sections: generalSections
        }];
    }

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
