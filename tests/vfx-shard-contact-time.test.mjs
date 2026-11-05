import test from 'node:test';
import assert from 'node:assert/strict';
import { composeLocalMatrix } from '../src/scenes/graph.js';
import { prepareNativeCollision } from '../src/scenes/native-collision.js';
import { createGunPickupShardRuntime, advanceGunPickupShardRuntime } from '../src/vfx/gun-pickup-shatter.js';

const floor=prepareNativeCollision([{
  id:'floor',worldMatrix:composeLocalMatrix({position:{x:0,y:-0.5,z:0}}),
  center:[0,0,0],size:[30,1,30],
}]);
const gravity={x:0,y:0,z:0};
const physics={collisionScene:floor,gravity,fixedDelta:1/150,
  material:{bounciness:0.5,dynamicFriction:2,bounceThreshold:2}};
const spawn=()=>createGunPickupShardRuntime({
  shards:[{id:'source-shard',modelMatrix:composeLocalMatrix({position:{x:0,y:0.2,z:0}}),
    originalScale:1,collisionRadius:0.1}],
  parentVelocity:{x:0,y:-30,z:0},attachedToEnemy:false,
  torqueSamples:[{x:0,y:0,z:1}],fadeDelays:[1.5],gravity,physics,
});

test('Web shard spin starts settling at its swept floor contact, not the render frame end',()=>{
  const short=spawn(),long=spawn();
  advanceGunPickupShardRuntime(short,0.1);
  advanceGunPickupShardRuntime(short,0.2);
  advanceGunPickupShardRuntime(long,0.3);
  for(const runtime of [short,long]){
    const shard=runtime.shards[0];
    assert.ok(shard.contacts?.some(c=>c.collider?.id==='floor') ||
      shard.firstWebImpactAt!==undefined);
    assert.ok(Math.abs(shard.firstWebImpactAt-1/30)<1e-7,
      'starting 0.1 above the floor at 3 units/s means contact at 1/30 s');
    assert.ok(shard.firstWebImpactAt<shard.firstStaticContactAt,
      'the swept hit must precede the observed render frame');
  }
  const angle=runtime=>Math.atan2(runtime.shards[0].modelMatrix[1],
    runtime.shards[0].modelMatrix[0]);
  assert.ok(Math.abs(angle(short)-angle(long))<1e-8,
    'equivalent first contact must settle spin independently of a 300ms hitch');
});
