/** SH-10: offline validation of an owner-local Web FPS trace; no browser launch. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessDojoFpsCapture } from './acceptance-dojo-fps.mjs';

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const i=process.argv.indexOf('--trace');
  if(i<0 || !process.argv[i+1]) {
    process.stderr.write('Usage: node scripts/acceptance-dojo-fps-report.mjs --trace private/dojo-fps.json [--require-ragdolls]\n');
    process.exitCode=2;
  } else try {
    const report=assessDojoFpsCapture(JSON.parse(readFileSync(process.argv[i+1],'utf8')),
      {requireRagdolls:process.argv.includes('--require-ragdolls')});
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(report.status!=='WEB_DOJO_FPS_SAMPLED_OWNER_MARKED_NOT_GPU_BENCHMARK')process.exitCode=2;
  } catch(error) {
    process.stderr.write('Dojo FPS observation unavailable: '+error.message+'\n');
    process.exitCode=2;
  }
}
