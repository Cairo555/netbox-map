# Connected floorplan walls (experimental fork feature)

This branch extends NetBox Map 0.12.0's existing floorplan visualization and
uses **ordinary FloorPlanTile records**. No database migration is required.

## Editing a floorplan

1. Open a floorplan in **Edit Mode**.
2. Select **Draw Walls**. The regular double-click/drag-to-move behavior is
   suspended while this tool is active.
3. Click and drag to draw a horizontal or vertical wall. The dominant mouse
   direction determines the axis; the path snaps to grid cells.
4. Release to stage that segment. Drag from its last endpoint to continue,
   or start elsewhere for a separate line.
5. Repeat, then click **Confirm** to save the entire drawing.

- **Undo** (or Ctrl/Cmd+Z) removes the last staged segment.
- **Cancel** (or Escape) discards *unsaved* segments.
- Green overlay = staged wall cells, blue = current drag preview,
  red = conflicting cells.
- Existing walls are reused at T-junctions/intersections. No duplicate records
  are created at shared coordinates.
- Racks, devices and other non-wall tiles remain protected from overlap,
  **even if hidden** in the floorplan sidebar.
- Long lines are split into rectangles of at most 10 cells to respect
  FloorPlanTile's field validators.

A single **Confirm** click posts the required wall tiles through the existing
NetBox Map REST API. It is **not a server-side atomic transaction**: if the
network or API fails partway through, previously saved walls remain saved and
clicking Confirm again skips those cells. Verify the result after an error.

If you want walls without text, leave the regular **Label** input blank.
This branch also corrects the floorplan serializer so that clearing an existing
wall's label persists visually after a page reload.

## Tests

Pure JavaScript geometry and syntax checks run in GitHub Actions:

```bash
node --test tests_js/floorplan_wall_planner.test.cjs
node --check netbox_map/static/netbox_map/js/floorplan_wall_drawing.js
```

A Django regression test for clearing wall labels was also added to
`netbox_map/tests/test_models.py`. It requires a running NetBox test
environment and is not exercised by the JavaScript-only CI job.

## Deploying to NetBox Docker

Use the **tested commit SHA**, not an unpinned moving branch, for repeatable
builds. The repository must be public or otherwise accessible from the build.

In `~/netbox-docker/plugin_requirements.txt`, replace only the
`netbox-map` line with:

```text
netbox-map @ https://github.com/Cairo555/netbox-map/archive/<tested-commit-sha>.zip
```

Preserve the other plugins and the existing configuration in
`configuration/plugins.py`. Make sure your custom image installs
`plugin_requirements.txt` and runs `collectstatic` after plugin
installation; NetBox Map ships JavaScript/CSS needed by the floorplan editor.

With a rollback snapshot available:

```bash
cd ~/netbox-docker
docker compose config --quiet
docker compose build --no-cache netbox
docker compose up -d --no-deps --force-recreate netbox netbox-worker netbox-housekeeping
docker compose ps
```

If you upgrade from upstream `netbox-map==0.12.0`, no data migration is
intended. Do not run `docker compose down -v` or delete existing volumes.

## Scope and limitations

This first version draws **grid-aligned, axis-orthogonal walls**, not freehand
vector lines. A crossing reuses wall cells rather than stacking objects on the
same database position (which is disallowed by the upstream uniqueness
constraint). The drawing is staged on the client; only Confirm writes data.

Before production rollout, test editing, saving, refresh, T-junctions, Cancel,
Undo and browser interactions on a disposable floorplan in your environment.
