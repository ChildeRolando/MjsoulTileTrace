import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {mapSourceBlocks} from './publish-textbooks.mjs';
const root=resolve(process.argv[2]??''),mapPath=join(root,'integration/chapter-map.json'),mapBytes=await readFile(mapPath),inventoryBytes=await readFile(join(root,'source-inventory.json')),inventory=JSON.parse(inventoryBytes),mapping=JSON.parse(mapBytes),pages=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
if(mapping.inventorySha256!==sha(inventoryBytes))throw Error('inventory_changed');
for(const source of inventory.sources)for(const row of source.pages){const bytes=await readFile(join(root,row.pageData));if(sha(bytes)!==row.pageDataSha256)throw Error('page_changed');pages.push({sourceId:source.sourceId,page:JSON.parse(bytes)});}
const owners=mapSourceBlocks(mapping,pages),blocks=pages.flatMap(p=>p.page.blocks);
if(owners.size!==blocks.length)throw Error('source_map_incomplete');
const actualChecks=[['79-cn',114,'79-cn-p114-b8','手役8—三色'],['79-cn',114,'79-cn-p114-b9','手役9—对子手（一）'],['79-cn',104,'79-cn-p104-b5','手役5—断幺'],['nemata-jp',111,'nemata-jp-p111-b25','流し満貫']].map(([sourceId,page,id,title])=>{const owner=owners.get(`${sourceId}:${page}:${id}`);if(owner?.chapter.sourceTitle!==title)throw Error('source_boundary_regression');return {sourceId,page,sourceBlockId:id,sourceTitle:title,correctOwner:true};});
const receipt={schema:'coach-textbook-source-map-validation/1',checkedAt:new Date().toISOString(),sourceInventorySha256:sha(inventoryBytes),chapterMapSha256:sha(mapBytes),pages:pages.length,chapters:mapping.chapters.length,units:mapping.chapters.reduce((n,c)=>n+c.units.length,0),sourceBlocks:blocks.length,imageBlocks:blocks.filter(b=>b.type==='image').length,allBlocksMappedExactlyOnce:true,actualChecks,modelCalls:0,fullChineseLibraryPublished:false};
await writeFile(join(root,'integration/chapter-map-validation.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
