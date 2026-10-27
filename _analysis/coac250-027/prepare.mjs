import {readFile,writeFile} from 'node:fs/promises';
import {dir} from './config.mjs';
const old=await readFile('_analysis/verify-pre-consume-coac250-10th-20261027.mjs','utf8');
const target=old.replace('for(const it of items){',"for(const it of items.filter(x=>x.key==='027-1')){")
 .replace("'_analysis/coac250-10th-batch-preconsume-20261027.json'",JSON.stringify(dir+'/audit-chain.json'));
await writeFile(dir+'/verify-audit-chain.mjs',target);
