'use strict';

const legacyFiles = [
  'demo-frontend/index.html',
  'demo-frontend/styles.css',
  'demo-frontend/app.js',
  'demo-frontend/conflict-engine.js',
  'demo-frontend/demo-state.js',
];

const fullVisionFiles = [
  'full-vision-demo/index.html',
  'full-vision-demo/styles.css',
  'full-vision-demo/app.js',
  'full-vision-demo/app-shell/claim-manifest.js',
  'full-vision-demo/app-shell/route-manifest.js',
  'full-vision-demo/app-shell/scenario-manifest.js',
  'full-vision-demo/app-shell/state.js',
  'full-vision-demo/fixtures/fixture-graph.js',
  'full-vision-demo/phases/phase-1/operations.js',
  'full-vision-demo/shared/ui.js',
];

module.exports = { legacyFiles, fullVisionFiles };
