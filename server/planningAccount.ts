import { record } from "../src/planning/schema.js";
import { validateAccountPlan, type AccountPlan } from "../src/planning/savedSchedule.js";
export { validateAccountPlan } from "../src/planning/savedSchedule.js";
export type PlanningIdentity = { user: { id: string }; token: string };
export type AccountConfig = { supabaseUrl: string; anonKey: string; fetch?: typeof fetch };
export async function deleteAccountPlan(
  config: AccountConfig,
  identity: PlanningIdentity,
  id: string,
  signal?: AbortSignal,
) {
  const url = new URL("/rest/v1/studyroom_planning_plans", config.supabaseUrl);
  url.searchParams.set("user_id", `eq.${identity.user.id}`);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("select", "id");
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${identity.token}`,
    Prefer: "return=representation",
  };
  const bounded = AbortSignal.any([
    signal ?? new AbortController().signal,
    AbortSignal.timeout(5000),
  ]);
  const upstream = config.fetch ?? fetch;
  const read = async (method: string) => {
    const response = await upstream(url, {
      method,
      headers,
      signal: bounded,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(
        "Cloud deletion unavailable. Reload the library before retrying; your draft is unchanged.",
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error("Deletion could not be confirmed.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) throw Error("Invalid deletion response.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  };
  const rows = await read("DELETE");
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== id)
    throw Error(
      "Deletion not confirmed for this owner and plan. Reload saved schedules before retrying.",
    );
  const after = await read("GET");
  if (!Array.isArray(after) || after.length !== 0)
    throw Error("Deletion could not be confirmed. Reload saved schedules before retrying.");
  return { deleted: true, id };
}
/** Uses the user's JWT and RLS, never a service-role credential or body-supplied owner. */
export class AccountSaveError extends Error {
  constructor(
    public attemptedId: string,
    public category: "save_uncertain" | "save_rejected" | "save_conflict",
    message: string,
  ) {
    super(message);
  }
}
export async function accountPlans(
  config: AccountConfig,
  identity: PlanningIdentity,
  save?: AccountPlan,
  signal?: AbortSignal,
  lookupId?: string,
) {
  if (!save) return requestAccountPlans(config, identity, undefined, signal, lookupId);
  try {
    const existing = await requestAccountPlans(config, identity, undefined, signal, save.id);
    if ("plans" in existing && existing.plans?.length) {
      if (JSON.stringify(existing.plans[0]) === JSON.stringify(validateAccountPlan(save)))
        return { saved: true, id: save.id };
      throw new AccountSaveError(
        save.id,
        "save_conflict",
        "This owner/ID already contains a different schedule. Nothing was overwritten. Reload and review it before saving a new copy.",
      );
    }
    return await requestAccountPlans(config, identity, save, signal);
  } catch (error) {
    if (error instanceof AccountSaveError) throw error;
    throw new AccountSaveError(
      save.id,
      "save_uncertain",
      "Account save could not be confirmed. Reload saved schedules to reconcile this attempted ID before retrying. Your reviewed edits are unchanged.",
    );
  }
}
async function requestAccountPlans(
  config: AccountConfig,
  identity: PlanningIdentity,
  save?: AccountPlan,
  signal?: AbortSignal,
  lookupId?: string,
) {
  const upstream = config.fetch ?? fetch;
  const url = new URL("/rest/v1/studyroom_planning_plans", config.supabaseUrl);
  if (!save) {
    url.searchParams.set("select", "id,title,payload");
    url.searchParams.set("user_id", `eq.${identity.user.id}`);
    url.searchParams.set("order", "updated_at.desc");
    url.searchParams.set("limit", lookupId ? "1" : "20");
    if (lookupId) url.searchParams.set("id", `eq.${lookupId}`);
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
    const status = response.status;
    await response.body?.cancel();
    if (save && status >= 400 && status < 500 && status !== 409)
      throw new AccountSaveError(
        save.id,
        "save_rejected",
        "Account save was rejected. Load saved schedules and delete an unneeded copy if the 20-plan library is full, then retry. Your reviewed edits are unchanged.",
      );
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
    return { saved: true, id: save.id };
  }
  return { plans };
}
