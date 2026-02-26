const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'src', 'assets', 'ems_config.json');
const textDir = path.join(__dirname, 'Botswananhq_ems', 'extracted_text');

// 1. Read the existing config
let config;
try {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
} catch (e) {
    console.error("Failed to read ems_config.json", e);
    process.exit(1);
}

// 2. Read all text files and build a map of criterion attributes
const severityMap = {};
const criticalMap = {};
const regexCriterion = /Criterion\s+([\d\.]+)/;
const regexCritical = /Critical:\s*([þ¨]+)/;
const regexSeverity = /Default Severity.*=\s*(\d)/;

const files = fs.readdirSync(textDir);
for (const file of files) {
    if (file.endsWith('.txt')) {
        const filePath = path.join(textDir, file);
        const textData = fs.readFileSync(filePath, 'utf8');
        const blocks = textData.split(/Criterion\s+(?=\d+\.\d+\.\d+\.\d+)/); // split by criteria starts roughly

        for (const block of blocks) {
            // Find criterion ID in this block
            const idMatch = block.match(/^([\d\.]+)/);
            if (!idMatch) continue;

            const criterionId = idMatch[1];

            // Find Critical
            const isCriticalMatch = block.match(/Critical:\s*([þ¨])/);
            if (isCriticalMatch) {
                // If it's a thorn (þ), it's true. If it's a diaeresis (¨), it's false.
                criticalMap[criterionId] = isCriticalMatch[1] === 'þ';
            }

            // Find Severity
            const severityMatch = block.match(/Default Severity.*?=\s*(\d)/);
            if (severityMatch) {
                severityMap[criterionId] = parseInt(severityMatch[1], 10);
            }
        }
    }
}

console.log(`Found ${Object.keys(severityMap).length} criteria to update.`);

// 3. Patch the config
let updateCount = 0;
let missingCount = 0;

for (const se of config.ems_full_configuration) {
    for (const section of se.sections) {
        for (const standard of section.standards) {
            for (const criterion of standard.criteria) {
                if (criterion.id) {
                    const mappedSeverity = severityMap[criterion.id];
                    const mappedCritical = criticalMap[criterion.id];

                    let updated = false;

                    if (mappedSeverity !== undefined && criterion.severity !== mappedSeverity) {
                        criterion.severity = mappedSeverity;
                        updated = true;
                    }
                    if (mappedCritical !== undefined && criterion.is_critical !== mappedCritical) {
                        criterion.is_critical = mappedCritical;
                        updated = true;
                    }

                    if (updated) {
                        updateCount++;
                    } else if (mappedSeverity === undefined) {
                        missingCount++;
                    }
                }
            }
        }
    }
}

// 4. Write the patched config
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

console.log(`Successfully updated ${updateCount} criteria in ems_config.json`);
console.log(`Missing extraction for ${missingCount} criteria (left as is).`);
