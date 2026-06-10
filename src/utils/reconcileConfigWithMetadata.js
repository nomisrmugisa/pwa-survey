import { normalizeCriterionCode } from './normalization.js';

const extractCode = (dataElement) => {
    const candidates = [
        dataElement?.code,
        dataElement?.formName,
        dataElement?.displayName,
        dataElement?.name,
    ];
    for (const candidate of candidates) {
        const normalized = normalizeCriterionCode(candidate);
        if (/^\d+(?:\.\d+){2,3}$/.test(normalized)) return normalized;
        const match = String(candidate || '').match(/\b\d+(?:\.\d+){2,3}\b/);
        if (match) return match[0];
    }
    return '';
};

const extractText = (dataElement, code) => {
    const raw = dataElement?.formName || dataElement?.displayName || dataElement?.name || '';
    return String(raw)
        .replace(new RegExp(`^.*?${code.replace(/\./g, '\\.')}[_\\s:.-]*`, 'i'), '')
        .replace(/_+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

export const reconcileConfigWithMetadata = (configList, metadata) => {
    if (!Array.isArray(configList) || !Array.isArray(metadata?.programStageSections)) {
        return { config: configList, addedCriteria: 0, addedStandards: 0 };
    }

    const nextConfig = JSON.parse(JSON.stringify(configList));
    const standardStatements = new Map();
    const criteria = new Map();

    metadata.programStageSections.forEach(section => {
        const elements = section.dataElements || section.programStageDataElements || [];
        elements.forEach(rawElement => {
            const dataElement = rawElement?.dataElement || rawElement;
            const name = String(dataElement?.formName || dataElement?.displayName || dataElement?.name || '');
            if (/comments?$/i.test(name.trim())) return;

            const code = extractCode(dataElement);
            if (/^\d+(?:\.\d+){2}$/.test(code)) {
                standardStatements.set(code, extractText(dataElement, code));
            } else if (/^\d+(?:\.\d+){3}$/.test(code)) {
                criteria.set(code, {
                    id: code,
                    description: extractText(dataElement, code),
                    is_critical: false,
                    severity: 1,
                });
            }
        });
    });

    let addedCriteria = 0;
    let addedStandards = 0;

    criteria.forEach(criterion => {
        const parts = criterion.id.split('.');
        const seId = parts[0];
        const sectionPiId = `${parts[0]}.${parts[1]}`;
        const standardId = `${parts[0]}.${parts[1]}.${parts[2]}`;
        const serviceElement = nextConfig.find(item => String(item?.se_id) === seId);
        if (!serviceElement) return;

        const section = (serviceElement.sections || []).find(item => String(item?.section_pi_id || '') === sectionPiId);
        if (!section) return;

        section.standards = Array.isArray(section.standards) ? section.standards : [];
        let standard = section.standards.find(item => String(item?.standard_id || '') === standardId);
        if (!standard) {
            standard = {
                standard_id: standardId,
                statement: standardStatements.get(standardId) || `Standard ${standardId}`,
                intent_tooltip: '',
                criteria: [],
            };
            section.standards.push(standard);
            addedStandards += 1;
        }

        standard.criteria = Array.isArray(standard.criteria) ? standard.criteria : [];
        if (!standard.criteria.some(item => String(item?.id || '') === criterion.id)) {
            standard.criteria.push(criterion);
            addedCriteria += 1;
        }
    });

    return { config: nextConfig, addedCriteria, addedStandards };
};
