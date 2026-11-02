/**
 * SH-05: reproducible, public WEB-ONLY observations.
 *
 * Never import or ship native corpus data here. These snapshots are NOT
 * evidence of parity with SUPERHOT: MIND CONTROL DELETE.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, buildStaticGeometry } from '../src/levels.js';
import { cameraAxes, resolveWalk, segmentAabb, segmentSphere } from '../src/math.js';

const v = (x, y, z) => ({ x, y, z });

const caseRecord = (id, domain, input, webResult) => ({
  id,
  domain,
  input,
  webResult,
  nativeEvidence: null,
  parityVerdict: 'UNASSESSED',
});

export function createParityReport() {
  const rayStart = v(0, 0, 0);
  const rayEnd = v(10, 0, 0);
  const wall = { min: v(4, -1, -1), max: v(6, 1, 1) };
  const target = { center: v(8, 0, 0), radius: 1 };
  const wallFraction = segmentAabb(rayStart, rayEnd, wall.min, wall.max);
  const targetFraction = segmentSphere(rayStart, rayEnd, target.center, target.radius);

  const cases = [
    caseRecord(
      'camera.zero',
      'camera',
      { yawRadians: 0, pitchRadians: 0 },
      cameraAxes(0, 0),
    ),
    caseRecord(
      'camera.positive-yaw',
      'camera',
      { yawRadians: Math.PI / 2, pitchRadians: 0 },
      cameraAxes(Math.PI / 2, 0),
    ),
    caseRecord(
      'collision.sphere-hit',
      'collision',
      { start: rayStart, end: rayEnd, center: v(5, 0, 0), radius: 1 },
      { fraction: segmentSphere(rayStart, rayEnd, v(5, 0, 0), 1) },
    ),
    caseRecord(
      'collision.sphere-miss',
      'collision',
      { start: rayStart, end: rayEnd, center: v(5, 4, 0), radius: 1 },
      { fraction: segmentSphere(rayStart, rayEnd, v(5, 4, 0), 1) },
    ),
    caseRecord(
      'collision.wall-before-target',
      'collision',
      { start: rayStart, end: rayEnd, wall, target },
      {
        wallFraction,
        targetFraction,
        occluded: wallFraction !== null &&
          (targetFraction === null || wallFraction <= targetFraction),
      },
    ),
    caseRecord(
      'collision.walk-pushout',
      'collision',
      { point: v(1.1, 1.6, 0), radius: 0.4, solids: [{ x: 0, z: 0, w: 2, d: 2 }] },
      resolveWalk(v(1.1, 1.6, 0), 0.4, [{ x: 0, z: 0, w: 2, d: 2 }]),
    ),
    ...LEVELS.map((level, index) => {
      const geometry = buildStaticGeometry(level);
      return caseRecord(
        `scene.${index + 1}.structure`,
        'scene',
        { levelIndex: index },
        {
          name: level.name,
          spawn: { ...level.spawn },
          authoredObstacleCount: level.obstacles.length,
          enemySpawnCount: level.enemies.length,
          renderedBoxCount: geometry.length,
          solidBoxCount: geometry.filter((box) => box.solid).length,
        },
      );
    }),
  ];

  return {
    schemaVersion: 1,
    scope: 'WEB_PROTOTYPE_ONLY',
    nativeComparison: 'NOT_RUN',
    implementation: 'TGrozner/superhot-web',
    scenarios: cases,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(createParityReport(), null, 2) + '\n');
}
