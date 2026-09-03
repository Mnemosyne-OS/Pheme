/**
 * Reading foreign JSON without inventing values.
 *
 * Every field that arrives from Reddit or Algolia is `unknown`: their shapes
 * change, fields disappear, a string becomes an object. The reflex was
 * `String(d.author ?? '')` — which is fine until the day `author` is an
 * object, and then the user's memory quietly contains the literal text
 * `[object Object]`. A fabricated value that looks like data is worse than a
 * missing one, and it is the exact failure this codebase keeps hunting.
 *
 * So: a non-string reads as absent, a non-number reads as null. Never a
 * coercion, never a guess.
 */

/**
 * @param v Anything a JSON parse produced.
 * @param fallback What to return when `v` is not a string.
 * @returns The string, or the fallback — never `"[object Object]"`.
 */
export const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

/**
 * @param v Anything a JSON parse produced.
 * @returns The finite number, or **null** — absent is not zero, and a score
 *   the source never sent must not become a 0 on screen.
 */
export const asNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * An IDENTIFIER, which foreign JSON is entitled to send as either type.
 *
 * Algolia is the reason this exists: on one Hacker News hit, `objectID` is a
 * string and `story_id` / `parent_id` are numbers. `asString` answers `''` for
 * a number — correctly, by its own rule — so reading an id with it silently
 * discarded every one that happened to be numeric, and the comparisons built
 * on those ids ("is this reply addressed to me?") could only ever be false.
 *
 * This is not the coercion `asString` refuses. Nothing is invented and no
 * shape is guessed: an id is a key, both types denote the same key, and the
 * two have to be comparable. Anything that is neither still reads as absent.
 *
 * @param v Anything a JSON parse produced.
 * @returns The id as a string, or '' — which must never match another ''.
 */
export const asId = (v: unknown): string =>
  typeof v === 'string' ? v
    : typeof v === 'number' && Number.isFinite(v) ? String(v)
      : '';

/**
 * @param v Anything a JSON parse produced.
 * @returns Only the strings in it; a non-array reads as empty.
 */
export const asStringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
