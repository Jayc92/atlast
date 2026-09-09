# M6 Criterion 4 — Independent Validation Packet

## 1. Purpose and status

This packet is the narrow follow-up to the M6-C pilot's Criterion 4 result. It
lets a technically competent employee who did not build Atlast validate the
merged `known-zero` relationship-evaluation workflow without repeating or
reinterpreting the rest of the M6-C pilot.

This document is an operational aid only. It is not validation evidence, does
not mark Criterion 4 PASS, does not complete M6, and does not authorize M7.
Until a completed independent run is separately evaluated, Criterion 4 remains
**FAIL** and M6 remains open at **5 of 6** exit criteria.

## 2. Independence boundary

The tester must complete the workflow without a developer driving the clicks,
choosing the verdict, supplying an identifier, or inspecting the exported JSON
for them. The tester may use this packet and the existing
[Kubernetes pilot guide](kubernetes-pilot.md).

If developer help becomes necessary, do not conceal it. Stop treating the run
as a candidate unaided validation, describe the help in the Pilot feedback
panel's **Session notes**, and preserve the resulting artifact. Also disclose
the help in the statement returned with the artifact. An assisted run is still
useful evidence, but it does not satisfy this targeted unaided validation.

The current panel does not expose a control for changing the artifact's
`developerIntervention` field from its default `false` value. That field alone
therefore does not prove independence. The tester's explicit statement and
session notes are required corroboration; any disclosed intervention makes this
targeted run insufficient regardless of the field's value.

## 3. Copy-paste request for the tester

> Please independently validate one corrected Atlast workflow against its
> disposable local Kubernetes pilot. Follow
> `docs/m6-criterion-4-independent-validation.md` without a developer guiding
> the steps or interpreting the result. The environment is local and read-only.
> When finished, send the exported pilot JSON file and state whether you needed
> any developer assistance. Do not commit the JSON file to Git.

## 4. Tester procedure

### A. Prepare the disposable pilot

Start from a fresh clone or an up-to-date `main` branch, then follow the setup,
ground-truth inspection, and launch steps in
[the Kubernetes pilot guide](kubernetes-pilot.md#d-set-up-the-pilot-environment):

```bash
./scripts/setup-kubernetes-pilot.sh
```

Before opening Atlast, independently inspect the real Kubernetes objects:

```bash
kubectl --context kind-atlast-m6-a -n atlast-m6-a get deployments,replicasets,pods,services -o wide
```

Then start Atlast:

```bash
./scripts/connect-kubernetes-pilot.sh
```

Open the printed local URL, normally `http://127.0.0.1:5173`.

### B. Confirm the known-zero ground truth in Atlast

1. Open the normal Atlast **Topology** page.
2. Find the real `unused-service` Service entity.
3. Open its **Trust Inspector** and inspect its dereferenced Evidence.
4. Independently confirm that the Service selector evaluation reports all three
   of these values:

```text
hasSelector: true
matchedPodCount: 0
evaluatedAgainstCompletePodSet: true
```

These values mean Atlast successfully evaluated the real selector against the
complete observed Pod set and found zero matches. Do not infer `known-zero` from
an empty graph alone; confirm the Evidence values above first.

### C. Record the relationship evaluation

1. Open **Pilot feedback**.
2. Complete **Tester role** and **Session notes** honestly. If anyone assists,
   describe what they did in **Session notes**, stop treating the run as an
   unaided candidate, and disclose the assistance when returning the artifact.
3. Under **Relationship judgment**, set **Review subject** to
   **Relationship evaluation (Atlast found no matching target, e.g. a known-zero
   Service selector)**.
4. Enter this real source entity identifier:

```text
atlast:entity:atlast-m6-a-service-unused
```

5. Leave **Relationship type** as `selects`.
6. Select the verdict `known-zero` only if your Evidence inspection in section B
   supports it.
7. Select **Record relationship judgment** and confirm the recorded relationship
   judgment count increments.
8. Select **Export pilot JSON** and retain the downloaded file outside the Git
   repository.

Never invent a Pod identifier, target entity identifier, or relationship
identifier for this zero-match result.

### D. Stop and clean up

Return to the terminal running `connect-kubernetes-pilot.sh`, press `Ctrl+C`,
then remove the disposable cluster:

```bash
./scripts/cleanup-kubernetes-pilot.sh
```

### E. Return the evidence

Send the maintainer:

- the exported pilot JSON file;
- a short statement confirming whether you completed the run without developer
  assistance; and
- any problem or ambiguity you encountered, even if the export succeeded.

The JSON may contain local sandbox details. Keep it outside the Git repository
and do not add credentials, production details, or other sensitive data.

## 5. Maintainer artifact-review template

Complete this only after receiving the tester's original exported file. Review
the file; do not edit it into compliance.

```text
M6 Criterion-4 independent validation review

Tester role:
Run date:
Artifact filename and local retention location (outside Git):
Artifact sessionId:

Independence
[ ] Tester is a technically competent employee who did not build Atlast.
[ ] Tester states that no developer drove the workflow or interpreted the result.
[ ] Session notes disclose no intervention or contradictory assistance.
[ ] developerIntervention.occurred is false (corroborating only; the current UI
    does not let the tester change this default, so it is not sufficient alone).

Ground-truth inspection
[ ] Tester inspected unused-service through the normal Atlast website.
[ ] Tester independently confirmed hasSelector: true.
[ ] Tester independently confirmed matchedPodCount: 0.
[ ] Tester independently confirmed evaluatedAgainstCompletePodSet: true.

Exported artifact
[ ] schemaVersion is atlast-m6-pilot-feedback-v2.
[ ] relationshipReviews contains the tester's applicable review.
[ ] reviewSubject is relationship-evaluation.
[ ] sourceEntityIdentifier is atlast:entity:atlast-m6-a-service-unused.
[ ] relationshipType is selects.
[ ] verdict is known-zero.
[ ] No atlastRelationshipIdentifier is present on that review.
[ ] No target-entity identifier or other fabricated field is present on that review.
[ ] The artifact was not committed to Git.

Review outcome
[ ] Candidate PASS: every applicable check above is satisfied.
[ ] FAIL / insufficient evidence: one or more applicable checks is not satisfied.

Notes:
```

## 6. Evaluation boundary

A successful run creates evidence with which Criterion 4 may be re-evaluated; it
does not update project status automatically. A separate maintainer evaluation
must compare the original artifact and tester statement with the exact frozen
Criterion 4 text in [the accepted M6 plan](m6-plan.md#15-m6-exit-criteria), then
record the factual outcome through the repository's normal review and checkpoint
process. Until that occurs, Criterion 4 remains FAIL, M6 remains open at 5 of 6,
and M7 remains unauthorized.
