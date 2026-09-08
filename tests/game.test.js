import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { SnakeGame, segmentDistance, DIFFICULTIES } from '../src/game.js';

test('flies straight without gravity and respects elapsed time', () => {
  const g = new SnakeGame(); g.berries = [new Vector3(45, 45, 45)];
  g.step(1);
  assert.ok(Math.abs(g.position.z - 17) < 1e-8);
  assert.equal(g.position.y, 0); assert.equal(g.position.x, 0);
  assert.ok(g.alive);
});

test('all four controls turn in their intended direction', () => {
  for (const [input, axis, sign] of [[{ x: 1, y: 0 }, 'x', 1], [{ x: -1, y: 0 }, 'x', -1], [{ x: 0, y: -1 }, 'y', 1], [{ x: 0, y: 1 }, 'y', -1]]) {
    const g = new SnakeGame(); g.step(0.3, input);
    assert.ok(g.position[axis] * sign > 0);
    const orientation = g.orientation.clone(); g.step(0.2);
    assert.ok(orientation.angleTo(g.orientation) < 1e-7, 'release preserves heading');
  }
});

test('pitch can pass vertical and continue through a loop', () => {
  const g = new SnakeGame('drift'); g.berries = [new Vector3(45, 45, 45)];
  for (let i = 0; i < 126; i++) g.step(1 / 60, { x: 0, y: -1 });
  const forward = new Vector3(0, 0, -1).applyQuaternion(g.orientation);
  assert.ok(g.alive); assert.ok(forward.z > 0.99);
});

test('swept berry collection grows tail, replaces berry, and awards difficulty points', () => {
  for (const [id, config] of Object.entries(DIFFICULTIES)) {
    const g = new SnakeGame(id); g.berries[0].copy(g.position).add(new Vector3(0, 0, -3));
    const count = g.berries.length; const events = g.step(0.25);
    assert.ok(events.includes('berry')); assert.equal(g.collected, 1);
    assert.equal(g.score, config.points); assert.equal(g.length, 8 + config.growth); assert.equal(g.berries.length, count);
  }
});

test('berries collect from an arbitrary flight angle', () => {
  const g = new SnakeGame(); g.orientation.setFromAxisAngle(new Vector3(1, 1, 0).normalize(), 1.1);
  g.berries[0].copy(g.position).add(new Vector3(0, 0, -3).applyQuaternion(g.orientation));
  g.step(0.2); assert.equal(g.collected, 1);
});

test('five berries advance a stage and increase scoring and speed', () => {
  const g = new SnakeGame();
  for (let i = 0; i < 5; i++) { g.berries[0].copy(g.position); g.step(1 / 60); }
  assert.equal(g.collected, 5); assert.equal(g.level, 2); assert.equal(g.score, 5 * 175);
  assert.equal(g.speed, 13 * 1.06);
  g.berries[0].copy(g.position); g.step(1 / 60); assert.equal(g.score, 7 * 175);
});

test('wall collision ends run and freezes movement', () => {
  const g = new SnakeGame(); g.position.z = -59; g.path = [g.position.clone()];
  assert.ok(g.step(1).includes('crash')); assert.equal(g.alive, false); assert.match(g.reason, /edge/);
  const position = g.position.clone(); g.step(1); assert.ok(g.position.equals(position));
});

test('swept collision detects crossing the tail between samples', () => {
  const g = new SnakeGame();
  g.path = Array.from({ length: 10 }, (_, i) => new Vector3(0, 0, 30 + i));
  g.path.push(new Vector3(-2, 0, 28), new Vector3(2, 0, 28));
  assert.ok(g.step(0.2).includes('crash')); assert.match(g.reason, /trail/);
});

test('neck is excluded and diagonal input has bounded turn rate', () => {
  const a = new SnakeGame(), b = new SnakeGame();
  a.step(1 / 120, { x: 1, y: 0 }); b.step(1 / 120, { x: 1, y: 1 });
  assert.ok(a.alive && b.alive);
  assert.ok(Math.abs(a.orientation.angleTo(new Quaternion()) - b.orientation.angleTo(new Quaternion())) < 0.00001);
});

test('segment distance handles crossing, parallel and degenerate segments', () => {
  const v = (x, y, z = 0) => new Vector3(x, y, z);
  assert.equal(segmentDistance(v(-1, 0), v(1, 0), v(0, -1), v(0, 1)), 0);
  assert.equal(segmentDistance(v(0, 0), v(1, 0), v(0, 2), v(1, 2)), 2);
  assert.equal(segmentDistance(v(0, 0), v(0, 0), v(3, 4), v(3, 4)), 5);
});

test('spawned berries stay away from walls, head and tail', () => {
  const g = new SnakeGame();
  for (let i = 0; i < 50; i++) {
    const p = g.spawnBerry();
    assert.ok(Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 51);
    assert.ok(p.distanceTo(g.position) >= 10); assert.ok(g.path.every(v => v.distanceTo(p) >= 4));
  }
});

test('speed is frame-rate independent and pace is applied', () => {
  const a = new SnakeGame('classic', 0.8), b = new SnakeGame('classic', 0.8);
  for (let i = 0; i < 60; i++) a.step(1 / 60, { x: 0.2, y: -0.1 });
  for (let i = 0; i < 30; i++) b.step(1 / 30, { x: 0.2, y: -0.1 });
  assert.ok(a.position.distanceTo(b.position) < 1e-8); assert.equal(a.speed, 10.4);
});
