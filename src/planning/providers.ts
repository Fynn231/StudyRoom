import type { PlanningInput, ScheduledPlan } from "./schema.js";
export type PlanningProviderKind = "cloud-qwen" | "ollama" | "lm-studio" | "browser-qwen";
export type PlanningProvider = {
  kind: PlanningProviderKind;
  enhance(
    input: PlanningInput,
    signal: AbortSignal,
  ): Promise<{
    plan: ScheduledPlan;
    verification: { model: string; cost: 0; provider: string };
  }>;
};
// Future local implementations live on the user's device, not behind arbitrary
// server URL proxies. Selecting one must never forward its prompts to the cloud.
export const planningProviders = [
  { kind: "cloud-qwen", available: true, sendsToCloud: true },
  { kind: "ollama", available: false, sendsToCloud: false },
  { kind: "lm-studio", available: false, sendsToCloud: false },
  { kind: "browser-qwen", available: false, sendsToCloud: false },
] as const;
