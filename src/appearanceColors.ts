// Exact, opaque sRGB stops. Reading contrast is provided by paper islands,
// never by silently changing the user's chosen colors.
export function customGradient(first: unknown, second: unknown): string | null {
  const valid = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) && value.length === 7;
  if (!valid(first) || !valid(second)) return null;
  return `linear-gradient(to bottom right, ${first}, ${second})`;
}
