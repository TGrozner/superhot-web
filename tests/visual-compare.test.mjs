import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  decodePng, pixelMetrics, silhouetteMetrics, objectMetrics, registration, compareFiles,
} from '../scripts/visual-compare.mjs';

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
  return Buffer.concat([head, data, crc]);
}
function png(width, height, bytes, { colorType = 2, filters = [] } = {}) {
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * channels;
  assert.equal(bytes.length, stride * height);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = colorType;
  const rows = [], prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const original = Buffer.from(bytes.slice(y * stride, (y + 1) * stride));
    const filter = filters[y] ?? 0;
    const row = Buffer.alloc(stride + 1); row[0] = filter;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? original[x - channels] : 0;
      const up = prev[x], ul = x >= channels ? prev[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = (left + up) >>> 1;
      if (filter === 4) {
        const p = left + up - ul;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - ul);
        predictor = a <= b && a <= c ? left : b <= c ? up : ul;
      }
      row[x + 1] = (original[x] - predictor + 256) & 255;
    }
    rows.push(row); prev.set(original);
  }
  return Buffer.concat([PNG_MAGIC, chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
function manifest(origin, opts = {}) {
  return {
    schemaVersion: 1, origin,
    ...(origin === 'native' ? { evidence: { captureId: 'private-case-42', buildId: '20299547' } } : {}),
    scene: { id: 'Containers', buildIndex: 28, stateId: 'frozen-frame-1' },
    camera: { coordinateSpace: 'matched-web', convention: 'column-major-world-to-camera', viewMatrix: [...identity], projectionMatrix: [...identity] },
    capture: { viewport: [2, 2], colorSpace: 'srgb', hud: 'off', png: 'image.png', mask: 'mask.png' },
    objects: [{ id: 'level28:secret', worldMatrix: [...identity] }],
    ...opts,
  };
}

const withTemp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'sh15-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('PNG decoder handles filters 0–4, RGB and gray, without PNG dependencies', () => {
  const rgb = [7, 33, 233, 4, 0, 231, 40, 100, 2, 255, 78, 91];
  for (const filter of [0, 1, 2, 3, 4]) {
    const image = decodePng(png(2, 2, rgb, { filters: [filter, filter] }));
    assert.deepEqual([...image.rgb], rgb);
  }
  const mask = decodePng(png(2, 2, [0, 255, 255, 0], { colorType: 0 }));
  assert.deepEqual([...mask.rgb], [0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0]);
});

test('PNG decoder rejects corrupt CRC, transparency, oversized images and truncation', () => {
  const clean = png(1, 1, [0, 128, 255]);
  const damaged = Buffer.from(clean); damaged[20] ^= 1;
  assert.throws(() => decodePng(damaged), /CRC/);
  assert.throws(() => decodePng(png(1, 1, [0, 0, 0, 80], { colorType: 6 })), /Transparent/);
  const huge = Buffer.from(clean); huge.writeUInt32BE(5000, 16);
  assert.throws(() => decodePng(huge), /CRC/);
  assert.throws(() => decodePng(clean.subarray(0, -5)), /Truncated|Incomplete/);
});

test('pixel comparison reports normalized error and linear-light luminance (not SSIM)', () => {
  const black = decodePng(png(1, 1, [0, 0, 0]));
  const white = decodePng(png(1, 1, [255, 255, 255]));
  const same = pixelMetrics(black, black);
  assert.equal(same.rgbMae01, 0);
  assert.equal(same.meanAbsoluteLinearLuminanceDelta01, 0);
  assert.equal(same.p95MaxChannelError255, 0);
  const diff = pixelMetrics(black, white);
  assert.equal(diff.rgbMae01, 1);
  assert.equal(diff.rgbRmse01, 1);
  assert.ok(Math.abs(diff.meanSignedLinearLuminanceDelta01 + 1) < 1e-12);
  assert.equal(diff.p95MaxChannelError255, 255);
});

test('masks use explicit threshold: non-overlap -> IoU zero and displaced centroids', () => {
  const a = decodePng(png(2, 2, [255, 0, 0, 0], { colorType: 0 }));
  const b = decodePng(png(2, 2, [0, 0, 0, 255], { colorType: 0 }));
  const result = silhouetteMetrics(a, b);
  assert.equal(result.iou, 0);
  assert.equal(result.union, 2);
  assert.equal(result.centroidDistancePx, Math.SQRT2);
  const empty = decodePng(png(1, 1, [0], { colorType: 0 }));
  assert.equal(silhouetteMetrics(empty, empty).iou, null);
});

test('world-space matching counts missing/extras without emitting private object IDs', () => {
  const translated = [...identity]; translated[12] = 3; translated[14] = 4;
  const result = objectMetrics(
    [{ id: 'private-reference', worldMatrix: identity }, { id: 'missing', worldMatrix: identity }],
    [{ id: 'private-reference', worldMatrix: translated }, { id: 'extra', worldMatrix: identity }],
  );
  assert.deepEqual([result.matchedCount, result.missingInWeb, result.extraInWeb], [1, 1, 1]);
  assert.equal(result.p95TranslationErrorWorldUnits, 5);
  assert.doesNotMatch(JSON.stringify(result), /private-reference|"missing"|"extra"/);
});

test('camera/scene mismatch blocks image metrics; matched fixtures are never certified native', () => withTemp(dir => {
  const native = manifest('native');
  const web = manifest('web');
  const black = png(2, 2, Array(12).fill(0));
  const white = png(2, 2, Array(12).fill(255));
  const nDir = join(dir, 'native'), wDir = join(dir, 'web');
  mkdirSync(nDir); mkdirSync(wDir);
  writeFileSync(join(nDir, 'image.png'), black);
  writeFileSync(join(wDir, 'image.png'), black);
  writeFileSync(join(nDir, 'mask.png'), png(2, 2, [255, 0, 255, 0], { colorType: 0 }));
  writeFileSync(join(wDir, 'mask.png'), png(2, 2, [255, 0, 255, 0], { colorType: 0 }));
  writeFileSync(join(nDir, 'n.json'), JSON.stringify(native));
  writeFileSync(join(wDir, 'w.json'), JSON.stringify(web));
  let result = compareFiles(join(nDir, 'n.json'), join(wDir, 'w.json'));
  assert.equal(result.status, 'PAIRED_NOT_PARITY_VERIFIED');
  assert.equal(result.pixel.rgbMae01, 0);
  assert.equal(result.silhouette.iou, 1);
  assert.equal(result.objects.matchedCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-case-42|secret|image\.png/);
  web.camera.viewMatrix[12] = 2;
  writeFileSync(join(wDir, 'w.json'), JSON.stringify(web));
  writeFileSync(join(wDir, 'image.png'), white);
  result = compareFiles(join(nDir, 'n.json'), join(wDir, 'w.json'));
  assert.equal(result.status, 'UNREGISTERED');
  assert.deepEqual(result.blockers, ['VIEW_MATRIX_MISMATCH']);
  assert.equal(result.pixel, null);
  assert.throws(() => registration(native, { ...web, objects: [{ id: 'dup', worldMatrix: identity }, { id: 'dup', worldMatrix: identity }] }), /duplicate/);
  web.camera.viewMatrix[12] = 0;
  web.origin = 'synthetic';
  assert.equal(registration(native, web).evidenceClass, 'SYNTHETIC_ONLY');
  writeFileSync(join(wDir, 'w.json'), JSON.stringify(web));
  const synthetic = compareFiles(join(nDir, 'n.json'), join(wDir, 'w.json'));
  assert.equal(synthetic.evidenceClass, 'SYNTHETIC_ONLY');
  assert.equal(synthetic.pixel.rgbMae01, 1);
}));

test('comparison rejects self-comparison through the same image path', () => withTemp(dir => {
  const a = manifest('native'), b = manifest('web');
  writeFileSync(join(dir, 'n.json'), JSON.stringify(a));
  writeFileSync(join(dir, 'w.json'), JSON.stringify(b));
  writeFileSync(join(dir, 'image.png'), png(2, 2, Array(12).fill(0)));
  assert.throws(() => compareFiles(join(dir, 'n.json'), join(dir, 'w.json')), /different image files/);
}));

test('comparison rejects PNG dimensions inconsistent with manifest viewport', () => withTemp(dir => {
  const nDir = join(dir, 'native'), wDir = join(dir, 'web'); mkdirSync(nDir); mkdirSync(wDir);
  writeFileSync(join(nDir, 'n.json'), JSON.stringify(manifest('native')));
  writeFileSync(join(wDir, 'w.json'), JSON.stringify(manifest('web')));
  writeFileSync(join(nDir, 'image.png'), png(1, 1, [0, 0, 0]));
  writeFileSync(join(wDir, 'image.png'), png(2, 2, Array(12).fill(0)));
  assert.throws(() => compareFiles(join(nDir, 'n.json'), join(wDir, 'w.json')), /viewport/);
}));
