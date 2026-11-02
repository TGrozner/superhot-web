import test from 'node:test';
import assert from 'node:assert/strict';
import { planPejAiBodyStun } from '../src/animation/enemy-stun-command-plan.js';

const fixture = () => ({
  direction: { x: 0, y: 1, z: -1 }, bodyPosition: { x: 2, y: 3, z: 4 },
  stunType: 'STUN_OTHERS', isConcrete: false, kamikazeAnimFired: false,
  kamikazeStunCurrentTime: 0, kamikazeStunableTime: 1, leftRight: 0.4,
  alreadyStunned: false, isBoss: false, rendererIds: ['body', null, 'head'],
  stunSoundRest: 10, realtimeSinceStartup: 11,
});
const plan = (changes = {}) => planPejAiBodyStun({ ...fixture(), ...changes });
const commands = (changes = {}) => plan(changes).commands;
const op = (list, name) => list.find(c => c.op === name);

test('Stun requests source-ordered cue, boss check, focus clear and pickup fade', () => {
  const p = plan();
  assert.equal(p.branch, 'stun-commands-requested');
  assert.deepEqual(p.commands.map(c => c.op), [
    'set-stun-type', 'set-stuned-concrete-part', 'request-stun-prefab-sound',
    'set-stun-sound-rest', 'mark-stunned-this-frame', 'mark-ever-stunned',
    'controller-stun', 'renderer-focus-zero', 'renderer-focus-zero',
    'controller-material-focus-zero', 'fade-out-available-pickup-effect',
  ]);
  assert.deepEqual(p.commands.filter(c => c.op === 'renderer-focus-zero').map(c => c.rendererId), ['body','head']);
  assert.deepEqual(op(p.commands,'controller-stun').direction, { x:0, y:1, z:-1 });
});

test('Kamikaze at threshold returns after setting the stun type, without any VFX', () => {
  const p = plan({ kamikazeAnimFired: true, kamikazeStunCurrentTime: 1 });
  assert.equal(p.branch, 'kamikaze-guard-return');
  assert.deepEqual(p.commands, [{ op:'set-stun-type', value:'STUN_OTHERS' }]);
});

test('Kamikaze below threshold cancels previous animation state before new Stun', () => {
  const c = commands({kamikazeAnimFired:true, kamikazeStunCurrentTime: 0.999});
  assert.deepEqual(c.slice(0,6), [
    {op:'set-stun-type', value:'STUN_OTHERS'},
    {op:'animator-on-stun-end'}, {op:'controller-end-stun'},
    {op:'animator-set-left-right',value:0.4},
    {op:'clear-kamikaze-anim-fired'}, {op:'reset-kamikaze-stun-current-time'},
  ]);
});

test('Kamikaze cancellation resets an existing stun before setting concrete state', () => {
  const c = commands({
    kamikazeAnimFired: true, kamikazeStunCurrentTime: 0.999,
    alreadyStunned: true, isConcrete: true,
  });
  assert.deepEqual(op(c, 'set-stuned-concrete-part'), {
    op: 'set-stuned-concrete-part', value: true,
  });
  assert.ok(c.findIndex(e => e.op === 'controller-end-stun')
    < c.findIndex(e => e.op === 'set-stuned-concrete-part'));
});

test('Native strict audio cooldown: equality and future rest do not request SFX', () => {
  for (const stunSoundRest of [11,12]) {
    const c = commands({stunSoundRest});
    assert.equal(op(c,'request-stun-prefab-sound'), undefined);
    assert.equal(op(c,'set-stun-sound-rest'), undefined);
  }
  const c = commands({stunSoundRest:10.999});
  assert.deepEqual(op(c,'request-stun-prefab-sound'), {
    op:'request-stun-prefab-sound', resource:'EnemyStun', position:{x:2,y:4.5,z:4},
  });
  assert.equal(op(c,'set-stun-sound-rest').realtimeSeconds, 11.25);
});

test('Concrete Stun chooses source audio variant and updates concrete flag when not stunned', () => {
  const c = commands({ isConcrete:true });
  assert.equal(op(c,'request-stun-prefab-sound').resource, 'EnemyStunConcrete');
  assert.deepEqual(op(c,'set-stuned-concrete-part'), {op:'set-stuned-concrete-part',value:true});
});

test('Already-stunned concrete retains existing flag; non-concrete clears it', () => {
  assert.equal(op(commands({alreadyStunned:true,isConcrete:true}),'set-stuned-concrete-part'),undefined);
  assert.deepEqual(op(commands({alreadyStunned:true,isConcrete:false}),'set-stuned-concrete-part'),{
    op:'set-stuned-concrete-part', value:false,
  });
});

test('Boss suppresses Controller.Stun but still receives source shader/pickup commands', () => {
  const c = commands({isBoss:true});
  assert.equal(op(c,'controller-stun'), undefined);
  assert.ok(op(c,'renderer-focus-zero'));
  assert.ok(op(c,'controller-material-focus-zero'));
  assert.ok(op(c,'fade-out-available-pickup-effect'));
});

test('No null renderer emits a focus command; renderer count is data-dependent', () => {
  const c = commands({rendererIds:[null,null]});
  assert.equal(c.filter(v=>v.op==='renderer-focus-zero').length,0);
  assert.ok(op(c,'controller-material-focus-zero'));
});

test('Invalid native snapshots and missing samples are rejected rather than guessed', () => {
  assert.throws(()=>plan({realtimeSinceStartup:NaN}), /realtimeSinceStartup/);
  assert.throws(()=>plan({kamikazeStunCurrentTime:Infinity}), /kamikazeStunCurrentTime/);
  assert.throws(()=>plan({rendererIds:['a','']}), /rendererIds\[1\]/);
  assert.throws(()=>plan({direction:{x:0,y:0}}), /direction.z/);
  assert.throws(()=>plan({isBoss:null}), /isBoss/);
});
