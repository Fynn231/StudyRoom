import { record } from "../src/planning/schema.js";
import { validateAccountPlan, type AccountPlan } from "../src/planning/savedSchedule.js";
export { validateAccountPlan } from "../src/planning/savedSchedule.js";
export type PlanningIdentity = { user: { id: string }; token: string };
export type AccountConfig = { supabaseUrl: string; anonKey: string; fetch?: typeof fetch };
/** Uses the user's JWT and RLS, never a service-role credential or body-supplied owner. */
export async function accountPlans(
  config: AccountConfig,
  identity: PlanningIdentity,
  save?: AccountPlan,
  signal?: AbortSignal,
) {
  const upstream = config.fetch ?? fetch;
  const url = new URL("/rest/v1/studyroom_planning_plans", config.supabaseUrl);
  if (!save) {
    url.searchParams.set("select", "id,title,payload");
    url.searchParams.set("user_id", `eq.${identity.user.id}`);
    url.searchParams.set("order", "updated_at.desc");
    url.searchParams.set("limit", "20");
  }
  let response = await upstream(url, {
    method: save ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(5000)]),
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
      ...(save ? { Prefer: "return=minimal" } : {}),
    },
    ...(save
      ? {
          body: JSON.stringify({
            id: save.id,
            user_id: identity.user.id,
            title: save.title,
            payload: { input: save.input, plan: save.plan },
          }),
        }
      : {}),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(
      "Account synchronization is unavailable. Keep your plan here or save on this device.",
    );
  }
  if (save) {
    await response.body?.cancel();
    // A successful write response alone does not establish durable state. Read
    // only this ID under the same verified owner/JWT; never retry or delete a
    // possibly committed write when confirmation fails.
    url.searchParams.set("select", "id,title,payload");
    url.searchParams.set("user_id", `eq.${identity.user.id}`);
    url.searchParams.set("id", `eq.${save.id}`);
    url.searchParams.set("limit", "1");
    response = await upstream(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(5000)]),
      headers: { apikey: config.anonKey, Authorization: `Bearer ${identity.token}` },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error("Account save could not be confirmed. Reload saved schedules before retrying.");
    }
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Account response unavailable.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) throw Error("Account response too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const rows: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!Array.isArray(rows) || rows.length > 20) throw Error("Invalid saved plans.");
  const plans = rows.map((row) => {
    const r = record(row, ["id", "title", "payload"]);
    const payload = record(r.payload, ["input", "plan"]);
    return validateAccountPlan({ id: r.id, title: r.title, ...payload });
  });
  if (save) {
    if (
      plans.length !== 1 ||
      JSON.stringify(plans[0]) !== JSON.stringify(validateAccountPlan(save))
    )
      throw Error("Account save could not be confirmed. Reload saved schedules before retrying.");
    return { saved: true };
  }
  return { plans };
}
