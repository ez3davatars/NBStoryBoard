export function getDisplayAssetName(name?: string | null) {
  if (!name) return "Untitled Actor";

  const cleaned = name
    .replace(/^actor_/i, "")
    .replace(/_/g, " ")
    .trim();

  if (cleaned.length <= 32) return cleaned;

  return `${cleaned.slice(0, 24)}…${cleaned.slice(-6)}`;
}

export function getCompactActorLabel(name?: string | null) {
  if (!name) return "Actor";

  const match = name.match(/(\d{5,})$/);
  if (match) return `Actor ${match[1].slice(-6)}`;

  return getDisplayAssetName(name);
}
