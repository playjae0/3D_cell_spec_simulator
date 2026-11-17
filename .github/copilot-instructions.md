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
Pouch geometry is reused; do not replace it with boxes or claim sealing-bar support.

Intake 1.0 validation lives in src/intake/, immutable model revisions/samples in src/models/. Never merge demo numbers into missing intake. Keep source records/nulls and stable instance IDs. Regenerate contract artifacts with node scripts/generate-intake.mjs and run npm test. Signed coordinate modes must not change legacy distance semantics. Preview failure/cancel/stale responses must not mutate active state or history.
