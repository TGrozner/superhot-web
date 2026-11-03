/**
 * SH-10 — owner-local Dojo/build10 clock observation from REAL browser samples.
 *
 * The recorder's performance.now() is sampler time, not the Web rAF timestamp.
 * This reports sampled Web ratios; it never certifies original MCD timing.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const good = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const dojo = f => f?.nativeScene?.source?.sceneBuildIndex === 10 &&
  f?.nativeScene?.source?.serializedOwner === 'level10' &&
  /(?:^|[\\/])SHRL_Dojo2\.unity$/i.test(f.nativeScene.source.scenePath ?? '');
export const DOJO_CLOCK_STATUS = Object.freeze({
  OBSERVED: 'WEB_CLOCK_REGIMES_SAMPLED_NOT_NATIVE_PARITY',
  INCOMPLETE: 'WEB_CLOCK_OBSERVATION_INCOMPLETE',
  INVALID: 'WEB_CLOCK_OBSERVATION_INVALID',
});

/**
 * Require steady movement and idle spans, skip the first 250 ms after each
 * switch to reduce transient shifter effects, and reject long sampling gaps.
 * No claimed native ratio/tolerance: shooting, camera look, throttling and
 * callback phase remain uncontrolled in user-supplied traces.
 */
export function assessDojoClockObservation(trace) {
  const frames = trace?.frames;
  const observations = {idle:null,moving:null};
  const issues = [];
  const result = status => ({
    status, evidence:'USER_SUPPLIED_WEB_BROWSER_SAMPLES_UNAUTHENTICATED',
    browserExecutionIndependentlyVerified:false,
    nativeTimeMeasured:false, nativeParityVerdict:'UNKNOWN',
    observations, differenceWorldSecondsPerRealSecond:
      observations.idle && observations.moving
        ? observations.moving.worldSecondsPerRealSecond-observations.idle.worldSecondsPerRealSecond
        : null,
    issues,
  });
  if (trace?.schemaVersion !== 2 ||
      trace?.captureKind !== 'SH10_DOJO_OWNER_BROWSER_V2' ||
      !Array.isArray(frames) || !frames.length || frames.length > 50000) {
    issues.push('invalid Dojo browser trace schema');
    return result(DOJO_CLOCK_STATUS.INVALID);
  }
  let previousFrameId=-1, previousTimestamp=-1, missing=false, segment=[];
  const candidates={idle:[],moving:[]};
  const settle=() => {
    if (segment.length < 2) {segment=[];return;}
    const startAt=segment[0].sampledAtMs+250;
    const settled=segment.filter(f => f.sampledAtMs>=startAt);
    if (settled.length<2) {segment=[];return;}
    const first=settled[0],last=settled.at(-1);
    const realSeconds=(last.sampledAtMs-first.sampledAtMs)/1000;
    const worldSeconds=last.worldClock-first.worldClock;
    if (realSeconds>=0.30 && worldSeconds>=0) {
      const k=first.gameplay.moving?'moving':'idle';
      candidates[k].push({
        startFrameId:first.frameId,endFrameId:last.frameId,
        samples:settled.length,realSeconds,worldSeconds,
        worldSecondsPerRealSecond:worldSeconds/realSeconds,
        appReportedTimeScaleMean:settled.reduce((v,f)=>v+f.gameplay.timeScale,0)/settled.length,
      });
    }
    segment=[];
  };
  for (let i=0;i<frames.length;i++) {
    const f=frames[i],g=f?.gameplay;
    if (!Number.isSafeInteger(f?.frameId) || f.frameId<=previousFrameId || !dojo(f) ||
        !good(f.worldClock) || typeof g?.moving!=='boolean') {
      issues.push('invalid source/frame/clock at sample '+i);
      return result(DOJO_CLOCK_STATUS.INVALID);
    }
    previousFrameId=f.frameId;
    if (f.sampledAtMs == null || g.timeScale == null) {
      missing=true;settle();continue;
    }
    if (!good(f.sampledAtMs) || !good(g.timeScale)) {
      issues.push('invalid measured browser timestamp or reported time scale at sample '+i);
      return result(DOJO_CLOCK_STATUS.INVALID);
    }
    if (f.sampledAtMs<=previousTimestamp) {
      issues.push('browser sampler time must increase');
      return result(DOJO_CLOCK_STATUS.INVALID);
    }
    previousTimestamp=f.sampledAtMs;
    if (f.activeScreen!=='playing') {settle();continue;}
    const prior=segment.at(-1);
    if (prior && (prior.gameplay.moving!==g.moving ||
        f.sampledAtMs-prior.sampledAtMs>500 ||
        f.worldClock<prior.worldClock)) settle();
    segment.push(f);
  }
  settle();
  for (const k of ['idle','moving']) {
    const sorted=candidates[k].sort((a,b)=>b.realSeconds-a.realSeconds);
    if (sorted.length) observations[k]=sorted[0];
    else issues.push('no settled '+k+' Web sampling span >=300 ms after 250 ms transition exclusion');
  }
  if (missing) issues.push('legacy/partial browser recording lacked sampler timestamps or Web timeScale');
  if (!observations.idle || !observations.moving) return result(DOJO_CLOCK_STATUS.INCOMPLETE);
  return result(DOJO_CLOCK_STATUS.OBSERVED);
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const at=process.argv.indexOf('--trace');
  if (at<0 || !process.argv[at+1]) {
    process.stderr.write('Usage: node scripts/acceptance-dojo-clock.mjs --trace private/dojo-full-run.json\n');
    process.exitCode=2;
  } else try {
    const report=assessDojoClockObservation(JSON.parse(readFileSync(process.argv[at+1],'utf8')));
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if (report.status!==DOJO_CLOCK_STATUS.OBSERVED) process.exitCode=2;
  } catch(e) {
    process.stderr.write('Dojo clock observation unavailable: '+e.message+'\n');
    process.exitCode=2;
  }
}
