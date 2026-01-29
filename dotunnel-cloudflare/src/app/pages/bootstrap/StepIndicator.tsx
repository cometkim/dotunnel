import { Check } from "lucide-react";
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
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary text-primary",
                    !isCompleted &&
                      !isCurrent &&
                      "border-muted-foreground/30 text-muted-foreground/50",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "mt-1 text-xs",
                    isCurrent && "font-medium text-foreground",
                    !isCurrent && "text-muted-foreground",
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
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
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
