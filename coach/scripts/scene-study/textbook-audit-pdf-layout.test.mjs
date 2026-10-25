import {describe,it,expect} from 'vitest';
import {checkPdfInlineSourceLayout,resolvePdf335FlowReview} from './textbook-audit-pdf-layout.mjs';
const convention='Unicode-codepoints, half-open [start,end), original lines[].text concatenated without separators';
function fixture(){
 const id='79-cn-p335-b1',image='79-cn-p335-b2',text={id,type:'text',lines:[{text:'甲',bbox:[0,0,10,10]},{text:'乙',bbox:[20,0,30,10]}]},asset={path:'assets/2.png',sha256:'source'},pic={id:image,type:'image',bbox:[10,0,20,10],asset:asset.path,imageSha256:asset.sha256};
 const body=[{type:'text',sourceBlockIds:[id],sourceText:'甲乙',text:'甲乙'},{type:'figure',figureId:'r1',sourceBlockIds:[image]}],candidate={source:{sourceId:'79-cn',page:335},body:{mode:'verbatim',blocks:body},figures:[{figureId:'r1',sourceImageBlockIds:[image],transcription:image+'为2m（二万）。'}]};
 const group={figureGroupId:'g1',parentFigureId:'r1',sourceImageBlockIds:[image],sourceTranscriptionEvidence:candidate.figures[0].transcription,tiles:[{sourceImageBlockId:image,code:'2m',red:false,orientation:'upright',asset}],text:'2m',presentationAsset:{},derivation:{}};
 return {page:{page:335,blocks:[text,pic]},candidate,layout:{schema:'coach-textbook-pdf-inline-layout/1',source:{sourceId:'79-cn',page:335},offsetConvention:convention,figureGroups:[group],paragraphs:[{sourceBlockIds:[id],originalSourceText:'甲乙',text:'甲2m乙',replacement:{sourceBlockIds:[id],insertBeforeSourceBlockId:id,parentBodyIndices:[0,1],parentBodyBlocks:structuredClone(body),parentFigureIds:['r1']},inlineContent:[{type:'text',text:'甲',sourceFragments:[{sourceBlockId:id,start:0,end:1}]},{type:'figure',figureGroupId:'g1',text:'2m'},{type:'text',text:'乙',sourceFragments:[{sourceBlockId:id,start:1,end:2}]}]}]}};
}
describe('source-line PDF inline layout',()=>{
 it('retains every source codepoint and image occurrence at its actual native gap',()=>{const {page,candidate,layout}=fixture(),before=structuredClone(layout);expect(checkPdfInlineSourceLayout(page,candidate,layout)).toMatchObject({paragraphs:1,imageOccurrences:1,figureGroups:1,exactSourceTextAndCodepointOffsets:true});expect(layout).toEqual(before);});
 it.each([
  ['offset omission',f=>f.layout.paragraphs[0].inlineContent[2].sourceFragments[0].start=0],
  ['rewritten source',f=>f.layout.paragraphs[0].inlineContent[0].text='改'],
  ['invented tile',f=>f.layout.figureGroups[0].tiles[0].code='3m'],
  ['changed parent body',f=>f.layout.paragraphs[0].replacement.parentBodyBlocks[0].text='改'],
  ['figure omitted',f=>f.layout.paragraphs[0].inlineContent.splice(1,1)],
  ['wrong gap position',f=>f.page.blocks[1].bbox=[40,0,50,10]],
  ['wrong source asset',f=>f.layout.figureGroups[0].tiles[0].asset.sha256='changed'],
  ['duplicate image group',f=>f.layout.figureGroups.push(structuredClone(f.layout.figureGroups[0]))]
 ])('rejects %s',(_,mutate)=>{const f=fixture();mutate(f);expect(()=>checkPdfInlineSourceLayout(f.page,f.candidate,f.layout)).toThrow();});
 it('cannot use the flow-only repair to release other unresolved content',()=>{expect(()=>resolvePdf335FlowReview({issues:[{severity:'uncertain',targetId:'r1'}],flowCheck:{verdict:'needs-repair'},bodyChecks:[],figureChecks:[],imageChecks:[],completePageCompared:true})).toThrow('flow_only');});
});

it('resolves only the two byte-bound original flow issues and preserves the author note',()=>{const review={"bodyChecks":[{"id":"b1","verdict":"faithful"}],"figureChecks":[{"id":"r1","verdict":"faithful"}],"imageChecks":[{"id":"i1","disposition":"represented"}],"issues":[{"severity":"error","targetId":"body.flowOrder","sourceEvidence":"源页第一段的牌图分别位于“有利性低下，”之后和“切掉”之后；候选却在“是比较”与“常见的”之间插入r1。","description":"r1插入位置截断“是比较常见的”，使完整论述段落被图例割裂。","suggestedRepair":"将b4、b5、b6连成完整段落，保持中文原文；在原有两处牌引用位置分别关联223m和2m，或将r1放在完整段落之后并明确这两处对应关系。"},{"severity":"error","targetId":"body.flowOrder","sourceEvidence":"源页11335m位于“比如副露的时候，”与“这样的形”之间；候选却在“不会先被切”与“出的）”之间插入r2。","description":"r2插入位置截断“切出的”，破坏括号内说明及完整段落的阅读顺序。","suggestedRepair":"将b8、b9、b10连成完整段落，保持中文原文；把11335m关联到“比如副露的时候，”之后，或将r2移至完整段落之后并明确引用位置。"},{"severity":"source-note","targetId":"79-cn-p335-b23","sourceEvidence":"源文末句为“手上的安全牌否够撑过剩下的巡目”。","description":"“否够”疑有漏字，候选已忠实保留，属于源文疑点。","suggestedRepair":"正文保持原样；如需校注，可另注“否够”疑为“是否够”，不得直接替换正文。"}],"flowCheck":{"verdict":"needs-repair","explanation":"整体段落、总结、分隔线、下一节标题及页码顺序正确，页首跨页残句处理正确。但r1插在“比较／常见的”之间，r2插在“切／出的”之间，两处均截断句段。应恢复完整段落并按原句位置关联牌例。"},"completePageCompared":true};const original=structuredClone(review),effective=resolvePdf335FlowReview(review);expect(review).toEqual(original);expect(effective.flowCheck.verdict).toBe('faithful');expect(effective.issues.at(-1)).toEqual(original.issues.at(-1));const extra=structuredClone(review);extra.issues.push({severity:'uncertain',targetId:'r2'});expect(()=>resolvePdf335FlowReview(extra)).toThrow();const badTile=structuredClone(review);badTile.figureChecks[0].verdict='uncertain';expect(()=>resolvePdf335FlowReview(badTile)).toThrow();});
