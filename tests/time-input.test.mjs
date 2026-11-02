import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOTYPE_INPUT_RULES, shouldPreventDefault, movementAxes, movementStep,
  keydownAction, pointerAction, interruptionAction, applyMouseLook,
} from '../src/input.js';

const keys = (...values) => new Set(values);
const near = (actual,expected,error=1e-12)=>assert.ok(Math.abs(actual-expected)<=error,`${actual} != ${expected}`);

test('physical key aliases and arrows preserve the original axes',()=>{
  assert.deepEqual(movementAxes(keys('KeyW','KeyZ','ArrowUp')),{forward:1,horizontal:0,moving:true});
  assert.deepEqual(movementAxes(keys('KeyW','KeyS','KeyD','KeyA')),{forward:0,horizontal:0,moving:false});
  assert.deepEqual(movementAxes(keys('ArrowDown','ArrowLeft')),{forward:-1,horizontal:-1,moving:true});
});

test('movement uses real dt; normalizes diagonals and rotates by yaw',()=>{
  const straight=movementStep(keys('KeyW'),0,.5);
  near(straight.dx,0); near(straight.dz,-.5*6.7);
  const diagonal=movementStep(keys('KeyW','KeyD'),0,1);
  near(Math.hypot(diagonal.dx,diagonal.dz),6.7);
  const rotated=movementStep(keys('KeyW'),Math.PI/2,1);
  near(rotated.dx,6.7); near(rotated.dz,0);
  const sprint=movementStep(keys('KeyW','ShiftRight'),0,1);
  near(sprint.dz,-8.9);
  const idle=movementStep(keys('ShiftLeft'),0,1);
  assert.equal(idle.moving,false); assert.equal(idle.dx,0); assert.equal(idle.dz,0);
  assert.equal(PROTOTYPE_INPUT_RULES.walkSpeed,6.7);
});

test('play/menu/pause keyboard actions have no side effects',()=>{
  assert.equal(keydownAction({code:'Enter',screen:'menu'}),'start');
  assert.equal(keydownAction({code:'Enter',screen:'win'}),'start');
  assert.equal(keydownAction({code:'Enter',screen:'dead'}),'start');
  assert.equal(keydownAction({code:'Escape',screen:'paused'}),'resume');
  assert.equal(keydownAction({code:'Enter',screen:'paused'}),'resume');
  assert.equal(keydownAction({code:'KeyR'}),'reload');
  assert.equal(keydownAction({code:'KeyF'}),'throw');
  assert.equal(keydownAction({code:'KeyE'}),'pickup');
  assert.equal(keydownAction({code:'Space',hop:.019}),'jump');
  assert.equal(keydownAction({code:'Space',hop:.02}),null);
  assert.equal(keydownAction({code:'Escape',screen:'playing'}),null);
  assert.equal(keydownAction({code:'KeyR',screen:'paused'}),null);
  assert.equal(keydownAction({code:'KeyR',repeat:true}),null);
});

test('pointer-lock acquisition, primary/secondary actions and interrupted play',()=>{
  assert.equal(pointerAction({button:0}), 'request-pointer-lock');
  assert.equal(pointerAction({button:0,pointerLocked:true}), 'shoot');
  assert.equal(pointerAction({button:2,pointerLocked:true}), 'throw');
  assert.equal(pointerAction({button:1,pointerLocked:true}),null);
  assert.equal(pointerAction({button:0,screen:'paused',pointerLocked:true}),null);
  assert.equal(interruptionAction({screen:'playing',pointerLocked:false}),'pause');
  assert.equal(interruptionAction({screen:'playing',visible:false}),'pause');
  assert.equal(interruptionAction({screen:'playing',pointerLocked:true,visible:true}),null);
  assert.equal(interruptionAction({screen:'menu',visible:false}),null);
});

test('mouse movement reproduces yaw/pitch limits and look activity pulse',()=>{
  const low=applyMouseLook({yaw:0,pitch:0,movementX:1,movementY:0});
  near(low.yaw,.00245); near(low.pitch,0); near(low.lookActivity,.12);
  const high=applyMouseLook({yaw:1,pitch:1.4,movementX:100,movementY:-100});
  near(high.yaw,1+.245); near(high.pitch,1.42); near(high.lookActivity,1);
  const down=applyMouseLook({yaw:0,pitch:-1.4,movementX:0,movementY:100});
  near(down.pitch,-1.42);
});

test('scroll-preventing codes match the browser handler',()=>{
  for(const code of ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']) assert.equal(shouldPreventDefault(code),true);
  for(const code of ['KeyW','KeyR','Escape','Enter']) assert.equal(shouldPreventDefault(code),false);
});
