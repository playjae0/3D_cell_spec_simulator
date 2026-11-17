# Pouch cell project constraints

Read docs/spec-v1.1.md and docs/evidence-decisions.md before geometry changes.
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
