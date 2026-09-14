import { createHash } from "node:crypto";
import { isIP } from "node:net";

export function canonicalUsername(value: string) {
  return value.trim().replace(/^.*\\/, "").split("@")[0].toLowerCase();
}
type Counter = { count: number; until: number };
export class LoginThrottle {
  private counters = new Map<string, Counter>();
  private inFlight = 0;
  constructor(private readonly clock = Date.now) {}
  reserve(request: Request, username: string) {
    const now = this.clock();
    for (const [key, record] of this.counters) if (record.until <= now) this.counters.delete(key);
    const supplied = request.headers.get("x-real-ip") || "";
    const source = process.env.TRUST_PROXY === "true" && isIP(supplied) ? supplied : "shared";
    // Bound stored identifiers, and do not retain raw usernames/IPs in memory keys.
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const pair = `pair:${hash(`${source}:${canonicalUsername(username)}`)}`;
    const ip = `source:${hash(source)}`;
    const rules = [
      [pair, 5],
      [ip, 300],
      ["global", 1000],
    ] as const;
    const blocked = rules.find(([key, limit]) => (this.counters.get(key)?.count ?? 0) >= limit);
    if (blocked || this.inFlight >= 16 || this.counters.size > 10000)
      return {
        retryAfter: blocked
          ? Math.max(1, Math.ceil((this.counters.get(blocked[0])!.until - now) / 1000))
          : 30,
      } as const;
    // Reserve synchronously before LDAP awaits, including concurrent attempts.
    const reserved = rules.map(([key]) => {
      const counter = this.counters.get(key) ?? { count: 0, until: now + 15 * 60_000 };
      counter.count++;
      this.counters.set(key, counter);
      return [key, counter] as const;
    });
    this.inFlight++;
    let finished = false;
    return {
      finish: (result: "success" | "failure" | "unavailable") => {
        if (finished) return;
        finished = true;
        this.inFlight--;
        const [key, counter] = reserved[0];
        if (this.counters.get(key) === counter) {
          if (result === "success") this.counters.delete(key);
          else if (result === "unavailable") counter.count = Math.max(0, counter.count - 1);
        }
      },
    } as const;
  }
}
export const loginThrottle = new LoginThrottle();
