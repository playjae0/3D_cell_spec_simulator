# Current R4 scope

For R4 use `docs/r4/01_WORK_ORDER.md`, `docs/r4/02_FIGURES.txt`, `docs/r4/design.md` and `docs/r4/copilot-and-operation.md`. These supersede the historical reading order below for this iteration. Do not reopen old research archives, delete files, refactor unrelated code, or build installers. Source geometry comes only from the designated figures and the user's confirmed stacked-foil structure.

R4 data is an explicit optional `product.processTooling` snapshot; intake 1.3 carries it with tool ID/revision, polarity/stage, placement and stable spot/outline IDs. Never auto-fill it into an older model. R0–R7 stage IDs preserve the original S/P meanings. CAD is `cad/process_tooling.py`; the element-technology panel is `src/tooling/`. Reuse existing cup and bend kernels. Seal measurements come from exact projected workface intersections, not displayed meshes. A tool geometry draft must merge with the latest inspection metadata before preview/apply.

Run `npm test`, `python -m unittest discover -s tests -p '*geometry*.py' -v`, `npm run build`. `python scripts/check_tooling_r4.py` produces the measured before/after report. The following sections document earlier versions and remain compatibility context, not an instruction to repeat their research.

Read docs/spec-integrated.md and docs/validation-integrated.md first for v1.4. It extends full main 4df91c9 / PR #4. Keep the original CAD; no new pouch/executable/deployment work in this scope.

Read docs/spec-v1.3.md and docs/intake/internal-copilot-prompt.md for the current intake contract. v1.3 extends the full main 3e0f9f8 app, never the read-only hosted review.

# Pouch cell project constraints

Read docs/spec-v1.2.md, docs/field-geometry-map-v1.2.md and docs/evidence-decisions.md before changes. v1.2 user request supersedes v1.1.
The user's 2026-11-17 central-gathering correction takes precedence over the ZIP.
Do not introduce V-fold/blade geometry from S1-13/S1-14, W2 guide mechanisms,
or W3 hybrid weld patterns. Stacked sheet electrodes; finite central gathering.
Positive and negative data are independent. Demo end assignment is not photo polarity.

CAD lives in cad/, display in src/viewer/, measurements in src/annotations/,
project validation in src/data/. Never derive engineering dimensions from pixels or
triangle indices. Keep stable semantic IDs; invalidate removed references explicitly.
Do not add an editable geometry input unless it actually changes the named shape.
Do not silently clamp impossible inputs or overwrite the last valid model on failure.
New surfaces need explicit datum, input/derived classification and regression checks.

Use npm test, python -m unittest discover -s tests -p '*geometry.py' -v,
and npm run build. Check the affected view in browser and capture front/side/section.
STEP changes require reimport, unit, bounding dimensions and volume checks.
Do not claim product accuracy from photo similarity or unit tests. Preserve assumptions
and unimplemented local sealing/foil-deformation limits in docs and UI diagnostics.

Constant foil width is one stored foilWidth per polarity, independent Y centers.
Stages resolve in cad/process.py; do not copy whole models per stage or use later
lead/tape/weld inputs in earlier geometry. Gathered length UI writes axialShortening,
not S0 rootLength. Do not silently migrate two legacy widths.
Field geometry links live in src/data/bindings.js; persistent references are semantic.
New direct editors must distinguish calculated values and their source inputs.
Preserve single-flight latest-wins queue semantics and invalidate on input, not send.
Verify real live-cad API capabilities, save gating, grouped undo and JSON migration.
Pouch geometry is reused; do not replace it with boxes. v1.5 adds nominal tool faces, not full sealing equipment or thermal predictions.

Intake 1.2 (legacy 1.0/1.1 accepted) validation lives in src/intake/, immutable model revisions/samples in src/models/. Never merge demo numbers into missing intake. Keep source records/nulls and stable instance IDs. Regenerate contract artifacts with node scripts/generate-intake.mjs and run npm test. Signed coordinate modes must not change legacy distance semantics. Preview failure/cancel/stale responses must not mutate active state or history.

Use shared annotations/semantics.js for sample guards and definition diff. Camera/layout is not inspection meaning; datum/anchor/spec/conditions are. S3 leadFilm is independent of S4 yellow tape; preserve unknown legacy S3 nulls. Compare cloned snapshots with independent CAD/cache; never mutate active state. Library import must preview conflicts and persist before publishing memory; preserve corrupt raw storage. New view presets must validate semantic references before applying.


For pouch work read docs/spec-pouch-v1.5.md and docs/evidence-pouch-v1.5.md.
Shared stage contract is src/data/stages.json: pouch_formed is independent;
loaded joins S4. Do not rank new stages numerically or change legacy IDs.
CAD generation in cad/pouch_process.py, exact bend map in pouch_material.py;
JS material anchors mirror that map in src/geometry/material.js. Test both.
Use analytic BRep extents (geometry_metrics.py), not tessellation-cached bounds.
Inputs and allowed combinations live in src/data/pouch-fields.js; regenerate
1.2 artifacts without overwriting frozen legacy fixtures. Do not auto-fill
missing product settings. Tool relief is not a product cutout. Fold/cut refs
remain material-attached, and removed material invalidates references.
Windows executable/installer/deployment updates remain deferred.
