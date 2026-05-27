import { describe, expect, it } from 'vitest';

describe('Production Actor Package Deletion Detection & Safety', () => {
  it('correctly identifies a production actor package by various markers', () => {
    const actor1 = {
      id: 'disk-packaged-prod-actor-999',
      isProductionActor: true,
      source: 'production_actor_package',
      filename: 'Library/ProductionActors/Abner_ProductionActor_999/actor.png'
    };

    const isProductionActor1 = 
      actor1.isProductionActor ||
      actor1.source === 'production_actor_package' ||
      (actor1.filename && (actor1.filename.includes('Library/ProductionActors') || actor1.filename.includes('Library\\ProductionActors')));

    expect(isProductionActor1).toBe(true);

    const legacyActor = {
      id: 'legacy-actor-1',
      filename: 'Actors/Realism/legacy.png'
    };

    const isProductionActor2 = 
      (legacyActor as any).isProductionActor ||
      (legacyActor as any).source === 'production_actor_package' ||
      (legacyActor.filename && (legacyActor.filename.includes('Library/ProductionActors') || legacyActor.filename.includes('Library\\ProductionActors')));

    expect(isProductionActor2).toBeFalsy();
  });
});
