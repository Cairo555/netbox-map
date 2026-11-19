/**
 * Grid-based wall planner shared by the interactive floor plan editor.
 * No database changes: contiguous wall cells become ordinary FloorPlanTile
 * rectangles (up to the model's 10-cell maximum). Existing wall cells are
 * reused at T-junctions/crossings, never duplicated.
 */
(function(root, factory) {
    'use strict';
    var planner = factory();
    if (typeof module === 'object' && module.exports) module.exports = planner;
    if (root) root.FloorplanWallPlanner = planner;
})(typeof window !== 'undefined' ? window : null, function() {
    'use strict';

    function key(x, y) { return x + ',' + y; }

    // The drawing tool is orthogonal: dominant mouse axis determines direction.
    function lineCells(from, to) {
        var dx = to.x - from.x;
        var dy = to.y - from.y;
        var horizontal = Math.abs(dx) >= Math.abs(dy);
        var steps = horizontal ? Math.abs(dx) : Math.abs(dy);
        var direction = (horizontal ? dx : dy) >= 0 ? 1 : -1;
        var cells = [];
        for (var n = 0; n <= steps; n++) {
            cells.push({
                x: from.x + (horizontal ? direction * n : 0),
                y: from.y + (horizontal ? 0 : direction * n)
            });
        }
        return cells;
    }

    function occupiedCells(tiles) {
        var walls = new Set();
        var blocked = new Set();
        tiles.forEach(function(tile) {
            for (var x = tile.x; x < tile.x + tile.w; x++) {
                for (var y = tile.y; y < tile.y + tile.h; y++) {
                    (tile.type === 'wall' ? walls : blocked).add(key(x, y));
                }
            }
        });
        return { walls: walls, blocked: blocked };
    }

    function buildPlan(strokes, tiles, width, height) {
        var occupied = occupiedCells(tiles);
        var conflicts = [];
        var allCells = [];
        strokes.forEach(function(stroke) {
            var cells = lineCells(stroke.from, stroke.to);
            allCells.push(cells);
            cells.forEach(function(cell) {
                var k = key(cell.x, cell.y);
                if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height ||
                    occupied.blocked.has(k)) {
                    conflicts.push(cell);
                }
            });
        });
        if (conflicts.length) {
            return { rectangles: [], cells: [], conflicts: conflicts };
        }

        var seen = new Set();
        var rectangles = [];
        var newCells = [];
        allCells.forEach(function(cells) {
            var run = [];
            var horizontal = cells.length < 2 || cells[0].y === cells[1].y;

            function flush() {
                if (!run.length) return;
                var minX = Math.min.apply(null, run.map(function(c) { return c.x; }));
                var minY = Math.min.apply(null, run.map(function(c) { return c.y; }));
                rectangles.push({
                    x_position: minX,
                    y_position: minY,
                    width: horizontal ? run.length : 1,
                    height: horizontal ? 1 : run.length
                });
                run = [];
            }

            cells.forEach(function(cell) {
                var k = key(cell.x, cell.y);
                if (occupied.walls.has(k) || seen.has(k)) {
                    flush(); // Break runs at intersections to avoid overlapping.
                    return;
                }
                if (run.length === 10) flush(); // Django model max width/height=10.
                seen.add(k);
                run.push(cell);
                newCells.push(cell);
            });
            flush();
        });
        return { rectangles: rectangles, cells: newCells, conflicts: [] };
    }

    return { lineCells: lineCells, occupiedCells: occupiedCells, buildPlan: buildPlan };
});
