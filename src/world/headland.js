// The headland by day: the places (one file each in places/), walking out of doors, and the afternoon.
// You walk on the bay's own ground mesh, can't wade in below the tide line or climb anything steeper
// than a bank, and slide along walls and slopes rather than stopping dead. Walking into a place's
// trigger starts its afternoon. The clock runs from two o'clock to seven; far from the tower and the
// places it runs on, and so do you (the same time-lapse as the night in the chair).
import * as THREE from 'three';
import { toWorld, TOWER, UNIT } from './geo.js';
import { ROOM } from './room.js';
import { laneDist, routeTo } from './lane.js';
import { smooth } from '../render/paint.js';
import * as lighthouse from './places/lighthouse.js';
import * as cliff from './places/cliff.js';
import * as village from './places/village.js';
import * as harbour from './places/harbour.js';
import * as cottages from './places/cottages.js';
import * as school from './places/school.js';

export const PLACE_LIST = [lighthouse, cliff, village, harbour, cottages, school];
// the afternoon: hours, and how fast it goes (0.6 game minutes a second at a walk)
export const DAY = { from: 14, to: 19, rate: 0.6 / 60, dusk: 17.5 };
const DEG = Math.PI / 180;
const TOWER_R = ROOM.R + ROOM.wall;         // the outside of the tower wall
const MAX_SLOPE = 0.9, PACE_MAX = 5;

export class Headland {
  constructor(keeper) {
    this.k = keeper;
    this.bay = keeper.bay;
    this.group = new THREE.Group();
    this.group.name = 'places';
    this.solids = [...this.bay.solids];
    const bay = this.bay;
    const scene = {
      group: this.group,
      at: (x, y, up = 0) => { const v = toWorld(x, y); v.y = bay.groundAt(v.x, v.z) + up; return v; },
      solid: (p, r) => this.solids.push([p.x, p.z, r]),
    };
    this.places = PLACE_LIST.map((P) => {
      P.build(scene);
      const c = toWorld(...P.trigger.at);
      return { P, id: P.id, c, r: P.trigger.r, inside: false };
    });
    this.group.visible = false;
    this.hour = DAY.from;
    this.pace = 1;
  }

  place(id) { return this.places.find((p) => p.id === id); }

  // by day, every frame: a place file may export update(dt, ctx) for whatever moves there (people, a
  // bell). ctx is { night, eye (the camera, world), reading (the keeper's panel, or null), audio }.
  update(dt, ctx) {
    for (const pl of this.places) pl.P.update?.(dt, ctx);
  }

  // ---------------- where you can stand ----------------
  ground(x, z) {
    return this.insideTower(x, z) ? this.k.roomFloor(x, z) : Math.max(this.bay.groundAt(x, z), this.bay.tide + 0.3);
  }

  insideTower(x, z) { return Math.hypot(x - TOWER.x, z - TOWER.z) < TOWER_R - 0.05; }

  // the doorway as a corridor through the wall: along = metres out from the centre, side = metres across
  doorway(p) {
    const l = p.clone().applyMatrix4(this.k.roomInv);
    const a = ROOM.door.deg * DEG;
    return { l, along: l.x * Math.sin(a) - l.z * Math.cos(a), side: l.x * Math.cos(a) + l.z * Math.sin(a) };
  }

  // next: where the walker wants to be (corrected in place); prev: where it is now
  collide(next, prev) {
    const k = this.k, D = ROOM.door;
    // up the tower, out of the day's way
    if (k.up) { k.collideRoom(next); return next; }
    const open = k.doorOpen();
    const dw = this.doorway(next);
    const r = Math.hypot(next.x - TOWER.x, next.z - TOWER.z);
    const inGap = open && Math.abs(dw.side) < D.half - 0.12 && dw.along > ROOM.R - 0.7 && r < TOWER_R + 0.45;
    if (inGap) {
      // through the doorway: held between its jambs
      const lim = D.half - 0.2;
      if (Math.abs(dw.side) > lim) {
        const a = D.deg * DEG, s = Math.sign(dw.side) * lim;
        dw.l.x = Math.sin(a) * dw.along + Math.cos(a) * s;
        dw.l.z = -Math.cos(a) * dw.along + Math.sin(a) * s;
        next.copy(dw.l.applyMatrix4(k.room.group.matrixWorld));
      }
      next.y = prev.y;
      return next;
    }
    if (this.insideTower(prev.x, prev.z)) { k.collideRoom(next); return next; }
    // out of doors: round the tower wall, the houses, the places
    const out = (cx, cz, rr) => {
      const dx = next.x - cx, dz = next.z - cz, d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-6) { next.x = cx + dx / d * rr; next.z = cz + dz / d * rr; }
    };
    out(TOWER.x, TOWER.z, TOWER_R + 0.25);
    for (const [x, z, rr] of this.solids) out(x, z, rr + 0.25);
    // the ground: not down into the sea, not up anything too steep; slide along x or z if one will do
    if (!this.footing(prev, next)) {
      const tryX = prev.clone().setX(next.x), tryZ = prev.clone().setZ(next.z);
      if (this.footing(prev, tryX)) next.copy(tryX);
      else if (this.footing(prev, tryZ)) next.copy(tryZ);
      else next.copy(prev);
    }
    return next;
  }

  footing(a, b) {
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (run < 1e-6) return true;
    const bay = this.bay, hb = bay.groundAt(b.x, b.z);
    if (hb < bay.tide + 0.3) return false;
    const ha = this.insideTower(a.x, a.z) ? TOWER.y : bay.groundAt(a.x, a.z);
    return (hb - ha) / run < MAX_SLOPE;
  }

  // what's underfoot, for the footsteps
  surface(p) {
    if (this.insideTower(p.x, p.z)) return 'wood';
    const r = Math.hypot(p.x - TOWER.x, p.z - TOWER.z);
    if (r < TOWER_R + 1.2) return 'stone';
    const x = p.x / UNIT, y = p.z / UNIT;
    if (laneDist(x, y) < 0.9) return 'gravel';
    if (x > 84 && y > -3 && y < 6) return 'stone';     // the slip and the harbour wall
    return 'grass';
  }

  // ---------------- triggers ----------------
  // the place whose trigger was walked into this frame (an edge, not a level), or null
  triggers(p) {
    let hit = null;
    for (const pl of this.places) {
      const inside = Math.hypot(p.x - pl.c.x, p.z - pl.c.z) < pl.r;
      if (inside && !pl.inside) hit = pl;
      pl.inside = inside;
    }
    return hit;
  }

  resetTriggers(p) { for (const pl of this.places) pl.inside = !!p && Math.hypot(p.x - pl.c.x, p.z - pl.c.z) < pl.r; }

  // ---------------- the afternoon ----------------
  // the time-lapse pace, from how far you are from the tower and the nearest place
  updatePace(p, dt) {
    let near = this.insideTower(p.x, p.z) ? 0 : Math.hypot(p.x - TOWER.x, p.z - TOWER.z) - TOWER_R;
    for (const pl of this.places) near = Math.min(near, Math.hypot(p.x - pl.c.x, p.z - pl.c.z) - pl.r);
    const want = 1 + (PACE_MAX - 1) * smooth(18, 48, near);
    this.pace += (want - this.pace) * Math.min(1, dt * 1.2);
    return this.pace;
  }

  // the sun's way across the afternoon: south-west and high at two, down to the dusk sun at seven
  sunDir(hour, duskSun) {
    const f = smooth(DAY.from, DAY.to, hour);
    const el = 40 * DEG, high = new THREE.Vector3(-Math.cos(el) * 0.707, Math.sin(el), Math.cos(el) * 0.707);
    return high.lerp(duskSun, f).normalize();
  }

  // autoplay: the way from where you stand to a place, as world points on the ground
  route(from, id) {
    const pl = this.place(id);
    if (!pl) return [];
    const ap = pl.P.approach;
    const pts = routeTo(from.x / UNIT, from.z / UNIT, ap.lane, ap.spur).map(([x, y]) => toWorld(x, y));
    pts.push(pl.c.clone());
    return pts;
  }
}
