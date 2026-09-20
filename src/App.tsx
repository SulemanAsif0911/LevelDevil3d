import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Flame, Play, Skull, Timer, Coins, KeyRound, Pause, RotateCcw,
  Volume2, VolumeX, Home, Trophy, Gamepad2, Info, Settings as SettingsIcon,
  X, Lock, ChevronRight, ChevronLeft, Flag, Zap, Ghost, Crown, Sparkles, DoorOpen, TriangleAlert,
} from 'lucide-react';
import { DevilEngine } from './game/engine';
import { LEVELS, TROLL_QUIPS, WIN_QUIPS } from './game/levels';
import { sound } from './game/audio';

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
};

const DIFF = [1, 2, 2, 3, 3, 4, 5, 5];
const DIFF_LABEL = ['Tutorial', 'Tricky', 'Tricky', 'Spicy', 'Spicy', 'Brutal', 'Brutal', 'NIGHTMARE'];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DevilEngine | null>(null);
  const [screen, setScreen] = useState<'menu' | 'game' | 'victory'>('menu');
  const [levelIdx, setLevelIdx] = useState(0);
  const [unlocked, setUnlocked] = useState(() => Number(localStorage.getItem('devil3d_unlocked') ?? 0));
  const [deaths, setDeaths] = useState(0);
  const [totalDeaths, setTotalDeaths] = useState(() => Number(localStorage.getItem('devil3d_totalDeaths') ?? 0));
  const [coins, setCoins] = useState(0);
  const [totalCoinsAll, setTotalCoinsAll] = useState(() => Number(localStorage.getItem('devil3d_coins') ?? 0));
  const [time, setTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [quip, setQuip] = useState<string | null>(null);
  const [winInfo, setWinInfo] = useState<{ time: number; deaths: number; coins: number; totalCoins: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('devil3d_muted') === '1');
  const [highQ, setHighQ] = useState(() => localStorage.getItem('devil3d_q') !== 'low');
  const [showLevels, setShowLevels] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [intro, setIntro] = useState(true);
  const [keyToast, setKeyToast] = useState(false);
  const [flash, setFlash] = useState(0);
  const quipTimer = useRef<number | null>(null);
  const [touch, setTouchState] = useState({ left: false, right: false, jump: false });
  const touchRef = useRef(touch);
  touchRef.current = touch;

  const bestTimes = useMemo(() => {
    return LEVELS.map((_, i) => {
      const v = localStorage.getItem(`devil3d_best_${i}`);
      return v ? Number(v) : null;
    });
  }, [winInfo, unlocked]);

  const totalBest = useMemo(() => LEVELS.reduce((a, l) => a + l.coins.length, 0), []);

  // ---------- engine lifecycle ----------
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new DevilEngine(canvasRef.current, {
      onDeath: (q) => {
        setDeaths((d) => d + 1);
        setTotalDeaths((t) => {
          const n = t + 1;
          localStorage.setItem('devil3d_totalDeaths', String(n));
          return n;
        });
        setQuip(q);
        setFlash((f) => f + 1);
        if (quipTimer.current) window.clearTimeout(quipTimer.current);
        quipTimer.current = window.setTimeout(() => setQuip(null), 1700);
      },
      onCoin: (c) => setCoins(c),
      onWin: (stats) => {
        setWinInfo(stats);
        setTotalCoinsAll((t) => {
          const n = t + stats.coins;
          localStorage.setItem('devil3d_coins', String(n));
          return n;
        });
        const prev = localStorage.getItem(`devil3d_best_${levelIdxRef.current}`);
        if (!prev || stats.time < Number(prev)) localStorage.setItem(`devil3d_best_${levelIdxRef.current}`, String(stats.time));
        setUnlocked((u) => {
          const n = Math.max(u, Math.min(LEVELS.length - 1, levelIdxRef.current + 1));
          // if finished last, keep max
          const nu = levelIdxRef.current >= LEVELS.length - 1 ? LEVELS.length - 1 : n;
          localStorage.setItem('devil3d_unlocked', String(nu));
          return nu;
        });
      },
      onKey: () => {
        setHasKey(true);
        setKeyToast(true);
        window.setTimeout(() => setKeyToast(false), 2200);
      },
      onProgress: (p) => setProgress(p),
    });
    engineRef.current = engine;
    engine.loadLevel(0, LEVELS[0]);
    engine.start();
    sound.setMuted(localStorage.getItem('devil3d_muted') === '1');
    if (localStorage.getItem('devil3d_q') === 'low') engine.setQuality(false);
    return () => engine.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const levelIdxRef = useRef(levelIdx);
  levelIdxRef.current = levelIdx;

  // timer ticker
  useEffect(() => {
    if (screen !== 'game' || paused || winInfo) return;
    const id = window.setInterval(() => {
      const s = engineRef.current?.getSnapshot();
      if (s) {
        setTime(s.time);
        setCoins(s.coins);
        setHasKey(s.hasKey);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [screen, paused, winInfo, levelIdx]);

  // touch -> engine
  useEffect(() => {
    engineRef.current?.setTouch(touch.left, touch.right, touch.jump);
  }, [touch]);

  // keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (screen !== 'game') return;
      if (e.key.toLowerCase() === 'r') restartLevel();
      if (e.key === 'Escape') setPaused((p) => !p);
      if (e.key.toLowerCase() === 'm') toggleMute();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, levelIdx]);

  // pause engine
  useEffect(() => {
    if (paused) engineRef.current?.pause();
    else engineRef.current?.resume();
  }, [paused]);

  const startLevel = useCallback((idx: number) => {
    sound.unlock();
    sound.click();
    sound.startMusic();
    setLevelIdx(idx);
    levelIdxRef.current = idx;
    setDeaths(0);
    setCoins(0);
    setTime(0);
    setProgress(0);
    setHasKey(false);
    setNeedsKey(!!LEVELS[idx].door);
    setWinInfo(null);
    setQuip(null);
    setPaused(false);
    setIntro(true);
    setScreen('game');
    // load after paint so canvas sized
    requestAnimationFrame(() => {
      engineRef.current?.loadLevel(idx, LEVELS[idx]);
      engineRef.current?.resetDeaths();
      window.setTimeout(() => setIntro(false), 3200);
    });
  }, []);

  const restartLevel = useCallback(() => {
    sound.click();
    setDeaths(0);
    setCoins(0);
    setTime(0);
    setHasKey(false);
    setWinInfo(null);
    setPaused(false);
    engineRef.current?.loadLevel(levelIdxRef.current, LEVELS[levelIdxRef.current]);
    engineRef.current?.resetDeaths();
  }, []);

  const nextLevel = useCallback(() => {
    if (levelIdxRef.current >= LEVELS.length - 1) {
      setScreen('victory');
      setWinInfo(null);
    } else {
      startLevel(levelIdxRef.current + 1);
    }
  }, [startLevel]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const n = !m;
      localStorage.setItem('devil3d_muted', n ? '1' : '0');
      sound.setMuted(n);
      return n;
    });
  }, []);

  const toggleQuality = useCallback(() => {
    setHighQ((q) => {
      const n = !q;
      localStorage.setItem('devil3d_q', n ? 'high' : 'low');
      engineRef.current?.setQuality(n);
      return n;
    });
  }, []);

  const goMenu = useCallback(() => {
    sound.click();
    setScreen('menu');
    setPaused(false);
    setWinInfo(null);
    engineRef.current?.resume();
  }, []);

  const embers = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    left: (i * 37.7) % 100,
    delay: (i * 0.7) % 6,
    dur: 5 + ((i * 13) % 7),
    size: 2 + ((i * 7) % 4),
  })), []);

  const lvl = LEVELS[levelIdx];
  const isTouch = useMemo(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0), []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0608] vignette scanlines">
      {/* 3D canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ width: '100%', height: '100%' }} />

      {/* rising embers overlay (menu + game ambience) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {embers.map((e, i) => (
          <span
            key={i}
            className="absolute bottom-[-10px] rounded-full bg-orange-400 blur-[1px]"
            style={{
              left: `${e.left}%`,
              width: e.size, height: e.size,
              boxShadow: '0 0 8px 2px rgba(255,110,20,.7)',
              animation: `ember-rise ${e.dur}s linear ${e.delay}s infinite`,
              opacity: 0.8,
            }}
          />
        ))}
      </div>

      {/* death flash */}
      {flash > 0 && <DeathFlash key={flash} />}

      {/* lava top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-red-950/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#ff3d00]/15 to-transparent" />

      {/* ==================== MENU ==================== */}
      {screen === 'menu' && (
        <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-black/70 via-[#140708]/80 to-black/85 backdrop-blur-[2px]">
          <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col items-center px-5 py-8 md:py-12">
            {/* top bar */}
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-orange-500 shadow-lg shadow-red-900/50">
                  <Flame className="h-5 w-5 text-white" />
                </div>
                <div className="leading-tight">
                  <div className="font-display text-[11px] font-800 tracking-[0.3em] text-orange-200/90" style={{ fontWeight: 800 }}>INFERNO ARCADE</div>
                  <div className="font-mono2 text-[10px] text-white/40">v3.0 • poly.pizza edition</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { sound.unlock(); sound.click(); setShowHow(true); }} className="btn-ghost flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white/85">
                  <Info className="h-4 w-4" /> <span className="hidden sm:inline">How to play</span>
                </button>
                <button onClick={() => { sound.unlock(); sound.click(); setShowSettings(true); }} className="btn-ghost flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white/85">
                  <SettingsIcon className="h-4 w-4" /> <span className="hidden sm:inline">Settings</span>
                </button>
              </div>
            </div>

            {/* hero */}
            <div className="mt-8 text-center md:mt-12">
              <div className="animate-pop-in mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-950/50 px-4 py-1.5 text-[11px] font-bold tracking-[0.25em] text-red-200">
                <Skull className="h-3.5 w-3.5" /> 8 LEVELS • 100+ TROLL TRAPS • 0 MERCY
              </div>
              <h1 className="font-display animate-title-glow text-center text-[13vw] font-black leading-[0.9] text-transparent sm:text-7xl md:text-8xl"
                style={{
                  backgroundImage: 'linear-gradient(180deg,#fff7e8 8%,#ffc46b 32%,#ff6a1a 55%,#e01e0e 72%,#7a0d0d 100%)',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text',
                  filter: 'drop-shadow(0 6px 30px rgba(255,60,10,.35))',
                }}>
                LEVEL<br />DEVIL <span className="align-top text-[0.45em] text-orange-300" style={{ WebkitTextStroke: '0' }}>3D</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-balance text-sm leading-relaxed text-white/60 md:text-base">
                A rage platformer from the depths. Sprint, leap and curse your way through collapsing floors,
                <span className="text-orange-300"> hidden spikes</span>, patrolling saws and falling rock.
                The exit is real. Probably.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button onClick={() => startLevel(Math.min(unlocked, LEVELS.length - 1))} className="btn-lava group flex h-14 items-center gap-3 rounded-2xl px-8 font-display text-sm font-800 tracking-widest text-white transition-transform hover:scale-[1.03] active:scale-95" style={{ fontWeight: 800 }}>
                  <Play className="h-5 w-5 fill-white transition-transform group-hover:scale-125" />
                  {unlocked > 0 ? `CONTINUE — LEVEL ${unlocked + 1}` : 'ENTER HELL'}
                </button>
                <button onClick={() => { sound.click(); setShowLevels(true); }} className="btn-ghost flex h-14 items-center gap-2 rounded-2xl px-6 font-display text-xs font-bold tracking-widest text-white">
                  <Flag className="h-4 w-4 text-orange-400" /> LEVEL SELECT
                </button>
              </div>
              {/* stats strip */}
              <div className="mx-auto mt-7 grid max-w-2xl grid-cols-3 gap-2.5">
                {[
                  { icon: Skull, label: 'TOTAL DEATHS', value: String(totalDeaths) },
                  { icon: Coins, label: 'SOULS (COINS)', value: `${totalCoinsAll}/${totalBest}` },
                  { icon: Trophy, label: 'BEST CLEAR', value: bestTimes.filter(Boolean).length + '/8' },
                ].map((s, i) => (
                  <div key={i} className="glass rounded-2xl px-3 py-3.5 text-center">
                    <s.icon className="mx-auto h-4 w-4 text-orange-400" />
                    <div className="font-display mt-1 text-lg font-800 text-white" style={{ fontWeight: 800 }}>{s.value}</div>
                    <div className="font-mono2 text-[9px] tracking-[0.2em] text-white/40">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* level cards preview */}
            <div className="mt-10 w-full">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xs font-bold tracking-[0.3em] text-white/70">CHOOSE YOUR SUFFERING</h2>
                <button onClick={() => setShowLevels(true)} className="flex items-center gap-1 text-xs font-bold text-orange-300 hover:text-orange-200">All levels <ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {LEVELS.slice(0, 4).map((l, i) => (
                  <LevelCard key={i} index={i} name={l.name} diff={DIFF[i]} label={DIFF_LABEL[i]} locked={i > unlocked} best={bestTimes[i]} par={l.par} onPlay={() => startLevel(i)} compact />
                ))}
              </div>
            </div>

            {/* poly.pizza credit banner */}
            <div className="glass mt-6 flex w-full flex-col items-center gap-2 rounded-2xl p-5 text-center md:flex-row md:text-left">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 font-display text-lg font-black text-black">Q</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white">3D models — Quaternius via <span className="text-amber-300">poly.pizza</span> <span className="ml-1 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono2 text-[10px] text-emerald-300">CC0</span></div>
                <div className="text-xs text-white/50">Ultimate Platformer Pack • Animated Characters • Dungeon & Nature kits — rebuilt as optimized procedural low-poly for 60fps. Full credits in-game.</div>
              </div>
              <button onClick={() => setShowCredits(true)} className="btn-ghost rounded-xl px-4 py-2.5 text-xs font-bold text-white">VIEW CREDITS</button>
            </div>

            <div className="mt-6 pb-4 text-center font-mono2 text-[10px] tracking-widest text-white/30">
              THREE.JS • WEBAUDIO SYNTH • NO ASSETS • KEYBOARD + TOUCH • R TO RESTART • ESC TO PAUSE
            </div>
          </div>
        </div>
      )}

      {/* ==================== GAME ==================== */}
      {(screen === 'game' || screen === 'victory') && screen === 'game' && (
        <>
          {/* HUD top */}
          <div className="pointer-events-none absolute inset-x-0 top-0 p-3 md:p-5">
            <div className="mx-auto flex max-w-6xl flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="pointer-events-auto flex items-center gap-2">
                  <button onClick={goMenu} className="btn-ghost flex h-10 w-10 items-center justify-center rounded-xl text-white/80"><Home className="h-4.5 w-4.5" /></button>
                  <div className="glass flex h-10 items-center gap-3 rounded-xl px-3.5">
                    <span className="font-display rounded-lg bg-gradient-to-br from-red-600 to-orange-500 px-2 py-0.5 text-[11px] font-black text-white">{String(levelIdx + 1).padStart(2, '0')}</span>
                    <span className="font-display text-[13px] font-bold tracking-wide text-white">{lvl.name}</span>
                    <span className="hidden font-mono2 text-[10px] text-white/40 md:inline">{lvl.sub}</span>
                  </div>
                </div>
                <div className="pointer-events-auto flex items-center gap-2">
                  <div className="glass hidden h-10 items-center gap-2 rounded-xl px-3.5 sm:flex">
                    <Timer className="h-4 w-4 text-cyan-300" />
                    <span className="font-mono2 text-sm font-bold text-white tabular-nums">{fmt(time)}</span>
                    <span className="font-mono2 text-[10px] text-white/35">PAR {fmt(lvl.par)}</span>
                  </div>
                  <div className="glass flex h-10 items-center gap-2 rounded-xl px-3.5">
                    <Skull className="h-4 w-4 text-red-400" />
                    <span className="font-mono2 text-sm font-bold text-white tabular-nums">{deaths}</span>
                  </div>
                  <div className="glass flex h-10 items-center gap-2 rounded-xl px-3.5">
                    <Coins className="h-4 w-4 text-amber-300" />
                    <span className="font-mono2 text-sm font-bold text-white tabular-nums">{coins}/{lvl.coins.length}</span>
                  </div>
                  {needsKey && (
                    <div className={`flex h-10 items-center gap-2 rounded-xl border px-3.5 ${hasKey ? 'border-amber-300/50 bg-amber-400/15' : 'glass'}`}>
                      <KeyRound className={`h-4 w-4 ${hasKey ? 'text-amber-300' : 'text-white/40'}`} />
                      {!hasKey && <span className="hidden text-[11px] font-bold text-white/50 md:inline">FIND KEY</span>}
                    </div>
                  )}
                  <button onClick={restartLevel} title="Restart (R)" className="btn-ghost flex h-10 w-10 items-center justify-center rounded-xl text-white/85"><RotateCcw className="h-4.5 w-4.5" /></button>
                  <button onClick={toggleMute} className="btn-ghost hidden h-10 w-10 items-center justify-center rounded-xl text-white/85 sm:flex">{muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}</button>
                  <button onClick={() => setPaused(true)} className="btn-ghost flex h-10 w-10 items-center justify-center rounded-xl text-white/85"><Pause className="h-4.5 w-4.5" /></button>
                </div>
              </div>
              {/* progress */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-amber-300 transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%`, boxShadow: '0 0 12px rgba(255,120,20,.8)' }} />
                </div>
                <span className="font-mono2 text-[10px] font-bold text-white/50 tabular-nums">{Math.round(progress * 100)}%</span>
              </div>
            </div>
          </div>

          {/* level intro card */}
          {intro && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="animate-pop-in glass max-w-md rounded-3xl p-6 text-center md:p-8">
                <div className="font-mono2 text-[10px] font-bold tracking-[0.35em] text-orange-300">LEVEL {levelIdx + 1} / 8 — {DIFF_LABEL[levelIdx]}</div>
                <div className="font-display mt-2 text-3xl font-black text-white md:text-4xl">{lvl.name}</div>
                <div className="mt-1 text-xs text-white/50">{lvl.sub}</div>
                <div className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-3 text-[13px] leading-relaxed text-orange-100">{lvl.hint}</div>
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Flame key={i} className={`h-3.5 w-3.5 ${i < DIFF[levelIdx] ? 'text-orange-400' : 'text-white/15'}`} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* death quip */}
          {quip && !winInfo && (
            <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center px-6">
              <div key={quip + deaths} className="animate-pop-in flex items-center gap-2.5 rounded-2xl border border-red-500/40 bg-[#1a0808]/90 px-5 py-3 shadow-2xl shadow-red-950 backdrop-blur-md">
                <Skull className="h-5 w-5 shrink-0 text-red-400" />
                <span className="text-sm font-bold text-red-100">#{deaths} — {quip}</span>
              </div>
            </div>
          )}

          {/* key toast */}
          {keyToast && (
            <div className="pointer-events-none absolute inset-x-0 top-[32%] flex justify-center px-6">
              <div className="animate-pop-in flex items-center gap-2.5 rounded-2xl border border-amber-300/50 bg-amber-950/90 px-5 py-3 shadow-2xl shadow-amber-950 backdrop-blur-md">
                <KeyRound className="h-5 w-5 text-amber-300" />
                <span className="text-sm font-bold text-amber-100">Demon gate dissolved — RUN!</span>
              </div>
            </div>
          )}

          {/* mobile controls */}
          {isTouch && !winInfo && !paused && (
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-6">
              <div className="flex gap-2.5">
                <TouchBtn label="left" onChange={(v) => setTouchState((t) => ({ ...t, left: v }))}>
                  <ChevronLeft className="h-8 w-8" />
                </TouchBtn>
                <TouchBtn label="right" onChange={(v) => setTouchState((t) => ({ ...t, right: v }))}>
                  <ChevronRight className="h-8 w-8" />
                </TouchBtn>
              </div>
              <TouchBtn big label="jump" onChange={(v) => setTouchState((t) => ({ ...t, jump: v }))}>
                <span className="font-display text-xs font-black">JUMP</span>
              </TouchBtn>
            </div>
          )}

          {/* desktop hint */}
          {!isTouch && !intro && !winInfo && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/50 px-5 py-1.5 font-mono2 text-[10px] tracking-widest text-white/40 backdrop-blur-md md:flex">
              <span>A/D MOVE</span><span className="text-orange-500">•</span><span>SPACE JUMP</span><span className="text-orange-500">•</span><span>R RESTART</span><span className="text-orange-500">•</span><span>ESC PAUSE</span>
            </div>
          )}

          {/* pause */}
          {paused && !winInfo && (
            <Overlay onClose={() => setPaused(false)}>
              <div className="font-mono2 text-[10px] font-bold tracking-[0.35em] text-orange-300">PAUSED IN HELL</div>
              <h2 className="font-display mt-1 text-3xl font-black text-white">{lvl.name}</h2>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { icon: Timer, v: fmt(time), l: 'TIME' },
                  { icon: Skull, v: String(deaths), l: 'DEATHS' },
                  { icon: Coins, v: `${coins}/${lvl.coins.length}`, l: 'SOULS' },
                ].map((s, i) => (
                  <div key={i} className="rounded-2xl bg-white/5 p-3 text-center">
                    <s.icon className="mx-auto h-4 w-4 text-orange-400" />
                    <div className="font-mono2 mt-1 text-sm font-bold text-white">{s.v}</div>
                    <div className="font-mono2 text-[9px] tracking-widest text-white/40">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button onClick={() => setPaused(false)} className="btn-lava flex h-12 items-center justify-center gap-2 rounded-xl font-display text-xs font-black tracking-widest text-white"><Play className="h-4 w-4 fill-white" /> RESUME</button>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={restartLevel} className="btn-ghost flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-white"><RotateCcw className="h-4 w-4" /> Retry</button>
                  <button onClick={toggleMute} className="btn-ghost flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-white">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {muted ? 'Unmute' : 'Mute'}</button>
                  <button onClick={goMenu} className="btn-ghost flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-white"><Home className="h-4 w-4" /> Menu</button>
                </div>
              </div>
            </Overlay>
          )}

          {/* win */}
          {winInfo && (
            <Overlay>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-600 shadow-lg shadow-orange-900/60">
                <Trophy className="h-7 w-7 text-black/70" />
              </div>
              <div className="font-mono2 mt-3 text-[10px] font-bold tracking-[0.35em] text-emerald-300">LEVEL {levelIdx + 1} CLEARED</div>
              <h2 className="font-display mt-1 text-3xl font-black text-white">{WIN_QUIPS[levelIdx % WIN_QUIPS.length]}</h2>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Stat icon={Timer} v={fmt(winInfo.time)} l={`PAR ${fmt(lvl.par)}`} accent={winInfo.time <= lvl.par ? 'text-emerald-300' : 'text-white'} />
                <Stat icon={Skull} v={String(winInfo.deaths)} l="DEATHS" />
                <Stat icon={Coins} v={`${winInfo.coins}/${winInfo.totalCoins}`} l="SOULS" />
              </div>
              {winInfo.time <= lvl.par && (
                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-amber-300/40 bg-amber-400/10 py-2 text-xs font-bold text-amber-200">
                  <Sparkles className="h-4 w-4" /> UNDER PAR — DEMONIC SPEED!
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={restartLevel} className="btn-ghost flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-black tracking-widest text-white"><RotateCcw className="h-4 w-4" /> REPLAY</button>
                <button onClick={nextLevel} className="btn-lava flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl font-display text-xs font-black tracking-widest text-white">
                  {levelIdx >= LEVELS.length - 1 ? <><Crown className="h-4 w-4" /> FINISH HELL</> : <>NEXT LEVEL <ChevronRight className="h-4 w-4" /></>}
                </button>
              </div>
              {/* mini level dots */}
              <div className="mt-4 flex items-center justify-center gap-1.5">
                {LEVELS.map((_, i) => (
                  <button key={i} onClick={() => startLevel(i)} disabled={i > unlocked} className={`h-2 rounded-full transition-all ${i === levelIdx ? 'w-6 bg-orange-400' : i <= unlocked ? 'w-2 bg-white/40 hover:bg-white/70' : 'w-2 bg-white/10'}`} />
                ))}
              </div>
            </Overlay>
          )}
        </>
      )}

      {/* ==================== VICTORY ==================== */}
      {screen === 'victory' && (
        <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-black/80 via-[#1a0a06]/90 to-black/95 backdrop-blur-sm">
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-5 py-10 text-center">
            <div className="animate-pop-in">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-300 via-orange-500 to-red-700 shadow-2xl shadow-orange-900 animate-floaty">
                <Crown className="h-10 w-10 text-black/70" />
              </div>
              <div className="font-mono2 mt-5 text-[11px] font-bold tracking-[0.4em] text-amber-300">YOU ESCAPED HELL</div>
              <h1 className="font-display animate-title-glow mt-2 text-5xl font-black leading-none text-transparent md:text-7xl" style={{ backgroundImage: 'linear-gradient(180deg,#fff7e8,#ffc46b 35%,#ff6a1a 60%,#e01e0e)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
                DEVIL<br />DEFEATED
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm text-white/60">All 8 trials survived. {totalDeaths} deaths. {totalCoinsAll} souls collected. Hell respectfully requests a rematch.</p>
              <div className="glass mx-auto mt-6 grid max-w-md grid-cols-3 gap-2 rounded-3xl p-4">
                <Stat icon={Skull} v={String(totalDeaths)} l="DEATHS" />
                <Stat icon={Coins} v={`${totalCoinsAll}/${totalBest}`} l="SOULS" />
                <Stat icon={Zap} v={`${bestTimes.filter(Boolean).length}/8`} l="CLEARED" />
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button onClick={() => startLevel(0)} className="btn-lava flex h-13 items-center gap-2 rounded-2xl px-7 py-3.5 font-display text-xs font-black tracking-widest text-white"><RotateCcw className="h-4 w-4" /> SUFFER AGAIN</button>
                <button onClick={() => setScreen('menu')} className="btn-ghost flex items-center gap-2 rounded-2xl px-7 py-3.5 font-display text-xs font-black tracking-widest text-white"><Home className="h-4 w-4" /> MENU</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODALS ==================== */}
      {showLevels && (
        <Modal title="SELECT TRIAL" sub={`${unlocked + 1} OF 8 UNLOCKED`} onClose={() => setShowLevels(false)}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {LEVELS.map((l, i) => (
              <LevelCard key={i} index={i} name={l.name} diff={DIFF[i]} label={DIFF_LABEL[i]} locked={i > unlocked} best={bestTimes[i]} par={l.par} sub={l.sub} onPlay={() => { setShowLevels(false); startLevel(i); }} />
            ))}
          </div>
        </Modal>
      )}

      {showHow && (
        <Modal title="HOW TO SUFFER" sub="SURVIVAL MANUAL" onClose={() => setShowHow(false)}>
          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-black tracking-widest text-orange-300"><Gamepad2 className="h-4 w-4" /> CONTROLS</div>
              {[
                ['MOVE', 'A / D or ← →'],
                ['JUMP', 'SPACE / W / ↑'],
                ['VARIABLE JUMP', 'Hold = higher'],
                ['RESTART', 'R'],
                ['PAUSE', 'ESC'],
                ['MOBILE', 'On-screen pad'],
              ].map(([a, b], i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/5 py-1.5 text-xs last:border-0">
                  <span className="font-bold text-white/70">{a}</span>
                  <span className="font-mono2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-orange-200">{b}</span>
                </div>
              ))}
              <div className="mt-2 text-[11px] leading-relaxed text-white/50">Pro tech: coyote-time + jump-buffering are on — your jumps will feel buttery even at 3am rage o'clock.</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-black tracking-widest text-red-300"><TriangleAlert className="h-4 w-4" /> TRAP GLOSSARY</div>
              {[
                ['Hidden spikes', 'Pop when you approach. Listen for the click.'],
                ['Fake floors', 'Look solid, drop instantly. Keep moving.'],
                ['Crumble blocks', 'Shake 0.5s, then fall. Commit fast.'],
                ['Patrol saws', 'Follow glowing paths. Learn the rhythm.'],
                ['Stalactites', 'Fall when you walk under. Bait & dash.'],
                ['Demon gates', 'Need the gold key. Follow the glow.'],
                ['Lava', 'Obviously deadly. Obviously everywhere.'],
              ].map(([a, b], i) => (
                <div key={i} className="border-b border-white/5 py-1.5 last:border-0">
                  <div className="text-xs font-bold text-white">{a}</div>
                  <div className="text-[11px] text-white/50">{b}</div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {showSettings && (
        <Modal title="SETTINGS" sub="TUNE THE TORMENT" onClose={() => setShowSettings(false)}>
          <div className="flex flex-col gap-2.5">
            <button onClick={toggleMute} className="flex items-center justify-between rounded-2xl bg-white/5 p-4 text-left hover:bg-white/10">
              <div className="flex items-center gap-3">
                {muted ? <VolumeX className="h-5 w-5 text-white/60" /> : <Volume2 className="h-5 w-5 text-orange-400" />}
                <div><div className="text-sm font-bold text-white">Sound & Music</div><div className="text-xs text-white/50">Synthesized hellish loop + SFX</div></div>
              </div>
              <div className={`rounded-full px-3 py-1 font-mono2 text-[11px] font-bold ${muted ? 'bg-white/10 text-white/50' : 'bg-emerald-500/20 text-emerald-300'}`}>{muted ? 'OFF' : 'ON'}</div>
            </button>
            <button onClick={toggleQuality} className="flex items-center justify-between rounded-2xl bg-white/5 p-4 text-left hover:bg-white/10">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-amber-300" />
                <div><div className="text-sm font-bold text-white">Graphics quality</div><div className="text-xs text-white/50">Shadows + pixel ratio</div></div>
              </div>
              <div className={`rounded-full px-3 py-1 font-mono2 text-[11px] font-bold ${highQ ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>{highQ ? 'HIGH' : 'LOW'}</div>
            </button>
            <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="flex items-center justify-between rounded-2xl bg-red-950/40 p-4 text-left hover:bg-red-950/60">
              <div className="flex items-center gap-3">
                <Ghost className="h-5 w-5 text-red-400" />
                <div><div className="text-sm font-bold text-white">Wipe save</div><div className="text-xs text-white/50">Deaths, unlocks, best times</div></div>
              </div>
              <div className="rounded-full bg-red-500/20 px-3 py-1 font-mono2 text-[11px] font-bold text-red-300">RESET</div>
            </button>
          </div>
        </Modal>
      )}

      {showCredits && (
        <Modal title="CREDITS" sub="STANDING ON PIXEL GIANTS" onClose={() => setShowCredits(false)}>
          <div className="flex flex-col gap-2.5 text-sm">
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/5 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-amber-200"><Flame className="h-4 w-4" /> 3D MODELS — poly.pizza × Quaternius</div>
              <p className="mt-2 text-xs leading-relaxed text-white/60">
                All characters, traps, platforms, coins, keys and decor are based on the CC0 low-poly packs by
                <span className="text-white"> Quaternius</span> distributed via <span className="text-amber-300">poly.pizza</span> —
                rebuilt in-code as procedural flat-shaded meshes for zero-load instant play.
              </p>
              <div className="mt-3 grid gap-1.5">
                {[
                  ['Ultimate Platformer Pack', 'player imp • platforms • spikes • coins'],
                  ['Animated Character Pack', 'run / jump / death poses reference'],
                  ['Ultimate Nature + Dungeon', 'pillars • rocks • chains • lava trim'],
                  ['License', 'CC0 Public Domain — free for personal + commercial use'],
                ].map(([a, b], i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-black/30 px-3 py-2 text-xs">
                    <span className="font-bold text-white">{a}</span>
                    <span className="text-right text-white/50">{b}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <a href="https://poly.pizza" target="_blank" rel="noreferrer" className="btn-ghost flex-1 rounded-xl py-2.5 text-center text-xs font-bold text-white">poly.pizza ↗</a>
                <a href="https://quaternius.com" target="_blank" rel="noreferrer" className="btn-ghost flex-1 rounded-xl py-2.5 text-center text-xs font-bold text-white">quaternius.com ↗</a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-white/5 p-4"><div className="text-xs font-black text-white">ENGINE</div><div className="mt-1 text-xs text-white/50">Three.js • custom AABB physics • coyote + buffer • pooled particles • dynamic shadows</div></div>
              <div className="rounded-2xl bg-white/5 p-4"><div className="text-xs font-black text-white">AUDIO</div><div className="mt-1 text-xs text-white/50">100% WebAudio synth — no files. 132 BPM phrygian hell-loop, 12 SFX.</div></div>
            </div>
            <div className="text-center font-mono2 text-[10px] tracking-widest text-white/30">MADE WITH SPITE IN THE NINTH CIRCLE • {TROLL_QUIPS.length} INSULTS INCLUDED</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- sub components ---------------- */

function DeathFlash() {
  return <div className="pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(255,20,10,.45)_100%)]" style={{ animation: 'shake-hard .35s ease' }} />;
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]" onClick={onClose}>
      <div className="animate-pop-in glass w-full max-w-md rounded-3xl p-6 md:p-7" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Modal({ title, sub, children, onClose }: { title: string; sub: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="animate-pop-in glass max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-5 md:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="font-mono2 text-[10px] font-bold tracking-[0.35em] text-orange-300">{sub}</div>
            <h2 className="font-display text-2xl font-black text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost flex h-10 w-10 items-center justify-center rounded-xl text-white"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, v, l, accent }: { icon: React.ElementType; v: string; l: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-orange-400" />
      <div className={`font-mono2 mt-1 text-sm font-bold tabular-nums ${accent ?? 'text-white'}`}>{v}</div>
      <div className="font-mono2 text-[9px] tracking-widest text-white/40">{l}</div>
    </div>
  );
}

function LevelCard({ index, name, diff, label, locked, best, par, sub, onPlay, compact }: {
  index: number; name: string; diff: number; label: string; locked: boolean; best: number | null; par: number; sub?: string; onPlay: () => void; compact?: boolean;
}) {
  return (
    <button
      onClick={onPlay}
      disabled={locked}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${locked ? 'border-white/5 bg-black/40 opacity-50' : 'glass hover:-translate-y-0.5 hover:border-orange-500/40 hover:shadow-xl hover:shadow-orange-950/40'}`}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-red-600/20 to-orange-500/10 blur-xl transition-all group-hover:from-red-600/40" />
      <div className="flex items-center justify-between">
        <span className={`font-display rounded-lg px-2 py-0.5 text-[11px] font-black ${locked ? 'bg-white/10 text-white/40' : 'bg-gradient-to-br from-red-600 to-orange-500 text-white'}`}>
          {String(index + 1).padStart(2, '0')}
        </span>
        {locked ? <Lock className="h-4 w-4 text-white/30" /> : best != null ? <span className="font-mono2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">{fmt(best)}</span> : <span className="font-mono2 text-[10px] text-white/35">PAR {fmt(par)}</span>}
      </div>
      <div className="font-display mt-2 text-sm font-black leading-tight text-white">{locked ? '???' : name}</div>
      {!compact && sub && <div className="mt-0.5 line-clamp-1 text-[11px] text-white/45">{locked ? 'Clear previous trial' : sub}</div>}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Flame key={i} className={`h-3 w-3 ${i < diff ? (locked ? 'text-white/20' : 'text-orange-400') : 'text-white/10'}`} />
          ))}
        </div>
        <span className={`font-mono2 text-[9px] font-bold tracking-widest ${locked ? 'text-white/25' : 'text-orange-300/80'}`}>{locked ? 'LOCKED' : label.toUpperCase()}</span>
      </div>
      {!locked && (
        <div className="mt-2.5 flex items-center gap-1 text-[11px] font-black tracking-widest text-orange-300 opacity-0 transition-all group-hover:opacity-100">
          PLAY <ChevronRight className="h-3.5 w-3.5" />
        </div>
      )}
      {locked && <DoorOpen className="absolute bottom-3 right-3 h-8 w-8 text-white/5" />}
    </button>
  );
}

function TouchBtn({ children, onChange, big, label }: { children: React.ReactNode; onChange: (v: boolean) => void; big?: boolean; label: string }) {
  return (
    <button
      aria-label={label}
      className={`flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-md active:bg-orange-500/40 ${big ? 'h-20 w-20 rounded-full border-orange-400/40 bg-gradient-to-br from-red-600/60 to-orange-500/60' : 'h-16 w-16'}`}
      onTouchStart={(e) => { e.preventDefault(); onChange(true); }}
      onTouchEnd={(e) => { e.preventDefault(); onChange(false); }}
      onTouchCancel={() => onChange(false)}
      onMouseDown={() => onChange(true)}
      onMouseUp={() => onChange(false)}
      onMouseLeave={() => onChange(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
