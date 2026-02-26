Here is the exact breakdown of how these two scenarios work in "layman's terms":
1. The Average Rule: (Links → Root)
A Root Criterion (usually a high-level management process) cannot be scored directly by a user. Instead, its score is the aggregated average of the scores assigned to the specific operational tasks (Linked Criteria) associated with it in the matrix [Turn 4].

    Example from the Matrix: Criterion 1.3.1.5 (The manager ensures compliance with laws) is a Root. It is linked to many items, such as 9.3.1.7 (Vehicle licensing) and 1.2.7.1 (Medication storage).
    If the user scores those 20+ linked items individually, your app must calculate the average of those points to determine the final score for Root 1.3.1.5 [Turn 6].

2. The Critical Criterion Rule: (The Pull-Down Effect)
If you have a Critical Criterion (þ), its score does not automatically overwrite the numerical score of every linked item, but it dictates the "health" of the entire system in two ways:

    Standard-Level Failure: If any critical criterion within a Standard is Non-compliant (NC), the entire Standard must be flagged as failing, regardless of the other scores [Turn 4, Turn 5].
    Consistency (Logical Links): If a critical criterion is failing, the linked criteria should reflect a similar deficiency to ensure the report is consistent [Turn 4].
        Example from the Matrix: Criterion 1.1.1.5 (Valid licensure) is a Critical item [5, Turn 1]. It is linked to 1.1.3.1 (Ownership and licensure document).
        If the organization does not have a license (1.1.1.5 = NC, 5 points), it is logically impossible for the document explaining that license (1.1.3.1) to be Compliant. Therefore, while they don't "carry the same score" automatically, a failure in the critical root necessitates a failure in the logical link.

3. The "Majority Rule" Override
Even if the average is mathematically high, there is a "safety valve":

    If more than 50% of the linked criteria for a system are rated as NC or PC, your app should automatically score the Root Criterion as NC or PC [Turn 4, Turn 6]. This ensures that high volume of small failures prevents a "Compliant" rating for the manager overseeing them.

Summary for your App Logic:

    Linked Criteria: User gives individual scores (C, PC, NC) → App converts to points based on Severity [Turn 6].
    Root Criteria: App calculates the average of those Linked points [Turn 4].
    Critical Check: If a linked item is Critical + NC, flag the Standard as failing and check all Linked items for logical consistency [Turn 4, Turn 5].



Addtionally:---------------------------------------------------------------

To compute a score for a single criterion, you must first determine if it is a Linked Criterion (an individual operational task) or a Root Criterion (a high-level management process). The method of calculation differs based on this distinction.
1. Scoring Individual (Linked) Criteria
For criteria that are scored directly by a surveyor or user, the score is determined by mapping the Compliance Rating against the pre-assigned Default Severity level.

    Determine Compliance: The user selects one of three ratings: Compliant (C), Partially Compliant (PC), or Non-compliant (NC).
    Assign Severity: Every criterion has a fixed seriousness level from 1 (Mild) to 4 (Very Serious).
    Point Calculation:
        Compliant (C): Always yields 80 to 100 points, regardless of severity.
        Partially Compliant (PC): Points range from 75 (Mild) down to 45 (Very Serious).
        Non-compliant (NC): Points range from 35 (Mild) down to 5 (Very Serious).

2. Scoring Root Criteria (The Matrix Model)
According to the Matrix Chart, certain criteria are "Roots" that oversee multiple operational areas. These criteria cannot be scored directly; instead, their score is an aggregated average of all the criteria linked to them in the chart.

    Identify the Links: For example, Criterion 1.3.1.5 (The manager ensures compliance with laws) is a Root criterion. It has over 20 Linked Criteria, such as 1.2.7.1 (Medication storage), 9.3.1.7 (Vehicle licensing), and 10.1.2.1 (Professional licensure for assessments).
    Compute the Average: Your app must take the individual point scores of every operational link (the sub-criteria) and average them to produce the final numerical score for that Root criterion.

3. The Critical Criterion "Veto"
If a criterion is designated as Critical, it has a disproportionate effect on the score:

    Safety/Legal Breach: If a critical item (like 1.1.1.5, Organization Licensure) is scored as PC but involves a legal or safety risk, it must be downgraded to NC (5 points).
    Standard Penalty: If a critical criterion is non-compliant, it causes the entire standard to be flagged as failing, even if other non-critical items in that section have high scores.

4. Verification via Audits
For criteria involving record audits or interviews (such as checking patient records for documentation findings in 10.1.1.4), a specific threshold is used:

    The 80% Rule: To receive a Compliant (C) rating, at least 80% (typically 4 out of 5) of the audited samples must meet the requirement.
    The Mix Rule: If only 2 or 3 out of 5 samples are compliant, the rating for that criterion is automatically set to Partially Compliant (PC).

Summary for your App: To compute a score per criterion, your app logic must:

    Check if the item is a Root or a Link.
    If it's a Link, apply the (Compliance + Severity) point table.
    If it's a Root, calculate the average points of its linked items identified in the Matrix.
    Apply the Critical override if the item is marked as such


    Current implementation in app------------------------------------

    The system now correctly distinguishes between Root and Linked criteria:

Severity-Based Points: C/PC/NC answers now generate points on a 100 down to 5 scale based on the criterion's Severity (1-4).

Root Criteria Logic: If a criterion has subordinate links defined in the ems_links.json file (e.g. 1.1.2.1), the system will now disable its dropdown in the form. Its score is instead dynamically calculated as the average of the points scored by all of its linked subordinate tasks.

Majority Override Rule: For Root criteria, if more than 50% of its subordinate tasks are scored PC or NC, the Root's average score is severely penalized to ensure it doesn't pass.

Critical Veto: If a "Critical" item is scored "NC", the entire Standard will fail and receive a 0%.

Score Persistence: Automatic score tags (e.g. `[SCORE: 90 pts - PARTIAL]`) are generated and automatically appended to the text in the criterion's comment box dynamically when the dropdown value changes.