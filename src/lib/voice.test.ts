/**
 * Pheme speaks the engine the host chose (doc 31 §13.6): the host's registry
 * decides which engines exist, never a list copied into the cartridge.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../sdk/mnemo-sdk', () => ({ MnemoCartridgeSDK: class { invoke = vi.fn(); } }));

import { engineFromHost } from './voice';

describe('engineFromHost', () => {
  it('keeps every engine the host names, the ones added after XTTS included', () => {
    for (const id of ['qwen3', 'chatterbox', 'piper', 'browser']) expect(engineFromHost(id)).toBe(id);
  });

  it('falls back to Piper only when the host named nothing', () => {
    expect(engineFromHost(undefined)).toBe('piper');
    expect(engineFromHost('')).toBe('piper');
    expect(engineFromHost(42)).toBe('piper');
  });
});
