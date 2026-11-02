import { meshModelMatrices, parseObjGroupsIntoIndexedMesh } from '../render/mesh-format.js';
import { createCharacterIndexedPass } from './indexed-pass.js';

// Metadata only, derived from already-inspected private corpus results #80,
// #81, #88 and #90. No proprietary vertex, normal, UV, face or skin data here.
// All source IDs are OWNER qualified: resources.assets:284/285 are NOT these meshes.
export const NATIVE_ENEMY_OBJ_EXPORTS = Object.freeze({
  merged: Object.freeze({
    owner: 'sharedassets0.assets', pathId: 284, rendererPathId: 4748,
    prefabGameObjectId: 870, serializedBoneRefs: 60,
    groupName: 'EnemyMerged_0', triangleCount: 2254,
    vCount: 5237, vtCount: 5237, vnCount: 5237,
    gzipBytes: 110391, objBytes: 660805,
    gzipSha256: 'e7cde671af5c46baf553f629988b39a19ffb13c4f7df1a6a0602ab403884e6cf',
    objSha256: 'acd05fef8f85ce06a1b6a6255247b01d3e27b5f3687525504ef39f45d2f67add',
    // OBJ is UnityPy mirrored-X output; our Web preview applies (-x,y,-z).
    webBounds: Object.freeze({
      min: Object.freeze([-.878194034, .0000810648, -.24209635]),
      max: Object.freeze([.878194034, 1.9474926, .122781016]),
    }),
  }),
  headless: Object.freeze({
    owner: 'sharedassets0.assets', pathId: 285, rendererPathId: 4749,
    prefabGameObjectId: 870, serializedBoneRefs: 59,
    groupName: 'EnemyMergedHeadless_0', triangleCount: 2132,
    vCount: 4895, vtCount: 4895, vnCount: 4895,
    gzipBytes: 103229, objBytes: 618720,
    gzipSha256: 'd28936a6d5d1a49293309bb7be4a02106a135cce064c30ce81825c805babc51b',
    objSha256: 'e6146e67cd0a9fb49b2641cc59fb397f5c236f78eb5c290a2206a74764305cff',
    webBounds: Object.freeze({
      min: Object.freeze([-.878194034, .0000810648, -.24209635]),
      max: Object.freeze([.878194034, 1.78382015, .122781016]),
    }),
  }),
});
const nativeFileReceipts = new WeakSet();

function descriptorFor(variant) {
  if (!Object.hasOwn(NATIVE_ENEMY_OBJ_EXPORTS, variant)) {
    throw new RangeError('Unknown owner-qualified native enemy variant');
  }
  return NATIVE_ENEMY_OBJ_EXPORTS[variant];
}

/**
 * Transport-level decoding of a caller-provided OBJ, with independently
 * specified evidence. This function alone NEVER qualifies any native source:
 * native qualification requires the exact digest checks in loadNativeEnemyObj().
 *
 * SH-12 owns the canonical indexed OBJ parser and winding/normal layout.
 */
export function decodeSourceNeutralEnemyObj(text, evidence) {
  if (!evidence || typeof evidence !== 'object' ||
      !['vCount', 'vtCount', 'vnCount', 'triangleCount'].every((key) =>
        Number.isSafeInteger(evidence[key]) && evidence[key] > 0) ||
      typeof evidence.groupName !== 'string' || !evidence.groupName.length ||
      !evidence.webBounds) {
    throw new TypeError('Explicit group/count/bounds evidence required');
  }
  if (typeof text !== 'string' || text.length > 2_000_000) {
    throw new RangeError('Decoded OBJ text must be smaller than 2 MB');
  }
  const counts = { v: 0, vt: 0, vn: 0 };
  for (const line of text.split(/\r?\n/)) {
    const kind = line.trimStart().split(/\s+/, 1)[0];
    if (Object.hasOwn(counts, kind)) counts[kind]++;
  }
  if (counts.v !== evidence.vCount || counts.vt !== evidence.vtCount ||
      counts.vn !== evidence.vnCount) {
    throw new RangeError('OBJ vertex/UV/normal declarations differ from source evidence');
  }
  const decoded = parseObjGroupsIntoIndexedMesh(text, [evidence.groupName], {
    axisSigns: [-1, 1, -1],
    winding: 'keep', // two reflections preserve handedness and face order
    expectedGroups: {
      [evidence.groupName]: {
        expectedTriangles: evidence.triangleCount,
        expectedBounds: {
          min: [...evidence.webBounds.min], max: [...evidence.webBounds.max],
          tolerance: .0001,
        },
      },
    },
  });
  const range = decoded.drawRanges[0];
  if (decoded.drawRanges.length !== 1 || range.indexCount !== evidence.triangleCount * 3 ||
      decoded.groupEvidence[0]?.groupName !== evidence.groupName) {
    throw new Error('OBJ geometry does not match exact exporter group/triangle evidence');
  }
  return {
    mesh: decoded.mesh, drawRanges: decoded.drawRanges,
    groupEvidence: decoded.groupEvidence, sourceCounts: counts,
    coordinateConversion: 'unitypy-obj-to-web:-x,+y,-z;keep-winding',
    materialBindingsResolved: false, skinWeightsAvailable: false,
    geometryProvenance: 'caller-OBJ-geometry-not-native-qualified',
  };
}

async function checkedDigest(bytes, expected, what) {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto SHA-256 unavailable: refuse unverified source');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('');
  if (hex !== expected) throw new Error(what + ' SHA-256 differs from private source receipt');
}

/**
 * Exact local-only authenticity gate. Accepts the owner's original OBJ/OBJ.gz,
 * never an HTTP URL/path and never uploads it. Rejects unproven variants.
 * Hashes are proof of conversion identity, NOT original runtime geometry/pose.
 */
export async function loadNativeEnemyObj(file, { variant = 'merged' } = {}) {
  const evidence = descriptorFor(variant);
  if (!file || typeof file.name !== 'string' || typeof file.arrayBuffer !== 'function' ||
      !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new TypeError('Choose a local File object for native enemy preview');
  }
  const compressed = /\.obj\.gz$/i.test(file.name);
  if (!compressed && !/\.obj$/i.test(file.name)) {
    throw new TypeError('Only a local .obj or .obj.gz file is accepted');
  }
  const requiredBytes = compressed ? evidence.gzipBytes : evidence.objBytes;
  if (file.size !== requiredBytes) throw new RangeError('Local file length differs from source-export receipt');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== requiredBytes) throw new RangeError('Local File changed during read');
  let objBytes = bytes;
  if (compressed) {
    await checkedDigest(bytes, evidence.gzipSha256, 'Compressed OBJ');
    if (typeof DecompressionStream !== 'function') {
      throw new Error('gzip DecompressionStream unavailable in browser');
    }
    const response = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    objBytes = new Uint8Array(await response.arrayBuffer());
  }
  if (objBytes.byteLength !== evidence.objBytes) {
    throw new RangeError('Uncompressed OBJ size differs from source-export receipt');
  }
  await checkedDigest(objBytes, evidence.objSha256, 'Uncompressed OBJ');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(objBytes);
  const decoded = decodeSourceNeutralEnemyObj(text, evidence);
  const receipt = Object.freeze({
    ...decoded, variant, owner: evidence.owner, meshPathId: evidence.pathId,
    rendererPathId: evidence.rendererPathId,
    geometryProvenance: 'private-owner-qualified-export-OBJ-geometry-only',
  });
  nativeFileReceipts.add(receipt);
  return receipt;
}

/**
 * Static single-mesh WebGL2 display through SH-14's existing SH-12-compatible
 * character pass. Root matrix may come from SH-06 later; no pose sampling,
 * bone skinning, hitboxes or claims of native spawn occur in this module.
 *
 * With an arbitrary caller mesh, the report deliberately says UNVERIFIED.
 */
export function createEnemyStaticIndexedPass(gl, program, uniforms, receipt, {
  diagnosticColor = [.83, .10, .20, 1],
} = {}) {
  if (!receipt || !receipt.mesh || !Array.isArray(diagnosticColor) ||
      diagnosticColor.length !== 4 ||
      !diagnosticColor.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new TypeError('Require source-neutral indexed mesh and explicit diagnostic RGBA');
  }
  const sourceVerified = nativeFileReceipts.has(receipt);
  const pass = createCharacterIndexedPass(gl, program, uniforms,
    { enemy: receipt.mesh }, { resolveColor: () => diagnosticColor });
  return Object.freeze({
    draw(rootMatrix) {
      const { model, normal, mirrored } = meshModelMatrices(rootMatrix);
      const result = pass.draw([{
        partId: 'staticEnemy', jointId: 'root', meshId: 'enemy',
        materialKey: 'diagnostic-only', model, normal, mirrored,
      }]);
      return {
        ...result, geometryProvenance: sourceVerified
          ? 'verified-private-OBJ-export-static-geometry-only'
          : 'caller-supplied-unverified-mesh',
        staticMesh: true, skinned: false, nativeEnemySpawnVerified: false,
        nativeMaterialVerified: false,
      };
    },
    dispose: pass.dispose,
  });
}
