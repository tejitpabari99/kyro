/**
 * `domain/curation.ts` unit tests (M1-03) — 03 §6.4 step 2's acceptance
 * gate: "overrides.json validates against its Zod schema in a unit test."
 * Covers the schema in isolation (valid/invalid shapes) *and* parses the
 * real committed `data/curation/overrides.json` file end-to-end, so a
 * future hand-edit that breaks the shape fails CI immediately rather than
 * only at M1-04 build time.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { CurationOverridesFileSchema, parseCurationOverrides } from '../curation';

const OVERRIDES_PATH = path.join(__dirname, '../../../data/curation/overrides.json');

describe('CurationOverridesFileSchema — valid shapes', () => {
  it('accepts an empty overrides/aliases file', () => {
    expect(() => parseCurationOverrides({ overrides: {}, aliases: {} })).not.toThrow();
  });

  it('accepts a full per-id override with every optional field', () => {
    const parsed = parseCurationOverrides({
      overrides: {
        Some_Id: {
          exercise_type: 'bodyweight_reps',
          uses_custom_metric: true,
          name: 'Renamed Exercise',
          aliases: ['Alias One', 'Alias Two'],
        },
      },
      aliases: { AO: 'Some_Id' },
    });
    expect(parsed.overrides.Some_Id.exercise_type).toBe('bodyweight_reps');
    expect(parsed.overrides.Some_Id.aliases).toEqual(['Alias One', 'Alias Two']);
    expect(parsed.aliases.AO).toBe('Some_Id');
  });

  it('accepts an override with only exclude: true', () => {
    expect(() =>
      parseCurationOverrides({
        overrides: { Duplicate_Id: { exclude: true } },
        aliases: {},
      }),
    ).not.toThrow();
  });

  it('accepts every exercise_type enum value', () => {
    const types = [
      'weight_reps',
      'reps_only',
      'bodyweight_reps',
      'bodyweight_assisted_reps',
      'duration',
      'weight_duration',
      'distance_duration',
      'short_distance_weight',
    ];
    for (const exercise_type of types) {
      expect(() =>
        parseCurationOverrides({ overrides: { X: { exercise_type } }, aliases: {} }),
      ).not.toThrow();
    }
  });
});

describe('CurationOverridesFileSchema — invalid shapes rejected', () => {
  it('rejects a bogus exercise_type value', () => {
    expect(() =>
      parseCurationOverrides({
        overrides: { X: { exercise_type: 'not_a_real_type' } },
        aliases: {},
      }),
    ).toThrow();
  });

  it('rejects exclude: false (only the true literal is allowed)', () => {
    expect(() =>
      parseCurationOverrides({ overrides: { X: { exclude: false } }, aliases: {} }),
    ).toThrow();
  });

  it('rejects an unknown key on an override entry (strict)', () => {
    expect(() =>
      parseCurationOverrides({
        overrides: { X: { exercize_type: 'weight_reps' } },
        aliases: {},
      }),
    ).toThrow();
  });

  it('rejects an unknown top-level key (strict)', () => {
    expect(() =>
      parseCurationOverrides({ overrides: {}, aliases: {}, extra: true }),
    ).toThrow();
  });

  it('rejects a missing top-level "aliases" key', () => {
    expect(() => parseCurationOverrides({ overrides: {} })).toThrow();
  });

  it('rejects a non-string alias target', () => {
    expect(() => parseCurationOverrides({ overrides: {}, aliases: { OHP: 42 } })).toThrow();
  });

  it('rejects an empty-string alias term key value', () => {
    expect(() => parseCurationOverrides({ overrides: {}, aliases: { OHP: '' } })).toThrow();
  });
});

describe('data/curation/overrides.json (real committed file)', () => {
  const raw = fs.readFileSync(OVERRIDES_PATH, 'utf-8');
  const json: unknown = JSON.parse(raw);

  it('validates against CurationOverridesFileSchema', () => {
    expect(() => CurationOverridesFileSchema.parse(json)).not.toThrow();
  });

  it('seeds the stair-machine uses_custom_metric override (03 §6.3 heuristic note)', () => {
    const parsed = parseCurationOverrides(json);
    expect(parsed.overrides.Stairmaster).toEqual({ uses_custom_metric: true });
  });

  it('seeds push-up-variant overrides to bodyweight_reps (03 §6.3 rule 6 note)', () => {
    const parsed = parseCurationOverrides(json);
    expect(parsed.overrides['Decline_Push-Up']).toEqual({ exercise_type: 'bodyweight_reps' });
    expect(parsed.overrides['Handstand_Push-Ups']).toEqual({ exercise_type: 'bodyweight_reps' });
  });

  it('seeds the "OHP" global alias (03 §2 worked example)', () => {
    const parsed = parseCurationOverrides(json);
    expect(parsed.aliases.OHP).toBe('Barbell_Shoulder_Press');
  });

  it('every alias target and override id is a non-empty string key', () => {
    const parsed = parseCurationOverrides(json);
    for (const [term, target] of Object.entries(parsed.aliases)) {
      expect(term.length).toBeGreaterThan(0);
      expect(target.length).toBeGreaterThan(0);
    }
    for (const id of Object.keys(parsed.overrides)) {
      expect(id.length).toBeGreaterThan(0);
    }
  });
});
