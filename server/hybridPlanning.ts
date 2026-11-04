import type { IncomingMessage, ServerResponse } from "node:http";
import { validatePlanningInput, record } from "../src/planning/schema.js";
import { schedule, validateScheduledPlan } from "../src/planning/scheduler.js";
import type { PlanningProvider } from "../src/planning/providers.js";
import { AiCapacity, CapacityError } from "./aiCapacity.js";
import { PlanningProviderError } from "./qwenPlanning.js";
import {
  accountPlans,
  validateAccountPlan,
  type AccountConfig,
  type PlanningIdentity,
} from "./planningAccount.js";

export function createHybridHandler(options: {
  hosted: boolean;
  origin?: string;
  capacity: AiCapacity;
  provider?: PlanningProvider;
  account?: AccountConfig;
}) {
  const active = new Set<AbortController>();
  let lastIssue: { reason: string; upstreamStatus?: number; retryAfter: number } | null = null;
  const handle = async (req: IncomingMessage, res: ServerResponse, identity?: PlanningIdentity) => {
    const send = (status: number, data: unknown, retryAfter?: number) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      });
      res.end(JSON.stringify(data));
    };
    if (options.hosted && !identity) {
      send(401, { error: "Sign in required." });
      return;
    }
    if (req.method === "GET" && req.url === "/api/ai/hybrid/status") {
      send(200, {
        configured: !!options.provider,
        preferred: "cloud-qwen",
        localProvidersAvailable: false,
        lastIssue,
      });
      return;
    }
    const account = req.url === "/api/ai/hybrid/account-plans";
    if (!account && req.url !== "/api/ai/hybrid/enhance" && req.url !== "/api/ai/hybrid/baseline") {
      send(404, { error: "Not found." });
      return;
    }
    if (req.method === "DELETE" && account) {
      // DELETE /api/ai/hybrid/account-plans/{id} (owner-scoped, fail-closed).
      try {
        const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
        const id = url.searchParams.get("id");
        if (!id) throw Error("Missing plan id.");
        const supabaseUrl = options.account?.supabaseUrl;
        if (!supabaseUrl) throw Error("Account sync not configured.");
        const response = await (options.account?.fetch ?? fetch)(
          `${supabaseUrl}/rest/v1/studyroom_planning_plans?eq.id.~eq.${id}&select=id`,
          {
            method: "DELETE",
            headers: {
              apikey: options.account!.anonKey,
              Authorization: `Bearer ${identity!.token}`,
              "Content-Type": "application/json",
            },
          },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (response.status === 401 || response.status === 403 || response.status === 503) {
            send(503, { error: "Account sync unavailable. Plan was not deleted." });
            return;
          }
          send(response.status, body);
          return;
        }
        send(200, { deleted: true });
        return;
      } catch (e) {
        send(500, { error: "Could not delete account plan: " + (e as Error).message });
        return;
      }
    }
    if (req.method !== "POST" && !(account && req.method === "GET")) {
      send(405, { error: "Use the documented method." });
      return;
    }
    if (account && (!identity || !options.account)) {
      send(503, {
        error:
          "Account sync requires reviewed database setup. Device-only planning remains available.",
      });
      return;
    }
    if (
      req.method === "POST" &&
      (req.headers.origin !== (options.origin ?? `http://${req.headers.host}`) ||
        (req.headers["sec-fetch-site"] !== undefined &&
          req.headers["sec-fetch-site"] !== "same-origin"))
    ) {
      send(403, { error: "Same-origin action required." });
      return;
    }
    if (
      req.method === "POST" &&
      (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] ?? "") ||
        req.headers["content-encoding"])
    ) {
      send(415, { error: "Use uncompressed JSON." });
      return;
    }
    const limit = account ? 196608 : 24576;
    if (Number(req.headers["content-length"] ?? 0) > limit) {
      send(413, { error: "Planning request too large." });
      return;
    }
    const controller = new AbortController();
    active.add(controller);
    const abort = () => controller.abort();
    req.once("aborted", abort);
    res.once("close", abort);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let release: (() => void) | undefined;
    try {
      if (account && req.method === "GET") {
        send(200, await accountPlans(options.account!, identity!, undefined, controller.signal));
        return;
      }
      timer = setTimeout(() => {
        controller.abort();
        send(408, { error: "Request timed out." });
        req.destroy();
      }, 5000);
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > limit) {
          send(413, { error: "Planning request too large." });
          return;
        }
        chunks.push(chunk);
      }
      clearTimeout(timer);
      let value: unknown;
      try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      } catch {
        send(400, { error: "Invalid planning JSON." });
        return;
      }
      if (account) {
        let plan;
        try {
          plan = validateAccountPlan(value);
        } catch {
          send(400, { error: "Review the plan before saving." });
          return;
        }
        send(200, await accountPlans(options.account!, identity!, plan, controller.signal));
        return;
      }
      let input;
      try {
        const v = record(value, req.url!.endsWith("enhance") ? ["input", "consent"] : ["input"]);
        if ("consent" in v && v.consent !== true) throw Error();
        input = validatePlanningInput(v.input);
      } catch {
        send(400, { error: "Review tasks, deadlines, availability and cloud consent." });
        return;
      }
      if (req.url!.endsWith("baseline")) {
        send(200, { plan: schedule(input) });
        return;
      }
      if (!options.provider) {
        send(503, { error: "Cloud Qwen is not configured. Your baseline plan is unchanged." });
        return;
      }
      release = options.capacity.acquire(identity?.user.id ?? "local");
      try {
        const result = await options.provider.enhance(input, controller.signal);
        const plan = validateScheduledPlan(input, result.plan);
        if (
          result.verification.cost !== 0 ||
          result.verification.provider !== "openrouter-qwen-free" ||
          !/^qwen\/[a-z0-9._-]+:free$/.test(result.verification.model)
        )
          throw Error("Unverified enhancement");
        options.capacity.outcome(true);
        lastIssue = null;
        send(200, { ...result, plan });
      } catch (error) {
        options.capacity.outcome(false);
        if (error instanceof PlanningProviderError) {
          lastIssue = {
            reason: error.reason,
            upstreamStatus: error.upstreamStatus,
            retryAfter: error.retryAfter,
          };
          if (error.reason !== "invalid_output") options.capacity.cooldown(error.retryAfter);
          send(
            error.reason === "rate_limit" ||
              error.reason === "daily_quota" ||
              error.reason === "upstream_capacity"
              ? 429
              : 503,
            {
              error: `Cloud Qwen unavailable (${error.reason}). Your baseline and edits are unchanged.`,
              diagnostic: lastIssue,
            },
            error.retryAfter,
          );
        } else
          send(502, {
            error:
              "Cloud Qwen returned no valid enhancement. Your baseline and edits are unchanged.",
          });
      }
    } catch (error) {
      if (error instanceof CapacityError)
        send(
          429,
          { error: `Planning capacity: ${error.reason}. Your plan is unchanged.` },
          error.retryAfter,
        );
      else
        send(503, {
          error: account
            ? "Account sync is unavailable. Your local plan is unchanged."
            : "Planning request failed. Your current work is unchanged.",
        });
    } finally {
      release?.();
      if (timer) clearTimeout(timer);
      active.delete(controller);
      req.removeListener("aborted", abort);
      res.removeListener("close", abort);
    }
  };
  return Object.assign(handle, {
    close() {
      for (const c of active) c.abort();
    },
    metrics: () => options.capacity.metrics(),
  });
}
