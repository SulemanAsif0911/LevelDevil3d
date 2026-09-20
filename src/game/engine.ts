import * as THREE from 'three';
import type { LevelDef } from './levels';
import { TROLL_QUIPS } from './levels';
import { sound } from './audio';

// Models: art direction + proportions based on Quaternius "Ultimate Platformer Pack"
// via poly.pizza (CC0 Public Domain). Rebuilt here as zero-load procedural
// low-poly meshes (flat-shaded primitives) for instant loading + 60fps.

export interface EngineCallbacks {
  onDeath: (quips: string) => void;
  onCoin: (collected: number, total: number) => void;
  onWin: (stats: { time: number; deaths: number; coins: number; totalCoins: number }) => void;
  onKey: () => void;
  onProgress?: (p: number) => void;
}

interface PlatformRuntime {
  def: LevelDef['platforms'][number];
  mesh: THREE.Group;
  minX: number; maxX: number; minY: number; maxY: number;
  cx: number; cy: number;
  dx: number; dy: number;
  // crumble / fake
  state: 'idle' | 'shaking' | 'falling' | 'gone';
  timer: number;
  vy: number;
  baseY: number;
}

interface SpikeRuntime {
  def: LevelDef['spikes'][number];
  group: THREE.Group;
  revealed: boolean;
  pop: number; // 0..1
}

interface SawRuntime {
  def: LevelDef['saws'][number];
  group: THREE.Group;
  disc: THREE.Group;
  t: number;
  x: number; y: number;
}

interface CoinRuntime { pos: THREE.Vector3; mesh: THREE.Group; taken: boolean; phase: number }
interface StalRuntime {
  def: LevelDef['stalactites'][number];
  mesh: THREE.Group;
  state: 'idle' | 'falling' | 'stuck' | 'gone';
  vy: number; timer: number; y0: number;
}
interface Burst { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number; spin: THREE.Vector3 }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
function seeded(s: number) {
  let x = s * 9973 + 7;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

export class DevilEngine {
  private canvas: HTMLCanvasElement;
  private cb: EngineCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private raf = 0;
  private last = 0;
  private time = 0;
  private levelTime = 0;
  private deaths = 0;
  private running = false;
  private paused = false;
  private disposed = false;

  private level!: LevelDef;
  private levelIdx = 0;
  get levelIndex() { return this.levelIdx; }

  // player
  private player!: THREE.Group;
  private pBody!: THREE.Group;
  private armL!: THREE.Group; private armR!: THREE.Group;
  private legL!: THREE.Group; private legR!: THREE.Group;
  private tailSeg!: THREE.Group;
  private head!: THREE.Group;
  private playerLight!: THREE.PointLight;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private facing = 1;
  private onGround = false;
  private coyote = 0;
  private buffer = 0;
  private squash = 0;
  private runPhase = 0;
  private dead = false;
  private deadT = 0;
  private won = false;
  private winT = 0;
  private spawn = new THREE.Vector3();
  private coinsTaken = 0;
  private hasKey = false;

  // input
  private keys = { left: false, right: false, jump: false };
  private touch = { left: false, right: false, jump: false };

  // world
  private platforms: PlatformRuntime[] = [];
  private spikes: SpikeRuntime[] = [];
  private saws: SawRuntime[] = [];
  private coins: CoinRuntime[] = [];
  private stals: StalRuntime[] = [];
  private lavaMeshes: THREE.Group[] = [];
  private exitPos = new THREE.Vector3();
  private exitGroup: THREE.Group | null = null;
  private exitLight: THREE.PointLight | null = null;
  private doorMesh: THREE.Group | null = null;
  private doorCollider: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
  private doorOpen = false;
  private keyMesh: THREE.Group | null = null;
  private keyPos: THREE.Vector3 | null = null;
  private bursts: Burst[] = [];
  private ash: THREE.Points | null = null;
  private ashVel: Float32Array | null = null;
  private embers: THREE.Points | null = null;
  private bgGroup: THREE.Group | null = null;
  private dirLight!: THREE.DirectionalLight;
  private shake = 0;
  private worldGroup = new THREE.Group();
  private lavaOcean: THREE.Mesh | null = null;
  private lastProgress = -1;
  private winToken = 0;

  // shared mats/geos
  private mats!: Record<string, THREE.Material>;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.init();
    this.bindKeys();
  }

  private init() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0508);
    this.scene.fog = new THREE.Fog(0x140708, 14, 42);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
    this.camera.position.set(4, 3, 10);

    const hemi = new THREE.HemisphereLight(0xff9a6a, 0x1c0a12, 0.85);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0x58181f, 0.7);
    this.scene.add(amb);
    this.dirLight = new THREE.DirectionalLight(0xffd9b0, 1.6);
    this.dirLight.position.set(6, 12, 7);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.left = -10; this.dirLight.shadow.camera.right = 10;
    this.dirLight.shadow.camera.top = 10; this.dirLight.shadow.camera.bottom = -10;
    this.dirLight.shadow.camera.far = 40;
    this.dirLight.shadow.bias = -0.0004;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // lava rim glow from below
    const under = new THREE.PointLight(0xff4400, 12, 30, 1.8);
    under.position.set(10, -4, 2);
    this.scene.add(under);

    this.mats = {
      stone: new THREE.MeshStandardMaterial({ color: 0x37303e, roughness: 0.95, flatShading: true }),
      stoneTop: new THREE.MeshStandardMaterial({ color: 0x5b5266, roughness: 0.9, flatShading: true }),
      stoneDark: new THREE.MeshStandardMaterial({ color: 0x232029, roughness: 1, flatShading: true }),
      move: new THREE.MeshStandardMaterial({ color: 0x4a2d5e, roughness: 0.8, flatShading: true }),
      moveGlow: new THREE.MeshStandardMaterial({ color: 0x1a0a00, emissive: 0xff5a00, emissiveIntensity: 2.2 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xc9ced8, roughness: 0.35, metalness: 0.75, flatShading: true }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x3c3f4a, roughness: 0.6, metalness: 0.5, flatShading: true }),
      lava: new THREE.MeshStandardMaterial({ color: 0xff5a00, emissive: 0xff4400, emissiveIntensity: 2.6, roughness: 0.4 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffbe2e, emissive: 0xcf7a00, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.6, flatShading: true }),
      devil: new THREE.MeshStandardMaterial({ color: 0xe5382b, roughness: 0.7, flatShading: true }),
      devilDark: new THREE.MeshStandardMaterial({ color: 0x9e1b14, roughness: 0.8, flatShading: true }),
      cream: new THREE.MeshStandardMaterial({ color: 0xffe6c2, roughness: 0.6, flatShading: true }),
      white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
      black: new THREE.MeshStandardMaterial({ color: 0x14090a, roughness: 0.6 }),
      rock: new THREE.MeshStandardMaterial({ color: 0x4d3540, roughness: 1, flatShading: true }),
      pillar: new THREE.MeshStandardMaterial({ color: 0x2c2130, roughness: 1, flatShading: true }),
      portal: new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
      portalCore: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    };

    this.scene.add(this.worldGroup);
    this.buildDevil();
    this.buildParticles();
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  // ---------------------------------------------------------------- player
  private buildDevil() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    this.pBody = body;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.5), this.mats.devil);
    torso.position.y = 0.02;
    torso.castShadow = true;
    body.add(torso);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.08), this.mats.cream);
    belly.position.set(0, -0.02, 0.26);
    body.add(belly);

    const head = new THREE.Group();
    head.position.y = 0.58;
    body.add(head);
    this.head = head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), this.mats.devil);
    skull.castShadow = true;
    head.add(skull);
    // horns — Quaternius chunky cones
    const hornGeo = new THREE.ConeGeometry(0.11, 0.34, 5);
    const hL = new THREE.Mesh(hornGeo, this.mats.cream);
    hL.position.set(-0.28, 0.3, 0);
    hL.rotation.z = 0.55;
    hL.castShadow = true;
    head.add(hL);
    const hR = hL.clone();
    hR.position.x = 0.28;
    hR.rotation.z = -0.55;
    head.add(hR);
    // eyes angry
    const eyeGeo = new THREE.SphereGeometry(0.095, 8, 8);
    const eL = new THREE.Mesh(eyeGeo, this.mats.white);
    eL.position.set(-0.13, 0.06, 0.27);
    head.add(eL);
    const eR = eL.clone(); eR.position.x = 0.13; head.add(eR);
    const pupGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const pL = new THREE.Mesh(pupGeo, this.mats.black);
    pL.position.set(-0.13, 0.05, 0.35);
    head.add(pL);
    const pR = pL.clone(); pR.position.x = 0.13; head.add(pR);
    const browGeo = new THREE.BoxGeometry(0.16, 0.05, 0.05);
    const bL = new THREE.Mesh(browGeo, this.mats.black);
    bL.position.set(-0.13, 0.17, 0.3); bL.rotation.z = -0.35;
    head.add(bL);
    const bR = bL.clone(); bR.position.x = 0.13; bR.rotation.z = 0.35; head.add(bR);
    // fangs
    const fangGeo = new THREE.ConeGeometry(0.04, 0.1, 4);
    const f1 = new THREE.Mesh(fangGeo, this.mats.white);
    f1.position.set(-0.08, -0.24, 0.26); f1.rotation.x = Math.PI;
    head.add(f1);
    const f2 = f1.clone(); f2.position.x = 0.08; head.add(f2);

    // arms with pivot at shoulder
    const mkArm = (side: number) => {
      const grp = new THREE.Group();
      grp.position.set(side * 0.4, 0.2, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.46, 0.17), this.mats.devil);
      m.position.y = -0.2;
      m.castShadow = true;
      grp.add(m);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), this.mats.devilDark);
      hand.position.y = -0.44;
      grp.add(hand);
      body.add(grp);
      return grp;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // trident in right hand (Quaternius-style chunky)
    const tri = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 6), new THREE.MeshStandardMaterial({ color: 0x6b3b1f, roughness: 0.8, flatShading: true }));
    tri.add(handle);
    const prongMat = new THREE.MeshStandardMaterial({ color: 0xd8b545, metalness: 0.6, roughness: 0.35, flatShading: true });
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 5), prongMat);
      p.position.set(i * 0.12, 0.68, 0);
      tri.add(p);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.06), prongMat);
    cross.position.y = 0.54;
    tri.add(cross);
    tri.position.set(0, -0.42, 0.1);
    tri.rotation.x = 0.25;
    this.armR.add(tri);

    // legs
    const mkLeg = (side: number) => {
      const grp = new THREE.Group();
      grp.position.set(side * 0.16, -0.24, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.4, 0.21), this.mats.devilDark);
      m.position.y = -0.2;
      m.castShadow = true;
      grp.add(m);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.12, 0.32), this.mats.black);
      foot.position.set(0, -0.38, 0.05);
      grp.add(foot);
      body.add(grp);
      return grp;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // tail
    const tail = new THREE.Group();
    tail.position.set(0, -0.12, -0.28);
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 6), this.mats.devil);
    t1.rotation.x = 1.1; t1.position.set(0, 0, -0.16);
    tail.add(t1);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), this.mats.devilDark);
    tip.position.set(0, 0.08, -0.36);
    tip.rotation.x = -0.6;
    tail.add(tip);
    body.add(tail);
    this.tailSeg = tail;

    this.player = g;
    this.playerLight = new THREE.PointLight(0xff5a2a, 8, 9, 1.9);
    this.playerLight.position.set(0, 1, 1.5);
    g.add(this.playerLight);
    this.scene.add(g);
  }

  private buildParticles() {
    // ash falling
    const N = 320;
    const pos = new Float32Array(N * 3);
    this.ashVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rand(-10, 60);
      pos[i * 3 + 1] = rand(-4, 16);
      pos[i * 3 + 2] = rand(-12, 4);
      this.ashVel[i] = rand(0.3, 1.1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff8a5a, size: 0.06, transparent: true, opacity: 0.7, sizeAttenuation: true });
    this.ash = new THREE.Points(geo, mat);
    this.scene.add(this.ash);
    // embers rising
    const M = 160;
    const ep = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      ep[i * 3] = rand(-10, 60);
      ep[i * 3 + 1] = rand(-4, 4);
      ep[i * 3 + 2] = rand(-2, 3);
    }
    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    const emat = new THREE.PointsMaterial({ color: 0xffb02e, size: 0.09, transparent: true, opacity: 0.9 });
    this.embers = new THREE.Points(egeo, emat);
    this.scene.add(this.embers);
  }

  // ---------------------------------------------------------------- level build
  loadLevel(idx: number, def: LevelDef) {
    this.levelIdx = idx;
    this.level = def;
    this.levelTime = 0;
    this.coinsTaken = 0;
    this.hasKey = false;
    this.doorOpen = false;
    this.dead = false; this.won = false; this.deadT = 0; this.winT = 0;
    this.winToken++;
    this.lastProgress = -1;
    this.vel.set(0, 0, 0);
    this.spawn.set(def.spawn[0], def.spawn[1], 0);
    this.pos.copy(this.spawn);
    this.facing = 1;
    this.player.rotation.set(0, 0, 0);
    this.pBody.rotation.set(0, 0, 0);
    this.pBody.scale.set(1, 1, 1);
    this.squash = 0;
    this.shake = 0;

    // clear world
    this.worldGroup.clear();
    this.platforms = []; this.spikes = []; this.saws = []; this.coins = []; this.stals = [];
    this.lavaMeshes = []; this.bursts.forEach(b => this.scene.remove(b.mesh)); this.bursts = [];
    this.exitGroup = null; this.doorMesh = null; this.doorCollider = null; this.keyMesh = null; this.keyPos = null;
    this.bgGroup = new THREE.Group();
    this.worldGroup.add(this.bgGroup);

    this.buildBackground(def);
    this.buildLavaOcean(def);

    for (const p of def.platforms) this.addPlatform(p);
    for (const s of def.spikes) this.addSpike(s);
    for (const s of def.saws) this.addSaw(s);
    for (const c of def.coins) this.addCoin(c);
    for (const st of def.stalactites) this.addStal(st);
    for (const l of def.lava) this.addLava(l);
    if (def.key) this.addKey(def.key);
    if (def.door) this.addDoor(def.door);
    this.addExit(def.exit);

    this.player.visible = true;
    this.updateCamera(1);
  }

  private addPlatform(p: LevelDef['platforms'][number]) {
    const [cx, cy] = p.pos ?? p.moveFrom ?? [0, 0];
    const [w, h] = p.size;
    const g = new THREE.Group();
    const kind = p.kind ?? 'stone';
    const baseMat = kind === 'move' ? this.mats.move : this.mats.stone;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), baseMat);
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.14, 1.66), this.mats.stoneTop);
    cap.position.y = h / 2 - 0.02;
    cap.receiveShadow = true;
    g.add(cap);
    // lava glow strip on front bottom (hell trim)
    if (kind === 'stone' || kind === 'move') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.05, 0.04), this.mats.moveGlow);
      strip.position.set(0, -h / 2 + 0.12, 0.82);
      g.add(strip);
    }
    if (kind === 'move') {
      const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.08, 1.0), this.mats.moveGlow);
      glow.position.y = -h / 2 - 0.04;
      g.add(glow);
    }
    if (kind === 'crumble' || kind === 'fake') {
      // cracks
      const crackMat = new THREE.MeshBasicMaterial({ color: 0x120b0d });
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(rand(0.3, w * 0.5), 0.03, 0.02), crackMat);
        c.position.set(rand(-w / 4, w / 4), rand(-h / 4, h / 4), 0.81);
        c.rotation.z = rand(-0.5, 0.5);
        g.add(c);
      }
    }
    // side studs (Quaternius chunk)
    const studGeo = new THREE.BoxGeometry(0.12, 0.12, 0.08);
    const studMat = this.mats.stoneDark;
    const n = Math.max(2, Math.floor(w / 1.2));
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(studGeo, studMat);
      s.position.set(-w / 2 + 0.4 + (i * (w - 0.8)) / Math.max(1, n - 1), -h / 2 + 0.35, 0.8);
      g.add(s);
    }

    const startX = p.moveFrom ? p.moveFrom[0] : cx;
    const startY = p.moveFrom ? p.moveFrom[1] : cy;
    g.position.set(startX, startY, 0);
    this.worldGroup.add(g);
    this.platforms.push({
      def: p, mesh: g,
      minX: startX - w / 2, maxX: startX + w / 2, minY: startY - h / 2, maxY: startY + h / 2,
      cx: startX, cy: startY, dx: 0, dy: 0,
      state: 'idle', timer: 0, vy: 0, baseY: startY,
    });
  }

  private addSpike(s: LevelDef['spikes'][number]) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.85), this.mats.darkMetal);
    base.castShadow = true;
    g.add(base);
    const coneGeo = new THREE.ConeGeometry(0.17, 0.62, 6);
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(coneGeo, this.mats.metal);
      c.position.set(i * 0.32, 0.4, 0);
      c.castShadow = true;
      g.add(c);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), new THREE.MeshStandardMaterial({ color: 0xff2d2d, emissive: 0xff2200, emissiveIntensity: 1.2 }));
      tip.position.set(i * 0.32, 0.68, 0);
      g.add(tip);
    }
    // orient
    if (s.dir === 'down') g.rotation.z = Math.PI;
    if (s.dir === 'left') g.rotation.z = Math.PI / 2;
    if (s.dir === 'right') g.rotation.z = -Math.PI / 2;
    g.position.set(s.pos[0], s.pos[1], 0);
    if (s.hidden) g.position.y -= 0.75;
    this.worldGroup.add(g);
    this.spikes.push({ def: s, group: g, revealed: !s.hidden, pop: s.hidden ? 0 : 1 });
  }

  private addSaw(s: LevelDef['saws'][number]) {
    const g = new THREE.Group();
    const disc = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(s.radius, s.radius, 0.16, 20), this.mats.metal);
    blade.rotation.x = Math.PI / 2;
    blade.castShadow = true;
    disc.add(blade);
    const toothGeo = new THREE.BoxGeometry(0.16, 0.16, 0.14);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const t = new THREE.Mesh(toothGeo, this.mats.metal);
      t.position.set(Math.cos(a) * (s.radius + 0.06), Math.sin(a) * (s.radius + 0.06), 0);
      t.rotation.z = a;
      disc.add(t);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(s.radius * 0.32, s.radius * 0.32, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0xb01e14, roughness: 0.5, flatShading: true }));
    hub.rotation.x = Math.PI / 2;
    disc.add(hub);
    const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), this.mats.darkMetal);
    bolt.position.z = 0.12;
    disc.add(bolt);
    g.add(disc);
    // glow ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(s.radius + 0.14, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff3d00, transparent: true, opacity: 0.55 }));
    g.add(ring);
    const sx = s.pathFrom ? s.pathFrom[0] : s.pos[0];
    const sy = s.pathFrom ? s.pathFrom[1] : s.pos[1];
    g.position.set(sx, sy, 0.1);
    this.worldGroup.add(g);
    this.saws.push({ def: s, group: g, disc, t: (s.phase ?? 0), x: sx, y: sy });
  }

  private addCoin(c: [number, number]) {
    const g = new THREE.Group();
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 14), this.mats.gold);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    g.add(coin);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xff9a00, emissiveIntensity: 0.9 }));
    inner.rotation.x = Math.PI / 2;
    g.add(inner);
    // sparkle ring
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.5 }));
    g.add(halo);
    g.position.set(c[0], c[1], 0);
    this.worldGroup.add(g);
    this.coins.push({ pos: new THREE.Vector3(c[0], c[1], 0), mesh: g, taken: false, phase: rand(0, 6) });
  }

  private addStal(st: LevelDef['stalactites'][number]) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.4, 6), this.mats.rock);
    rock.rotation.x = Math.PI; // point down
    rock.castShadow = true;
    g.add(rock);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.7), this.mats.stoneDark);
    cap.position.y = 0.75;
    g.add(cap);
    g.position.set(st.pos[0], st.pos[1], 0);
    this.worldGroup.add(g);
    this.stals.push({ def: st, mesh: g, state: 'idle', vy: 0, timer: 0, y0: st.pos[1] });
  }

  private addLava(l: { pos: [number, number]; size: [number, number] }) {
    const g = new THREE.Group();
    const [w, h] = l.size;
    const surf = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 1.8), this.mats.lava);
    surf.position.y = h / 2;
    g.add(surf);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.7), new THREE.MeshStandardMaterial({ color: 0x2a0d06, roughness: 1 }));
    g.add(body);
    // crust chunks
    const r = seeded(Math.floor(l.pos[0] * 13));
    for (let i = 0; i < Math.floor(w * 1.4); i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(rand(0.2, 0.5), 0.08, 0.4), this.mats.stoneDark);
      c.position.set(-w / 2 + r() * w, h / 2 + 0.12, rand(-0.5, 0.5));
      c.rotation.y = r() * 1;
      g.add(c);
    }
    const light = new THREE.PointLight(0xff5a00, 6, 8, 1.8);
    light.position.set(0, 1, 1.5);
    g.add(light);
    g.position.set(l.pos[0], l.pos[1], -0.1);
    this.worldGroup.add(g);
    this.lavaMeshes.push(g);
  }

  private addKey(k: [number, number]) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 16), this.mats.gold);
    ring.position.y = 0.3;
    g.add(ring);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), this.mats.gold);
    g.add(stem);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.08), this.mats.gold);
    t1.position.set(0.1, -0.1, 0);
    g.add(t1);
    const t2 = t1.clone(); t2.position.y = -0.22; g.add(t2);
    const light = new THREE.PointLight(0xffc93e, 5, 6, 1.8);
    g.add(light);
    g.position.set(k[0], k[1], 0);
    this.worldGroup.add(g);
    this.keyMesh = g;
    this.keyPos = new THREE.Vector3(k[0], k[1], 0);
  }

  private addDoor(d: { pos: [number, number]; size: [number, number] }) {
    const g = new THREE.Group();
    const [w, h] = d.size;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.1), new THREE.MeshStandardMaterial({ color: 0x2b1836, roughness: 0.8, flatShading: true }));
    frame.castShadow = true;
    g.add(frame);
    // runes
    for (let i = 0; i < 4; i++) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.07, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3d6a }));
      rune.position.set(0, -h / 2 + 0.4 + i * 0.65, 0.58);
      g.add(rune);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), this.mats.cream);
    skull.position.set(0, h / 2 + 0.1, 0);
    g.add(skull);
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
    eL.position.set(-0.09, h / 2 + 0.12, 0.2);
    g.add(eL);
    const eR = eL.clone(); eR.position.x = 0.09; g.add(eR);
    g.position.set(d.pos[0], d.pos[1], 0);
    this.worldGroup.add(g);
    this.doorMesh = g;
    this.doorCollider = { minX: d.pos[0] - w / 2, maxX: d.pos[0] + w / 2, minY: d.pos[1] - h / 2, maxY: d.pos[1] + h / 2 };
  }

  private addExit(e: [number, number]) {
    const g = new THREE.Group();
    // stone arch
    const pilGeo = new THREE.BoxGeometry(0.5, 2.8, 0.9);
    const pL = new THREE.Mesh(pilGeo, this.mats.pillar);
    pL.position.set(-1.0, 1.1, 0); pL.castShadow = true;
    g.add(pL);
    const pR = pL.clone(); pR.position.x = 1.0; g.add(pR);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.9), this.mats.pillar);
    top.position.y = 2.65; top.castShadow = true;
    g.add(top);
    // horns on arch
    const hornGeo = new THREE.ConeGeometry(0.18, 0.6, 5);
    const h1 = new THREE.Mesh(hornGeo, this.mats.cream);
    h1.position.set(-1.15, 3.1, 0);
    g.add(h1);
    const h2 = h1.clone(); h2.position.x = 1.15; g.add(h2);
    // portal
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), this.mats.portal.clone());
    portal.position.y = 1.25;
    g.add(portal);
    const core = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), this.mats.portalCore.clone());
    core.position.set(0, 1.25, 0.02);
    g.add(core);
    (g as unknown as { portal: THREE.Mesh; core: THREE.Mesh }).portal = portal;
    (g as unknown as { core: THREE.Mesh }).core = core;
    const light = new THREE.PointLight(0xff7a1a, 10, 10, 1.7);
    light.position.set(0, 1.5, 1.5);
    g.add(light);
    this.exitLight = light;
    // base steps
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 1.6), this.mats.stoneDark);
    step.position.y = -0.35;
    step.receiveShadow = true;
    g.add(step);
    g.position.set(e[0], e[1], -0.2);
    this.worldGroup.add(g);
    this.exitGroup = g;
    this.exitPos.set(e[0], e[1] + 1.1, 0);
  }

  private buildBackground(def: LevelDef) {
    const r = seeded(def.decorSeed ?? 7);
    const bg = this.bgGroup!;
    // distant volcanoes
    for (let i = 0; i < 10; i++) {
      const x = (i / 10) * (def.width + 16) - 8;
      const h = 6 + r() * 7;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(4 + r() * 4, h, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a1218, roughness: 1, flatShading: true })
      );
      cone.position.set(x + rand(-2, 2), h / 2 - 4, -20 - r() * 8);
      bg.add(cone);
      // lava cap glow
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1 + r(), 1.4, 5), new THREE.MeshBasicMaterial({ color: 0xff4a00 }));
      cap.position.set(cone.position.x, h - 4.2, cone.position.z + 0.1);
      bg.add(cap);
    }
    // mid pillars
    for (let i = 0; i < 16; i++) {
      const x = r() * (def.width + 10) - 5;
      const h = 3 + r() * 9;
      const p = new THREE.Mesh(new THREE.BoxGeometry(1 + r() * 1.5, h, 1), this.mats.pillar);
      p.position.set(x, h / 2 - 3 + r() * 4, -9 - r() * 5);
      bg.add(p);
      if (r() > 0.6) {
        const glow = new THREE.Mesh(new THREE.BoxGeometry(0.2, h * 0.5, 0.2), new THREE.MeshBasicMaterial({ color: 0xff5a00 }));
        glow.position.set(x + 0.6, p.position.y, p.position.z + 0.6);
        bg.add(glow);
      }
    }
    // hanging chains
    for (let i = 0; i < 14; i++) {
      const x = r() * def.width;
      const len = 2 + r() * 5;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 5), this.mats.darkMetal);
      chain.position.set(x, 10 - len / 2, -4 - r() * 3);
      bg.add(chain);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12), this.mats.darkMetal);
      hook.position.set(x, 10 - len, chain.position.z);
      bg.add(hook);
    }
    // floating rocks
    for (let i = 0; i < 12; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + r() * 0.7, 0), this.mats.rock);
      rock.position.set(r() * def.width, 6 + r() * 7, -6 - r() * 6);
      rock.rotation.set(r() * 3, r() * 3, 0);
      (rock as unknown as { baseY: number; ph: number }).baseY = rock.position.y;
      (rock as unknown as { ph: number }).ph = r() * 6;
      bg.add(rock);
    }
    // ground glow plane far behind
    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(def.width + 40, 6), new THREE.MeshBasicMaterial({ color: 0x3a0d05, transparent: true, opacity: 0.7 }));
    glowPlane.position.set(def.width / 2, -3.5, -14);
    bg.add(glowPlane);
  }

  private buildLavaOcean(def: LevelDef) {
    const w = def.width + 40;
    const ocean = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 14), this.mats.lava);
    ocean.position.set(def.width / 2, def.killY - 1.4, -2);
    this.worldGroup.add(ocean);
    this.lavaOcean = ocean;
    const light = new THREE.PointLight(0xff4400, 20, 40, 1.6);
    light.position.set(def.width / 2, def.killY + 1, 3);
    this.worldGroup.add(light);
  }

  // ---------------------------------------------------------------- input
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.keys.left = true;
    if (k === 'arrowright' || k === 'd') this.keys.right = true;
    if (k === ' ' || k === 'arrowup' || k === 'w') {
      this.keys.jump = true;
      this.buffer = 0.14;
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.keys.left = false;
    if (k === 'arrowright' || k === 'd') this.keys.right = false;
    if (k === ' ' || k === 'arrowup' || k === 'w') {
      this.keys.jump = false;
      // variable jump: cut velocity
      if (this.vel.y > 4) this.vel.y = 4;
    }
  };
  private bindKeys() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  setTouch(left: boolean, right: boolean, jump: boolean) {
    const prevJump = this.touch.jump;
    this.touch.left = left; this.touch.right = right; this.touch.jump = jump;
    if (jump && !prevJump) {
      this.buffer = 0.14;
    }
    if (!jump && prevJump) {
      if (this.vel.y > 4) this.vel.y = 4;
    }
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ---------------------------------------------------------------- control
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      let dt = (now - this.last) / 1000;
      this.last = now;
      dt = Math.min(dt, 0.033);
      if (!this.paused) this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.last = performance.now(); }
  setQuality(high: boolean) {
    this.renderer.shadowMap.enabled = high;
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.material) { /* force update */ }
    });
  }

  respawn() {
    if (this.won) return;
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.dead = false; this.deadT = 0;
    this.player.visible = true;
    // reset troll states partially? Keep revealed spikes revealed (evil), reset falling blocks that are gone
    for (const p of this.platforms) {
      if (p.state === 'gone' || p.state === 'falling') {
        p.state = 'idle'; p.timer = 0; p.vy = 0;
        p.mesh.visible = true;
      }
    }
    for (const s of this.stals) {
      if (s.state === 'gone' || s.state === 'stuck') {
        s.state = 'idle'; s.vy = 0; s.timer = 0;
        s.mesh.position.y = s.y0;
        s.mesh.visible = true;
      }
    }
    this.updateCamera(1);
  }

  private die(cause: string) {
    if (this.dead || this.won) return;
    this.dead = true;
    this.deadT = 0;
    this.deaths++;
    this.shake = 0.7;
    sound.death();
    // soul burst
    this.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xff2d2d, 26, 7);
    this.burst(this.pos.clone(), 0xffe6c2, 10, 5);
    this.burst(this.pos.clone(), 0x3a0d05, 12, 6);
    this.player.visible = false;
    const q = cause === 'troll'
      ? this.level.troll
      : TROLL_QUIPS[Math.floor(Math.random() * TROLL_QUIPS.length)];
    this.cb.onDeath(q);
  }

  private burst(p: THREE.Vector3, color: number, count: number, speed: number) {
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(p);
      const vel = new THREE.Vector3(rand(-1, 1), rand(0.2, 1.2), rand(-0.6, 0.6)).normalize().multiplyScalar(rand(speed * 0.4, speed));
      this.scene.add(mesh);
      this.bursts.push({ mesh, vel, life: 0, maxLife: rand(0.5, 1.1), spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), 0) });
    }
  }

  // ---------------------------------------------------------------- update
  private update(dt: number) {
    this.time += dt;
    if (!this.dead && !this.won) this.levelTime += dt;

    this.updatePlatforms(dt);
    this.updateSaws(dt);
    this.updateSpikes(dt);
    this.updateCoins(dt);
    this.updateStals(dt);
    this.updateExit(dt);
    this.updateBursts(dt);
    this.updateAmbient(dt);

    if (!this.dead && !this.won) {
      this.updatePlayer(dt);
      this.checkHazards();
      this.checkPickupWin();
    } else if (this.dead) {
      this.deadT += dt;
      if (this.deadT > 0.85) this.respawn();
    } else if (this.won) {
      this.winT += dt;
      // victory spin + confetti
      this.player.rotation.y += dt * 6;
      this.player.position.y += Math.sin(this.time * 8) * dt * 0.6;
      if (Math.random() < 0.3) {
        this.burst(this.exitPos.clone().add(new THREE.Vector3(rand(-1, 1), rand(0, 2), 0)), [0xffbe2e, 0xff5a00, 0x7dff6a, 0x6ac8ff][Math.floor(Math.random() * 4)], 4, 5);
      }
    }

    this.animateDevil(dt);
    this.updateCamera(dt);
    this.dirLight.position.set(this.pos.x + 5, this.pos.y + 10, 7);
    this.dirLight.target.position.set(this.pos.x, this.pos.y, 0);

    if (this.cb.onProgress) {
      const p = THREE.MathUtils.clamp(this.pos.x / this.level.width, 0, 1);
      if (Math.abs(p - this.lastProgress) > 0.004) {
        this.lastProgress = p;
        this.cb.onProgress(p);
      }
    }
  }

  private updatePlatforms(dt: number) {
    for (const p of this.platforms) {
      p.dx = 0; p.dy = 0;
      const kind = p.def.kind ?? 'stone';
      if (kind === 'move' && p.def.moveFrom && p.def.moveTo) {
        const speed = p.def.moveSpeed ?? 1.6;
        // ping-pong linear
        const ax = p.def.moveFrom[0], ay = p.def.moveFrom[1];
        const bx = p.def.moveTo[0], by = p.def.moveTo[1];
        const dist = Math.hypot(bx - ax, by - ay) || 1;
        const period = (dist / speed) * 2;
        let t = (this.time + (p.def.phase ?? 0)) % period;
        let k = t / (period / 2);
        if (k > 1) k = 2 - k;
        const nx = ax + (bx - ax) * k;
        const ny = ay + (by - ay) * k;
        p.dx = nx - p.cx; p.dy = ny - p.cy;
        p.cx = nx; p.cy = ny;
        p.minX = nx - p.def.size[0] / 2; p.maxX = nx + p.def.size[0] / 2;
        p.minY = ny - p.def.size[1] / 2; p.maxY = ny + p.def.size[1] / 2;
        p.mesh.position.set(nx, ny, 0);
      } else if ((kind === 'crumble' || kind === 'fake') && p.state !== 'gone') {
        if (p.state === 'shaking') {
          p.timer -= dt;
          p.mesh.position.x = p.cx + rand(-0.06, 0.06);
          if (p.timer <= 0) {
            p.state = 'falling'; p.vy = 0;
            if (kind === 'crumble') sound.crumble();
          }
        } else if (p.state === 'falling') {
          p.vy -= 22 * dt;
          p.cy += p.vy * dt;
          p.mesh.position.y = p.cy;
          p.mesh.rotation.z += dt * 0.4;
          p.minY = p.cy - p.def.size[1] / 2; p.maxY = p.cy + p.def.size[1] / 2;
          if (p.cy < this.level.killY - 2) {
            p.state = 'gone'; p.timer = 2.2;
            p.mesh.visible = false;
          }
        } else if (p.state === 'idle' && p.timer > 0) {
          // respawn timer after gone? handled below
        }
        if (p.state === 'gone') {
          p.timer -= dt;
          if (p.timer <= 0) {
            p.state = 'idle'; p.cy = p.baseY;
            p.mesh.position.set(p.cx, p.cy, 0);
            p.mesh.rotation.z = 0; p.mesh.visible = true;
            p.minY = p.cy - p.def.size[1] / 2; p.maxY = p.cy + p.def.size[1] / 2;
          }
        }
      }
    }
  }

  private updateSaws(dt: number) {
    for (const s of this.saws) {
      s.disc.rotation.z += dt * 7;
      if (s.def.pathFrom && s.def.pathTo) {
        const speed = s.def.speed ?? 1.8;
        const ax = s.def.pathFrom[0], ay = s.def.pathFrom[1];
        const bx = s.def.pathTo[0], by = s.def.pathTo[1];
        const dist = Math.hypot(bx - ax, by - ay) || 1;
        const period = (dist / speed) * 2;
        s.t += dt;
        let tt = s.t % period;
        let k = tt / (period / 2);
        if (k > 1) k = 2 - k;
        // ease
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        s.x = ax + (bx - ax) * e;
        s.y = ay + (by - ay) * e;
        s.group.position.set(s.x, s.y, 0.1);
      }
    }
  }

  private updateSpikes(dt: number) {
    for (const s of this.spikes) {
      if (!s.revealed && s.def.hidden) {
        const dx = this.pos.x - s.def.pos[0];
        const dy = this.pos.y - s.def.pos[1];
        const r = s.def.triggerRadius ?? 2.2;
        if (!this.dead && !this.won && dx * dx + dy * dy < r * r) {
          s.revealed = true;
          sound.spikePop();
          this.shake = Math.max(this.shake, 0.25);
        }
      }
      const target = s.revealed ? 1 : 0;
      if (Math.abs(s.pop - target) > 0.001) {
        s.pop += Math.sign(target - s.pop) * dt * 6;
        s.pop = THREE.MathUtils.clamp(s.pop, 0, 1);
        const e = 1 - Math.pow(1 - s.pop, 3);
        s.group.position.y = s.def.pos[1] - (1 - e) * 0.75;
        if (s.def.dir === 'down') s.group.position.y = s.def.pos[1] + (1 - e) * 0.75;
      }
    }
  }

  private updateCoins(dt: number) {
    for (const c of this.coins) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 2.6;
      c.mesh.position.y = c.pos.y + Math.sin(this.time * 2.4 + c.phase) * 0.12;
    }
  }

  private updateStals(dt: number) {
    for (const s of this.stals) {
      if (s.state === 'idle') {
        const dx = Math.abs(this.pos.x - s.mesh.position.x);
        const below = this.pos.y < s.mesh.position.y;
        const r = s.def.fallRadius ?? 1.4;
        if (!this.dead && !this.won && dx < r && below && this.pos.y > s.mesh.position.y - 7) {
          s.state = 'falling'; s.vy = 0;
          sound.spikePop();
        }
        // subtle sway
        s.mesh.rotation.z = Math.sin(this.time * 1.2 + s.y0) * 0.03;
      } else if (s.state === 'falling') {
        s.vy -= 26 * dt;
        s.mesh.position.y += s.vy * dt;
        // hit ground/platforms?
        let landed = s.mesh.position.y < this.level.killY + 0.5;
        for (const p of this.platforms) {
          if (p.state === 'gone') continue;
          if (s.mesh.position.x > p.minX - 0.2 && s.mesh.position.x < p.maxX + 0.2 &&
            s.mesh.position.y - 0.7 < p.maxY && s.mesh.position.y > p.minY) {
            landed = true; break;
          }
        }
        if (landed) {
          s.state = 'stuck'; s.timer = 2.6;
          this.shake = Math.max(this.shake, 0.3);
          sound.land();
          this.burst(s.mesh.position.clone(), 0x6a5a62, 8, 4);
        }
      } else if (s.state === 'stuck') {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.state = 'gone'; s.timer = 1.4;
          s.mesh.visible = false;
        }
      } else if (s.state === 'gone') {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.state = 'idle'; s.vy = 0;
          s.mesh.position.y = s.y0;
          s.mesh.visible = true;
        }
      }
    }
  }

  private updateExit(dt: number) {
    if (!this.exitGroup) return;
    const g = this.exitGroup as unknown as { portal: THREE.Mesh; core: THREE.Mesh } & THREE.Group;
    const pulse = 1 + Math.sin(this.time * 3.2) * 0.06;
    if (g.portal) {
      (g.portal.material as THREE.MeshBasicMaterial).color.setHSL(0.05 + Math.sin(this.time * 1.5) * 0.03, 1, 0.55);
      g.portal.scale.set(pulse, 1 + Math.sin(this.time * 3.2) * 0.03, 1);
    }
    if (g.core) {
      g.core.scale.set(1 + Math.sin(this.time * 5) * 0.1, 1 + Math.cos(this.time * 4) * 0.08, 1);
      (g.core.material as THREE.MeshBasicMaterial).color.setHSL(0.12, 1, 0.72 + Math.sin(this.time * 6) * 0.06);
    }
    if (this.exitLight) this.exitLight.intensity = 9 + Math.sin(this.time * 4) * 2.5;
    if (this.keyMesh && !this.hasKey) {
      this.keyMesh.rotation.y += dt * 2.2;
      this.keyMesh.position.y = (this.keyPos?.y ?? 0) + Math.sin(this.time * 2.6) * 0.15;
    }
    if (this.doorMesh && this.doorOpen) {
      // sink
      if (this.doorMesh.position.y > -4) {
        this.doorMesh.position.y -= dt * 2.4;
      }
    }
  }

  private updateBursts(dt: number) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life += dt;
      b.vel.y -= 14 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      const k = 1 - b.life / b.maxLife;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, k);
      b.mesh.scale.setScalar(Math.max(0.01, k));
      if (b.life >= b.maxLife) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  private updateAmbient(dt: number) {
    // ash drift
    if (this.ash) {
      const p = this.ash.geometry.attributes.position as THREE.BufferAttribute;
      const arr = p.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3 + 1] -= (this.ashVel?.[i] ?? 0.6) * dt;
        arr[i * 3] += Math.sin(this.time * 0.7 + i) * dt * 0.3;
        if (arr[i * 3 + 1] < -5) {
          arr[i * 3 + 1] = 14;
          arr[i * 3] = this.pos.x + rand(-12, 12);
        }
      }
      p.needsUpdate = true;
    }
    if (this.embers) {
      const p = this.embers.geometry.attributes.position as THREE.BufferAttribute;
      const arr = p.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3 + 1] += dt * (0.8 + (i % 5) * 0.2);
        arr[i * 3] += Math.sin(this.time * 2 + i * 1.7) * dt * 0.5;
        if (arr[i * 3 + 1] > 10) {
          arr[i * 3 + 1] = -3;
          arr[i * 3] = this.pos.x + rand(-10, 10);
        }
      }
      p.needsUpdate = true;
    }
    // lava pulse
    if (this.lavaOcean) {
      (this.lavaOcean.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.4 + Math.sin(this.time * 2.2) * 0.5;
    }
    // bg float
    if (this.bgGroup) {
      for (const c of this.bgGroup.children) {
        const f = c as unknown as { baseY?: number; ph?: number };
        if (f.baseY !== undefined) {
          c.position.y = f.baseY + Math.sin(this.time * 0.6 + (f.ph ?? 0)) * 0.5;
          c.rotation.y += dt * 0.15;
        }
      }
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.8);
  }

  // ---------------------------------------------------------------- physics
  private updatePlayer(dt: number) {
    const left = this.keys.left || this.touch.left;
    const right = this.keys.right || this.touch.right;
    const SPEED = 7.2;
    const ACCEL_GROUND = 60;
    const ACCEL_AIR = 38;
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    const want = target * SPEED;
    const diff = want - this.vel.x;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), accel * dt);
    this.vel.x += step;
    if (target !== 0) this.facing = target;

    if (this.buffer > 0) this.buffer -= dt;
    if (this.coyote > 0) this.coyote -= dt;
    if (this.onGround) this.coyote = 0.12;

    if (this.buffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vel.y = 11.4;
      this.onGround = false;
      this.coyote = 0; this.buffer = 0;
      this.squash = -0.35;
      sound.jump();
      this.burst(this.pos.clone().add(new THREE.Vector3(0, -0.4, 0)), 0x8a7a88, 6, 3);
    }

    // gravity with fall clamp + jump hang
    const grav = this.vel.y > 0 ? 30 : 42;
    this.vel.y -= grav * dt;
    this.vel.y = Math.max(this.vel.y, -20);

    // integrate X
    this.pos.x += this.vel.x * dt;
    this.resolveAxis(true);

    // ride moving platforms (carry)
    // (applied before Y so standing sticks)

    // integrate Y
    const wasFalling = this.vel.y < -1;
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    const groundedBefore = this.onGround;
    this.onGround = false;
    this.resolveAxis(false);

    if (this.onGround && !groundedBefore && wasFalling) {
      // landed
      this.squash = 0.32;
      sound.land();
      this.burst(this.pos.clone().add(new THREE.Vector3(0, -0.45, 0)), 0x5b5266, 7, 3);
      if (this.vel.y < -12) this.shake = Math.max(this.shake, 0.12);
    }

    // crumble/fake trigger if standing
    if (this.onGround) {
      for (const p of this.platforms) {
        const kind = p.def.kind ?? 'stone';
        if (kind !== 'crumble' && kind !== 'fake') continue;
        if (p.state !== 'idle') continue;
        const hx = 0.3, hy = 0.45;
        const overlapX = this.pos.x + hx > p.minX && this.pos.x - hx < p.maxX;
        const onTop = Math.abs((this.pos.y - hy) - p.maxY) < 0.18;
        if (overlapX && onTop) {
          p.state = 'shaking';
          p.timer = kind === 'fake' ? 0.14 : 0.55;
        }
      }
    }

    // carry by platform delta if standing
    if (this.onGround) {
      for (const p of this.platforms) {
        if ((p.dx !== 0 || p.dy !== 0) && p.state === 'idle') {
          const hx = 0.3, hy = 0.45;
          const overlapX = this.pos.x + hx > p.minX - 0.1 && this.pos.x - hx < p.maxX + 0.1;
          const onTop = Math.abs((this.pos.y - hy) - p.maxY) < 0.22;
          if (overlapX && onTop) {
            this.pos.x += p.dx;
            this.pos.y += Math.max(0, p.dy);
          }
        }
      }
    }

    // world bounds
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, 0.5, this.level.width + 2);
    if (this.pos.y < this.level.killY) {
      sound.splash();
      this.die('fall');
      return;
    }
    void prevY;

    // run phase
    if (this.onGround && Math.abs(this.vel.x) > 0.5) {
      this.runPhase += dt * Math.abs(this.vel.x) * 1.6;
      if (Math.random() < dt * Math.abs(this.vel.x) * 0.7) {
        this.burst(this.pos.clone().add(new THREE.Vector3(-this.facing * 0.2, -0.42, 0)), 0x4a4256, 1, 1.5);
      }
    }

    // squash decay
    this.squash += (0 - this.squash) * Math.min(1, dt * 10);

    // sync mesh
    this.player.position.copy(this.pos);
  }

  private resolveAxis(isX: boolean) {
    const hx = 0.3, hy = 0.45;
    const boxes: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
    for (const p of this.platforms) {
      if (p.state === 'gone' || p.state === 'falling') continue;
      // broadphase
      if (p.maxX < this.pos.x - 2 || p.minX > this.pos.x + 2) continue;
      if (p.maxY < this.pos.y - 3 || p.minY > this.pos.y + 3) continue;
      boxes.push(p);
    }
    if (this.doorCollider && !this.doorOpen) boxes.push(this.doorCollider);

    for (const b of boxes) {
      const overlapX = this.pos.x + hx > b.minX && this.pos.x - hx < b.maxX;
      const overlapY = this.pos.y + hy > b.minY && this.pos.y - hy < b.maxY;
      if (!overlapX || !overlapY) continue;
      if (isX) {
        if (this.vel.x > 0) this.pos.x = b.minX - hx - 0.001;
        else if (this.vel.x < 0) this.pos.x = b.maxX + hx + 0.001;
        else {
          // pushed by platform? resolve minimal
          const dl = this.pos.x + hx - b.minX;
          const dr = b.maxX - (this.pos.x - hx);
          this.pos.x += dl < dr ? -dl - 0.001 : dr + 0.001;
        }
        this.vel.x = 0;
      } else {
        if (this.vel.y <= 0 && this.pos.y > (b.minY + b.maxY) / 2) {
          this.pos.y = b.maxY + hy + 0.001;
          this.vel.y = 0;
          this.onGround = true;
        } else if (this.vel.y > 0) {
          this.pos.y = b.minY - hy - 0.001;
          this.vel.y = 0;
        } else {
          // overlapping side while falling slightly inside — push out horizontally
          const dl = this.pos.x + hx - b.minX;
          const dr = b.maxX - (this.pos.x - hx);
          if (Math.min(dl, dr) < 0.2) this.pos.x += dl < dr ? -dl - 0.001 : dr + 0.001;
          else {
            this.pos.y = b.maxY + hy + 0.001;
            this.vel.y = 0;
            this.onGround = true;
          }
        }
      }
    }
  }

  private spikeHitbox(s: SpikeRuntime): { minX: number; maxX: number; minY: number; maxY: number } | null {
    if (s.pop < 0.5) return null;
    const [x, y] = s.def.pos;
    const d = s.def.dir;
    if (d === 'up') return { minX: x - 0.42, maxX: x + 0.42, minY: y - 0.1, maxY: y + 0.42 };
    if (d === 'down') return { minX: x - 0.42, maxX: x + 0.42, minY: y - 0.42, maxY: y + 0.1 };
    if (d === 'left') return { minX: x - 0.42, maxX: x + 0.1, minY: y - 0.42, maxY: y + 0.42 };
    return { minX: x - 0.1, maxX: x + 0.42, minY: y - 0.42, maxY: y + 0.42 };
  }

  private overlaps(a: { minX: number; maxX: number; minY: number; maxY: number }, shrink = 0): boolean {
    const hx = 0.3 - shrink, hy = 0.45 - shrink;
    return this.pos.x + hx > a.minX && this.pos.x - hx < a.maxX && this.pos.y + hy > a.minY && this.pos.y - hy < a.maxY;
  }

  private checkHazards() {
    // spikes
    for (const s of this.spikes) {
      const hb = this.spikeHitbox(s);
      if (hb && this.overlaps(hb, 0.08)) {
        this.die(s.def.hidden ? 'troll' : 'spike');
        return;
      }
    }
    // saws
    for (const s of this.saws) {
      const dx = this.pos.x - s.x;
      const dy = this.pos.y - s.y;
      const rr = s.def.radius * 0.82;
      // capsule-ish shrink for fairness
      if (dx * dx + dy * dy < (rr + 0.22) * (rr + 0.22) && Math.abs(dx) < rr + 0.3 && Math.abs(dy) < rr + 0.4) {
        this.die('saw');
        return;
      }
    }
    // stalactites falling
    for (const st of this.stals) {
      if (st.state === 'falling' || st.state === 'stuck') {
        const dx = Math.abs(this.pos.x - st.mesh.position.x);
        const dy = Math.abs(this.pos.y - st.mesh.position.y);
        if (dx < 0.42 && dy < 0.9) {
          this.die('troll');
          return;
        }
      }
    }
    // lava pools
    for (const l of this.level.lava) {
      const minX = l.pos[0] - l.size[0] / 2, maxX = l.pos[0] + l.size[0] / 2;
      const top = l.pos[1] + l.size[1] / 2 + 0.1;
      if (this.pos.x > minX && this.pos.x < maxX && this.pos.y - 0.45 < top && this.pos.y > l.pos[1] - 1) {
        sound.splash();
        this.die('lava');
        return;
      }
    }
  }

  private checkPickupWin() {
    // coins
    for (const c of this.coins) {
      if (c.taken) continue;
      const dx = this.pos.x - c.mesh.position.x;
      const dy = this.pos.y - c.mesh.position.y;
      if (dx * dx + dy * dy < 0.85) {
        c.taken = true;
        c.mesh.visible = false;
        this.coinsTaken++;
        sound.coin();
        this.burst(c.mesh.position.clone(), 0xffbe2e, 10, 4);
        this.cb.onCoin(this.coinsTaken, this.coins.length);
      }
    }
    // key
    if (this.keyPos && !this.hasKey && this.keyMesh?.visible) {
      const dx = this.pos.x - this.keyPos.x;
      const dy = this.pos.y - this.keyPos.y;
      if (dx * dx + dy * dy < 1.1) {
        this.hasKey = true;
        if (this.keyMesh) this.keyMesh.visible = false;
        this.doorOpen = true;
        sound.key();
        sound.door();
        this.shake = Math.max(this.shake, 0.3);
        this.burst(this.keyPos.clone(), 0xffd76a, 18, 5);
        this.cb.onKey();
      }
    }
    // exit
    const dx = this.pos.x - this.exitPos.x;
    const dy = this.pos.y - this.exitPos.y;
    const needsKey = !!this.level.door && !this.doorOpen;
    if (!needsKey && dx * dx + dy * dy < 1.7) {
      this.won = true;
      this.winT = 0;
      const token = this.winToken;
      sound.win();
      this.burst(this.exitPos.clone(), 0xff7a1a, 30, 7);
      this.burst(this.exitPos.clone(), 0xffe9a8, 20, 6);
      setTimeout(() => {
        if (!this.disposed && this.won && token === this.winToken) {
          this.cb.onWin({ time: this.levelTime, deaths: this.deaths, coins: this.coinsTaken, totalCoins: this.coins.length });
        }
      }, 1300);
    }
  }

  private animateDevil(dt: number) {
    if (!this.player.visible) return;
    const moving = Math.abs(this.vel.x) > 0.6;
    const inAir = !this.onGround;
    // face
    const targetRot = this.facing === 1 ? 0.18 : -0.18;
    this.pBody.rotation.y += (targetRot * 2 - this.pBody.rotation.y) * Math.min(1, dt * 10);
    // squash & stretch
    const sq = this.squash;
    const stretch = inAir ? THREE.MathUtils.clamp(this.vel.y * 0.012, -0.18, 0.28) : 0;
    this.pBody.scale.set(1 - sq * 0.7 - stretch * 0.4, 1 + sq + stretch, 1 - sq * 0.5);
    // lean
    this.pBody.rotation.z = THREE.MathUtils.clamp(-this.vel.x * 0.014, -0.18, 0.18);
    if (moving && !inAir) {
      const s = Math.sin(this.runPhase);
      const c = Math.cos(this.runPhase);
      this.legL.rotation.x = s * 0.9;
      this.legR.rotation.x = -s * 0.9;
      this.armL.rotation.x = -s * 0.8;
      this.armR.rotation.x = s * 0.8;
      this.pBody.position.y = Math.abs(c) * 0.06;
      this.head.rotation.z = Math.sin(this.runPhase * 0.5) * 0.06;
    } else if (inAir) {
      const up = this.vel.y > 1;
      this.legL.rotation.x = up ? -0.55 : 0.35;
      this.legR.rotation.x = up ? 0.45 : -0.3;
      this.armL.rotation.x = up ? -2.4 : -0.5;
      this.armR.rotation.x = up ? -2.2 : -0.6;
      this.head.rotation.x = up ? -0.12 : 0.1;
    } else {
      // idle breathe
      const b = Math.sin(this.time * 2.2) * 0.05;
      this.legL.rotation.x *= 0.8; this.legR.rotation.x *= 0.8;
      this.armL.rotation.x = b; this.armR.rotation.x = -b;
      this.pBody.position.y = Math.sin(this.time * 2.2) * 0.03;
      this.head.rotation.y = Math.sin(this.time * 0.9) * 0.25;
      this.head.position.y = 0.58 + Math.sin(this.time * 2.2) * 0.015;
    }
    this.tailSeg.rotation.y = Math.sin(this.time * 3.4) * 0.5;
    this.tailSeg.rotation.x = Math.sin(this.time * 2.1) * 0.2;
    this.playerLight.intensity = 7 + Math.sin(this.time * 7) * 1.2;
  }

  private updateCamera(dt: number) {
    const lookAhead = THREE.MathUtils.clamp(this.vel.x * 0.28, -2.2, 2.2);
    const tx = THREE.MathUtils.clamp(this.pos.x + lookAhead + 1.2, 7, Math.max(8, this.level.width - 5));
    const ty = THREE.MathUtils.clamp(this.pos.y + 1.4, 2.2, 12);
    const k = 1 - Math.pow(0.001, dt);
    this.camera.position.x += (tx - this.camera.position.x) * k;
    this.camera.position.y += (ty - this.camera.position.y) * k;
    this.camera.position.z = 10.2;
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.9;
      this.camera.position.x += rand(-s, s);
      this.camera.position.y += rand(-s, s);
      this.camera.rotation.z = rand(-s * 0.02, s * 0.02);
    } else {
      this.camera.rotation.z *= 0.9;
    }
    this.camera.lookAt(this.camera.position.x, this.camera.position.y - 0.4, 0);
  }

  getSnapshot() {
    return { time: this.levelTime, deaths: this.deaths, coins: this.coinsTaken, totalCoins: this.coins.length, hasKey: this.hasKey };
  }

  resetDeaths() { this.deaths = 0; }

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.dispose();
  }
}
