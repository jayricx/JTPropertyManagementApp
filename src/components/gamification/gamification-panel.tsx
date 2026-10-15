"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  Building2,
  CalendarCheck,
  Crown,
  Flame,
  HeartPulse,
  Home,
  KeyRound,
  Lock,
  Sparkles,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// Type-only import — the runtime lib touches the database and must never be
// bundled into this client component.
import type {
  BadgeState,
  GamificationOverview,
  HealthComponent,
} from "@/lib/gamification";

const BADGE_ICONS = {
  home: Home,
  building: Building2,
  key: KeyRound,
  "calendar-check": CalendarCheck,
  zap: Zap,
  "trending-up": TrendingUp,
  crown: Crown,
} as const;

// Flip to true after hydration so entrance animations can ease in from zero
// without a setState-in-effect cascade (server render stays static).
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function scoreHex(score: number): string {
  if (score < 40) return "#ef4444";
  if (score < 70) return "#f59e0b";
  return "#10b981";
}

function scoreClass(score: number): string {
  if (score < 40) return "text-red-500";
  if (score < 70) return "text-amber-500";
  return "text-emerald-500";
}

/** Animated 0–100 ring that eases up to the score on mount. */
function ScoreRing({ value }: { value: number }) {
  const mounted = useMounted();
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const offset = mounted
    ? circumference * (1 - Math.min(100, Math.max(0, value)) / 100)
    : circumference;

  return (
    <div className="relative size-32 shrink-0 self-center sm:self-start">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="10"
          className="stroke-muted"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={scoreHex(value)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        <span className="text-[11px] text-muted-foreground">health</span>
      </div>
    </div>
  );
}

function HealthRow({ component }: { component: HealthComponent }) {
  const mounted = useMounted();
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{component.label}</span>
        <span className={`font-semibold tabular-nums ${scoreClass(component.score)}`}>
          {component.score}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${mounted ? component.score : 0}%`,
            backgroundColor: scoreHex(component.score),
            transition: "width 800ms ease-out",
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{component.detail}</p>
    </div>
  );
}

function HealthScoreCard({ overview }: { overview: GamificationOverview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="size-5" /> Portfolio Health
        </CardTitle>
        <CardDescription>
          How your portfolio is doing right now
        </CardDescription>
      </CardHeader>
      <CardContent>
        {overview.healthScore === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Add units and leases to see your portfolio health score.
          </p>
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row">
            <ScoreRing value={overview.healthScore} />
            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
              {overview.healthComponents.map((component) => (
                <HealthRow key={component.key} component={component} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LevelCard({ overview }: { overview: GamificationOverview }) {
  const mounted = useMounted();
  const { level, levelTitle, xp, xpThisWeek, currentLevelXp, nextLevelXp } =
    overview;
  const span = nextLevelXp !== null ? nextLevelXp - currentLevelXp : 1;
  const percent = nextLevelXp !== null
    ? Math.min(100, Math.max(0, Math.round(((xp - currentLevelXp) / span) * 100)))
    : 100;
  const toNext = nextLevelXp !== null ? Math.max(0, nextLevelXp - xp) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5" /> Landlord Level
        </CardTitle>
        <CardDescription>
          Earn XP for growing and managing your portfolio
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">Lv {level}</span>
            <span className="font-medium text-muted-foreground">
              {levelTitle}
            </span>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {xp.toLocaleString()}
            </span>{" "}
            XP
            {xpThisWeek > 0 && (
              <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                +{xpThisWeek} this week
              </span>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${mounted ? percent : 0}%`,
                transition: "width 800ms ease-out",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {nextLevelXp !== null
              ? `${toNext.toLocaleString()} XP to level ${level + 1}`
              : "Max level reached"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Add property +50 · Unit +15 · Tenant +20 · Lease +30 · Payment +10 ·
          Expense +5 · Resolve request +25
        </p>
      </CardContent>
    </Card>
  );
}

function AchievementsCard({ overview }: { overview: GamificationOverview }) {
  const unlocked = overview.badges.filter((b) => b.unlockedAt !== null).length;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-5" /> Achievements
            </CardTitle>
            <CardDescription>
              {unlocked} of {overview.badges.length} unlocked
            </CardDescription>
          </div>
          {overview.streakMonths > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-600 dark:text-orange-400">
              <Flame className="size-4" />
              {overview.streakMonths}-month collection streak
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {overview.badges.map((badge: BadgeState) => {
            const Icon = BADGE_ICONS[badge.icon] ?? Home;
            const isUnlocked = badge.unlockedAt !== null;
            return (
              <div
                key={badge.key}
                title={
                  isUnlocked
                    ? `Unlocked ${new Date(badge.unlockedAt!).toLocaleDateString()}`
                    : "Locked"
                }
                className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center ${
                  isUnlocked
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "opacity-60"
                }`}
              >
                {!isUnlocked && (
                  <Lock className="absolute right-1.5 top-1.5 size-3 text-muted-foreground" />
                )}
                <div
                  className={`flex size-10 items-center justify-center rounded-full ${
                    isUnlocked
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold leading-tight">
                    {badge.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                    {badge.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function celebrate() {
  import("canvas-confetti")
    .then((m) => {
      const fire = m.default;
      const colors = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];
      fire({ particleCount: 120, spread: 70, origin: { y: 0.6 }, colors });
      setTimeout(
        () => fire({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 }, colors }),
        250,
      );
      setTimeout(
        () => fire({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, colors }),
        400,
      );
    })
    .catch(() => {
      // Confetti is a nicety — the toast still fires below.
    });
}

export function GamificationPanel({ overview }: { overview: GamificationOverview }) {
  // Ref guard so StrictMode's double effect run celebrates exactly once.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (celebratedRef.current || overview.justUnlocked.length === 0) return;
    celebratedRef.current = true;
    for (const key of overview.justUnlocked) {
      const badge = overview.badges.find((b) => b.key === key);
      if (!badge) continue;
      toast.success(`🏆 ${badge.title} unlocked!`, {
        description: badge.description,
      });
    }
    celebrate();
  }, [overview]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HealthScoreCard overview={overview} />
        </div>
        <LevelCard overview={overview} />
      </div>
      <AchievementsCard overview={overview} />
    </div>
  );
}
