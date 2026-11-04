export type CapacityFailure = "user_quota" | "provider_quota" | "busy" | "cooldown" | "capacity";
export class CapacityError extends Error {
  constructor(
    readonly reason: CapacityFailure,
    readonly retryAfter: number,
  ) {
    super(reason);
  }
}
type Usage = { day: number; count: number; minute: number; minuteCount: number; active: number };
const dayMs = 86400000;
/** Single-process admission control. Deployments reset counters; distributed hosting needs shared storage. */
export class AiCapacity {
  private users = new Map<string, Usage>();
  private provider: Usage;
  private cooldownUntil = 0;
  private counters = { admitted: 0, succeeded: 0, failed: 0, denied: 0 };
  constructor(
    private now = Date.now,
    private limits = {
      userMinute: 4,
      userDay: 12,
      providerMinute: 12,
      providerDay: 40,
      concurrent: 2,
      users: 1024,
    },
  ) {
    this.provider = this.fresh();
  }
  private fresh(): Usage {
    return { day: this.now(), count: 0, minute: this.now(), minuteCount: 0, active: 0 };
  }
  private reset(usage: Usage) {
    const now = this.now();
    if (now - usage.day >= dayMs) {
      usage.day = now;
      usage.count = 0;
    }
    if (now - usage.minute >= 60000) {
      usage.minute = now;
      usage.minuteCount = 0;
    }
  }
  acquire(userId: string): () => void {
    const now = this.now();
    const deny = (reason: CapacityFailure, until: number): never => {
      this.counters.denied++;
      throw new CapacityError(reason, Math.max(1, Math.ceil((until - now) / 1000)));
    };
    if (now < this.cooldownUntil) deny("cooldown", this.cooldownUntil);
    for (const [id, u] of this.users) if (!u.active && now - u.day >= dayMs) this.users.delete(id);
    if (!this.users.has(userId) && this.users.size >= this.limits.users)
      deny("capacity", now + 60000);
    const user = this.users.get(userId) ?? this.fresh();
    this.reset(user);
    this.reset(this.provider);
    if (user.count >= this.limits.userDay) deny("user_quota", user.day + dayMs);
    if (user.minuteCount >= this.limits.userMinute) deny("user_quota", user.minute + 60000);
    if (this.provider.count >= this.limits.providerDay)
      deny("provider_quota", this.provider.day + dayMs);
    if (this.provider.minuteCount >= this.limits.providerMinute)
      deny("provider_quota", this.provider.minute + 60000);
    if (user.active || this.provider.active >= this.limits.concurrent) deny("busy", now + 5000);
    user.count++;
    user.minuteCount++;
    user.active++;
    this.provider.count++;
    this.provider.minuteCount++;
    this.provider.active++;
    this.users.set(userId, user);
    this.counters.admitted++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        user.active--;
        this.provider.active--;
      }
    };
  }
  cooldown(seconds: number) {
    this.cooldownUntil = Math.max(
      this.cooldownUntil,
      this.now() + Math.max(1, Math.min(86400, seconds)) * 1000,
    );
  }
  outcome(success: boolean) {
    this.counters[success ? "succeeded" : "failed"]++;
  }
  // Aggregate numbers only. No raw prompts, identifiers or per-user lookup endpoint.
  metrics() {
    return { ...this.counters, active: this.provider.active };
  }
}
