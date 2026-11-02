import test from 'node:test';
import assert from 'node:assert/strict';
import { planPejAiBodyStun } from '../src/animation/enemy-stun-command-plan.js';
import {
  MCD_STUN_SERIALIZED_BINDINGS,
  planMcdSourceBoundStunClip,
} from '../src/sound/mcd-stun-serialized-clips.js';
import { MCD_PREFAB_SOUND_RESULT } from '../src/sound/mcd-prefab-sound-intent.js';

const commands = (overrides = {}) => planPejAiBodyStun({
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
}).commands;
const available = { poolExists: true, reused: false, pitchBeforeRequest: 1 };

test('nonconcrete Stun: source GO1860 -> AudioSource27512 -> original clip1675', () => {
  const result = planMcdSourceBoundStunClip(commands(), available);
  assert.equal(result.nativeRequest.prefabName, 'EnemyStun');
  assert.equal(result.nativeRequest.playback.status, MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST);
  assert.deepEqual(result.serializedBinding.prefab, {
    owner: 'resources.assets', pathId: 1860, serializedActive: true,
  });
  assert.equal(result.localClipRequest.clip.pathId, 1675);
  assert.equal(result.localClipRequest.clip.name, 'AC_Enemy_Stun');
  assert.equal(result.localClipRequest.audioSource.pathId, 27512);
  assert.deepEqual(result.localClipRequest.position, { x: 2, y: 4.5, z: 4 });
  assert.equal(result.localClipRequest.serializedStartingVolume, 0.6340000033378601);
  assert.equal(result.localClipRequest.clip.serializedFrequencyHz, 96000);
  assert.equal(result.nativeRequest.nextEligibleRealtimeSeconds, 10.25);
});

test('concrete Stun maps separately to source GO1886 -> AudioSource27520 -> clip1611', () => {
  const result = planMcdSourceBoundStunClip(commands({ isConcrete: true }), available);
  assert.equal(result.nativeRequest.prefabName, 'EnemyStunConcrete');
  assert.equal(result.serializedBinding.prefab.pathId, 1886);
  assert.equal(result.localClipRequest.audioSource.pathId, 27520);
  assert.equal(result.localClipRequest.clip.pathId, 1611);
  assert.equal(result.localClipRequest.clip.name, 'AC_Enemy_Hit');
  assert.equal(result.localClipRequest.clip.serializedFrequencyHz, 48000);
  assert.equal(result.localClipRequest.serializedStartingVolume, 0.699999988079071);
});

test('missing native pool: advances source realtime rest but emits NO local clip request', () => {
  const result = planMcdSourceBoundStunClip(commands(), { poolExists: false });
  assert.equal(result.nativeRequest.playback.status, MCD_PREFAB_SOUND_RESULT.EMPTY_EFFECT);
  assert.equal(result.nativeRequest.playback.reason, 'pool-missing');
  assert.equal(result.nativeRequest.nextEligibleRealtimeSeconds, 10.25);
  assert.equal(result.localClipRequest, null);
  assert.equal(result.serializedBinding.clip.pathId, 1675);
});

test('strict realtime equality suppresses source request before resource mapping', () => {
  assert.equal(planMcdSourceBoundStunClip(
    commands({ stunSoundRest: 10, realtimeSinceStartup: 10 }), available), null);
});

test('native playback pitch is runtime-owned, not falsely reset to serialized pitch 1', () => {
  const result = planMcdSourceBoundStunClip(commands({ isConcrete: true }), {
    poolExists: true, reused: true, pitchBeforeRequest: 0.81,
  });
  assert.equal(result.localClipRequest.requestedPitch, 0.81);
  assert.equal(result.serializedBinding.audioSource.serializedPitch, 1);
  assert.equal(result.nativeRequest.playback.pauseBeforeReuse, true);
  assert.deepEqual(result.localClipRequest.audioSource.outputMixerRef, {
    fileId: 3, pathId: 659,
  });
});

test('serialized bindings are immutable and do not supply a browser sound engine', () => {
  assert.equal(Object.isFrozen(MCD_STUN_SERIALIZED_BINDINGS), true);
  assert.equal(Object.isFrozen(MCD_STUN_SERIALIZED_BINDINGS.EnemyStun.clip), true);
  assert.equal(typeof MCD_STUN_SERIALIZED_BINDINGS.EnemyStun.clip.name, 'string');
});
