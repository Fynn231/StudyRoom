export function normalizeDomains(text: string): string[];
export function blockRules(
  domains: string[],
  base?: number,
): Array<{
  id: number;
  priority: number;
  action: { type: "block" };
  condition: { urlFilter: string; resourceTypes: ["main_frame"] };
}>;
