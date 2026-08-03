"use client";

import { AnalysisStage } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS: { id: AnalysisStage; label: string }[] = [
  {
    id: "deployments",
    label: "Finding your smart contracts",
  },
  {
    id: "verification",
    label: "Checking verified contracts",
  },
  {
    id: "ens",
    label: "Looking for your ENS profile",
  },
  {
    id: "scoring",
    label: "Calculating your reputation score",
  },
  {
    id: "complete",
    label: "Analysis complete",
  },
];

const STAGE_ORDER: AnalysisStage[] = STEPS.map((s) => s.id);

function stageIndex(stage: AnalysisStage | null): number {
  if (!stage) return -1;
  return STAGE_ORDER.indexOf(stage);
}

interface AnalysisProgressProps {
  stage: AnalysisStage | null;
  elapsedMs: number;
  includesENS?: boolean;
}

export function AnalysisProgress({
  stage,
  elapsedMs,
  includesENS = false,
}: AnalysisProgressProps) {
  const current = stageIndex(stage);
  const visibleSteps = includesENS
    ? STEPS
    : STEPS.filter((s) => s.id !== "ens");

  const progressPct =
    current < 0
      ? 5
      : Math.min(100, Math.round(((current + 1) / visibleSteps.length) * 100));

  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="surface-panel border border-surface-border rounded-2xl p-6 space-y-5 animate-fade-in-up">
      <div className="flex items-center justify-between gap-4">
        <div>
  <p className="text-sm font-semibold text-surface-foreground">
    Analyzing your wallet
  </p>

  <p className="text-xs text-surface-muted mt-1">
    We are reviewing your on-chain activity step by step.
  </p>

   <p className="text-xs text-surface-muted">
  Step {Math.min(current + 1, visibleSteps.length)} of {visibleSteps.length}
</p>
</div>
  <div className="text-right">
  <p className="text-xs font-medium text-surface-foreground">
    {progressPct}% Complete
  </p>

  <p className="text-xs text-surface-muted">
    {elapsedSec}s
  </p>
</div>
      </div>

      <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
        <div
          className="h-full bg-surface-accent transition-all duration-500 ease-productive rounded-full"
          style={{ width: `${progressPct}%` }}
        />
      </div>

<div className="rounded-lg border border-surface-border bg-surface-raised p-3">
  <p className="text-xs text-surface-muted">
    Current step
  </p>

  <p className="text-sm font-semibold text-surface-foreground mt-1">
    {stage
      ? visibleSteps.find((s) => s.id === stage)?.label
      : "Preparing analysis..."}
  </p>
</div>

      <ol className="space-y-2">
        {visibleSteps.map((step) => {
          const idx = stageIndex(step.id);
          const done = current > idx;
          const active = current === idx;

          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-3 text-sm transition-colors",
                done && "text-surface-muted",
                active && "text-surface-foreground font-medium",
                !done && !active && "text-surface-muted/50"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 border",
                  done && "bg-green-500/15 border-green-500/30 text-green-400",
                  active && "bg-surface-accent/20 border-surface-accent/40 text-surface-accent animate-pulse",
                  !done && !active && "border-surface-border text-surface-muted/40"
                )}
              >
                {done ? "✓" : active ? "…" : ""}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
