import { Vector3, Quaternion } from 'three';

export const DIFFICULTIES = {
  drift: { name: 'Drift', subtitle: 'Find your flow', description: 'A little space to breathe. Slow flight, gentle growth.', speed: 9, growth: 3, berries: 14, points: 100, turn: 1.5, tag: 'RELAXED', index: 1 },
  classic: { name: 'Classic', subtitle: 'The sweet spot', description: 'Keep your cool as the chase picks up.', speed: 13, growth: 5, berries: 12, points: 175, turn: 1.65, tag: 'BALANCED', index: 2 },
  surge: { name: 'Surge', subtitle: 'Trust your instincts', description: 'More speed. More snake. Less room for error.', speed: 18, growth: 7, berries: 10, points: 275, turn: 1.8, tag: 'CHALLENGING', index: 3 },
  void: { name: 'Void', subtitle: 'Enter at your own risk', description: 'Fast flight and relentless growth. Go all in.', speed: 23, growth: 10, berries: 8, points: 400, turn: 1.95, tag: 'EXPERT', index: 4 },
};

// Minimum distance between two finite segments, including parallel segments.
export function segmentDistance(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  const clamp = n => Math.max(0, Math.min(1, n));
  if (a <= 1e-9 && e <= 1e-9) return p1.distanceTo(p2);
  if (a <= 1e-9) t = clamp(f / e);
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) s = clamp(-c / a);
    else {
      const b = d1.dot(d2), denom = a * e - b * b;
      if (denom !== 0) s = clamp((b * f - c * e) / denom);
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}

export class SnakeGame {
  constructor(difficulty = 'classic', pace = 1, random = Math.random) {
    this.difficulty = difficulty;
    this.config = DIFFICULTIES[difficulty];
    this.pace = pace;
    this.random = random;
    this.halfSize = 60;
    this.position = new Vector3(0, 0, 30);
    this.orientation = new Quaternion();
    this.path = Array.from({ length: 17 }, (_, i) => new Vector3(0, 0, 30 + i * 0.5));
    this.length = 8;
    this.score = 0;
    this.collected = 0;
    this.level = 1;
    this.elapsed = 0;
    this.alive = true;
    this.reason = '';
    this.berries = [new Vector3(0, 0, 12), new Vector3(7, 3, -6), new Vector3(-9, -4, -20)];
    while (this.berries.length < this.config.berries) this.berries.push(this.spawnBerry());
  }

  get speed() { return this.config.speed * this.pace * (1 + Math.min(9, this.level - 1) * 0.06); }

  spawnBerry() {
    let point;
    for (let attempt = 0; attempt < 200; attempt++) {
      point = new Vector3(...Array.from({ length: 3 }, () => (this.random() - 0.5) * 102));
      if (point.distanceTo(this.position) < 10 || this.berries.some(b => b.distanceTo(point) < 7)) continue;
      if (this.path.some(p => p.distanceTo(point) < 4)) continue;
      return point;
    }
    // A crowded arena still gets a collectible; choose the safest sampled point.
    let best = point, clearance = -1;
    for (let i = 0; i < 100; i++) {
      point = new Vector3(...Array.from({ length: 3 }, () => (this.random() - 0.5) * 102));
      const gap = Math.min(...this.path.map(p => p.distanceToSquared(point)));
      if (gap > clearance) { clearance = gap; best = point; }
    }
    return best;
  }

  step(dt, input = { x: 0, y: 0 }, sensitivity = 1) {
    if (!this.alive) return [];
    const events = [];
    // Substeps keep motion, collection and collisions stable after slow frames.
    const count = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < count && this.alive; i++) {
      const delta = dt / count;
      this.elapsed += delta;
      const turn = this.config.turn * sensitivity * delta;
      const magnitude = Math.max(1, Math.hypot(input.x, input.y));
      this.orientation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -input.x / magnitude * turn));
      this.orientation.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -input.y / magnitude * turn));
      this.orientation.normalize();
      const before = this.position.clone();
      const forward = new Vector3(0, 0, -1).applyQuaternion(this.orientation);
      this.position.addScaledVector(forward, this.speed * delta);
      if (Math.max(Math.abs(this.position.x), Math.abs(this.position.y), Math.abs(this.position.z)) > this.halfSize - 0.6) {
        this.alive = false; this.reason = 'You reached the edge of the arena.';
      }
      // Ignore the neck, which is necessarily connected to the head.
      for (let j = 10; j < this.path.length - 1 && this.alive; j++) {
        if (segmentDistance(before, this.position, this.path[j], this.path[j + 1]) < 1.05) {
          this.alive = false; this.reason = 'You crossed your own trail.';
        }
      }
      if (!this.alive) { events.push('crash'); break; }
      for (let b = 0; b < this.berries.length; b++) {
        if (segmentDistance(before, this.position, this.berries[b], this.berries[b]) < 2.15) {
          this.collected++;
          this.score += this.config.points * this.level;
          this.length += this.config.growth;
          const nextLevel = 1 + Math.floor(this.collected / 5);
          if (nextLevel !== this.level) { this.level = nextLevel; events.push('level'); }
          this.berries[b] = this.spawnBerry();
          events.push('berry');
        }
      }
      if (this.position.distanceTo(this.path[0]) >= 0.5) this.path.unshift(this.position.clone());
      this.path.length = Math.min(this.path.length, Math.ceil(this.length / 0.5) + 1);
    }
    return events;
  }
}
