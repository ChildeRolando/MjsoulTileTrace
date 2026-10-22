import { resolve } from 'node:path';
import { prepare } from '../scripts/scene-study/prepare.mjs';
import { freeze,run,importGold,calibrateDevelopmentBudget,recover } from '../scripts/scene-study/study.mjs';
import { materials } from '../scripts/scene-study/materials.mjs';
import { polishReviewPresentation } from '../scripts/scene-study/review-presentation.mjs';
import { report,importRatings } from '../scripts/scene-study/evaluate.mjs';
const [command,directory,...args]=process.argv.slice(2);
if(!directory||!['prepare','freeze','materials','import-gold','run','report','import-ratings','calibrate-budget','recover'].includes(command))throw new Error('Usage: node bin/scene-pattern-study.mjs <prepare|freeze|materials|import-gold|run|report|import-ratings|calibrate-budget|recover> <study-directory> [database|settings-file|annotations-file|development/evaluation [max-cases]|output-tokens]');
const out=resolve(directory);
switch(command){case 'prepare':await prepare({out,database:resolve(args[0])});break;case 'freeze':{const c=await freeze(out,args[0]);console.log({version:c.version,provider:c.provider,datasetHash:c.datasetHash});break;}case 'calibrate-budget':{const c=await calibrateDevelopmentBudget(out,Number(args[0]));console.log({limits:c.limits,priorDevelopmentAttempts:c.priorDevelopmentAttempts});break;}case 'recover':await recover(out);break;case 'materials':console.log(await materials(out));await polishReviewPresentation(out);break;case 'import-gold':await importGold(out,args[0]);break;case 'import-ratings':await importRatings(out,args[0]);break;case 'run':await run(out,args[0]??'development',Number(args[1]??(args[0]==='evaluation'?60:12)));break;case 'report':console.log((await report(out)).decision);break;}
