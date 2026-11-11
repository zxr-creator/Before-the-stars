// The per-draw description both orrery renderers consume, and their common interface.
import type { BodyId } from './astro';
import type { Cam, SceneLayout, Vec3 } from './layout';

export interface BodyDraw {
  id: BodyId;
  pos: Vec3;
  /** Drawn radius in scene units (after the on-screen minimum). */
  r: number;
  /** Drawn radius in CSS pixels. */
  px: number;
  alpha: number;
}

export interface RingDraw {
  key: string;
  center: Vec3;
  r: number;
  alpha: number;
  color: string;
  dashed: boolean;
}

export interface ArcDraw {
  key: string;
  from: Vec3;
  to: Vec3;
  progress: number;
  color: string;
}

export interface Frame {
  layout: SceneLayout;
  cam: Cam;
  target: Vec3;
  bodies: BodyDraw[];
  rings: RingDraw[];
  arcs: ArcDraw[];
  /** Heliocentric orbit lines. */
  orbitAlpha: number;
  /** The orbit to emphasise (the followed body's). */
  focusOrbit: BodyId | null;
  beltAlpha: number;
  /** Logarithmic distance rings of the flat chart. */
  scaleAlpha: number;
  /** Turn of the home globe about its axis (3D), radians. */
  earthSpin: number;
  /** Longitude and latitude facing the viewer on the flat chart's home globe (radians). */
  earthFace: [number, number];
}

export interface OrreryRenderer {
  readonly kind: '3d' | 'flat';
  /** Canvas size in CSS pixels and the screen point the target is drawn at. */
  resize(w: number, h: number, cx: number, cy: number): void;
  setEarthTexture(tex: HTMLCanvasElement): void;
  /** Place the camera; `project` and `uppAt` follow it. */
  setCamera(cam: Cam, target: Vec3): void;
  /** Scene units per CSS pixel at a point. */
  uppAt(p: Vec3): number;
  /** Screen position of a scene point and whether it is in front of the camera. */
  project(p: Vec3): [number, number, boolean];
  draw(f: Frame): void;
  lastDrawMs: number;
  destroy(): void;
}
