const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

const getTimestamp = (date = new Date()): string =>
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-` +
    `${pad(date.getMilliseconds(), 3)}`;

const getRandomSuffix = (): string => {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.getRandomValues) {
        const bytes = new Uint8Array(4);
        cryptoApi.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    return Math.random().toString(36).slice(2, 10);
};

const sanitizeFilenamePart = (value: string): string =>
    value
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

let lastNumericLabelStamp = 0;

export const createUniqueNumericLabel = (prefix: string): string => {
    const safePrefix = sanitizeFilenamePart(prefix || 'Asset') || 'Asset';
    const now = Date.now();
    const stamp = now <= lastNumericLabelStamp ? lastNumericLabelStamp + 1 : now;
    lastNumericLabelStamp = stamp;

    return `${safePrefix}_${stamp}`;
};

export const createUniqueDownloadFilename = (
    suggestedFilename: string,
    defaultExtension = 'png'
): string => {
    const fallbackExtension = sanitizeFilenamePart(defaultExtension).replace(/^\./, '') || 'png';
    const sanitized = sanitizeFilenamePart(suggestedFilename || 'image') || 'image';
    const dotIndex = sanitized.lastIndexOf('.');

    const hasExtension = dotIndex > 0 && dotIndex < sanitized.length - 1;
    const rawBase = hasExtension ? sanitized.slice(0, dotIndex) : sanitized;
    const rawExtension = hasExtension ? sanitized.slice(dotIndex + 1) : fallbackExtension;

    const base = sanitizeFilenamePart(rawBase) || 'image';
    const extension = sanitizeFilenamePart(rawExtension).replace(/^\./, '') || fallbackExtension;

    return `${base}-${getTimestamp()}-${getRandomSuffix()}.${extension}`;
};
