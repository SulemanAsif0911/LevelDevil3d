export type Dir = 'up' | 'down' | 'left' | 'right';

export interface PlatformDef {
  pos: [number, number]; // center
  size: [number, number]; // w,h
  kind?: 'stone' | 'crumble' | 'fake' | 'move' | 'ice';
  moveFrom?: [number, number];
  moveTo?: [number, number];
  moveSpeed?: number; // units/sec
  moveDelay?: number;
  phase?: number;
}

export interface SpikeDef {
  pos: [number, number];
  dir: Dir;
  hidden?: boolean;
  triggerRadius?: number;
  delay?: number;
}

export interface SawDef {
  pos: [number, number];
  radius: number;
  pathFrom?: [number, number];
  pathTo?: [number, number];
  speed?: number;
  phase?: number;
}

export interface StalactiteDef {
  pos: [number, number]; // hanging point
  fallRadius?: number;
}

export interface LevelDef {
  name: string;
  sub: string;
  hint: string;
  troll: string;
  par: number; // par time
  spawn: [number, number];
  exit: [number, number];
  killY: number;
  width: number;
  platforms: PlatformDef[];
  spikes: SpikeDef[];
  saws: SawDef[];
  coins: [number, number][];
  stalactites: StalactiteDef[];
  lava: { pos: [number, number]; size: [number, number] }[];
  key?: [number, number];
  door?: { pos: [number, number]; size: [number, number] };
  decorSeed?: number;
}

const G = (x: number, y: number, w: number, h = 1): PlatformDef => ({
  pos: [x, y],
  size: [w, h],
  kind: 'stone',
});

export const LEVELS: LevelDef[] = [
  // ------------------------------------------------ 1
  {
    name: 'Fresh Meat',
    sub: 'Welcome to Hell — trust nothing.',
    hint: 'A / D or ← → to move • SPACE to jump. Reach the portal.',
    troll: 'That last spike? Yeah. It was always there.',
    par: 22,
    spawn: [2, 2.5],
    exit: [29, 2.2],
    killY: -6,
    width: 32,
    platforms: [
      G(4, 0, 9),          // start ground
      G(11.5, 1.2, 3),     // step
      G(15.5, 2.2, 3),
      G(20, 1.2, 5),       // middle
      { pos: [24.2, 0.5], size: [1.6, 1], kind: 'stone' },
      G(28.5, 0, 7),
    ],
    spikes: [
      { pos: [19, 1.7], dir: 'up' },                       // visible lesson
      { pos: [26.6, 0.5], dir: 'up', hidden: true, triggerRadius: 2.2 }, // troll at exit run
    ],
    saws: [],
    coins: [[11.5, 2.6], [15.5, 3.6], [20, 2.6]],
    stalactites: [],
    lava: [],
    decorSeed: 11,
  },
  // ------------------------------------------------ 2
  {
    name: 'Trust Issues',
    sub: 'The floor is lava. Literally. Sometimes.',
    hint: 'Some floors are FAKE — they drop. Keep moving. Spikes pop when you get close.',
    troll: 'You stood exactly where we wanted you to.',
    par: 30,
    spawn: [2, 2.5],
    exit: [36, 3.4],
    killY: -7,
    width: 39,
    platforms: [
      G(3.5, 0, 7),
      { pos: [9, 0], size: [3, 1], kind: 'fake' },
      G(13.5, 0, 4),
      G(18, 1, 3),
      { pos: [22, 1], size: [2.6, 1], kind: 'fake' },
      G(26.5, 2, 4),
      G(31.5, 2, 3),
      G(36, 2, 5),
    ],
    spikes: [
      { pos: [13.5, 0.5], dir: 'up', hidden: true, triggerRadius: 2.4 },
      { pos: [18, 1.5], dir: 'up', hidden: true, triggerRadius: 2.0 },
      { pos: [26.5, 2.5], dir: 'up', hidden: true, triggerRadius: 2.4 },
      { pos: [33.2, 2.5], dir: 'up' },
    ],
    saws: [{ pos: [29, 3.2], radius: 0.55, pathFrom: [28, 3.2], pathTo: [30.5, 3.2], speed: 1.6 }],
    coins: [[9, 1.6], [22, 2.6], [31.5, 3.4]],
    stalactites: [],
    lava: [{ pos: [21.8, -2.2], size: [16, 1.2] }],
    decorSeed: 23,
  },
  // ------------------------------------------------ 3
  {
    name: 'Saw Hello',
    sub: 'Round, shiny, extremely unfriendly.',
    hint: 'Saws patrol. Watch the rhythm, then commit. No hesitation in hell.',
    troll: 'The gap closed behind you. Rude, we know.',
    par: 34,
    spawn: [2, 2.5],
    exit: [38, 2.2],
    killY: -6,
    width: 41,
    platforms: [
      G(4, 0, 9),
      G(11, 0, 2.5),
      G(15.5, 1, 3),
      G(20.5, 0, 4),
      G(25.5, 1, 3),
      G(30, 0, 4),
      G(36.5, 0, 7),
    ],
    spikes: [
      { pos: [12, 0.5], dir: 'up', hidden: true, triggerRadius: 2.2 },
      { pos: [24, 1.5], dir: 'up', hidden: true, triggerRadius: 2.0 },
      { pos: [34.5, 0.5], dir: 'up' },
    ],
    saws: [
      { pos: [11, 1.4], radius: 0.6, pathFrom: [10, 1.4], pathTo: [12.2, 1.4], speed: 2.0 },
      { pos: [20.5, 1.6], radius: 0.7, pathFrom: [20.5, 1.2], pathTo: [20.5, 3.2], speed: 1.5 },
      { pos: [27.5, 1.5], radius: 0.6, pathFrom: [26, 1.5], pathTo: [29.2, 1.5], speed: 2.4 },
      { pos: [32, 1.5], radius: 0.55 },
    ],
    coins: [[15.5, 2.4], [20.5, 3.8], [30, 1.6]],
    stalactites: [],
    lava: [{ pos: [13.2, -2.4], size: [2.6, 1] }],
    decorSeed: 37,
  },
  // ------------------------------------------------ 4
  {
    name: 'Up & Over',
    sub: 'Hell has verticality. And gravity.',
    hint: 'Climb the tower. Crumble blocks break after you touch them. Stalactites fall. Keep climbing.',
    troll: 'Look up. No — up UP.',
    par: 44,
    spawn: [2, 1.5],
    exit: [6, 12.4],
    killY: -6,
    width: 22,
    platforms: [
      G(4, 0, 9),
      G(9.5, 1.5, 3),
      { pos: [6.5, 3], size: [2.4, 0.8], kind: 'crumble' },
      G(3.5, 4.5, 2.6),
      { pos: [7.5, 6], size: [2.4, 0.8], kind: 'crumble' },
      G(11, 7, 3),
      G(7, 8.2, 2.4),
      { pos: [3.8, 9.4], size: [2.2, 0.8], kind: 'crumble' },
      G(6.5, 11, 6),
      G(14.5, 4, 3),
    ],
    spikes: [
      { pos: [9.5, 2.0], dir: 'up', hidden: true, triggerRadius: 2.2 },
      { pos: [7, 8.7], dir: 'up', hidden: true, triggerRadius: 2.0 },
      { pos: [5.2, 11.5], dir: 'up', hidden: true, triggerRadius: 2.2 },
    ],
    saws: [{ pos: [11, 8.2], radius: 0.55, pathFrom: [9.8, 8.2], pathTo: [12.2, 8.2], speed: 1.4 }],
    coins: [[6.5, 4.2], [11, 8.4], [3.8, 10.6]],
    stalactites: [{ pos: [3.5, 7.5] }, { pos: [7, 11] }, { pos: [10.5, 4.5] }],
    lava: [{ pos: [4, -2.4], size: [14, 1] }],
    decorSeed: 51,
  },
  // ------------------------------------------------ 5
  {
    name: 'Key To Hell',
    sub: 'No key, no escape. Classic.',
    hint: 'Grab the KEY to dissolve the demon gate, then reach the portal. The key is… guarded.',
    troll: 'The gate ate your confidence. Tasty.',
    par: 40,
    spawn: [2, 2.5],
    exit: [37, 2.2],
    killY: -6,
    width: 40,
    platforms: [
      G(4, 0, 8),
      G(10.5, 1.5, 3),
      G(15, 0.5, 4),
      G(20, 2, 3.5),
      G(25, 0.5, 4),
      G(30.5, 1.5, 3),
      G(36.5, 0, 7),
    ],
    spikes: [
      { pos: [15, 1.0], dir: 'up', hidden: true, triggerRadius: 2.2 },
      { pos: [20, 2.5], dir: 'up', hidden: true, triggerRadius: 2.0 },
      { pos: [30.5, 2.0], dir: 'up', hidden: true, triggerRadius: 2.2 },
    ],
    saws: [
      { pos: [20, 3.6], radius: 0.55, pathFrom: [18.8, 3.6], pathTo: [21.2, 3.6], speed: 1.8 },
      { pos: [25, 2.0], radius: 0.6, pathFrom: [25, 1.2], pathTo: [25, 3.0], speed: 1.6 },
    ],
    coins: [[10.5, 2.9], [25, 3.8], [34, 2.6]],
    stalactites: [{ pos: [15, 4.5] }],
    lava: [],
    key: [20, 3.1],
    door: { pos: [33, 1.6], size: [0.7, 3.2] },
    decorSeed: 68,
  },
  // ------------------------------------------------ 6
  {
    name: 'Crusher Alley',
    sub: 'Ride or fry. The lava is patient.',
    hint: 'Moving platforms over lava. Time your jumps — saws sweep the sky-bridge.',
    troll: 'You hesitated. The lava noticed.',
    par: 46,
    spawn: [2, 2.5],
    exit: [40, 3.4],
    killY: -4.5,
    width: 43,
    platforms: [
      G(3.5, 0, 7),
      { pos: [9, 1], size: [2.4, 0.7], kind: 'move', moveFrom: [9, 1], moveTo: [9, 3], moveSpeed: 1.6 },
      { pos: [13.5, 2], size: [2.4, 0.7], kind: 'move', moveFrom: [12, 2], moveTo: [15, 2], moveSpeed: 1.8 },
      G(18.5, 2, 3),
      { pos: [22.5, 2], size: [2.4, 0.7], kind: 'move', moveFrom: [21, 2], moveTo: [24, 2], moveSpeed: 2.2 },
      G(27.5, 2.5, 3),
      { pos: [31.5, 2.5], size: [2.4, 0.7], kind: 'move', moveFrom: [31.5, 1], moveTo: [31.5, 3.4], moveSpeed: 1.7 },
      G(36, 2, 3.5),
      G(40.5, 2, 4),
    ],
    spikes: [{ pos: [18.5, 2.5], dir: 'up', hidden: true, triggerRadius: 2.2 }],
    saws: [
      { pos: [18.5, 4], radius: 0.6, pathFrom: [17.2, 4], pathTo: [19.8, 4], speed: 1.8 },
      { pos: [27.5, 4.2], radius: 0.65, pathFrom: [26.2, 4.2], pathTo: [28.8, 4.2], speed: 2.2 },
    ],
    coins: [[13.5, 3.4], [22.5, 3.4], [31.5, 4.4]],
    stalactites: [],
    lava: [{ pos: [17, -2.2], size: [26, 1.4] }],
    decorSeed: 84,
  },
  // ------------------------------------------------ 7
  {
    name: 'The Gauntlet',
    sub: 'Everything you hate, in one hallway.',
    hint: 'Fake floors, hidden spikes, patrolling saws, falling rock. Breathe. Then run.',
    troll: 'We counted your deaths. We lost count.',
    par: 55,
    spawn: [2, 2.5],
    exit: [44, 2.2],
    killY: -7,
    width: 47,
    platforms: [
      G(3.5, 0, 7),
      { pos: [9, 0.2], size: [2.6, 0.8], kind: 'fake' },
      G(13, 0, 3.5),
      G(17.5, 1.2, 3),
      { pos: [21.5, 1.2], size: [2.2, 0.8], kind: 'crumble' },
      G(25.5, 1.2, 3),
      G(30, 0.5, 3.5),
      { pos: [34.5, 0.5], size: [2.6, 0.8], kind: 'fake' },
      G(39, 0, 4),
      G(44, 0, 6),
    ],
    spikes: [
      { pos: [13, 0.5], dir: 'up', hidden: true, triggerRadius: 2.2 },
      { pos: [17.5, 1.7], dir: 'up', hidden: true, triggerRadius: 2.0 },
      { pos: [25.5, 1.7], dir: 'up', hidden: true, triggerRadius: 2.2 },
      { pos: [30, 1.0], dir: 'up', hidden: true, triggerRadius: 2.0 },
      { pos: [39, 0.5], dir: 'up' },
    ],
    saws: [
      { pos: [17.5, 2.8], radius: 0.55, pathFrom: [16.2, 2.8], pathTo: [18.8, 2.8], speed: 2.0 },
      { pos: [30, 2.2], radius: 0.6, pathFrom: [30, 1.4], pathTo: [30, 3.2], speed: 1.9 },
    ],
    coins: [[9, 1.8], [21.5, 2.6], [34.5, 2.0], [39, 1.8]],
    stalactites: [{ pos: [25.5, 5] }, { pos: [39, 4] }],
    lava: [{ pos: [34.2, -2.4], size: [3.4, 1] }],
    key: [21.5, 2.5],
    door: { pos: [41.5, 1.6], size: [0.7, 3.2] },
    decorSeed: 99,
  },
  // ------------------------------------------------ 8
  {
    name: "Devil's Deal",
    sub: 'Sign here. In blood. Good luck.',
    hint: 'The final trial. Every trick at once. The portal is real this time. Probably.',
    troll: 'One more try. You were so close. Were you?',
    par: 70,
    spawn: [2, 2.5],
    exit: [48, 4.4],
    killY: -7,
    width: 51,
    platforms: [
      G(3.5, 0, 7),
      { pos: [9.5, 1], size: [2.2, 0.7], kind: 'move', moveFrom: [9.5, 1], moveTo: [9.5, 3], moveSpeed: 1.8 },
      G(14, 2.5, 2.6),
      { pos: [18, 2.5], size: [2.4, 0.7], kind: 'crumble' },
      G(22.5, 1.5, 3),
      { pos: [27, 1.5], size: [2.4, 0.7], kind: 'move', moveFrom: [25.5, 1.5], moveTo: [28.5, 1.5], moveSpeed: 2.4 },
      G(32, 2.5, 3),
      { pos: [36.5, 2.5], size: [2.2, 0.8], kind: 'fake' },
      G(40.5, 3, 3),
      G(44.5, 3, 2.6),
      G(48.5, 3, 5),
    ],
    spikes: [
      { pos: [14, 3.0], dir: 'up', hidden: true, triggerRadius: 2.2 },
      { pos: [22.5, 2.0], dir: 'up', hidden: true, triggerRadius: 2.0 },
      { pos: [32, 3.0], dir: 'up', hidden: true, triggerRadius: 2.2 },
      { pos: [40.5, 3.5], dir: 'up', hidden: true, triggerRadius: 2.0 },
      { pos: [46.5, 3.5], dir: 'up' },
    ],
    saws: [
      { pos: [22.5, 3.4], radius: 0.6, pathFrom: [21.2, 3.4], pathTo: [23.8, 3.4], speed: 2.2 },
      { pos: [32, 4.4], radius: 0.65, pathFrom: [30.8, 4.4], pathTo: [33.2, 4.4], speed: 2.0 },
      { pos: [44.5, 4.6], radius: 0.6, pathFrom: [43.4, 4.6], pathTo: [45.6, 4.6], speed: 2.4 },
    ],
    coins: [[9.5, 3.8], [18, 3.9], [27, 2.9], [36.5, 4.0], [44.5, 5.6]],
    stalactites: [{ pos: [14, 6] }, { pos: [32, 6] }, { pos: [48.5, 7] }],
    lava: [{ pos: [20, -2.6], size: [22, 1.4] }],
    key: [36.5, 3.9],
    door: { pos: [46, 4.6], size: [0.7, 3.2] },
    decorSeed: 133,
  },
];

export const TROLL_QUIPS = [
  'Oops! Did that hurt?',
  'So close! Not really.',
  'The floor sends its regards.',
  'Hell remembers that one.',
  'Again? Bold strategy.',
  'That spike was always there. Probably.',
  'Even the devil winced.',
  'Speedrun strats: not dying.',
  ' respawn speed: demonic.',
  'Trust issues: unlocked.',
  'The portal misses you.',
  'Skill issue? In THIS economy?',
];

export const WIN_QUIPS = [
  'Escaped. Barely.',
  'Hell lets you leave. For now.',
  'The devil applauds sarcastically.',
  'Certified not-a-noob.',
];
