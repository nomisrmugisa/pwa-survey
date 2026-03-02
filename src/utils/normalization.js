/**
 * Normalizes a raw criterion code by removing common prefixes and suffixes.
 * E.g., "EMS_1.1.1.1" -> "1.1.1.1", "SE 1.1.1.1 extra" -> "1.1.1.1"
 * @param {string} rawCode 
 * @returns {string}
 */
export const normalizeCriterionCode = (rawCode) => {
    if (!rawCode) return '';
    let code = String(rawCode).trim();
    // Strip known prefixes like "EMS_" or "SE " if present
    code = code.replace(/^EMS_/, '');
    if (code.startsWith('SE ')) {
        code = code.slice(3).trim();
    }
    // Strip circular link root tags
    code = code.replace(/-root\(.*\)$/, '');
    // If any spaces remain, take the first token (e.g. "1.1.1.1 extra" -> "1.1.1.1")
    code = code.split(/\s+/)[0];
    return code;
};

/**
 * Compares two criterion codes (e.g. "1.2.1.4" and "1.2.1.1")
 * Returns -1 if A < B, 1 if A > B, 0 if equal.
 * Compares segment by segment numerically.
 */
export const compareCriterionCodes = (codeA, codeB) => {
    const a = normalizeCriterionCode(codeA) || '';
    const b = normalizeCriterionCode(codeB) || '';
    if (a === b) return 0;

    const partsA = a.split('.').map(n => parseInt(n, 10));
    const partsB = b.split('.').map(n => parseInt(n, 10));

    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
        const valA = partsA[i] || 0;
        const valB = partsB[i] || 0;
        if (valA < valB) return -1;
        if (valA > valB) return 1;
    }
    return 0;
};
