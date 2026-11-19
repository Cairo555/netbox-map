// Smoke-test Canvas drawing without a browser.
// node --test tests_js/floorplan_wall_renderer.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,
    '../netbox_map/static/netbox_map/js/floorplan_renderer.js'), 'utf8');
const sandbox = { window: { FloorplanApp: {} } };
vm.runInNewContext(source, sandbox, { filename: 'floorplan_renderer.js' });

function fakeRenderer() {
    const Renderer = sandbox.window.FloorplanApp.Renderer;
    const renderer = Object.create(Renderer.prototype);
    const fills = [];
    renderer.state = {
        zoom: 1, tileSize: 20, gridWidth: 20, gridHeight: 20,
        wallDrawingOverlay: {
            cells: [{ x: 2, y: 3 }, { x: 3, y: 3 }],
            preview: [{ x: 4, y: 3 }, { x: 5, y: 3 }],
            blocked: []
        }
    };
    renderer.ctx = {
        fillStyle: '',
        save() {},
        restore() {},
        fillRect(x, y, w, h) { fills.push({ x, y, w, h, color: this.fillStyle }); }
    };
    renderer._getTileFillColor = () => '#5c5c6e';
    return { renderer, fills };
}

test('pending cells and active drag render as the final solid wall color', () => {
    const { renderer, fills } = fakeRenderer();
    renderer.drawWallOverlay();
    assert.equal(fills.length, 4);
    assert.ok(fills.every(fill => fill.color === '#5c5c6e'));
});

test('existing wall tiles and live preview overlap by a pixel instead of leaving seams', () => {
    const { renderer, fills } = fakeRenderer();
    renderer._fillWallRect(10, 10, 20, 20, '#5c5c6e');
    renderer._fillWallRect(30, 10, 20, 20, '#5c5c6e');
    assert.ok(fills[0].x + fills[0].w > fills[1].x);
});

test('preview highlights blocking cells in red while preserving the wall itself', () => {
    const { renderer, fills } = fakeRenderer();
    renderer.state.wallDrawingOverlay.blocked = [{ x: 5, y: 3 }];
    renderer.drawWallOverlay();
    assert.equal(fills.length, 5);
    assert.ok(fills[4].color.startsWith('rgba(239, 68, 68'));
    assert.equal(fills[0].color, '#5c5c6e');
});
