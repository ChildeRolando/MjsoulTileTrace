import { parseArgs } from 'node:util';
import { prepare, label } from '../scripts/mortal-ablation/prepare.mjs';
import { freeze, run, recover } from '../scripts/mortal-ablation/experiment.mjs';
const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  out: { type: 'string' }, database: { type: 'string' }, previous: { type: 'string' }, 'prior-context': { type: 'string' },
  knowledge: { type: 'string', default: 'scripts/scene-study/knowledge-v2.json' }, settings: { type: 'string' }, split: { type: 'string', default: 'pilot' },
} });
if (!v.out || positionals.length !== 1) throw new Error('Usage: mortal-ablation prepare|freeze|label|run|recover|report --out DIR [options]');
switch (positionals[0]) {
  case 'prepare':
    if (!v.database || !v.previous || !v['prior-context']) throw new Error('prepare requires database, previous and prior-context');
    await prepare({ out: v.out, database: v.database, previous: v.previous, priorContext: v['prior-context'] }); break;
  case 'freeze': await freeze(v.out, v.knowledge, v.settings); break;
  case 'label': if (!v.database) throw new Error('label requires database'); await label({ out: v.out, database: v.database }); break;
  case 'run': await run(v.out, v.split); break;
  case 'recover': await recover(v.out); break;
  case 'report': await (await import('../scripts/mortal-ablation/report.mjs')).report(v.out); break;
  default: throw new Error('Unknown command');
}
