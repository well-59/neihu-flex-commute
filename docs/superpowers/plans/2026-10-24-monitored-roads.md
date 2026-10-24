# Neihu Monitored Roads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. User has explicitly requested implementation; execute in this chat.

**Goal:** All current Neihu VD directions are visible/selectable on a usable model island with honest live traffic colors and detail.
**Architecture:** Exact-ID inventory/geometry adapter, existing observation validation, expanded real OSM physical surface, thin selectable monitoring overlays, responsive live UI. Independent file ownership for data, monitoring UI/model and display network; root integrates scene/entry/export/browser checks.
**Tech Stack:** Node 24, Python standard library, browser ES modules, Three.js 0.160.0; no build framework.
**Spec:** docs/superpowers/specs/2026-10-24-monitored-roads-design.md

## Global Constraints
- Source observations and historical data remain immutable; new assets include provenance.
- No guessed road readings, stale-green states, fictitious GPS or navigation guarantees.
- Existing historical and synthetic modes remain operational.
- Shared checkout: ownership boundaries, no agent commits, root coordinates integration.

## Review Focus
- Missing/invalid/zero-flow/stale data and failed partial feed responses.
- Curved direction geometry versus road bearing; same LinkID with multiple VD devices.
- Bridges crossing roads at different layers and explicit vehicle restrictions.
- Phone drawer/list/legend overlap and long road names/keyboard selection.
- Camera fitting expanded island and thin road color remaining below vehicles.

### Task 1: Current inventory and complete road geometry
Files: new web/monitored-roads.js; scripts/build-road-network.py; web/data/neihu-road-network.js / neihu-roads.osm; new data/region asset; tests/monitored-roads.test.mjs.
Interface: buildMonitoredSummary(inventory,history) -> {rows,representatives,coverage}; rows carry exact current id/vdId/linkId/roadName/bearing/position/lane counts, geometry and scope. All baseline Neihu directions retained, no representative dedup loss. Region mask saved with provenance.
- [ ] Add/run failing tests for all 80 baseline directions, all 21 names/four missing roads, exact LinkID joins and unmapped truthful handling.
- [ ] Implement adapter and expanded real road geometry without modifying source observations.
- [ ] Verify tests and provenance; send source/coverage details to root.

### Task 2: Traffic state and responsive monitoring UI
Files: web/traffic-monitor-model.js; web/traffic-monitor.js; web/traffic-island.css; tests/traffic-monitor.test.mjs.
Consumes Task 1 summary via existing createMonitor argument. Exposes city.drawRoutes(summary,4,selected,rows) and city.focusRoute(id).
- [ ] Test congestion levels/boundaries, missing/zero flow/stale/future data and speed sources before implementation.
- [ ] Implement classification, compact list/search, direction/detail card and persistent legend; preserve data timing and source units.
- [ ] Verify meaningful model tests; root checks browser desktop/phone integration.

### Task 3: Network and physical animation discipline
Files: web/traffic-network.js; web/traffic-flow.js; web/traffic-vehicles.js; tests/traffic-network.test.mjs.
- [ ] Add/run failing fixtures for separated crossing levels, bridge approaches, explicit car/motorcycle access and distance-based traversal.
- [ ] Implement conservative geometry continuity/access propagation and arc-length movement. Retain existing API and historical matchObservations.
- [ ] Run relevant tests and report compatibility notes.

### Task 4: Scene, entry, export and whole-flow verification
Files: web/traffic-island-scene.js; web/traffic-island.js; web/traffic-island.html; tests/browser checks; README.md; standalone.
- [ ] Integrate complete live summary/default live view, dynamic island/camera fitting, labels/picking and below-vehicle traffic ribbons.
- [ ] Run full Node/Python suites, fix regressions and regenerate standalone.
- [ ] Verify actual live fetch plus deterministic fixture, road click/detail/color/missing/stale, four missing roads, desktop and phone layouts; inspect screenshots.
- [ ] Independent review; fix material findings; update README and deliver local preview with exact limitations.
