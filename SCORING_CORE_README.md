# Scoring Core Module (shared extract)

This repository includes a reusable scoring engine in:

- `src/utils/scoring_core.js`

It is a dependency-free, pure JavaScript module that encapsulates the
healthcare accreditation scoring logic from the main app.

## Exposed functions

### 1. calculatePointsForLink(response, severity)

Returns a numeric score for an individual criterion based on
**response** and **severity (1–4)**.

- `C`, `FC`, `FULL`, `COMPLIANT` → 80 points
- `PC`, `PARTIAL`, `SUBSTANTIAL` → 75/65/55/45 depending on severity
- `NC`, `NON`, `NON_COMPLIANT`, `NOT_MET`, `FAIL` → 35/25/15/5
- `NA` or unknown → `null`

```js
import { calculatePointsForLink } from './src/utils/scoring_core.js';

const pts = calculatePointsForLink('PC', 2); // 65
```

### 2. computeGraphScores(criteriaMap)

Performs deep recursive scoring over a graph of criteria (roots and
linked children).

**Input:**

```ts
criteriaMap: {
  [code: string]: {
    id?: string;
    response: string;      // 'C' | 'PC' | 'NC' | 'NA' | etc.
    isRoot?: boolean;      // true for root/aggregate criteria
    links?: string[];      // codes of child criteria
    severity?: string|number; // 1–4
    isCritical?: boolean;  // critical risk flag
  }
}
```

**Output:**

```ts
scores: {
  [code: string]: {
    points: number | null;   // 0–80 for scored criteria
    response: string;        // normalized 'C' | 'PC' | 'NC' | 'NA' | 'Pending'
    rawResponse: string;     // original response
    isRoot: boolean;
    isDraft: boolean;        // true if some linked children not yet scored
    criticalFail: boolean;   // true when any linked critical NC fails
    isScored: boolean;       // whether this criterion currently contributes
    draftAvg: number | null; // average of scored children
    countScoredLinks: number;
    rootSources: Array<{
      code: string;
      points: number | null;
      response: string;
      isScored: boolean;
      isCritical: boolean;
    }>;
  }
}
```

### 3. calculateSectionScore(standards) & calculateOverallScore(sections)

Aggregation helpers for rolling up from standards → sections → overall.

Each item passed in should look like:

```ts
{
  totalScore: number;   // sum of points for criteria in that group
  maxScore: number;     // usually N * 100 where N = #scored criteria
  criticalFail: boolean;
}
```

Both functions return:

```ts
{
  percent: number;      // 0–100 (2 decimal places)
  totalScore: number;
  maxScore: number;
  criticalFail: boolean;
}
```

## Minimal usage example

```js
import {
  calculatePointsForLink,
  computeGraphScores,
  calculateSectionScore,
  calculateOverallScore
} from './src/utils/scoring_core.js';

const criteriaMap = {
  '1.1.1.1': { response: 'C', isRoot: false, links: [], severity: 1, isCritical: false },
  '1.1.1.2': { response: 'PC', isRoot: false, links: [], severity: 2, isCritical: false },
  ROOT: { response: 'NA', isRoot: true, links: ['1.1.1.1', '1.1.1.2'], severity: 2, isCritical: false }
};

const scores = computeGraphScores(criteriaMap);

const section = calculateSectionScore([
  {
    totalScore: scores['ROOT'].points ?? 0,
    maxScore: scores['ROOT'].isScored ? 100 : 0,
    criticalFail: scores['ROOT'].criticalFail
  }
]);

const overall = calculateOverallScore([section]);
console.log(overall.percent);
```

You can drop `scoring_core.js` (and optionally this README) into
another project as-is. No React or framework dependencies are required.
