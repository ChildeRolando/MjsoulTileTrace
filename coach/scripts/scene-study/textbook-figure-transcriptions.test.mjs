import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TextbookDiagramSchema} from '@riichi-coach/contracts';
import {verifyFigureTranscription} from './apply-textbook-figure-transcriptions.mjs';
const manifest=JSON.parse(readFileSync(new URL('./textbook-figure-transcriptions.json',import.meta.url),'utf8'));
const diagram=id=>manifest.figures.find(f=>f.id===id).diagram;
describe('reviewed textbook diagrams',()=>{
 it('accounts for every shown tile without inventing the seven hidden hands',()=>{
  expect(manifest.figures).toHaveLength(22);
  for(const f of manifest.figures)expect(TextbookDiagramSchema.parse(f.diagram)).toEqual(f.diagram);
  expect(manifest.figures.filter(f=>f.diagram.hiddenTileCount>0)).toHaveLength(7);
  expect(diagram('open-hand-defense-b12')).toMatchObject({concealed:'',hiddenTileCount:7,doraDisplay:'4z'});
  expect(diagram('open-hand-defense-b14')).toMatchObject({concealed:'5522444z',hiddenTileCount:0});
  expect(diagram('open-hand-defense-b14').notes).toContain('假设例');
 });
 it('preserves draw separation, normal fives, called positions and repeated dora artwork',()=>{
  expect(diagram('pairs-route-b6').concealed).toBe('11227p66s556677z');
  expect(diagram('pairs-route-b21').concealed).toContain('2245s');
  expect(diagram('pairs-standard-b6')).toMatchObject({concealed:'23445788m244p88s',drawn:'9m',doraDisplay:'4m'});
  expect(diagram('open-hand-defense-b19').melds).toEqual([{kind:'chi',tiles:'678m',calledIndex:0},{kind:'pon',tiles:'888m',calledIndex:2},{kind:'chi',tiles:'312m',calledIndex:0}]);
  expect(diagram('open-hand-defense-b16').doraDisplay).toBe('44p');
  expect(diagram('open-hand-defense-b16').notes).toContain('不把重复图标');
 });
 it('rejects tile omission, illegal melds, invalid honors and a fifth tile copy',()=>{
  expect(()=>TextbookDiagramSchema.parse({...diagram('pairs-standard-b6'),concealed:'2344578m244p88s'})).toThrow();
  expect(()=>TextbookDiagramSchema.parse({...diagram('open-hand-defense-b19'),melds:[{kind:'chi',tiles:'135m',calledIndex:0}]})).toThrow();
  expect(()=>TextbookDiagramSchema.parse({...diagram('pairs-route-b6'),concealed:'111117p66s55667z'})).toThrow();
  expect(()=>TextbookDiagramSchema.parse({...diagram('pairs-route-b6'),doraDisplay:'8z'})).toThrow();
 });
 it('binds a transcription to its exact image and registered block',()=>{
  const bytes=Buffer.from('fixture-image'),entry={...manifest.figures[0],sha256:createHash('sha256').update(bytes).digest('hex')};
  const block={id:entry.id,src:entry.path,type:'figure'};
  expect(verifyFigureTranscription(entry,block,bytes)).toEqual(entry.diagram);
  expect(()=>verifyFigureTranscription(entry,block,Buffer.from('changed'))).toThrow('image_changed');
  expect(()=>verifyFigureTranscription(entry,{...block,id:'different'},bytes)).toThrow('binding');
 });
});
