import { parseArgs } from 'node:util';
import { prepare } from '../scripts/context-rag/prepare.mjs';
import { freeze, run, recover } from '../scripts/context-rag/experiment.mjs';
import { report, probes } from '../scripts/context-rag/report.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  out: { type: 'string' }, database: { type: 'string' }, previous: { type: 'string' },
  knowledge: { type: 'string', default: 'scripts/scene-study/knowledge-v2.json' },
  settings: { type: 'string' }, split: { type: 'string', default: 'pilot' }, 'failed-pilot': { type: 'string' },
} });
if (!values.out || positionals.length !== 1) throw new Error('Usage: npm run context-rag -- prepare|freeze|run|recover|probes|report --out DIR [options]');
const out = values.out;
switch (positionals[0]) {
  case 'prepare':
    if (!values.database || !values.previous) throw new Error('prepare requires --database and --previous');
    await prepare({ out, database: values.database, previous: values.previous }); break;
  case 'freeze': await freeze(out, values.knowledge, values.settings); break;
  case 'run': await run(out, values.split); break;
  case 'recover': await recover(out); break;
  case 'probes': await probes(out); break;
  case 'report': await report(out, values['failed-pilot']); break;
  default: throw new Error('Unknown context-rag command');
}
