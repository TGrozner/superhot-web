/**
 * Defensive, deterministic metadata snapshot for WEB-PROTOTYPE-ONLY audio.
 * This validates data shape; it does not validate native source evidence.
 */
const MAX_DEPTH = 12;
const MAX_OBJECTS = 512;

export function snapshotSoundParams(params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('params must be a plain, non-array object');
  }

  const ancestors = new Set();
  let objectCount = 0;

  function clone(value, depth) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object') {
      throw new TypeError('params must contain only finite JSON-like data');
    }
    if (depth >= MAX_DEPTH) throw new RangeError('params nesting limit exceeded');
    if (ancestors.has(value)) throw new TypeError('params must not contain cycles');
    if (++objectCount > MAX_OBJECTS) throw new RangeError('params object count limit exceeded');

    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!isArray && prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('params must contain only plain objects and arrays');
    }
    ancestors.add(value);
    let copy;
    if (isArray) {
      if (value.length > MAX_OBJECTS || Reflect.ownKeys(value).length !== value.length + 1) {
        throw new TypeError('params arrays must be dense with no extra properties (max 512 elements)');
      }
      copy = new Array(value.length);
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          throw new TypeError('params arrays must have data elements, not accessors or holes');
        }
        copy[i] = clone(descriptor.value, depth + 1);
      }
    } else {
      copy = {};
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string') throw new TypeError('params must not have symbol keys');
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
          throw new TypeError('params must not contain accessors or hidden properties');
        }
        Object.defineProperty(copy, key, {
          value: clone(descriptor.value, depth + 1),
          enumerable: true,
        });
      }
    }
    ancestors.delete(value);
    return Object.freeze(copy);
  }
  return clone(params, 0);
}
