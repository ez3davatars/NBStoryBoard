export const WELCOME_SEEN_KEY = 'nano_has_seen_welcome';
export const WELCOME_SEEN_INSTALL_KEY = 'nano_welcome_seen_install_id';

export type WelcomeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const readWelcomeSeenFlag = (storage: Pick<Storage, 'getItem'>): boolean => {
  const raw = storage.getItem(WELCOME_SEEN_KEY);
  if (!raw) return false;

  try {
    return JSON.parse(raw) === true;
  } catch {
    return raw === 'true';
  }
};

export const readWelcomeSeenInstallId = (storage: Pick<Storage, 'getItem'>): string | null => {
  const raw = storage.getItem(WELCOME_SEEN_INSTALL_KEY);
  return raw && raw.trim() ? raw : null;
};

export const isWelcomeSeenForInstall = (args: {
  seenWelcome: boolean;
  seenInstallId: string | null;
  currentInstallId: string | null;
}): boolean => {
  if (!args.seenWelcome) return false;

  // Web builds and older preload surfaces do not have an install fingerprint.
  // In that case, keep the legacy boolean behavior.
  if (!args.currentInstallId) return true;

  return args.seenInstallId === args.currentInstallId;
};

export const hasSeenWelcomeForInstall = (
  storage: Pick<Storage, 'getItem'>,
  currentInstallId: string | null
): boolean =>
  isWelcomeSeenForInstall({
    seenWelcome: readWelcomeSeenFlag(storage),
    seenInstallId: readWelcomeSeenInstallId(storage),
    currentInstallId
  });

export const markWelcomeSeenForInstall = (
  storage: WelcomeStorage,
  seen: boolean,
  currentInstallId: string | null
): void => {
  storage.setItem(WELCOME_SEEN_KEY, JSON.stringify(seen));

  if (seen && currentInstallId) {
    storage.setItem(WELCOME_SEEN_INSTALL_KEY, currentInstallId);
    return;
  }

  storage.removeItem(WELCOME_SEEN_INSTALL_KEY);
};
