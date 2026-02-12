import { Check } from "@phosphor-icons/react/ssr";
import type * as React from "react";

import { cn } from "#app/lib/utils.ts";

type Step = {
  id: string;
  label: string;
};

const STEPS: Step[] = [
  { id: "auth", label: "Auth" },
  { id: "admin", label: "Admin" },
  { id: "tunnel", label: "Tunnel" },
  { id: "complete", label: "Complete" },
];

type StepIndicatorProps = {
  currentStep: "auth" | "admin" | "tunnel" | "complete";
};

export function StepIndicator({
  currentStep,
}: StepIndicatorProps): React.ReactElement {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={step.id} className="flex items-center">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium",
                    isCompleted && "border-kumo-brand bg-kumo-brand text-white",
                    isCurrent && "border-kumo-brand text-kumo-brand",
                    !isCompleted &&
                      !isCurrent &&
                      "border-kumo-subtle/30 text-kumo-subtle/50",
                  )}
                >
                  {isCompleted ? <Check size={16} /> : <span>{index + 1}</span>}
                </div>
                <span
                  className={cn(
                    "mt-1 text-xs",
                    isCurrent && "font-medium text-kumo-default",
                    !isCurrent && "text-kumo-subtle",
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 w-12 sm:w-16 md:w-24",
                    index < currentIndex
                      ? "bg-kumo-brand"
                      : "bg-kumo-subtle/30",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
