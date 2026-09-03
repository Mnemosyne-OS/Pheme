/**
 * The single channel between Pheme and Mnemosyne OS.
 * Everything host-side goes through the postMessage SDK — no window globals,
 * no Node/Electron access. Actions are whitelisted by the host actionRegistry.
 *
 * Pheme's contract with the user is structural: there is NO action here that
 * could publish anything anywhere. The bridge can read (scan feeds, query
 * memory, infer drafts) and write into the user's OWN memory — posting is a
 * thing only the human does, in their own browser, with their own account.
 */
import { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { tally, type CostTask } from './costs';
import type { WatchInboxItem, WatchStatus, WatchTarget } from './watch';

const PLUGIN_ID = '@mnemosyne-plugins/pheme';
const sdk = new MnemoCartridgeSDK(PLUGIN_ID);

async function balanceMicro(): Promise<number | null> {
  try {
    const b = await sdk.invoke<{ creditsUsdMicro?: number }>('credits.balance');
    return typeof b?.creditsUsdMicro === 'number' ? b.creditsUsdMicro : null;
  } catch { return null; }
}

/** True when running inside the host shell (an iframe with a parent). */
export function isFramed(): boolean {
  try { return typeof window !== 'undefined' && window.parent !== window.self; }
  catch { return true; }
}

export const bridge = {
  /**
   * Host + vault status — used as the "am I connected" probe, and as the ONE
   * place that answers "can the active model see an image?". The verdict is
   * the host's (`model:getStatus` → `vision`): below it, images are dropped
   * without a word by a local worker or a text-only provider, and the model
   * then describes a picture it never received.
   */
  status: () => sdk.invoke<{
    vaultReady: boolean;
    model?: { vision?: { images?: boolean; video?: boolean } };
  }>('mnemosyne.status'),

  /** Host-side HTTP GET (bypasses iframe CORS) — the universal scan fetch. */
  fetchUrl: (url: string) =>
    sdk.invoke<{ status: number; body: string; encoding?: string; contentType?: string }>('social.fetch', { url }),

  /**
   * The BYTES of a remote image, base64, ready for a vision call.
   *
   * The same host fetch, but it used to be useless for this: the body came
   * back decoded as UTF-8 whatever it was, so every image arrived as
   * replacement characters. The host now says which encoding it used, and
   * this refuses anything else rather than handing a mangled string to a
   * model — an unreadable image must fail loudly, not become a hallucination.
   */
  fetchImage: async (url: string): Promise<{ mimeType: string; data: string }> => {
    const r = await sdk.invoke<{
      status: number; body: string; encoding?: string; truncated?: boolean; contentType?: string;
    }>('social.fetch', { url });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP_${r.status}`);
    const mimeType = (r.contentType ?? '').split(';')[0].trim();
    if (!/^image\//i.test(mimeType)) throw new Error(`NOT_AN_IMAGE: ${mimeType || 'unknown type'}`);
    // An older host has no `encoding` field and always decoded as UTF-8 —
    // the bytes are already gone by the time they reach here.
    if (r.encoding !== 'base64') throw new Error('HOST_TOO_OLD: this Mnemosyne OS cannot hand over image bytes');
    if (!r.body) throw new Error('EMPTY_IMAGE');
    // The host caps a body at 4MB, which a phone screenshot passes easily.
    // Half a JPEG is not a small JPEG — it is a corrupt file, and a vision
    // model handed one describes whatever it can make of the fragment.
    if (r.truncated) throw new Error('IMAGE_TRUNCATED: larger than the host will fetch (4MB)');
    return { mimeType, data: r.body };
  },

  /**
   * Ask Mnemosyne. `model.infer` passes an InferRequest straight into the
   * host's model pipeline, and RAG is ON unless a caller disables it — the
   * vault context rides along, so the answer comes from the user's own
   * memory, the way the chat answers a human. (`mnemosyne.query` wraps the
   * same pipeline but hard-slices at 2000 chars — drafts need the room.)
   */
  ask: async (prompt: string, opts?: {
    noMemory?: boolean; task?: CostTask; net?: string;
    /** Vision attachments (raw base64). The host REFUSES the call when the
     *  active route cannot see them — it does not answer blind. */
    images?: { mimeType: string; data: string }[];
  }) => {
    // Cost attribution by credit delta (Mnemosyne Cloud only): balance
    // before, infer, balance after — the host drops its balance cache on
    // every inference, so the after-read is fresh. Local engines delta 0.
    const before = opts?.task ? await balanceMicro() : null;
    try {
      return await sdk.invoke<unknown>('model.infer', {
        prompt,
        maxTokens: 1600,
        // Pure text work (translation…) skips the vault-RAG pass: no memory
        // context to drag in, faster and cheaper. Drafting always keeps it.
        ...(opts?.noMemory ? { disableRAG: true } : {}),
        ...(opts?.images?.length ? { images: opts.images } : {}),
      });
    } finally {
      if (opts?.task) {
        const after = await balanceMicro();
        const delta = before !== null && after !== null && before > after ? before - after : null;
        tally(opts.task, delta, opts.net);
      }
    }
  },

  /**
   * Current cloud-credit balance in USD. The host throws when the balance is
   * genuinely unknown (offline, wallet not ready, no credit account) with a
   * diagnostic reason — keep it, so the UI can say WHY instead of a mute dash.
   */
  creditBalanceUsd: async (): Promise<{ usd: number | null; reason: string | null }> => {
    try {
      const b = await sdk.invoke<{ credits?: number }>('credits.balance');
      return typeof b?.credits === 'number'
        ? { usd: b.credits, reason: null }
        : { usd: null, reason: 'unexpected balance shape' };
    } catch (e) {
      return { usd: null, reason: e instanceof Error ? e.message : String(e) };
    }
  },

  /**
   * Background watch (host doc 72). Pheme is an iframe: it cannot notice a
   * reply that lands while its window is closed. The host keeps looking —
   * while Mnemosyne OS runs — and hands back what arrived.
   */
  watchRegister: (targets: WatchTarget[], intervalMin: number) =>
    sdk.invoke<{ targets: number; intervalMin: number }>('watch.register', { targets, intervalMin }),
  watchUnregister: () => sdk.invoke('watch.unregister'),
  watchInbox: () =>
    sdk.invoke<{ items: WatchInboxItem[]; status: WatchStatus | null }>('watch.inbox'),
  watchClear: (ids?: string[]) => sdk.invoke('watch.clearInbox', ids ? { ids } : {}),

  /**
   * The host-side mirror of what this cartridge knows (host doc 73) — the
   * copy that survives the iframe's origin changing under it.
   */
  stateGet: () =>
    sdk.invoke<{ state: { snapshot?: Record<string, string> } | null; updatedAt: string | null }>('state.get'),
  stateSet: (snapshot: Record<string, string>) =>
    sdk.invoke<{ bytes?: number; updatedAt?: string }>('state.set', { state: { snapshot } }),

  /**
   * Write ONE chronicle of the user's own public work into their memory
   * (`vault:write`). Deliberately `social.ingest` and not `mnemosyne.ingest`:
   * the latter embeds the text and discards it, answering `success: true`
   * without storing anything. This one goes through routePulse — PromptShield,
   * SHA-256 dedup, real persistence — and hands back a chronicle id, which is
   * the only proof a memory exists.
   *
   * Target: the built-in SOCIAL vault, so the chat, the RAG and the dream
   * layer see it immediately. `sourceRef` stays stable per item so a future
   * human-gated forget can target exactly what Pheme put there.
   */
  remember: (content: string, sourceRef: string) =>
    sdk.invoke<{ chronicleId?: string }>('social.ingest', {
      vault: 'SOCIAL',
      content,
      spineType: 'SOCIAL_NODE',
      sourceRef,
    }),

  /**
   * Ask the host to re-read this cartridge's manifest and say which of these
   * permissions it now holds. Enforcement uses the registry built at startup,
   * so a manifest that gained `vault:write` stayed refused until a restart —
   * this turns that into a button.
   */
  refreshPermissions: (permissions: string[]) =>
    sdk.invoke<{ granted: Record<string, boolean> }>('permissions.refresh', { permissions }),

  /** Open a URL in the OS browser — where the HUMAN goes to reply. */
  openExternal: (url: string) => sdk.invoke('shell.openExternal', { url }).catch(() => {}),
};

/**
 * Model responses arrive in whatever envelope the active provider uses.
 * Normalise the common shapes to a plain string, never throw.
 */
export function inferText(res: unknown): string {
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    for (const key of ['text', 'content', 'answer', 'response', 'output']) {
      if (typeof r[key] === 'string') return r[key];
    }
    if (r.data) return inferText(r.data);
    if (r.result) return inferText(r.result);
  }
  return '';
}
