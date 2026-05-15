import { describe, expect, it } from 'vitest';
import {
  WELCOME_SEEN_INSTALL_KEY,
  WELCOME_SEEN_KEY,
  hasSeenWelcomeForInstall,
  markWelcomeSeenForInstall
} from '../welcomeState';

const createMemoryStorage = () => {
  const data = new Map<string, string>();

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    }
  };
};

describe('welcomeState', () => {
  it('keeps legacy web behavior when no install id is available', () => {
    const storage = createMemoryStorage();
    storage.setItem(WELCOME_SEEN_KEY, JSON.stringify(true));

    expect(hasSeenWelcomeForInstall(storage, null)).toBe(true);
  });

  it('requires a matching install id for native installs', () => {
    const storage = createMemoryStorage();
    storage.setItem(WELCOME_SEEN_KEY, JSON.stringify(true));
    storage.setItem(WELCOME_SEEN_INSTALL_KEY, 'install-a');

    expect(hasSeenWelcomeForInstall(storage, 'install-a')).toBe(true);
    expect(hasSeenWelcomeForInstall(storage, 'install-b')).toBe(false);
  });

  it('shows the welcome screen for old dismissed state without an install id', () => {
    const storage = createMemoryStorage();
    storage.setItem(WELCOME_SEEN_KEY, JSON.stringify(true));

    expect(hasSeenWelcomeForInstall(storage, 'fresh-install')).toBe(false);
  });

  it('writes and clears the current install dismissal marker', () => {
    const storage = createMemoryStorage();

    markWelcomeSeenForInstall(storage, true, 'install-a');
    expect(storage.getItem(WELCOME_SEEN_KEY)).toBe('true');
    expect(storage.getItem(WELCOME_SEEN_INSTALL_KEY)).toBe('install-a');

    markWelcomeSeenForInstall(storage, false, 'install-a');
    expect(storage.getItem(WELCOME_SEEN_KEY)).toBe('false');
    expect(storage.getItem(WELCOME_SEEN_INSTALL_KEY)).toBeNull();
  });
});
