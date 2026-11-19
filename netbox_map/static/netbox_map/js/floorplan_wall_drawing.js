/**
 * Optional connected wall drawing tool for FloorPlan edit mode.
 * Draw multiple straight segments, then Confirm once to persist ordinary
 * wall tiles through the existing API. Escape/Cancel discards unsaved lines.
 */
(function(App, Planner) {
    'use strict';

    var viewer = window.floorplanViewer;
    var toggle = document.getElementById('fp-wall-draw-toggle');
    var tools = document.getElementById('fp-wall-tools');
    var confirmBtn = document.getElementById('fp-wall-confirm');
    var undoBtn = document.getElementById('fp-wall-undo');
    var cancelBtn = document.getElementById('fp-wall-cancel');
    var status = document.getElementById('fp-wall-status');
    if (!App || !Planner || !viewer || !viewer.state.editMode || !toggle) return;

    var state = viewer.state;
    var canvas = viewer.canvas;
    var events = viewer.events;
    var strokes = [];
    var drawing = false;
    var saving = false;
    var from = null;
    var to = null;
    var lastEnd = null;

    function gridPoint(e) {
        var bounds = canvas.getBoundingClientRect();
        var world = viewer.screenToWorld(e.clientX - bounds.left, e.clientY - bounds.top);
        return { x: Math.floor(world.x / state.tileSize), y: Math.floor(world.y / state.tileSize) };
    }

    function clamp(point) {
        return {
            x: Math.min(state.gridWidth - 1, Math.max(0, point.x)),
            y: Math.min(state.gridHeight - 1, Math.max(0, point.y))
        };
    }

    function inBounds(point) {
        return point.x >= 0 && point.y >= 0 &&
            point.x < state.gridWidth && point.y < state.gridHeight;
    }

    function updateOverlay(message) {
        var pending = Planner.buildPlan(strokes, state.tiles, state.gridWidth, state.gridHeight);
        var preview = drawing && from && to ? Planner.lineCells(from, to) : [];
        var blocked = pending.conflicts.slice();
        var occupied = Planner.occupiedCells(state.tiles);
        preview.forEach(function(cell) {
            if (!inBounds(cell) || occupied.blocked.has(cell.x + ',' + cell.y)) blocked.push(cell);
        });
        state.wallDrawingOverlay = state.wallDrawingMode ? {
            cells: pending.cells, preview: preview, blocked: blocked
        } : null;
        events.emit('render');

        if (tools) tools.classList.toggle('d-none', !state.wallDrawingMode);
        toggle.classList.toggle('active', !!state.wallDrawingMode);
        toggle.setAttribute('aria-pressed', state.wallDrawingMode ? 'true' : 'false');
        toggle.disabled = saving;
        if (confirmBtn) confirmBtn.disabled = saving || !strokes.length || !!pending.conflicts.length;
        if (undoBtn) undoBtn.disabled = saving || !strokes.length;
        if (cancelBtn) cancelBtn.disabled = saving;
        if (status) {
            status.textContent = message ||
                (pending.conflicts.length
                    ? 'A wall overlaps another object. Undo the last segment.'
                    : strokes.length + ' segment(s) queued, ' + pending.rectangles.length +
                      ' tile(s) to save. Drag from the last endpoint to continue.');
        }
    }

    function stopMode(clearStrokes) {
        state.wallDrawingMode = false;
        drawing = false;
        from = null;
        to = null;
        canvas.style.cursor = '';
        if (clearStrokes) {
            strokes = [];
            lastEnd = null;
        }
        updateOverlay();
    }

    toggle.addEventListener('click', function() {
        if (saving) return;
        if (state.wallDrawingMode) {
            if (strokes.length) {
                if (status) status.textContent = 'Confirm or Cancel your pending walls first.';
                return;
            }
            stopMode(true);
        } else {
            state.wallDrawingMode = true;
            state.visibleTypes.add('wall');
            state.deselectTile();
            canvas.style.cursor = 'crosshair';
            updateOverlay('Click and drag to draw a wall. Release to add a segment.');
        }
    });

    // Capture before regular Interaction handlers; no tile movement or canvas
    // pan should occur when the drawing tool owns the primary mouse button.
    canvas.addEventListener('mousedown', function(e) {
        if (!state.wallDrawingMode || saving || e.button !== 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        var clicked = gridPoint(e);
        if (!inBounds(clicked)) return;
        // Clicking an endpoint again continues the connected wall. Clicking
        // anywhere else starts another chain in the same pending drawing.
        from = lastEnd && Math.abs(clicked.x - lastEnd.x) <= 1 &&
            Math.abs(clicked.y - lastEnd.y) <= 1 ? lastEnd : clicked;
        to = from;
        drawing = true;
        updateOverlay();
    }, true);

    window.addEventListener('mousemove', function(e) {
        if (!state.wallDrawingMode || !drawing) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        to = clamp(gridPoint(e));
        updateOverlay();
    }, true);

    window.addEventListener('mouseup', function(e) {
        if (!state.wallDrawingMode || !drawing || e.button !== 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        drawing = false;
        to = clamp(gridPoint(e));
        var cells = Planner.lineCells(from, to);
        var endpoint = cells[cells.length - 1];
        var candidate = strokes.concat([{ from: from, to: endpoint }]);
        var plan = Planner.buildPlan(candidate, state.tiles, state.gridWidth, state.gridHeight);
        if (plan.conflicts.length) {
            updateOverlay('Cannot draw through a rack, device, or other non-wall tile.');
            return;
        }
        strokes = candidate;
        lastEnd = endpoint;
        updateOverlay();
    }, true);

    canvas.addEventListener('mousemove', function(e) {
        if (!state.wallDrawingMode) return;
        e.stopImmediatePropagation();
        canvas.style.cursor = 'crosshair';
        events.emit('hover', { tile: null, x: 0, y: 0 });
    }, true);

    // Prevent selection and legacy double-click placement during drawing.
    ['click', 'dblclick'].forEach(function(name) {
        canvas.addEventListener(name, function(e) {
            if (!state.wallDrawingMode) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);
    });

    function undo() {
        if (!strokes.length || saving) return;
        strokes.pop();
        lastEnd = strokes.length ? strokes[strokes.length - 1].to : null;
        updateOverlay();
    }

    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (cancelBtn) cancelBtn.addEventListener('click', function() { stopMode(true); });

    document.addEventListener('keydown', function(e) {
        if (!state.wallDrawingMode || saving) return;
        var tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (e.key === 'Escape') {
            e.preventDefault();
            stopMode(true);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo();
        }
    });

    // Save happens only after Confirm. If a request fails, already-created
    // walls stay in the grid; retrying skips them instead of duplicating tiles.
    if (confirmBtn) confirmBtn.addEventListener('click', function() {
        if (saving) return;
        var plan = Planner.buildPlan(strokes, state.tiles, state.gridWidth, state.gridHeight);
        if (plan.conflicts.length) {
            updateOverlay('Remove conflicting segments before saving.');
            return;
        }
        if (!plan.rectangles.length) {
            stopMode(true);
            return;
        }
        saving = true;
        updateOverlay('Saving ' + plan.rectangles.length + ' wall tiles…');
        var api = new App.API(state);
        var labelInput = document.getElementById('tile-label-input');
        var label = labelInput ? labelInput.value.trim() : '';
        var saved = 0;

        var chain = Promise.resolve();
        plan.rectangles.forEach(function(rect) {
            chain = chain.then(function() {
                return api.post(state.apiUrl, {
                    floorplan: state.floorplanId,
                    x_position: rect.x_position,
                    y_position: rect.y_position,
                    width: rect.width,
                    height: rect.height,
                    tile_type: 'wall',
                    label: label,
                    status: 'active',
                    orientation: 0
                }).then(function(tile) {
                    saved++;
                    state.addTile({
                        id: tile.id, x: tile.x_position, y: tile.y_position,
                        w: tile.width, h: tile.height, type: 'wall',
                        label: tile.label || '', status: tile.status,
                        orientation: 0, object_type: null, object_type_model: null,
                        object_name: null, object_id: null, object_url: null,
                        utilization: null, primary_ip: null,
                        linked_floorplan_id: null, linked_floorplan_name: null,
                        linked_floorplan_url: null, fov_direction: 0,
                        fov_angle: 90, fov_distance: 5, drop_port_count: 0
                    });
                });
            });
        });

        chain.then(function() {
            saving = false;
            stopMode(true);
            events.emit('sidebar:rebuild');
            if (status) status.textContent = saved + ' wall tiles saved.';
        }).catch(function(err) {
            saving = false;
            updateOverlay('Saved ' + saved + ' tile(s), but a request failed. Confirm again to retry remaining walls.');
            events.emit('sidebar:rebuild');
            window.alert('Wall save failed: ' + (err.detail ? JSON.stringify(err.detail) : err.message));
        });
    });
})(window.FloorplanApp, window.FloorplanWallPlanner);
