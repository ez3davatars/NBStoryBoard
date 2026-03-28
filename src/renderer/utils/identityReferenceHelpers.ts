import type { ActorIdentityReferenceSet } from '../context/AppContext';

export function buildOrderedActorIdentityInputs(
  identitySet: ActorIdentityReferenceSet,
): string[] {
  return [
    identitySet.primaryFaceAnchor,
    ...identitySet.angleFaceAnchors,
    ...identitySet.supportIdentityRefs,
    ...identitySet.wardrobeRefs,
  ].filter(Boolean) as string[];
}

export function hasStrongFaceAnchor(
  identitySet: ActorIdentityReferenceSet,
): boolean {
  return Boolean(identitySet.primaryFaceAnchor || identitySet.angleFaceAnchors?.length);
}
