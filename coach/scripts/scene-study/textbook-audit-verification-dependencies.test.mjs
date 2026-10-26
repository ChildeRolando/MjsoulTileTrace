import {it,expect} from 'vitest';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 buildVerificationDependencyManifest,
 verifyVerificationDependencyManifest,
 collectModuleDependencyFiles,
 nativePageApprovalEntries,
 verificationDependencySchema,
} from './textbook-audit-verification-dependencies.mjs';

const here=dirname(fileURLToPath(import.meta.url));

async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'coach-verification-deps-'));
 await mkdir(join(dir,'modules'));
 await writeFile(join(dir,'modules','entry.mjs'),"import {x} from './dep-a.mjs';\nimport './side.mjs';\nexport const y=x;\n");
 await writeFile(join(dir,'modules','dep-a.mjs'),"export {x} from './dep-b.mjs';\n");
 await writeFile(join(dir,'modules','dep-b.mjs'),"export const x='stable';\n");
 await writeFile(join(dir,'modules','side.mjs'),"export const side=1;\n");
 await mkdir(join(dir,'root','approvals'),{recursive:true});
 await writeFile(join(dir,'root','approvals','page.p1.json'),JSON.stringify({page:1,jobs:[]}));
 return {
  dir,
  base:join(dir,'modules'),
  root:join(dir,'root'),
  approval:{path:'approvals/page.p1.json'},
  cleanup:()=>rm(dir,{recursive:true,force:true}),
 };
}

it('collects the relative import closure and ignores package or builtin imports',async()=>{
 const f=await fixture();
 try{
  const files=await collectModuleDependencyFiles(join(f.base,'entry.mjs'));
  expect(files.map(x=>x.name)).toEqual(['dep-a.mjs','dep-b.mjs','entry.mjs','side.mjs']);
 }finally{await f.cleanup();}
});

it('builds a stable content-addressed manifest including the page approval file',async()=>{
 const f=await fixture();
 try{
  const first=await buildVerificationDependencyManifest({baseDir:f.base,entry:'entry.mjs',root:f.root,pageApprovals:[f.approval]});
  const second=await buildVerificationDependencyManifest({baseDir:f.base,entry:'entry.mjs',root:f.root,pageApprovals:[f.approval]});
  expect(first.schema).toBe(verificationDependencySchema);
  expect(first.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(second.manifestSha256).toBe(first.manifestSha256);
  expect(first.pageApprovals).toHaveLength(1);
  expect(first.pageApprovals[0].path).toBe('approvals/page.p1.json');
  expect(first.pageApprovals[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  await expect(verifyVerificationDependencyManifest({baseDir:f.base,manifest:first,root:f.root})).resolves.toMatchObject({ok:true,files:4,pageApprovals:1});
 }finally{await f.cleanup();}
});

it('detects a changed module dependency',async()=>{
 const f=await fixture();
 try{
  const manifest=await buildVerificationDependencyManifest({baseDir:f.base,entry:'entry.mjs',root:f.root,pageApprovals:[f.approval]});
  await writeFile(join(f.base,'dep-b.mjs'),"export const x='changed';\n");
  await expect(verifyVerificationDependencyManifest({baseDir:f.base,manifest,root:f.root})).rejects.toMatchObject({
   code:'verification_dependency_manifest_changed',
   detail:expect.stringContaining('dep-b.mjs'),
  });
 }finally{await f.cleanup();}
});

it('detects an added module dependency even when the entry file is unchanged',async()=>{
 const f=await fixture();
 try{
  const manifest=await buildVerificationDependencyManifest({baseDir:f.base,entry:'entry.mjs',root:f.root,pageApprovals:[f.approval]});
  await writeFile(join(f.base,'dep-a.mjs'),"export {x} from './dep-b.mjs';\nimport './dep-c.mjs';\n");
  await writeFile(join(f.base,'dep-c.mjs'),"export const c=1;\n");
  await expect(verifyVerificationDependencyManifest({baseDir:f.base,manifest,root:f.root})).rejects.toMatchObject({
   code:'verification_dependency_manifest_changed',
   detail:expect.stringContaining('dep-c.mjs'),
  });
 }finally{await f.cleanup();}
});

it('detects a changed page approval file and rejects a missing one',async()=>{
 const f=await fixture();
 try{
  const manifest=await buildVerificationDependencyManifest({baseDir:f.base,entry:'entry.mjs',root:f.root,pageApprovals:[f.approval]});
  await writeFile(join(f.root,'approvals','page.p1.json'),JSON.stringify({page:1,jobs:[{changed:true}]}));
  await expect(verifyVerificationDependencyManifest({baseDir:f.base,manifest,root:f.root})).rejects.toMatchObject({code:'verification_page_approval_changed'});
  await expect(buildVerificationDependencyManifest({baseDir:f.base,entry:'entry.mjs',root:f.root,pageApprovals:[{path:'approvals/page.p1.json',sha256:'0'.repeat(64)}]})).rejects.toMatchObject({code:'verification_page_approval_changed'});
  await expect(buildVerificationDependencyManifest({baseDir:f.base,entry:'entry.mjs',root:f.root,pageApprovals:[{path:'approvals/missing.json'}]})).rejects.toMatchObject({code:'verification_page_approval_missing'});
  await expect(buildVerificationDependencyManifest({baseDir:f.base,entry:'entry.mjs',root:f.root,pageApprovals:[{path:'../outside.json'}]})).rejects.toMatchObject({code:'verification_page_approval_outside_root'});
 }finally{await f.cleanup();}
});

it('rejects a missing dependency instead of silently shrinking the closure',async()=>{
 const f=await fixture();
 try{
  await rm(join(f.base,'dep-b.mjs'));
  await expect(collectModuleDependencyFiles(join(f.base,'entry.mjs'))).rejects.toMatchObject({code:'verification_dependency_missing',detail:'dep-b.mjs'});
 }finally{await f.cleanup();}
});

it('covers the real native correction module and reads its page approval binding',async()=>{
 const files=await collectModuleDependencyFiles(join(here,'textbook-audit.mjs'));
 expect(files.map(x=>x.name)).toContain('textbook-audit-pdf-native.mjs');
 expect(files.map(x=>x.name)).toContain('textbook-audit-pdf-native-corrections.mjs');
 const approvals=await nativePageApprovalEntries({baseDir:here,sourceId:'nemata-jp',page:329});
 expect(approvals).toHaveLength(1);
 expect(approvals[0].path).toBe('audit/source-corrections/native-inline-field-corrections.p329.root-acceptance.json');
 expect(await nativePageApprovalEntries({baseDir:here,sourceId:'nemata-jp',page:999})).toEqual([]);
});
