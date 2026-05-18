'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, RotateCcw, Settings, ChevronRight,
  Volume2, VolumeX, Timer, Coffee, Flag, Trophy,
  Gauge, Zap, Clock, SkipForward, ArrowLeft, Users,
  Target, Wrench, CircleDot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

// ==================== TYPES ====================
type SessionType = 'race' | 'pitstop';
type TireCompound = 'soft' | 'medium' | 'hard';
type AppPage = 'landing' | 'timer';

interface RaceConfig {
  totalLaps: number;       // 1 lap = 1 minute
  breakDuration: number;   // break in minutes
  tireCompound: TireCompound;
  driverName: string;
  autoStart: boolean;
  soundEnabled: boolean;
}

// ==================== HYDRATION SAFE HOOK ====================
const emptySubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

// ==================== TIRE COMPOUND CONFIG ====================
const TIRE_COMPOUNDS: Record<TireCompound, { name: string; color: string; glow: string; desc: string; emoji: string }> = {
  soft:  { name: 'Soft',  color: '#E10600', glow: '#E1060044', desc: 'Short burst, high intensity', emoji: '🔴' },
  medium: { name: 'Medium', color: '#FFB800', glow: '#FFB80044', desc: 'Balanced focus session', emoji: '🟡' },
  hard:  { name: 'Hard',  color: '#CCCCCC', glow: '#CCCCCC44', desc: 'Marathon deep work', emoji: '⚪' },
};

// Break suggestions based on focus time
function suggestBreak(minutes: number): number {
  if (minutes <= 15) return 3;
  if (minutes <= 25) return 5;
  if (minutes <= 40) return 8;
  if (minutes <= 60) return 10;
  if (minutes <= 90) return 15;
  return 20;
}

// ==================== RACE ENGINEER MESSAGE SYSTEM ====================
const ENGINEER_MSGS = {
  // Progress milestones (0%)
  stintStart: [
    "Green lights. Stint started. Bring focus up to operating temperature.",
    "Lights out. New stint underway. Find your rhythm.",
    "Green flag. The track is yours. Settle into the zone.",
    "Session green. Build pace gradually. No need to push yet.",
  ],
  // Progress milestones (25%)
  sector1: [
    "Sector 1 complete. Pace is stable. No issues detected.",
    "First sector done. Good rhythm. Keep it consistent.",
    "Sector 1 cleared. Tire temps are in. You're dialed in.",
    "P1 sector time. Good pace. Stay smooth.",
  ],
  // Progress milestones (50%)
  halfway: [
    "Half distance complete. Strategy holding. Maintain concentration.",
    "50% done. You're in the groove. Don't let up now.",
    "Halfway point. Pace is strong. Keep the focus tight.",
    "Mid-stint reached. Everything nominal. Push through.",
  ],
  // Progress milestones (75%)
  sector3: [
    "Final stint phase. Keep inputs clean. No errors now.",
    "75% complete. The hard part's over. Stay disciplined.",
    "Last sector approaching. Concentration is key. No mistakes.",
    "Final phase initiated. Keep it tidy. Bring it home clean.",
  ],
  // Progress milestones (100%)
  complete: [
    "Chequered flag. Stint complete. Strong execution.",
    "That's the flag! Stint done. Quality performance.",
    "Race complete. Clean stint. Well managed.",
    "Flag out. Stint finished. Professional drive.",
    "Chequered flag! Outstanding consistency throughout.",
  ],
  // Pit stop
  pitstop: [
    "Box box box! Time for a pit stop.",
    "Come in for fresh tires. Take a break.",
    "Pit window open. Recharge and refocus.",
    "Strategic pit stop. You've earned a breather.",
  ],
  // Back to race from pit stop
  backToRace: [
    "Fresh tires fitted. Back on track!",
    "Great stop! Green light, go go go!",
    "Tires changed, fuel topped up. Push now!",
    "Pit complete. New stint. Full focus mode.",
  ],
  // === RACE CONTROL: Focus loss detection ===
  focusLoss: [
    "Race Control: potential focus loss detected. Re-engage concentration.",
    "Race Control: you've drifted. Eyes on the road. Re-focus now.",
    "Race Control: attention drop registered. Get back in the zone.",
    "Race Control: laps are slipping. Regain your concentration.",
  ],
  // Focus recovery
  focusRecovery: [
    "Race Control: focus restored. You are back in the race.",
    "Race Control: concentration confirmed. Good recovery.",
    "Race Control: back on pace. Focus locked in again.",
    "Race Control: re-engaged. That's the spirit. Keep going.",
  ],
  // Long uninterrupted focus streak (10+ min)
  focusStreak: [
    "Race Control: consistent pace confirmed. You are running qualifying-level focus.",
    "Race Control: 10 minutes uninterrupted. Elite concentration detected.",
    "Race Control: sustained focus streak. You're in the flow state.",
    "Race Control: impressive stint consistency. Zone mode activated.",
  ],
  // Early completion
  earlyFinish: [
    "Race Control: box, box. Early finish confirmed. Efficient stint.",
    "Race Control: stint concluded early. Clean and efficient.",
    "Race Control: early chequered flag. Smart energy management.",
  ],
  // === TIME PRESSURE SCALING ===
  // 80-100% remaining (fresh)
  tyresFresh: [
    "Tyres fresh. Build rhythm.",
    "Clean sheet. Find your groove.",
    "New rubber. Let the pace come to you.",
    "Fresh compound. Build up gradually.",
  ],
  // 50-80% remaining
  racePace: [
    "Race pace required. Stay consistent.",
    "Settling into the stint. Hold your line.",
    "Middle phase. Consistency beats raw speed.",
    "Steady inputs. The rhythm is what matters.",
  ],
  // 20-50% remaining
  trackPosition: [
    "Track position matters now. No mistakes.",
    "Pressure phase. Keep it clean and precise.",
    "Every second counts. Stay sharp.",
    "Critical stint phase. Maximum attention required.",
  ],
  // 0-20% remaining
  maximumFocus: [
    "Final lap conditions. Maximum focus required.",
    "Last push. Everything on the line. Concentrate.",
    "Closing stages. Do not waver. Full commitment.",
    "Endgame. One lapse now costs everything. Stay locked.",
  ],
};

type EngineerCategory = keyof typeof ENGINEER_MSGS;

function getRandomMsg(category: EngineerCategory): string {
  const msgs = ENGINEER_MSGS[category];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

// ==================== CIRCUIT TRACK ====================
function generateCircuitPoints(w: number, h: number) {
  const pad = 45;
  const result: Array<{ x: number; y: number }> = [];

  const waypoints = [
    { x: w * 0.52, y: h - pad },
    { x: w * 0.3, y: h - pad },
    { x: w * 0.14, y: h - pad - 5 },
    { x: pad, y: h - pad - 25 },
    { x: pad + 8, y: h * 0.7 },
    { x: pad - 5, y: h * 0.58 },
    { x: pad + 20, y: h * 0.5 },
    { x: pad + 5, y: h * 0.42 },
    { x: pad - 5, y: h * 0.32 },
    { x: pad + 15, y: h * 0.24 },
    { x: pad + 30, y: h * 0.18 },
    { x: pad + 10, y: h * 0.12 },
    { x: pad + 30, y: pad + 5 },
    { x: pad + 55, y: pad - 3 },
    { x: w * 0.3, y: pad + 2 },
    { x: w * 0.42, y: pad + 8 },
    { x: w * 0.48, y: pad + 14 },
    { x: w * 0.55, y: pad + 6 },
    { x: w * 0.65, y: pad + 2 },
    { x: w * 0.78, y: pad - 2 },
    { x: w - pad - 15, y: pad + 5 },
    { x: w - pad + 2, y: pad + 25 },
    { x: w - pad - 2, y: h * 0.2 },
    { x: w - pad - 15, y: h * 0.27 },
    { x: w - pad - 35, y: h * 0.32 },
    { x: w - pad - 20, y: h * 0.38 },
    { x: w - pad + 2, y: h * 0.43 },
    { x: w - pad - 5, y: h * 0.5 },
    { x: w - pad - 25, y: h * 0.57 },
    { x: w - pad - 8, y: h * 0.63 },
    { x: w - pad - 40, y: h * 0.67 },
    { x: w - pad - 65, y: h * 0.72 },
    { x: w * 0.65, y: h * 0.74 },
    { x: w * 0.58, y: h * 0.72 },
    { x: w * 0.55, y: h * 0.75 },
    { x: w * 0.52, y: h - pad },
  ];

  const steps = 25;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const smoothT = t * t * (3 - 2 * t);
      result.push({
        x: from.x + (to.x - from.x) * smoothT,
        y: from.y + (to.y - from.y) * smoothT,
      });
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result;
}

function buildSVGPath(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  d += ' Z';
  return d;
}

function RaceTrack({
  progress,
  lapFraction,
  sessionType,
  isRunning,
  trackSize,
  tireCompound,
  currentLap,
  totalLaps,
}: {
  progress: number;
  lapFraction: number;
  sessionType: SessionType;
  isRunning: boolean;
  trackSize: number;
  tireCompound: TireCompound;
  currentLap: number;
  totalLaps: number;
}) {
  const hydrated = useHydrated();
  const tw = trackSize;
  const th = trackSize * 0.72;
  const pad = 45;

  const points = useMemo(() => generateCircuitPoints(tw, th), [tw, th]);
  const circuitPath = useMemo(() => buildSVGPath(points), [points]);

  const carPos = useMemo(() => {
    const total = points.length;
    const idx = Math.min(Math.floor(progress * total), total - 1);
    const nextIdx = (idx + 1) % total;
    const frac = (progress * total) - idx;
    const curr = points[idx];
    const next = points[nextIdx];
    const x = curr.x + (next.x - curr.x) * frac;
    const y = curr.y + (next.y - curr.y) * frac;
    const angle = Math.atan2(next.y - curr.y, next.x - curr.x) * (180 / Math.PI);
    return { x, y, angle };
  }, [progress, points]);

  // Trail for current lap only (using lapFraction which resets each lap)
  const progressTrail = useMemo(() => {
    if (lapFraction <= 0.005) return '';
    const total = points.length;
    const endIdx = Math.min(Math.floor(lapFraction * total), total - 1);
    if (endIdx < 2) return '';
    const trail = points.slice(0, endIdx + 1);
    let d = `M ${trail[0].x} ${trail[0].y}`;
    for (let i = 1; i < trail.length; i++) {
      d += ` L ${trail[i].x} ${trail[i].y}`;
    }
    return d;
  }, [lapFraction, points]);

  const tire = TIRE_COMPOUNDS[tireCompound];
  const colorMap = {
    race: { primary: tire.color, secondary: sessionType === 'race' ? tire.color : '#69F0AE', accent: '#FFB800' },
    pitstop: { primary: '#00C853', secondary: '#69F0AE', accent: '#B2FF59' },
  };
  const c = colorMap[sessionType];

  if (!hydrated) return <div style={{ width: tw, height: th }} />;

  return (
    <svg width={tw} height={th} viewBox={`0 0 ${tw} ${th}`} className="overflow-visible select-none">
      <defs>
        <linearGradient id="tGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#252525" />
          <stop offset="50%" stopColor="#303030" />
          <stop offset="100%" stopColor="#252525" />
        </linearGradient>
        <filter id="cGlow">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="tShadow">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#000" floodOpacity="0.6" />
        </filter>
        <filter id="carGlowFilter">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="grassGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a2a1a" />
          <stop offset="100%" stopColor="#0a150a" />
        </radialGradient>
      </defs>

      <path d={circuitPath} fill="url(#grassGrad)" stroke="none" />
      <path d={circuitPath} fill="none" stroke="#0d0d0d" strokeWidth="68" strokeLinecap="round" strokeLinejoin="round" filter="url(#tShadow)" />
      <path d={circuitPath} fill="none" stroke="url(#tGrad)" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" />
      <path d={circuitPath} fill="none" stroke={`${tire.color}15`} strokeWidth="58" strokeDasharray="4 8" strokeLinecap="butt" />
      <path d={circuitPath} fill="none" stroke="#ffffff06" strokeWidth="60" strokeLinecap="round" strokeLinejoin="round" />
      <path d={circuitPath} fill="none" stroke="url(#tGrad)" strokeWidth="50" strokeLinecap="round" strokeLinejoin="round" />
      <path d={circuitPath} fill="none" stroke="#ffffff10" strokeWidth="1.5" strokeDasharray="10 10" strokeLinecap="round" />

      {/* Start/Finish checkered line */}
      {Array.from({ length: 10 }).map((_, row) =>
        Array.from({ length: 5 }).map((_, col) => (
          <rect key={`sf-${row}-${col}`} x={tw * 0.52 - 16 + col * 7} y={th - pad - 28 + row * 6} width="6.5" height="5.5" fill={(row + col) % 2 === 0 ? '#ffffffcc' : '#111111cc'} />
        ))
      )}

      {/* Sector markers */}
      <circle cx={pad + 25} cy={th * 0.5} r="4" fill="#FFB80033" stroke="#FFB80055" strokeWidth="1.5" />
      <circle cx={tw * 0.5} cy={pad + 14} r="4" fill="#FFB80033" stroke="#FFB80055" strokeWidth="1.5" />
      <circle cx={tw - pad - 8} cy={th * 0.5} r="4" fill="#FFB80033" stroke="#FFB80055" strokeWidth="1.5" />

      <text x={tw * 0.33} y={pad + 20} fill="#ffffff12" fontSize="12" fontFamily="monospace" fontWeight="bold" letterSpacing="3">DRS ZONE</text>
      <text x={tw / 2} y={th / 2 - 14} fill="#ffffff04" fontSize="56" fontFamily="monospace" fontWeight="bold" textAnchor="middle" letterSpacing="8">CIRCUIT</text>

      {/* Lap markers */}
      {totalLaps > 5 && (() => {
        const interval = totalLaps <= 20 ? 5 : totalLaps <= 50 ? 10 : 25;
        const count = Math.floor(totalLaps / interval);
        return Array.from({ length: count }).map((_, i) => {
          const lapIdx = Math.min(Math.floor(((i + 1) * interval / totalLaps) * points.length), points.length - 1);
          const pt = points[lapIdx];
          if (!pt) return null;
          return (
            <g key={`lap-${i}`}>
              <circle cx={pt.x} cy={pt.y} r="5" fill="none" stroke="#ffffff15" strokeWidth="1.5" />
              <text x={pt.x} y={pt.y - 10} fill="#ffffff15" fontSize="9" fontFamily="monospace" textAnchor="middle">L{(i + 1) * interval}</text>
            </g>
          );
        });
      })()}

      {/* Progress trail */}
      {progressTrail && (
        <>
          <path d={progressTrail} fill="none" stroke={c.primary} strokeWidth="10" strokeLinecap="round" opacity="0.3" filter="url(#cGlow)" />
          <path d={progressTrail} fill="none" stroke={c.secondary} strokeWidth="5" strokeLinecap="round" opacity="0.9" filter="url(#carGlowFilter)" />
        </>
      )}

      {/* Car */}
      {sessionType === 'race' && (
        <g transform={`translate(${carPos.x}, ${carPos.y}) rotate(${carPos.angle})`}>
          {isRunning && (
            <>
              <line x1="-16" y1="-2.5" x2="-26" y2="-2.5" stroke={c.accent} strokeWidth="0.8" opacity="0.3">
                <animate attributeName="opacity" values="0.3;0;0.3" dur="0.2s" repeatCount="indefinite" />
              </line>
              <line x1="-16" y1="0" x2="-30" y2="0" stroke={c.accent} strokeWidth="1.2" opacity="0.4">
                <animate attributeName="opacity" values="0.4;0;0.4" dur="0.15s" repeatCount="indefinite" />
              </line>
              <line x1="-16" y1="2.5" x2="-26" y2="2.5" stroke={c.accent} strokeWidth="0.8" opacity="0.3">
                <animate attributeName="opacity" values="0.3;0;0.3" dur="0.2s" repeatCount="indefinite" />
              </line>
              <circle cx="-10" cy="0" r="3" fill={c.primary} opacity="0.5">
                <animate attributeName="opacity" values="0.5;0.15;0.5" dur="0.2s" repeatCount="indefinite" />
                <animate attributeName="r" values="2;5;2" dur="0.15s" repeatCount="indefinite" />
              </circle>
              <circle cx="-13" cy="0" r="2" fill={c.accent} opacity="0.35">
                <animate attributeName="opacity" values="0.35;0.05;0.35" dur="0.25s" repeatCount="indefinite" />
                <animate attributeName="r" values="1;3.5;1" dur="0.18s" repeatCount="indefinite" />
              </circle>
            </>
          )}
          <g transform="scale(0.34)" filter="url(#carGlowFilter)">
            <path d="M 18,-5 L 30,-4 L 38,-6 L 44,-8 L 50,-8 L 54,-5 L 54,5 L 50,8 L 44,8 L 38,6 L 30,4 L 18,5 L 10,4 L 4,2 L 0,0 L 4,-2 L 10,-4 Z" fill={c.primary} stroke={c.secondary} strokeWidth="0.8" />
            <path d="M 54,-8 L 62,-11 L 65,-9 L 60,-5 L 54,-5 Z" fill={c.secondary} />
            <path d="M 54,8 L 62,11 L 65,9 L 60,5 L 54,5 Z" fill={c.secondary} />
            <path d="M 0,-7 L -4,-10 L -7,-10 L -7,-3 L 0,-2 Z" fill={c.secondary} />
            <path d="M 0,7 L -4,10 L -7,10 L -7,3 L 0,2 Z" fill={c.secondary} />
            <ellipse cx="32" cy="0" rx="6" ry="3.5" fill="#0a0a0a" />
            <rect x="20" y="-7" width="10" height="2" rx="1" fill={c.secondary} opacity="0.6" />
            <rect x="20" y="5" width="10" height="2" rx="1" fill={c.secondary} opacity="0.6" />
            <rect x="46" y="-12" width="9" height="4.5" rx="1.5" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
            <rect x="46" y="7.5" width="9" height="4.5" rx="1.5" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
            <rect x="0" y="-11" width="8" height="4" rx="1" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
            <rect x="0" y="7" width="8" height="4" rx="1" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
            <text x="26" y="2" fill="#ffffffdd" fontSize="6" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">1</text>
          </g>
        </g>
      )}

      <text x={pad - 10} y={th - pad - 32} fill="#ffffff10" fontSize="9" fontFamily="monospace" textAnchor="middle">T1</text>
      <text x={pad + 28} y={th * 0.5} fill="#ffffff10" fontSize="9" fontFamily="monospace" textAnchor="middle">T4</text>
      <text x={tw - pad - 16} y={pad + 34} fill="#ffffff10" fontSize="9" fontFamily="monospace" textAnchor="middle">T9</text>
      <text x={tw - pad + 5} y={th * 0.43} fill="#ffffff10" fontSize="9" fontFamily="monospace" textAnchor="middle">T11</text>
    </svg>
  );
}

// ==================== PIT BOARD (F1-style info display) ====================
function PitBoard({ currentLap, totalLaps, driverName, tireCompound, position, gap }: {
  currentLap: number; totalLaps: number; driverName: string; tireCompound: TireCompound; position: number; gap: string;
}) {
  const tire = TIRE_COMPOUNDS[tireCompound];
  return (
    <div className="bg-black border-2 border-white/20 rounded-lg px-3 py-2 font-mono text-xs sm:text-sm min-w-[160px] relative overflow-hidden">
      {/* Classic F1 pit board style */}
      <div className="absolute top-0 left-0 w-full h-0.5" style={{ backgroundColor: tire.color }} />
      <div className="flex items-center justify-between gap-4 mb-1">
        <span className="text-white/40">P</span>
        <span className="text-2xl sm:text-3xl font-black text-white">{position}</span>
      </div>
      <div className="flex items-center justify-between gap-4 mb-1">
        <span className="text-white/40">LAP</span>
        <span className="font-bold text-white">{currentLap}<span className="text-white/30">/{totalLaps}</span></span>
      </div>
      <div className="flex items-center justify-between gap-4 mb-1">
        <span className="text-white/40">TIRE</span>
        <span className="font-bold" style={{ color: tire.color }}>{tire.name.toUpperCase()}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-white/40">GAP</span>
        <span className="font-bold text-[#00C853]">+{gap}</span>
      </div>
    </div>
  );
}

// ==================== RACE ENGINEER TOAST ====================
function EngineerMessage({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 60000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const isRaceControl = message.startsWith('Race Control:');

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="fixed bottom-20 right-4 sm:right-8 z-40 max-w-xs"
    >
      <div className={`border rounded-lg px-4 py-3 shadow-2xl relative ${isRaceControl ? 'bg-[#0a1628] border-[#00C853]/30' : 'bg-[#111] border-[#E10600]/30'}`}>
        <button
          onClick={onDismiss}
          className="absolute top-1.5 right-2 text-white/30 hover:text-white/70 transition-colors p-0.5"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex items-start gap-2 pr-5">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isRaceControl ? 'bg-[#00C853]' : 'bg-[#E10600]'}`}>
            {isRaceControl ? <Zap className="w-3 h-3 text-white" /> : <Volume2 className="w-3 h-3 text-white" />}
          </div>
          <div>
            <div className={`text-[10px] font-bold tracking-wider uppercase mb-0.5 ${isRaceControl ? 'text-[#00C853]' : 'text-[#E10600]'}`}>
              {isRaceControl ? 'Race Control' : 'Race Engineer'}
            </div>
            <div className="text-white/80 text-sm">{message}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ==================== MAIN PAGE ====================
const DEFAULT_CONFIG: RaceConfig = {
  totalLaps: 25,
  breakDuration: 3,
  tireCompound: 'medium',
  driverName: 'Driver',
  autoStart: false,
  soundEnabled: true,
};

export default function RacePomodoro() {
  const hydrated = useHydrated();
  const [page, setPage] = useState<AppPage>('landing');
  const [config, setConfig] = useState<RaceConfig>(DEFAULT_CONFIG);

  // Timer state
  const [sessionType, setSessionType] = useState<SessionType>('race');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [racesCompleted, setRacesCompleted] = useState(0);
  const [totalFocusSeconds, setTotalFocusSeconds] = useState(0);
  const [trackSize, setTrackSize] = useState(660);
  const [showSettings, setShowSettings] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [engineerMsg, setEngineerMsg] = useState<string | null>(null);
  const [engineerKey, setEngineerKey] = useState(0);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [countdownStatus, setCountdownStatus] = useState<'idle' | 'counting' | 'finished'>('idle');
  const [litLights, setLitLights] = useState(0);
  const lastUpdateRef = useRef({ time: Date.now(), progress: 0 });

  // Landing page state
  const [customLaps, setCustomLaps] = useState(25);
  const [customBreak, setCustomBreak] = useState(3);
  const [selectedTire, setSelectedTire] = useState<TireCompound>('medium');
  const [driverInput, setDriverInput] = useState('');

  // Refs
  const configRef = useRef(config);
  const sessionTypeRef = useRef(sessionType);
  const racesCompletedRef = useRef(racesCompleted);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Milestone notification refs (reset each race)
  const notifiedMilestones = useRef<Set<string>>(new Set());
  const pressurePhaseNotified = useRef<string | null>(null);
  // Focus detection refs
  const isTabVisible = useRef(true);
  const lastActivityTime = useRef(Date.now());
  const focusLossNotified = useRef(false);
  const focusStreakNotified = useRef(false);
  const continuousFocusStart = useRef<number | null>(null);

  // Keep refs in sync
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { sessionTypeRef.current = sessionType; }, [sessionType]);
  useEffect(() => { racesCompletedRef.current = racesCompleted; }, [racesCompleted]);

  // Persistent State Load
  useEffect(() => {
    try {
      const saved = localStorage.getItem('race-pomodoro-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.racesCompleted === 'number') setRacesCompleted(parsed.racesCompleted);
        if (typeof parsed.totalFocusSeconds === 'number') setTotalFocusSeconds(parsed.totalFocusSeconds);
        if (typeof parsed.customLaps === 'number') setCustomLaps(parsed.customLaps);
        if (typeof parsed.customBreak === 'number') setCustomBreak(parsed.customBreak);
        if (typeof parsed.selectedTire === 'string') setSelectedTire(parsed.selectedTire as TireCompound);
        if (typeof parsed.driverInput === 'string') setDriverInput(parsed.driverInput);
        if (typeof parsed.soundEnabled === 'boolean') setConfig(prev => ({ ...prev, soundEnabled: parsed.soundEnabled }));
      }
    } catch (e) {
      console.error('Failed to load state from localStorage', e);
    }
  }, []);

  // Persistent State Save
  useEffect(() => {
    try {
      localStorage.setItem('race-pomodoro-state', JSON.stringify({
        racesCompleted,
        totalFocusSeconds,
        customLaps,
        customBreak,
        selectedTire,
        driverInput,
        soundEnabled: config.soundEnabled,
      }));
    } catch (e) {
      console.error('Failed to save state to localStorage', e);
    }
  }, [racesCompleted, totalFocusSeconds, customLaps, customBreak, selectedTire, driverInput, config.soundEnabled]);

  // Audio (declared early so showEngineer can be used in effects below)
  const playBeep = useCallback((freq: number, dur: number) => {
    if (!configRef.current.soundEnabled) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur / 1000);
    } catch { /* audio not available */ }
  }, []);

  const playEngineSound = useCallback(() => {
    if (!configRef.current.soundEnabled) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      
      // Helper to create oscillators simulating cylinders
      const createCylinder = (detune: number, type: OscillatorType, gainLevel: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.detune.value = detune;
        
        // Frequency envelope (RPM sweep)
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(180, now + 0.6); // Rev up in 1st
        osc.frequency.linearRampToValueAtTime(130, now + 0.7); // Shift to 2nd
        osc.frequency.linearRampToValueAtTime(240, now + 1.8); // Rev up in 2nd
        osc.frequency.linearRampToValueAtTime(190, now + 1.9); // Shift to 3rd
        osc.frequency.linearRampToValueAtTime(320, now + 3.5); // Accelerate away
        
        gain.gain.value = gainLevel;
        osc.connect(gain);
        return { osc, gain };
      };

      const cyl1 = createCylinder(0, 'sawtooth', 0.5);
      const cyl2 = createCylinder(15, 'sawtooth', 0.3); // Slightly detuned for richness
      const cyl3 = createCylinder(-15, 'square', 0.2);  // Square wave adds bite
      const sub = createCylinder(0, 'sine', 0.8);       // Sub frequencies
      
      // Fix sub frequency pitch
      sub.osc.frequency.setValueAtTime(40, now);
      sub.osc.frequency.linearRampToValueAtTime(90, now + 0.6);
      sub.osc.frequency.linearRampToValueAtTime(65, now + 0.7);
      sub.osc.frequency.linearRampToValueAtTime(120, now + 1.8);
      sub.osc.frequency.linearRampToValueAtTime(95, now + 1.9);
      sub.osc.frequency.linearRampToValueAtTime(160, now + 3.5);

      // Aggressive Lowpass filter that opens as RPM increases (simulates exhaust note)
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.linearRampToValueAtTime(2000, now + 0.6);
      filter.frequency.linearRampToValueAtTime(800, now + 0.7);
      filter.frequency.linearRampToValueAtTime(3000, now + 1.8);
      filter.frequency.linearRampToValueAtTime(1000, now + 1.9);
      filter.frequency.linearRampToValueAtTime(4000, now + 3.5);

      cyl1.gain.connect(filter);
      cyl2.gain.connect(filter);
      cyl3.gain.connect(filter);
      sub.gain.connect(filter);
      filter.connect(masterGain);
      
      // Overall volume envelope
      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.4, now + 0.1);
      masterGain.gain.linearRampToValueAtTime(0.4, now + 2.5);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
      
      const stopTime = now + 3.5;
      cyl1.osc.start(now); cyl1.osc.stop(stopTime);
      cyl2.osc.start(now); cyl2.osc.stop(stopTime);
      cyl3.osc.start(now); cyl3.osc.stop(stopTime);
      sub.osc.start(now); sub.osc.stop(stopTime);
    } catch { /* audio not available */ }
  }, []);

  const playStartSound = useCallback(() => {
    setTimeout(() => playBeep(600, 150), 0);
    setTimeout(() => playBeep(600, 150), 250);
    setTimeout(() => playBeep(600, 150), 500);
    setTimeout(() => playBeep(1200, 350), 750);
  }, [playBeep]);

  const playFinishSound = useCallback(() => {
    setTimeout(() => playBeep(880, 180), 0);
    setTimeout(() => playBeep(1100, 180), 180);
    setTimeout(() => playBeep(1320, 350), 360);
  }, [playBeep]);

  const showEngineer = useCallback((msg: string) => {
    setEngineerMsg(msg);
    setEngineerKey(prev => prev + 1);
  }, []);

  // === FOCUS DETECTION: Tab visibility ===
  useEffect(() => {
    const handleVisibility = () => {
      const visible = !document.hidden;
      const wasVisible = isTabVisible.current;
      isTabVisible.current = visible;

      if (isRunning && sessionTypeRef.current === 'race') {
        if (wasVisible && !visible) {
          // Tab switched away = focus loss
          focusLossNotified.current = true;
          continuousFocusStart.current = null;
          showEngineer(getRandomMsg('focusLoss'));
        } else if (!wasVisible && visible) {
          // Tab came back = focus recovery
          if (focusLossNotified.current) {
            focusLossNotified.current = false;
            showEngineer(getRandomMsg('focusRecovery'));
            continuousFocusStart.current = Date.now();
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isRunning, showEngineer]);

  // === FOCUS DETECTION: Inactivity (no mouse/keyboard for 60s) ===
  useEffect(() => {
    if (!isRunning || sessionType !== 'race') return;
    const onActivity = () => {
      const now = Date.now();
      const wasInactive = focusLossNotified.current;
      lastActivityTime.current = now;
      if (wasInactive) {
        focusLossNotified.current = false;
        showEngineer(getRandomMsg('focusRecovery'));
        continuousFocusStart.current = now;
      }
    };
    const inactivityCheck = setInterval(() => {
      if (!isRunning || sessionTypeRef.current !== 'race') return;
      const inactiveMs = Date.now() - lastActivityTime.current;
      if (inactiveMs > 60000 && !focusLossNotified.current) {
        focusLossNotified.current = true;
        continuousFocusStart.current = null;
        showEngineer(getRandomMsg('focusLoss'));
      }
    }, 10000);

    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);
    window.addEventListener('touchstart', onActivity);
    return () => {
      clearInterval(inactivityCheck);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('touchstart', onActivity);
    };
  }, [isRunning, sessionType, showEngineer]);

  // === FOCUS STREAK: 10+ min uninterrupted ===
  useEffect(() => {
    if (!isRunning || sessionType !== 'race') return;
    if (continuousFocusStart.current === null && !focusLossNotified.current) {
      continuousFocusStart.current = Date.now();
    }
    const streakCheck = setInterval(() => {
      if (!isRunning || sessionTypeRef.current !== 'race') return;
      if (focusStreakNotified.current) return;
      if (focusLossNotified.current || !isTabVisible.current) return;
      if (continuousFocusStart.current === null) return;
      const streakMinutes = (Date.now() - continuousFocusStart.current) / 60000;
      if (streakMinutes >= 10) {
        focusStreakNotified.current = true;
        showEngineer(getRandomMsg('focusStreak'));
      }
    }, 30000);
    return () => clearInterval(streakCheck);
  }, [isRunning, sessionType, showEngineer]);

  // Responsive track size - larger for better visibility
  useEffect(() => {
    const updateSize = () => {
      const w = window.innerWidth;
      if (w < 500) setTrackSize(Math.min(w - 10, 460));
      else if (w < 640) setTrackSize(560);
      else if (w < 768) setTrackSize(660);
      else if (w < 1024) setTrackSize(780);
      else setTrackSize(880);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Track focus time
  useEffect(() => {
    if (!isRunning || sessionType !== 'race') return;
    const interval = setInterval(() => { setTotalFocusSeconds(prev => prev + 1); }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, sessionType]);

  const progress = totalTime > 0 ? 1 - timeRemaining / totalTime : 0;

  // Smooth car animation - interpolate between timer ticks
  useEffect(() => {
    lastUpdateRef.current = { time: Date.now(), progress };
    if (!isRunning) {
      setSmoothProgress(progress);
    }
  }, [progress, isRunning]);

  useEffect(() => {
    if (!isRunning || totalTime === 0) return;
    let rafId: number;
    const animate = () => {
      const now = Date.now();
      const elapsed = (now - lastUpdateRef.current.time) / 1000;
      const extra = Math.min(elapsed / totalTime, 1 / totalTime);
      setSmoothProgress(Math.min(lastUpdateRef.current.progress + extra, 1));
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isRunning, totalTime]);

  // 1 lap = 1 minute (60 seconds). Car completes whole circuit per lap.
  const SECONDS_PER_LAP = 60;
  const visualTotalLaps = totalTime > 0 ? Math.max(1, Math.round(totalTime / SECONDS_PER_LAP)) : 0;
  const currentLap = totalTime > 0 ? Math.min(Math.floor(smoothProgress * visualTotalLaps) + 1, visualTotalLaps) : 0;

  // Car position on track: modular progress so car completes circuit every lap (60 seconds)
  // Each visual lap = 1/visualTotalLaps of the total progress range
  // trackProgress cycles 0→1 for each lap
  const trackProgress = visualTotalLaps > 0 ? (smoothProgress * visualTotalLaps) % 1 : 0;
  // Fraction within current lap for trail
  const lapFraction = visualTotalLaps > 0 ? (smoothProgress * visualTotalLaps) - Math.floor(smoothProgress * visualTotalLaps) : 0;

  // Start race from landing
  const startRace = useCallback(() => {
    const newConfig: RaceConfig = {
      totalLaps: customLaps,
      breakDuration: customBreak,
      tireCompound: selectedTire,
      driverName: driverInput.trim() || 'Driver',
      autoStart: false,
      soundEnabled: config.soundEnabled,
    };
    setConfig(newConfig);
    configRef.current = newConfig;
    setSessionType('race');
    setTimeRemaining(customLaps * 60);
    setTotalTime(customLaps * 60);
    setIsRunning(false);
    setCountdownStatus('counting');
    setLitLights(0);
    notifiedMilestones.current = new Set();
    pressurePhaseNotified.current = null;
    focusLossNotified.current = false;
    focusStreakNotified.current = false;
    continuousFocusStart.current = null;
    setPage('timer');
  }, [customLaps, customBreak, selectedTire, driverInput, config.soundEnabled]);

  // F1 5 Lights Countdown Sequence
  useEffect(() => {
    if (countdownStatus === 'counting') {
      if (litLights < 5) {
        const timer = setTimeout(() => {
          setLitLights(prev => prev + 1);
          playBeep(800, 150);
        }, 1000);
        return () => clearTimeout(timer);
      } else if (litLights === 5) {
        const delay = 500 + Math.random() * 1000; // wait 0.5s - 1.5s
        const timer = setTimeout(() => {
          setCountdownStatus('finished');
          setLitLights(0);
          playBeep(1200, 400); // Lights out beep
          playEngineSound();   // Engine start sound
          setIsRunning(true);
        }, delay);
        return () => clearTimeout(timer);
      }
    }
  }, [countdownStatus, litLights, playBeep, playEngineSound]);

  // Timer tick
  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          const curType = sessionTypeRef.current;
          const curConfig = configRef.current;
          playFinishSound();

          setTimeout(() => {
            if (curType === 'race') {
              setRacesCompleted(p => p + 1);
              // Check if early finish (progress was less than 100% due to skip)
              showEngineer(getRandomMsg('complete'));
              setShowComplete(true);

              // Switch to pit stop
              setSessionType('pitstop');
              const breakDur = curConfig.breakDuration * 60;
              setTimeRemaining(breakDur);
              setTotalTime(breakDur);
              setIsRunning(false);
            } else {
              // Back to race
              showEngineer(getRandomMsg('backToRace'));
              setSessionType('race');
              const raceDur = curConfig.totalLaps * 60;
              setTimeRemaining(raceDur);
              setTotalTime(raceDur);
              setIsRunning(false);
              notifiedMilestones.current = new Set();
              pressurePhaseNotified.current = null;
              focusLossNotified.current = false;
              focusStreakNotified.current = false;
              continuousFocusStart.current = null;
            }
          }, 0);

          return 0;
        }

        const newVal = prev - 1;
        // Race engineer notifications
        if (sessionTypeRef.current === 'race') {
          const curConfig = configRef.current;
          const totalSecs = curConfig.totalLaps * 60;
          const elapsed = totalSecs - newVal;
          const progressPct = elapsed / totalSecs; // 0 to 1

          // === PROGRESS MILESTONES (0%, 25%, 50%, 75%, 100%) ===
          const milestones: Array<{ id: string; threshold: number; category: EngineerCategory }> = [
            { id: 'start', threshold: 0.00, category: 'stintStart' },
            { id: 'sector1', threshold: 0.25, category: 'sector1' },
            { id: 'halfway', threshold: 0.50, category: 'halfway' },
            { id: 'sector3', threshold: 0.75, category: 'sector3' },
          ];

          for (const m of milestones) {
            if (!notifiedMilestones.current.has(m.id) && progressPct >= m.threshold) {
              notifiedMilestones.current.add(m.id);
              showEngineer(getRandomMsg(m.category));
              break; // Only one message per tick
            }
          }

          // === TIME PRESSURE SCALING (based on % time remaining) ===
          const remainingPct = 1 - progressPct;
          let currentPhase: string | null = null;
          if (remainingPct > 0.80) currentPhase = 'fresh';
          else if (remainingPct > 0.50) currentPhase = 'racePace';
          else if (remainingPct > 0.20) currentPhase = 'trackPosition';
          else if (remainingPct > 0) currentPhase = 'maximumFocus';

          if (currentPhase && currentPhase !== pressurePhaseNotified.current) {
            pressurePhaseNotified.current = currentPhase;
            const phaseMap: Record<string, EngineerCategory> = {
              fresh: 'tyresFresh',
              racePace: 'racePace',
              trackPosition: 'trackPosition',
              maximumFocus: 'maximumFocus',
            };
            // Only show pressure messages after the first minute (avoid clash with start message)
            if (elapsed > 5) {
              showEngineer(getRandomMsg(phaseMap[currentPhase]));
            }
          }
        }

        return newVal;
      });
    };

    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [isRunning, playFinishSound, showEngineer]);

  const start = useCallback(() => {
    if (timeRemaining === 0) return;
    setIsRunning(true);
    playStartSound();
    if (sessionType === 'race') {
      // The 'start' milestone will fire on the first tick, so no need to show here
      continuousFocusStart.current = Date.now();
    }
  }, [timeRemaining, playStartSound, sessionType]);

  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    const dur = sessionType === 'race' ? config.totalLaps * 60 : config.breakDuration * 60;
    setTimeRemaining(dur);
    setTotalTime(dur);
    setIsRunning(false);
    notifiedMilestones.current = new Set();
    pressurePhaseNotified.current = null;
    focusLossNotified.current = false;
    focusStreakNotified.current = false;
    continuousFocusStart.current = null;
  }, [sessionType, config.totalLaps, config.breakDuration]);

  const skipToBreak = useCallback(() => {
    showEngineer(getRandomMsg('earlyFinish'));
    setSessionType('pitstop');
    const breakDur = config.breakDuration * 60;
    setTimeRemaining(breakDur);
    setTotalTime(breakDur);
    setIsRunning(false);
    notifiedMilestones.current = new Set();
    pressurePhaseNotified.current = null;
  }, [config.breakDuration, showEngineer]);

  const skipToRace = useCallback(() => {
    showEngineer(getRandomMsg('backToRace'));
    setSessionType('race');
    const raceDur = config.totalLaps * 60;
    setTimeRemaining(raceDur);
    setTotalTime(raceDur);
    setIsRunning(false);
    notifiedMilestones.current = new Set();
    pressurePhaseNotified.current = null;
    focusLossNotified.current = false;
    focusStreakNotified.current = false;
    continuousFocusStart.current = null;
  }, [config.totalLaps, showEngineer]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const formatDuration = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  // Update break suggestion when laps change
  useEffect(() => {
    setCustomBreak(suggestBreak(customLaps));
  }, [customLaps]);

  // Update document title
  useEffect(() => {
    if (page !== 'timer') {
      document.title = 'RaceFocus - Pomodoro Timer';
      return;
    }
    document.title = isRunning
      ? `${formatTime(timeRemaining)} - LAP ${currentLap}/${visualTotalLaps} | RaceFocus`
      : 'RaceFocus - Pomodoro Timer';
  }, [timeRemaining, isRunning, page, currentLap, visualTotalLaps]);

  if (!hydrated) {
    return <div className="min-h-screen bg-[#0a0a0a]" />;
  }

  // ==================== LANDING PAGE ====================
  if (page === 'landing') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col relative overflow-hidden">
        {/* Animated background */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#E10600]/[0.03] rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#FFB800]/[0.03] rounded-full blur-[100px]" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
          {/* Logo */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8 sm:mb-12">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="w-12 h-12 bg-[#E10600] rounded-xl flex items-center justify-center shadow-lg shadow-[#E1060033] relative">
                <Gauge className="w-7 h-7 text-white relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-1">
              Race<span className="text-[#E10600]">Focus</span>
            </h1>
            <p className="text-white/30 text-sm tracking-wider">POMODORO TIMER</p>
          </motion.div>

          {/* Setup card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="w-full max-w-md"
          >
            <div className="bg-[#111]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 sm:p-8 shadow-2xl">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Flag className="w-5 h-5 text-[#E10600]" />
                Race Setup
              </h2>

              {/* Driver name */}
              <div className="mb-6">
                <Label className="text-white/50 text-xs tracking-wider uppercase mb-2 block flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Driver Name
                </Label>
                <Input
                  placeholder="Enter your name..."
                  value={driverInput}
                  onChange={(e) => setDriverInput(e.target.value)}
                  className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/20 h-11 text-base focus:border-[#E10600]/50 focus:ring-[#E10600]/20"
                />
              </div>

              {/* Number of laps (minutes) */}
              <div className="mb-6">
                <Label className="text-white/50 text-xs tracking-wider uppercase mb-2 block flex items-center gap-2">
                  <Target className="w-3.5 h-3.5" /> Race Distance
                </Label>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl sm:text-4xl font-black tabular-nums" style={{ color: TIRE_COMPOUNDS[selectedTire].color }}>{customLaps}</span>
                  <div>
                    <div className="text-sm font-bold">MIN</div>
                    <div className="text-[10px] text-white/30">{customLaps} laps of focus</div>
                  </div>
                </div>

                {/* Quick select buttons */}
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {[15, 25, 30, 40, 50, 60, 90].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setCustomLaps(mins)}
                      className={`py-2 rounded-lg text-xs font-bold tracking-wide transition-all border ${
                        customLaps === mins
                          ? 'border-[#E10600]/50 bg-[#E10600]/10 text-[#E10600]'
                          : 'border-white/5 bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/10'
                      }`}
                    >
                      {mins}
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/30 uppercase">Custom:</span>
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    value={customLaps}
                    onChange={(e) => setCustomLaps(Math.max(1, Math.min(180, parseInt(e.target.value) || 1)))}
                    className="bg-white/[0.04] border-white/10 text-white h-8 w-20 text-sm"
                  />
                  <span className="text-[10px] text-white/30">min focus</span>
                </div>
              </div>

              {/* Break duration */}
              <div className="mb-6">
                <Label className="text-white/50 text-xs tracking-wider uppercase mb-2 block flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5" /> Pit Stop Duration
                </Label>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl font-black text-[#00C853] tabular-nums">{customBreak}</span>
                  <div>
                    <div className="text-sm font-bold">MIN BREAK</div>
                    <div className="text-[10px] text-white/30">Suggested for {customLaps} min race</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {[3, 5, 8, 10, 15, 20].map((m) => (
                    <button
                      key={m}
                      onClick={() => setCustomBreak(m)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        customBreak === m
                          ? 'border-[#00C853]/50 bg-[#00C853]/10 text-[#00C853]'
                          : 'border-white/5 bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/10'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Tire compound */}
              <div className="mb-8">
                <Label className="text-white/50 text-xs tracking-wider uppercase mb-2 block flex items-center gap-2">
                  <CircleDot className="w-3.5 h-3.5" /> Tire Compound
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['soft', 'medium', 'hard'] as TireCompound[]).map((tc) => {
                    const tire = TIRE_COMPOUNDS[tc];
                    const isActive = selectedTire === tc;
                    return (
                      <button
                        key={tc}
                        onClick={() => setSelectedTire(tc)}
                        className={`py-3 px-2 rounded-xl text-center transition-all border ${
                          isActive
                            ? 'shadow-lg scale-[1.02]'
                            : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                        }`}
                        style={{
                          borderColor: isActive ? `${tire.color}44` : undefined,
                          backgroundColor: isActive ? `${tire.color}10` : undefined,
                          boxShadow: isActive ? `0 0 20px ${tire.glow}` : undefined,
                        }}
                      >
                        <div className="text-xl mb-1">{tire.emoji}</div>
                        <div className="text-xs font-bold" style={{ color: isActive ? tire.color : 'rgba(255,255,255,0.4)' }}>{tire.name}</div>
                        <div className="text-[9px] text-white/20 mt-0.5">{tire.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Start Race button */}
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button
                  onClick={startRace}
                  className="w-full h-14 text-base font-bold tracking-wide bg-[#E10600] hover:bg-[#c50500] text-white rounded-xl shadow-lg shadow-[#E1060033]"
                  style={{ boxShadow: `0 0 30px ${TIRE_COMPOUNDS[selectedTire].glow}` }}
                >
                  <Flag className="w-5 h-5 mr-2" />
                  START {customLaps} LAP RACE
                </Button>
              </motion.div>

              <p className="text-[10px] text-white/15 text-center mt-3 tracking-wider">
                1 LAP = 1 MINUTE OF FOCUS
              </p>
            </div>
          </motion.div>
        </div>

        <footer className="relative z-10 py-4 text-center text-[10px] text-white/10 tracking-wider">
          STAY FOCUSED. STAY FAST.
        </footer>
      </div>
    );
  }

  // ==================== TIMER PAGE ====================
  const tire = TIRE_COMPOUNDS[config.tireCompound];
  const sessionColor = sessionType === 'race' ? tire.color : '#00C853';
  const sessionName = sessionType === 'race' ? 'RACE' : 'PIT STOP';

  // Simulated position and gap
  const position = Math.max(1, 20 - racesCompleted * 3 - Math.floor(progress * 5));
  const gap = (Math.max(0, 30 - progress * 60 - racesCompleted * 10)).toFixed(3);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='10' height='10' fill='%23fff'/%3E%3Crect x='10' y='10' width='10' height='10' fill='%23fff'/%3E%3C/svg%3E")` }} />
      <div className="fixed inset-0 pointer-events-none transition-all duration-[2000ms]" style={{ background: isRunning ? `radial-gradient(ellipse at 50% 40%, ${sessionColor}06 0%, transparent 70%)` : 'none' }} />

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="icon" onClick={() => { setIsRunning(false); setPage('landing'); }} className="text-white/40 hover:text-white hover:bg-white/5 h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#E10600] rounded-md flex items-center justify-center shadow-lg shadow-[#E1060033]">
                <Gauge className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight">Race<span className="text-[#E10600]">Focus</span></span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Driver name */}
            <span className="hidden sm:inline text-xs text-white/20 mr-2">{config.driverName}</span>

            {/* Tire indicator */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.03] border border-white/5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tire.color }} />
              <span className="text-[10px] font-bold" style={{ color: tire.color }}>{tire.name.toUpperCase()}</span>
            </div>

            <Button variant="ghost" size="icon" onClick={() => setConfig(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }))} className="text-white/40 hover:text-white hover:bg-white/5 h-8 w-8">
              {config.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </Button>

            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white/40 hover:text-white hover:bg-white/5 h-8 w-8">
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#1a1a1a] border-white/10 text-white sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-white flex items-center gap-2 text-base">
                    <Settings className="w-5 h-5 text-[#E10600]" /> Race Settings
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-white/70 text-sm flex items-center gap-2">
                      <Flag className="w-3.5 h-3.5 text-[#E10600]" /> Race Laps (minutes)
                    </Label>
                    <Input type="number" min={1} max={180} value={config.totalLaps} onChange={(e) => setConfig(prev => ({ ...prev, totalLaps: Math.max(1, parseInt(e.target.value) || 1) }))} className="bg-[#111] border-white/10 text-white h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/70 text-sm flex items-center gap-2">
                      <Coffee className="w-3.5 h-3.5 text-[#00C853]" /> Pit Stop (minutes)
                    </Label>
                    <Input type="number" min={1} max={60} value={config.breakDuration} onChange={(e) => setConfig(prev => ({ ...prev, breakDuration: Math.max(1, parseInt(e.target.value) || 1) }))} className="bg-[#111] border-white/10 text-white h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/70 text-sm">Tire Compound</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['soft', 'medium', 'hard'] as TireCompound[]).map((tc) => {
                        const t = TIRE_COMPOUNDS[tc];
                        const isActive = config.tireCompound === tc;
                        return (
                          <button key={tc} onClick={() => setConfig(prev => ({ ...prev, tireCompound: tc }))} className={`py-2 rounded-lg text-xs font-bold border transition-all ${isActive ? 'shadow-lg' : 'border-white/5 bg-white/[0.02] text-white/40 hover:text-white/60'}`} style={{ borderColor: isActive ? `${t.color}44` : undefined, backgroundColor: isActive ? `${t.color}10` : undefined, color: isActive ? t.color : undefined, boxShadow: isActive ? `0 0 15px ${t.glow}` : undefined }}>
                            {t.emoji} {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Button onClick={() => { reset(); setShowSettings(false); }} className="w-full bg-[#E10600] hover:bg-[#c50500] text-white font-semibold">
                    Apply &amp; Reset
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-3 sm:py-5 relative z-10">
        {/* Session type badge */}
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border" style={{ backgroundColor: `${sessionColor}10`, borderColor: `${sessionColor}22` }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sessionColor }} />
            <span className="text-xs font-bold tracking-wider" style={{ color: sessionColor }}>
              {sessionName}
            </span>
            {isRunning && (
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: sessionColor }} />
            )}
          </div>
        </div>

        {/* Track + Timer + Pit Board layout */}
        <div className="flex items-center gap-4 sm:gap-6 mb-3 sm:mb-5">
          {/* Pit Board (desktop only) */}
          <div className="hidden lg:block">
            <PitBoard
              currentLap={sessionType === 'race' ? currentLap : visualTotalLaps}
              totalLaps={visualTotalLaps}
              driverName={config.driverName}
              tireCompound={config.tireCompound}
              position={position}
              gap={gap}
            />
          </div>

          {/* Track */}
          <div className="relative flex items-center justify-center">
            <div className="absolute rounded-full blur-3xl transition-all duration-[2000ms]" style={{ width: trackSize * 0.7, height: trackSize * 0.5, backgroundColor: isRunning ? `${sessionColor}06` : 'transparent' }} />

            <RaceTrack
              progress={trackProgress}
              lapFraction={lapFraction}
              sessionType={sessionType}
              isRunning={isRunning}
              trackSize={trackSize}
              tireCompound={config.tireCompound}
              currentLap={currentLap}
              totalLaps={visualTotalLaps}
            />

            {/* Timer overlay in center */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-0.5">
                <motion.div key={sessionType} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-[10px] sm:text-xs font-bold tracking-[0.25em] uppercase" style={{ color: sessionColor }}>
                  {sessionName}
                </motion.div>

                <motion.div
                  key={sessionType + '-time'}
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  className="text-4xl sm:text-5xl md:text-6xl font-mono font-bold tracking-wider text-white tabular-nums"
                  style={{ textShadow: isRunning ? `0 0 30px ${sessionColor}33` : 'none' }}
                >
                  {formatTime(timeRemaining)}
                </motion.div>

                {/* Lap counter */}
                <div className="text-xs sm:text-sm font-bold tracking-wider mt-0.5" style={{ color: sessionType === 'race' ? tire.color : '#00C853' }}>
                  {sessionType === 'race' ? `LAP ${currentLap}/${visualTotalLaps}` : `PIT STOP - ${config.breakDuration}m`}
                </div>

                <div className="w-28 sm:w-36 h-1 bg-white/10 rounded-full overflow-hidden mt-1">
                  <motion.div className="h-full rounded-full" style={{ backgroundColor: sessionColor }} animate={{ width: `${smoothProgress * 100}%` }} transition={{ duration: 0.3, ease: 'linear' }} />
                </div>

                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[9px] sm:text-[10px] text-white/25 tracking-[0.2em] uppercase">
                    {isRunning ? (sessionType === 'race' ? 'RACING' : 'IN PIT') : timeRemaining === totalTime ? 'READY' : 'PAUSED'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile pit board row */}
        <div className="lg:hidden flex items-center justify-center gap-3 mb-3 sm:mb-5">
          <div className="bg-black/80 border border-white/10 rounded-lg px-3 py-2 font-mono text-xs flex items-center gap-4">
            <div><span className="text-white/30">P</span> <span className="font-black text-base">{position}</span></div>
            <div><span className="text-white/30">LAP</span> <span className="font-bold">{sessionType === 'race' ? currentLap : visualTotalLaps}<span className="text-white/20">/{visualTotalLaps}</span></span></div>
            <div><span className="text-white/30">TIRE</span> <span className="font-bold" style={{ color: tire.color }}>{tire.name[0].toUpperCase()}</span></div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 sm:gap-5 mb-5 sm:mb-7">
          <Button onClick={reset} variant="ghost" size="icon" className="w-11 h-11 sm:w-12 sm:h-12 rounded-full text-white/30 hover:text-white hover:bg-white/5">
            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>

          <motion.div whileTap={{ scale: 0.92 }}>
            <Button
              onClick={isRunning ? pause : start}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full text-white shadow-xl"
              style={{ backgroundColor: sessionColor, boxShadow: `0 0 25px ${sessionColor}44, 0 4px 15px rgba(0,0,0,0.3)` }}
            >
              {isRunning ? <Pause className="w-6 h-6 sm:w-7 sm:h-7" /> : <Play className="w-6 h-6 sm:w-7 sm:h-7 ml-0.5" />}
            </Button>
          </motion.div>

          <Button
            onClick={sessionType === 'race' ? skipToBreak : skipToRace}
            variant="ghost"
            size="icon"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full text-white/30 hover:text-white hover:bg-white/5"
          >
            {sessionType === 'race' ? <Coffee className="w-4 h-4 sm:w-5 sm:h-5" /> : <Flag className="w-4 h-4 sm:w-5 sm:h-5" />}
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2 sm:gap-3 mb-4 w-full max-w-lg">
          <div className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2.5 border border-white/5">
            <Trophy className="w-3.5 h-3.5 text-[#FFB800]" />
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Races</div>
              <div className="text-base sm:text-lg font-bold tabular-nums">{racesCompleted}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2.5 border border-white/5">
            <Clock className="w-3.5 h-3.5 text-[#00C853]" />
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Focus</div>
              <div className="text-base sm:text-lg font-bold tabular-nums">{formatDuration(totalFocusSeconds)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2.5 border border-white/5">
            <Flag className="w-3.5 h-3.5" style={{ color: tire.color }} />
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Laps</div>
              <div className="text-base sm:text-lg font-bold tabular-nums">{visualTotalLaps}<span className="text-white/20 text-xs">/race</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2.5 border border-white/5">
            <Zap className="w-3.5 h-3.5 text-[#FF6D00]" />
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Pit</div>
              <div className="text-base sm:text-lg font-bold tabular-nums">{config.breakDuration}<span className="text-white/20 text-xs">m</span></div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-3 bg-[#0a0a0a]/50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-[10px] text-white/15">
          <span>RaceFocus Timer</span>
          <span className="tracking-wider">{config.driverName} &bull; {tire.name.toUpperCase()} &bull; {visualTotalLaps} LAPS</span>
        </div>
      </footer>

      {/* Race complete overlay */}
      <AnimatePresence>
        {showComplete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowComplete(false)}
          >
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 sm:p-8 max-w-sm mx-4 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {/* Checkered flag */}
              <div className="flex justify-center mb-4">
                <div className="grid grid-cols-4 gap-0.5 w-14 h-14">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className={Math.floor(i / 4) % 2 === i % 2 ? 'bg-white' : 'bg-[#111]'} style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                  ))}
                </div>
              </div>
              <h2 className="text-xl sm:text-2xl font-black mb-1" style={{ color: tire.color }}>RACE COMPLETE</h2>
              <p className="text-white/40 text-sm mb-1">{config.totalLaps} min race finished</p>
              <p className="text-white/60 text-sm mb-5">
                Great drive, {config.driverName}! Take a {config.breakDuration}m pit stop?
              </p>
              <div className="flex gap-3">
                <Button onClick={() => { setShowComplete(false); skipToRace(); }} variant="outline" className="flex-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5">
                  Skip Break
                </Button>
                <Button onClick={() => { setShowComplete(false); start(); }} className="flex-1 bg-[#00C853] hover:bg-[#00a844] text-white font-semibold">
                  <Coffee className="w-4 h-4 mr-1.5" /> Pit Stop
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5 Lights Countdown Overlay */}
      <AnimatePresence>
        {countdownStatus === 'counting' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <div className="flex gap-2 sm:gap-4 mb-8 bg-[#111] p-4 sm:p-6 rounded-2xl border border-white/10 shadow-2xl">
              {[1, 2, 3, 4, 5].map(lightNum => (
                <div key={lightNum} className="flex flex-col gap-2 sm:gap-4">
                  <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full border-4 border-black/50 transition-colors duration-75 ${litLights >= lightNum ? 'bg-[#E10600] shadow-[0_0_30px_#E10600]' : 'bg-[#333]'}`} />
                  <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full border-4 border-black/50 transition-colors duration-75 ${litLights >= lightNum ? 'bg-[#E10600] shadow-[0_0_30px_#E10600]' : 'bg-[#333]'}`} />
                </div>
              ))}
            </div>
            <h2 className="text-white/50 font-mono text-xl sm:text-2xl uppercase tracking-widest animate-pulse">Wait for it...</h2>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Race engineer messages */}
      <AnimatePresence mode="wait">
        {engineerMsg && <EngineerMessage key={engineerKey} message={engineerMsg} onDismiss={() => setEngineerMsg(null)} />}
      </AnimatePresence>
    </div>
  );
}
