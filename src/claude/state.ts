/**
 * Claude Code session state. The shared `graft/.cache/` pieces (the statusline's
 * `Stats` snapshot and the build lock) live in `../util/state.js` so the graph's
 * pre-query auto-refresh can take the same lock; they are re-exported here so
 * every existing import path keeps working.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cacheDir, readJson, writeJsonAtomic } from '../util/state.js';

export {
  LOCK_STALE_MS,
  acquireLock,
  acquireLockIn,
  releaseLockIn,
  cacheDir,
  emptyStats,
  patchStats,
  readStats,
  releaseLock,
  resolveContextDir,
  writeJsonAtomic,
  writeStats,
} from '../util/state.js';
export type { Stats } from '../util/state.js';

export interface SessionState {
  lastQuery: string | null;
  perAgentQuery: Record<string, string>;
  graftReads: number; sourceReads: number;
  /** Cumulative tokens saved this session via `ask --source` retrieval (est.). */
  savedTokens: number;
  /** Pointers the prompt hook already injected this session (novelty gate:
   * a hit whose pointer was shown once is never re-injected). Optional so
   * session files written before this field still parse. */
  injectedPointers?: string[];
  /** Weak-match nudges spent this session, capped so the line stays signal.
   * Optional for the same backwards-compatibility reason as above. */
  nudges?: number;
  /** Running micro-dollar cost of the input tokens this session has been billed
   * for, and the tokens that bought. Their ratio is the blended price of one
   * input token here — model and cache-hit ratio already folded in — which is
   * what turns `savedTokens` into a dollar figure. Stored as the pair rather
   * than the ratio so the rate re-blends as the session's cache warms rather
   * than freezing at whatever turn one happened to pay. Optional: absent on a
   * host that exposes no transcript, and on turn one of every session. */
  inputCostMicros?: number;
  inputTokensBilled?: number;
  /** `uuid` of the last assistant entry already billed, so a duplicate Stop
   * can't charge one turn twice. */
  lastBillingUuid?: string;
}

function emptySession(): SessionState {
  return { lastQuery: null, perAgentQuery: {}, graftReads: 0, sourceReads: 0, savedTokens: 0, injectedPointers: [], nudges: 0 };
}

/** The per-repo session directory holding one `<id>.json` per agent session. */
export function sessionDir(d: string): string { return join(cacheDir(d), 'session'); }

function sessionPath(d: string, id: string): string { return join(sessionDir(d), `${id}.json`); }

/** Every session id with a file on disk, or `[]` when none exist (never throws).
 *  Used by `graft stats` to find available sessions. */
export function listSessionIds(d: string): string[] {
  try {
    return readdirSync(sessionDir(d)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length));
  } catch { return []; }
}

export function readSession(d: string, id: string): SessionState {
  return readJson<SessionState>(sessionPath(d, id)) ?? emptySession();
}
export function writeSession(d: string, id: string, s: SessionState): void {
  writeJsonAtomic(sessionPath(d, id), s);
}
