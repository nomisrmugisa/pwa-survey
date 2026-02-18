export const transformMetadata = (metadata) => {
    if (!metadata || !metadata.programStageSections) return [];

    return metadata.programStageSections.map(section => {
        const subsections = [];
        let currentSubsection = {
            id: `default-${section.id}`,
            name: section.displayName, // Use Category name instead of 'General'
            fields: []
        };

        // Access nested dataElements correctly based on API response structure
        // The prompt implied programStageSections has dataElements directly.
        // If it's the raw API response from previous step, it might be section.dataElements
        const elements = section.dataElements || [];

        elements.forEach(element => {
            const de = element;
            const name = de.formName || de.displayName;

            // Check if this is a header marker
            // User originally said "(--)", but screenshot shows "Name--"
            const isHeader = name && (name.includes('(--)') || name.trim().endsWith('--'));

            if (isHeader) {
                console.log("Found Subsection Header:", name); // Debug Log

                // Push previous subsection if valid
                if (currentSubsection.fields.length > 0) {
                    subsections.push(currentSubsection);
                }

                // Clean name: remove "(--)" or trailing "--"
                const cleanName = name.replace(/\(--\)/g, '').replace(/--$/, '').trim();

                // Start new subsection
                currentSubsection = {
                    id: de.id,
                    name: cleanName,
                    fields: []
                };
            } else {
                // Regular field

                let options = [];
                if (de.optionSet && de.optionSet.options) {
                    options = de.optionSet.options.map(opt => ({
                        value: opt.code,
                        label: opt.displayName
                    }));
                }

                // Auto-generate options for Boolean types if no OptionSet exists
                if (options.length === 0 && (de.valueType === 'BOOLEAN' || de.valueType === 'TRUE_ONLY')) {
                    options = [
                        { value: 'true', label: 'Yes' },
                        { value: 'false', label: 'No' }
                    ];
                }

                currentSubsection.fields.push({
                    id: de.id,
                    label: name.endsWith('-comment') || name.endsWith('comment') ? 'Comment' : name,
                    type: mapValueTypeToInputType(de.valueType, options.length > 0),
                    options: options,
                    compulsory: de.compulsory
                });
            }
        });

        // Push the final subsection
        if (currentSubsection.fields.length > 0) {
            subsections.push(currentSubsection);
        }

        // Fallback if no fields found at all
        if (subsections.length === 0) {
            subsections.push({ id: `empty-${section.id}`, name: 'No Fields', fields: [] });
        }

        return {
            id: section.id,
            name: section.displayName,
            subsections: subsections
        };
    });
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
            return 'select'; // Often better as Yes/No select or checkbox
        case 'DATE':
            return 'date';
        case 'LONG_TEXT':
            return 'textarea';
        default:
            return 'text';
    }
};
