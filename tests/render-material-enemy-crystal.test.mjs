import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enemyRedCrystalMaterialBinding,
  enemyRedCrystalDiagnosticWebPacket,
} from '../src/render/material-model.js';

test('Unity material _Alpha=0 and _ALLOWLOCALFOG_ON are not generic Web alpha/fog rules', () => {
  const src=enemyRedCrystalMaterialBinding(4748).materialSource;
  assert.equal(src.shaderInputs._Alpha,0);
  assert.equal(enemyRedCrystalDiagnosticWebPacket(4748).color[3],1);
});

test('unproved enemy renderer identity cannot silently become a draw', () => {
  assert.throws(()=>enemyRedCrystalMaterialBinding(0),/integer/);
  assert.throws(()=>enemyRedCrystalMaterialBinding(7837),/No proved EnemyMerged/);
  assert.throws(()=>enemyRedCrystalDiagnosticWebPacket(9999),/No proved EnemyMerged/);
});
