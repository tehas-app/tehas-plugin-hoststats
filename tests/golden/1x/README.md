# The 1.x golden

These are the 1.x plugin's own view files, copied verbatim out of the 1.x
commit (`git show 4ac3c1c:view/...`; `view/` is gone from the port's own
history): the page, its data module, its view
script and its two stylesheets. They exist for one test, tests/view.test.ts:
the headless run draws the same snapshot twice, once with the 1.x script and
once with the Solid view, and the two `#host` subtrees must be equal once
whitespace is collapsed. The Solid view must draw what the 1.x view drew.

They are development-only test data. Nothing here is built, and nothing here
goes into `dist/`.
