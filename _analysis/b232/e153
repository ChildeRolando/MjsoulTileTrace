import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {imageFigureBinding,validateReview} from './textbook-audit.mjs';

const pageSha='a'.repeat(64),otherSha='b'.repeat(64),imageSha='c'.repeat(64);
const block={id:'img',type:'image',bbox:[10,10,20,20],imageSha256:imageSha};
const exact={figureId:'f-exact',bbox:[0,0,30,30],pageImageSha256:pageSha,sourceImageBlockIds:['img'],sourceImageSha256s:[imageSha]};
const context={figureId:'f-context',bbox:[0,0,30,30],pageImageSha256:pageSha,sourceImageBlockIds:['other'],sourceImageSha256s:[otherSha]};

it('accepts an exact source-image binding with the matching source SHA',()=>{
 expect(imageFigureBinding({figure:exact,block,pageImageSha256:pageSha})).toEqual({exact:true,contains:false,valid:true});
});

it('accepts a context figure only when its crop contains the image block and the page image SHA matches',()=>{
 expect(imageFigureBinding({figure:context,block,pageImageSha256:pageSha})).toEqual({exact:false,contains:true,valid:true});
});

it('rejects an exact figure whose source-image SHA is wrong',()=>{
 expect(imageFigureBinding({figure:{...exact,sourceImageSha256s:[otherSha]},block,pageImageSha256:pageSha}).valid).toBe(false);
});

it('rejects a context figure with a wrong page image SHA',()=>{
 expect(imageFigureBinding({figure:context,block,pageImageSha256:otherSha}).valid).toBe(false);
});

it('rejects a wrong figure that neither binds nor contains the image block',()=>{
 expect(imageFigureBinding({figure:{...context,bbox:[0,0,9,9]},block,pageImageSha256:pageSha}).valid).toBe(false);
});

it('rejects a missing figure or a missing image block',()=>{
 expect(imageFigureBinding({figure:null,block,pageImageSha256:pageSha}).valid).toBe(false);
 expect(imageFigureBinding({figure:exact,block:null,pageImageSha256:pageSha}).valid).toBe(false);
});


it('accepts the real p254 b58/b59 contextual review only because r15 is the exact binding',async()=>{
 const root='E:/AgentData/Coach/knowledge/processing';
 const candidate=JSON.parse(await readFile(`${root}/production/sol-high-field-repair9-20261027-p254nemata/candidates/nemata-jp/page-0254.json`,'utf8'));
 const page=JSON.parse(await readFile(`${root}/nemata-jp/pages/254.json`,'utf8'));
 const audit=JSON.parse(await readFile(`${root}/audit/pages/nemata-jp/page-0254.bdc0dcb315a56712edc68450c22c1b838a315683a5d9f0650395ac5f9c03f690.6baa4a7e1404.json`,'utf8'));
 expect(validateReview(audit.modelReview,page,candidate).passed).toBe(true);
 const withoutExact=structuredClone(audit.modelReview);const b58=withoutExact.imageChecks.find(x=>x.id==='nemata-jp-p254-b58');b58.figureIds=['nemata-jp-p254-r16'];
 expect(validateReview(withoutExact,page,candidate).passed).toBe(false);
});
