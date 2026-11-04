import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { readResearchCase } from './arena-research-case.mjs';
const id = value => createHash('sha256').update(value).digest('hex').slice(0,24);
const hiddenName = /preflight|synthetic|fixture|smoke|diagnostic|preparation|prep-|audit/i;
const locations = ['', 'independent-statistics', 'execution-receipt', 'arena-integration'];
const names = ['200题执行收据.md','报告.md','research-plan.json','research-design.json','root-result-review.json','independent-results.json','execution-receipt.json','batch-execution-receipt.json','operational-independent-recompute.json','summary.json','report.json','results.json'];
const labels = {'research-plan.json':'研究计划','research-design.json':'研究设计','root-result-review.json':'结果复核','independent-results.json':'独立统计','execution-receipt.json':'执行记录','batch-execution-receipt.json':'批量执行记录','operational-independent-recompute.json':'独立复算','summary.json':'汇总','report.json':'研究报告','results.json':'结果','报告.md':'研究报告'};
const MAX_BYTES = 16 * 1024 * 1024;
const inside = (root, target) => { const rel=relative(root,target); return rel && !rel.startsWith('..') && !isAbsolute(rel); };
const error = message => Object.assign(new Error(message),{status:404});
async function safeFile(root, file) {
  const actual=await realpath(file), info=await lstat(file);
  if (!inside(root,actual) || !info.isFile() || info.isSymbolicLink() || info.size>MAX_BYTES) throw error('研究资料不可读取。');
  return {actual,info};
}
export function createResearchLibrary(configFile) {
  let cache, expires=0;
  async function index(refresh=false) {
    if(cache && !refresh && Date.now()<expires) return cache;
    let roots=[];
    try { roots=JSON.parse((await readFile(configFile,'utf8')).replace(/^\uFEFF/,'')).roots; if(!Array.isArray(roots)||!roots.every(p=>typeof p==='string'&&isAbsolute(p))) throw Error(); }
    catch(e) { if(e.code!=='ENOENT') throw new Error('研究资料目录配置无效。'); }
    const studies=[], unavailable=[];
    for(const source of [...new Set(roots)]) {
      let root, dirs;
      try { root=await realpath(source); dirs=await readdir(root,{withFileTypes:true}); } catch { unavailable.push(source); continue; }
      for(const dir of dirs) {
        if(!dir.isDirectory()||dir.isSymbolicLink()) continue;
        const directory=join(root,dir.name), documents=[];
        for(const location of locations) for(const name of names) {
          const file=join(directory,location,name);
          try { const {info}=await safeFile(root,file); documents.push({id:id(location+'/'+name),name:labels[name]??name,path:location?`${location}/${name}`:name,modified:info.mtime.toISOString(),bytes:info.size,file,root}); } catch { /* absent/oversize documents are not advertised */ }
        }
        if(!documents.length) continue;
        documents.sort((a,b)=>Number(b.path==='arena-integration/200题执行收据.md')-Number(a.path==='arena-integration/200题执行收据.md') || Number(b.path==='independent-statistics/报告.md')-Number(a.path==='independent-statistics/报告.md') || Number(b.path==='arena-integration/报告.md')-Number(a.path==='arena-integration/报告.md'));
        let title=dir.name;
        const report=documents.find(d=>d.path.endsWith('.md'));
        if(report) { const text=await readFile(report.file,'utf8'); title=text.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0,180)||title; }
        const preparedOnly=documents.every(d=>/research-(plan|design)\.json$/.test(d.path));
        studies.push({id:id(directory),title,directory,name:dir.name,hidden:hiddenName.test(dir.name)||preparedOnly||/预检|准备|环境验证|数据包收口|样本冻结|来源修订|来源分配修订|样本及来源/.test(title),kind:preparedOnly?'准备中':documents.some(d=>d.path==='independent-statistics/independent-results.json'||d.path==='arena-integration/batch-execution-receipt.json')?'实验结果':'研究汇总',updated:documents.reduce((latest,d)=>d.modified>latest?d.modified:latest,''),documents});
      }
    }
    cache={studies:studies.sort((a,b)=>b.updated.localeCompare(a.updated)),roots,unavailable}; expires=Date.now()+30000; return cache;
  }
  const publicDoc = ({file,root,...d})=>d;
  const publicStudy = s=>({...s,documents:s.documents.map(publicDoc)});
  async function study(key) { const s=(await index()).studies.find(s=>s.id===key); if(!s) throw error('找不到该研究。'); return s; }
  async function document(key, docId) {
    const s=await study(key), d=s.documents.find(d=>d.id===docId); if(!d) throw error('找不到该研究资料。');
    await safeFile(d.root,d.file); const text=await readFile(d.file,'utf8');
    return {...publicDoc(d),text};
  }
  return {
    async list(refresh=false) { const data=await index(refresh); return {...data,studies:data.studies.map(publicStudy)}; },
    async detail(key) {
      const s=await study(key), stat=s.documents.find(d=>d.path==='independent-statistics/independent-results.json');
      let groups=[], statisticsStatus=null, statisticsError=null;
      if(stat) try {
        const raw=JSON.parse((await document(key,stat.id)).text.replace(/^\uFEFF/,'')); statisticsStatus=raw.status??null;
        groups=Object.entries(raw.groups??{}).map(([name,g])=>({name,valid:Number.isInteger(g.valid)?g.valid:null,matches:Number.isInteger(g.matches)?g.matches:null,cases:Array.isArray(raw.cases?.[name])?raw.cases[name]:[],reported:g}));
      } catch { statisticsError='独立统计暂不可读取，请查看原始报告或稍后刷新。'; }
      if(!stat) {
        const receipt=s.documents.find(d=>d.path==='arena-integration/batch-execution-receipt.json');
        if(receipt) try {
          const raw=JSON.parse((await document(key,receipt.id)).text.replace(/^\uFEFF/,''));
          if(Array.isArray(raw.cases)) groups=[{name:'raw_position',valid:raw.cases.filter(c=>c.status==='completed'&&c.attempt==='submitted').length,matches:null,cases:raw.cases,reported:{statusCounts:raw.statusCounts}}];
        } catch { statisticsError='批量执行记录暂不可读取。'; }
      }
      return {...publicStudy(s),groups,statisticsStatus,statisticsError};
    }, document,
    async case(key, group, caseIndex) {
      const s=await study(key), detail=await this.detail(key);
      const g=detail.groups.find(g=>g.name===group);
      if(!g || !Number.isInteger(caseIndex) || caseIndex<0 || caseIndex>=g.cases.length)throw error('找不到该研究案例。');
      return readResearchCase(s.directory,group,g.cases[caseIndex]);
    },
  };
}
