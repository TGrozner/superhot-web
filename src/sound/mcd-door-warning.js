import {sampleMcdCurve} from './mcd-curve.js';

/** Source world-clock envelopes, independent from continuous door audio.
 * Pass gameplay.audio.doors after build_native_door_visuals enrichment.
 * packets()/advance() return the SAME live array and records, not snapshots.
 * Spotlight range is modulated; its authored intensity stays constant.
 * Renderer must honor enabled/cullingMask and sample cookie alpha in light space.
 * falseLight uses its own world position/intensity, NOT the spotlight mask.
 * trigger retains the previous sample until advance, matching native Update.
 */
export function createMcdDoorWarnings(doors) {
  const packets = [], states = new Map(), slots = [null, null, null];
  for (const [id, door] of Object.entries(doors ?? {})) {
    const curve = door.curve;
    if (!Array.isArray(curve) || !curve.length || curve.some((key, index) =>
      !Number.isFinite(key.time) || !Number.isFinite(key.value) || key.weightedMode
      || (index > 0 && key.time <= curve[index - 1].time)) || curve.at(-1).time <= 0) {
      throw new TypeError('Door warning needs a nonempty, increasing unweighted curve');
    }
    if (!(door.spotlight?.range >= 0) || !Number.isFinite(door.spotlight.range)
      || !(door.falseLight?.intensity >= 0) || !Number.isFinite(door.falseLight.intensity)) {
      throw new TypeError('Door warning needs source spotlight range and false light intensity');
    }
    const packet = {
      id, active: false, elapsed: 0, rendererId: door.rendererId,
      spotlight: {...door.spotlight, enabled: false, range: 0},
      falseLight: {...door.falseLight, enabled: false, intensity: 0, slot: -1},
    };
    packets.push(packet);
    states.set(id, {door, packet, value: 0});
  }

  function trigger(source) {
    const id = typeof source === 'string' ? source : source && `${source.owner}::${source.pathId}`;
    const state = states.get(id);
    if (!state) return false;
    const {door, packet, value} = state;
    packet.elapsed = 0;
    packet.active = packet.spotlight.enabled = packet.falseLight.enabled = true;
    packet.spotlight.range = value * door.spotlight.range;
    packet.falseLight.intensity = value * door.falseLight.intensity;
    claimSlot(packet);
    return true;
  }

  function claimSlot(packet) {
    if (packet.falseLight.slot >= 0) return;
    const slot = slots.indexOf(null);
    if (slot >= 0) {
      slots[slot] = packet;
      packet.falseLight.slot = slot;
    }
  }

  function advance(worldDeltaSeconds) {
    if (!Number.isFinite(worldDeltaSeconds) || worldDeltaSeconds < 0) throw new RangeError('worldDeltaSeconds must be nonnegative');
    for (const state of states.values()) {
      const {door, packet} = state;
      if (!packet.active) continue;
      packet.elapsed += worldDeltaSeconds;
      if (packet.elapsed >= door.curve.at(-1).time) {
        packet.active = packet.spotlight.enabled = packet.falseLight.enabled = false;
        packet.falseLight.intensity = 0;
        if (packet.falseLight.slot >= 0) slots[packet.falseLight.slot] = null;
        packet.falseLight.slot = -1;
      } else {
        state.value = sampleMcdCurve(door.curve, packet.elapsed);
        packet.spotlight.range = state.value * door.spotlight.range;
        packet.falseLight.intensity = state.value * door.falseLight.intensity;
        claimSlot(packet);
      }
    }
    return packets;
  }

  function reset() {
    slots.fill(null);
    for (const state of states.values()) {
      state.value = 0;
      const packet = state.packet;
      packet.elapsed = packet.spotlight.range = packet.falseLight.intensity = 0;
      packet.active = packet.spotlight.enabled = packet.falseLight.enabled = false;
      packet.falseLight.slot = -1;
    }
  }
  return Object.freeze({trigger, advance, packets: () => packets, reset});
}
