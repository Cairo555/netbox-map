// Run with: node --test tests_js/floorplan_wall_planner.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const planner = require('../netbox_map/static/netbox_map/js/floorplan_wall_planner.js');

const wall = (x, y, w = 1, h = 1) => ({ x, y, w, h, type: 'wall' });
const rack = (x, y, w = 1, h = 1) => ({ x, y, w, h, type: 'rack' });
const stroke = (x1, y1, x2, y2) =>
    ({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });

test('orthogonal drag snaps to dominant axis, including reverse direction', () => {
    assert.deepEqual(planner.lineCells({ x: 2, y: 3 }, { x: 6, y: 4 }), [
        { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 },
        { x: 5, y: 3 }, { x: 6, y: 3 }
    ]);
    assert.deepEqual(planner.lineCells({ x: 3, y: 4 }, { x: 3, y: 2 }), [
        { x: 3, y: 4 }, { x: 3, y: 3 }, { x: 3, y: 2 }
    ]);
});

test('long walls are split into maximum ten-cell rectangles', () => {
    const result = planner.buildPlan([stroke(1, 1, 25, 1)], [], 30, 30);
    assert.deepEqual(result.rectangles, [
        { x_position: 1, y_position: 1, width: 10, height: 1 },
        { x_position: 11, y_position: 1, width: 10, height: 1 },
        { x_position: 21, y_position: 1, width: 5, height: 1 }
    ]);
    assert.equal(result.cells.length, 25);
});

test('T-junctions reuse a shared cell instead of creating duplicates', () => {
    const result = planner.buildPlan([
        stroke(0, 3, 6, 3),
        stroke(3, 3, 3, 7)
    ], [], 20, 20);
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.cells.length, 11);
    assert.equal(result.rectangles.reduce((sum, r) => sum + r.width * r.height, 0), 11);
});

test('walls can extend across existing wall areas without duplicate tiles', () => {
    const result = planner.buildPlan([stroke(0, 2, 6, 2)],
        [wall(2, 2, 3, 1)], 20, 20);
    assert.deepEqual(result.rectangles, [
        { x_position: 0, y_position: 2, width: 2, height: 1 },
        { x_position: 5, y_position: 2, width: 2, height: 1 }
    ]);
});

test('solid tiles block walls, even when hidden by UI filters', () => {
    const result = planner.buildPlan([stroke(1, 1, 8, 1)],
        [rack(3, 1, 2, 2)], 20, 20);
    assert.equal(result.rectangles.length, 0);
    assert.deepEqual(result.conflicts, [{ x: 3, y: 1 }, { x: 4, y: 1 }]);
});

test('out-of-grid segments are rejected without creating partial tiles', () => {
    const result = planner.buildPlan([stroke(2, 2, 12, 2)], [], 10, 10);
    assert.equal(result.rectangles.length, 0);
    assert.equal(result.conflicts.length, 3);
});

test('retry after partial save excludes already-created wall rectangles', () => {
    const strokes = [stroke(0, 0, 4, 0)];
    const first = planner.buildPlan(strokes, [], 20, 20);
    assert.equal(first.rectangles.length, 1);
    const retry = planner.buildPlan(strokes, [wall(0, 0, 5, 1)], 20, 20);
    assert.deepEqual(retry.rectangles, []);
});

test('segments in reverse direction normalize rectangle start coordinates', () => {
    const result = planner.buildPlan([stroke(6, 5, 2, 5)], [], 20, 20);
    assert.deepEqual(result.rectangles, [
        { x_position: 2, y_position: 5, width: 5, height: 1 }
    ]);
});

test('drag endpoint snaps onto a wall cell one grid cell away', () => {
    const existing = [wall(8, 3, 2, 1)];
    assert.deepEqual(
        planner.snapToWall({ x: 7, y: 3 }, { x: 1, y: 3 }, existing),
        { x: 8, y: 3 }
    );
    const end = planner.snapToWall({ x: 7, y: 3 }, { x: 1, y: 3 }, existing);
    const result = planner.buildPlan([{
        from: { x: 1, y: 3 }, to: end
    }], existing, 20, 20);
    assert.deepEqual(result.rectangles, [
        { x_position: 1, y_position: 3, width: 7, height: 1 }
    ]);
});

test('a new drag can start on a nearby existing wall without leaving a gap', () => {
    const existing = [wall(2, 4, 3, 1)];
    const start = planner.snapStart({ x: 5, y: 4 }, existing);
    assert.deepEqual(start, { x: 4, y: 4 });
    const result = planner.buildPlan([{
        from: start, to: { x: 8, y: 4 }
    }], existing, 20, 20);
    assert.deepEqual(result.rectangles, [
        { x_position: 5, y_position: 4, width: 4, height: 1 }
    ]);
});

test('snapping does not jump diagonally or over an unrelated row', () => {
    assert.deepEqual(
        planner.snapToWall({ x: 7, y: 3 }, { x: 1, y: 3 },
            [wall(8, 4)], 1),
        { x: 7, y: 3 }
    );
    assert.deepEqual(
        planner.snapStart({ x: 7, y: 3 }, [wall(8, 4)], 1),
        { x: 7, y: 3 }
    );
});

test('snapping beyond one cell is not allowed (intentional door openings)', () => {
    const tiles = [wall(10, 2, 1, 1)];
    assert.deepEqual(
        planner.snapToWall({ x: 8, y: 2 }, { x: 2, y: 2 }, tiles),
        { x: 8, y: 2 }
    );
});
