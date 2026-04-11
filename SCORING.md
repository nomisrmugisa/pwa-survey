## Facility Assessment Scoring – Developer Overview

This document explains how the scoring engine in this repo works and where the main pieces live, so another developer can quickly understand and reuse it.

---

### 1. High‑level idea

The scoring engine turns **flat form responses** (per data element) into **section / standard / criterion scores** using JSON configuration files.

Flow:

1. **Form UI** captures responses into `formData` (keyed by data element ID).
2. **App.jsx** builds a normalized structure `assessmentDetailsForScoring` from `formData` + `groups`.
3. **useAssessmentScoring hook** consumes that structure and returns per‑criterion & per‑section scores.
4. **FormArea** uses those scores to:
   - Display live scores next to each question.
   - Tag comments with score/severity summaries.
5. On submit, we also capture a **snapshot** of the scoring results for auditing.

---

### 2. Key files

**Hook & core logic**

- `src/hooks/useAssessmentScoring.js`
  - Main entry point for consumers.
  - React hook that takes `assessmentDetailsForScoring` and returns a structured scoring result.
- `src/utils/scoring.js`
  - Pure functions that implement the scoring rules:
    - How C/PC/NC options are converted to numeric points.
    - How child criteria roll up into root criteria.
    - How draft vs final scores are handled.
- `src/utils/createAssessmentSnapshot.js`
  - Builds a compact snapshot object from the scoring result and selected metadata, used when submitting to DHIS2.
- `src/utils/normalization.js`
  - Helpers to normalize criterion codes (e.g. `SURV_MORT_1.2.3` → `1.2.3`).

**Configuration & links**

- `src/assets/ems_config.json`
- `src/assets/mortuary_config.json`
- `src/assets/clinics_config.json`
- `src/assets/hospital_config.json`
  - Contain hierarchical SE → Section → Standard → Criteria definitions, including severity and critical flags.
- `src/assets/ems_links.json`
- `src/assets/mortuary_links.json`
- `src/assets/clinics_links.json`
- `src/assets/hospital_links.json`
  - Define how criteria are linked together for roll‑up scoring (roots and their children).

**Integration points**

- `src/App.jsx`
  - Builds `assessmentDetailsForScoring` from `groups` + `formData` in `assessmentDetailsForScoring` memo.
  - Chooses which config/links file to use (EMS, Mortuary, Clinics, Hospital) based on the active group.
  - Calls `useAssessmentScoring(assessmentDetailsForScoring)` and passes `scoringResults` into `FormArea` and `Layout`.
- `src/components/FormArea/FormArea.jsx`
  - Uses `scoringResults` to:
    - Show per‑criterion points/status chips above dropdowns.
    - Show root‑score summaries and a "Details" modal for root criteria.
    - Auto‑append score tags to comment fields.
  - On submit, calls `createAssessmentSnapshot(scoringResults)` and includes it in the payload.

---

### 3. Data shapes

**Input to `useAssessmentScoring`** (simplified):

```ts
interface AssessmentDetailsForScoring {
  sections: Array<{
    id: string;                // section id (matches metadata section.id)
    standards: Array<{
      id: string;              // standard code or section id
      criteria: Array<{
        id: string;            // data element id
        code: string;          // criteria code (e.g. "1.2.3.4")
        response: string;      // e.g. 'C', 'PC', 'NC', 'NA'
        isCritical: boolean;
        isRoot: boolean;       // true if this criterion is auto‑calculated root
        links: string[];       // children codes this root depends on
        roots: string[];       // parent roots this criterion contributes to
        severity: number;      // 1–4
      }>;
    }>;
  }>;
}
```

**Output from `useAssessmentScoring`** (simplified):

```ts
interface ScoringResults {
  sections: Array<{
    id: string;
    standards: Array<{
      id: string;
      criteriaScores: Record<string, CriterionScore>; // keyed by dataElement id
    }>;
  }>;
}

interface CriterionScore {
  response: string;         // 'C', 'PC', 'NC', 'Pending', ...
  points: number | null;    // numeric score, null if not yet scorable
  isRoot: boolean;
  isDraft: boolean;         // true when not all children are scored
  severity: number;
  normalizedValue?: string; // canonicalized status used in UI
  rootSources?: Array<{ code: string; points: number | null; response: string; isCritical: boolean; }>;
}
```

---

### 4. How to reuse the scoring

For another developer wanting to reuse just the scoring logic:

1. Copy or import:
   - `useAssessmentScoring.js`
   - `scoring.js`
   - `createAssessmentSnapshot.js`
   - Relevant `*_config.json` + `*_links.json` for their programme.
2. Build `assessmentDetailsForScoring` in the same shape as above from their own form/metadata.
3. Call `useAssessmentScoring(details)` (in React) or the pure functions in `scoring.js` (in non‑React code).
4. Optionally call `createAssessmentSnapshot(scoringResults)` when persisting to a backend.

Point them at this file (`SCORING.md`) plus the files listed in section 2 and they should be able to navigate and understand the scoring code quickly.
