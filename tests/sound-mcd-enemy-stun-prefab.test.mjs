import test from 'node:test';
import assert from 'node:assert/strict';
import { planPejAiBodyStun } from '../src/animation/enemy-stun-command-plan.js';
import {
  MCD_ENEMY_STUN_PREFABS,
  planMcdStunAudioFromCommands,
} from '../src/sound/mcd-enemy-stun-prefab.js';
import { MCD_PREFAB_SOUND_RESULT } from '../src/sound/mcd-prefab-sound-intent.js';

const nativeStunInput = (overrides = {}) => ({
  direction: { x: 1, y: 0, z: 0 },
  bodyPosition: { x: 2, y: 3, z: 4 },
  stunType: 'STUN_OTHERS',
  isConcrete: false,
  kamikazeAnimFired: false,
  kamikazeStunCurrentTime: 0,
  kamikazeStunableTime: 1,
  leftRight: 0,
  alreadyStunned: false,
  isBoss: false,
  rendererIds: [],
  stunSoundRest: 9,
  realtimeSinceStartup: 10,
  ...overrides,
});
const commands = overrides => planPejAiBodyStun(nativeStunInput(overrides)).commands;
const available = { poolExists: true, reused: false, pitchBeforeRequest: 1 };

test('nonconcrete Stun command reaches EnemyStun AudioPrefab, at SH-06 world position (no double Y offset)', () => {
  const plan = planMcdStunAudioFromCommands(commands(), available);
  assert.equal(plan.prefabName, 'EnemyStun');
  assert.deepEqual(MCD_ENEMY_STUN_PREFABS.EnemyStun, { name: 'EnemyStun', declaredPoolSize: 3 });
  assert.equal(plan.declaredPoolSize, 3);
  assert.equal(plan.nextEligibleRealtimeSeconds, 10.25);
  assert.equal(plan.playback.status, MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST);
  assert.deepEqual(plan.playback.position, { x: 2, y: 4.5, z: 4 });
  assert.equal(plan.playback.spatialBlend, 1);
  assert.equal(plan.playback.action, 'AudioSource.Play');
  assert.equal(plan.playback.pitch, 1);
  assert.equal(plan.playback.pauseBeforeReuse, false);
});

test('concrete Stun selects distinct EnemyStunConcrete pool and reuses AudioSource', () => {
  const plan = planMcdStunAudioFromCommands(commands({ isConcrete: true }), {
    poolExists: true, reused: true, pitchBeforeRequest: 0.85,
  });
  assert.equal(plan.prefabName, 'EnemyStunConcrete');
  assert.equal(plan.declaredPoolSize, 2);
  assert.equal(plan.playback.pauseBeforeReuse, true);
  assert.equal(plan.playback.registerPlaying, false);
  assert.equal(plan.playback.pitch, 0.85);
});

test('strict native realtime comparison: equality emits no sound and no rest update', () => {
  const nativeCommands = commands({ stunSoundRest: 10, realtimeSinceStartup: 10 });
  assert.equal(nativeCommands.some(c => c.op === 'set-stun-sound-rest'), false);
  assert.equal(planMcdStunAudioFromCommands(nativeCommands), null);
});

test('kamikaze early return suppresses stun cue even when realtime threshold passed', () => {
  const nativeCommands = commands({
    kamikazeAnimFired: true, kamikazeStunCurrentTime: 1,
    kamikazeStunableTime: 1,
  });
  assert.equal(planMcdStunAudioFromCommands(nativeCommands), null);
});

test('missing prefab pool yields empty effect but normal Stun call still advances realtime rest', () => {
  const plan = planMcdStunAudioFromCommands(commands(), { poolExists: false });
  assert.equal(plan.playback.status, MCD_PREFAB_SOUND_RESULT.EMPTY_EFFECT);
  assert.equal(plan.playback.reason, 'pool-missing');
  assert.equal(plan.nextEligibleRealtimeSeconds, 10.25);
});

test('boss suppresses Controller.Stun, not the preceding native audio request', () => {
  const nativeCommands = commands({ isBoss: true });
  assert.equal(nativeCommands.some(c => c.op === 'controller-stun'), false);
  assert.equal(planMcdStunAudioFromCommands(nativeCommands, available).prefabName, 'EnemyStun');
});

test('source-command adapter rejects unsupported sound names and broken adjacency instead of guessing', () => {
  const original = commands();
  const first = original.findIndex(c => c.op === 'request-stun-prefab-sound');
  assert.throws(
    () => planMcdStunAudioFromCommands(original.map((c, i) =>
      i === first ? { ...c, resource: 'UnprovenStun' } : c), available),
    /unknown native Stun/,
  );
  assert.throws(
    () => planMcdStunAudioFromCommands(original.filter(c => c.op !== 'set-stun-sound-rest'), available),
    /source realtime-rest update/,
  );
  assert.throws(
    () => planMcdStunAudioFromCommands([...original, original[first]], available),
    /at most one/,
  );
  assert.throws(() => planMcdStunAudioFromCommands(original), /poolExists must be boolean/);
});
