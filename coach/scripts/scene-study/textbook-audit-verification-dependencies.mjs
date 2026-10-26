import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * Identity of the dependencies that actually decide whether a native PDF page audit may pass.
 *
 * The page audit receipt records `auditorScriptSha256` = sha256(textbook-audit.mjs ||
 * textbook-production-cli.mjs). That identity deliberately stays untouched for compatibility,
 * but it does not cover the modules the audit route imports (notably the page-scoped
 * native-inline correction approvals) nor the per-page root-acceptance file those modules
 * point at. This module builds a manifest over that real dependency closure plus the page
 * approval binding, so a later gate can prove which dependency set it is looking at:
 *
 *   {schema, entry, files:[{name,sha256}], pageApprovals:[{path,sha256}], manifestSha256}
 *
 * The manifest is content-addressed and path-stable inside one base directory: identical
 * bytes produce an identical `manifestSha256`, and any added, removed or changed dependency
 * changes it. It is evidence, not a receipt rewrite.
 */
export const verificationDependencySchema='coach-textbook-audit-verification-dependencies/1';

const sha=b=>createHash('sha256').update(b).digest('hex');
const importSpecifiers=[
 /(?:^|[^\w$])from\s*['"](\.[^'"\r\n]+)['"]/g,
 /(?:^|[^\w$])import\s*['"](\.[^'"\r\n]+)['"]/g,
 /(?:^|[^\w$])import\s*\(\s*['"](\.[^'"\r\n]+)['"]\s*\)/g,
];

function fail(code,detail){
 const error=Error(detail?`${code}:${detail}`:code);
 error.code=code;
 if(detail!==undefined)error.detail=detail;
 return error;
}
const posix=p=>p.split(sep).join('/');

function localSpecifiers(text){
 const found=new Set();
 for(const pattern of importSpecifiers){
  pattern.lastIndex=0;
  let match;
  while((match=pattern.exec(text))!==null)found.add(match[1]);
 }
 return [...found];
}

/** Module files reachable from `entryPath` through relative ESM imports, sorted by name. */
export async function collectModuleDependencyFiles(entryPath){
 const base=dirname(resolve(entryPath)),seen=new Set(),files=[];
 async function visit(absolute){
  if(seen.has(absolute))return;
  seen.add(absolute);
  let bytes;
  try{bytes=await readFile(absolute);}
  catch(error){
   if(error.code==='ENOENT'||error.code==='EISDIR')throw fail('verification_dependency_missing',posix(relative(base,absolute)));
   throw error;
  }
  files.push({name:posix(relative(base,absolute)),sha256:sha(bytes)});
  for(const specifier of localSpecifiers(bytes.toString('utf8')))await visit(resolve(dirname(absolute),specifier));
 }
 await visit(resolve(entryPath));
 return files.sort((a,b)=>a.name.localeCompare(b.name));
}

/** Verify each page approval file against its recorded digest, inside `root`. */
export async function resolvePageApprovals(root,approvals){
 if(!approvals?.length)return [];
 if(!root)throw fail('verification_page_approval_root_missing');
 const resolved=new Map();
 for(const approval of approvals){
  if(!approval||typeof approval.path!=='string'||!approval.path)throw fail('verification_page_approval_invalid');
  const absolute=resolve(root,approval.path),rel=relative(resolve(root),absolute);
  if(!rel||rel==='..'||rel.startsWith('..'+sep)||rel.startsWith('../')||isAbsolute(rel))throw fail('verification_page_approval_outside_root',approval.path);
  let bytes;
  try{bytes=await readFile(absolute);}
  catch(error){
   if(error.code==='ENOENT')throw fail('verification_page_approval_missing',approval.path);
   throw error;
  }
  const actual=sha(bytes);
  if(typeof approval.sha256==='string'&&approval.sha256!==actual)throw fail('verification_page_approval_changed',posix(approval.path));
  resolved.set(posix(approval.path),{path:posix(approval.path),sha256:actual});
 }
 return [...resolved.values()].sort((a,b)=>a.path.localeCompare(b.path));
}

function manifestBody(entry,files,pageApprovals){
 return {schema:verificationDependencySchema,entry,files,pageApprovals};
}

/**
 * Build the manifest for one frozen base directory (a frozen runtime or the coach scripts dir).
 * `pageApprovals` entries may carry an expected `sha256`; when present it is enforced.
 */
export async function buildVerificationDependencyManifest({baseDir,entry='textbook-audit.mjs',root=null,pageApprovals=[]}={}){
 if(typeof baseDir!=='string'||!baseDir)throw fail('verification_dependency_base_missing');
 if(typeof entry!=='string'||!entry||isAbsolute(entry))throw fail('verification_dependency_entry_invalid');
 const files=await collectModuleDependencyFiles(join(resolve(baseDir),entry));
 const approvals=await resolvePageApprovals(root,pageApprovals);
 const body=manifestBody(posix(entry),files,approvals);
 return {...body,manifestSha256:sha(Buffer.from(JSON.stringify(body)))};
}

export function diffVerificationDependencies(expected,actual){
 const before=new Map((expected??[]).map(file=>[file.name,file.sha256]));
 const after=new Map((actual??[]).map(file=>[file.name,file.sha256]));
 return {
  added:[...after.keys()].filter(name=>!before.has(name)).sort(),
  removed:[...before.keys()].filter(name=>!after.has(name)).sort(),
  changed:[...before.keys()].filter(name=>after.has(name)&&before.get(name)!==after.get(name)).sort(),
 };
}

/**
 * Rebuild the manifest against the current base and require an exact identity match.
 * Throws `verification_dependency_manifest_changed` with the added/removed/changed names.
 */
export async function verifyVerificationDependencyManifest({baseDir,manifest,root=null}={}){
 if(!manifest||manifest.schema!==verificationDependencySchema||typeof manifest.entry!=='string'||!Array.isArray(manifest.files)||!Array.isArray(manifest.pageApprovals))throw fail('verification_dependency_manifest_invalid');
 const rebuilt=await buildVerificationDependencyManifest({baseDir,entry:manifest.entry,root,pageApprovals:manifest.pageApprovals});
 const diff=diffVerificationDependencies(manifest.files,rebuilt.files);
 if(manifest.manifestSha256!==rebuilt.manifestSha256)throw fail('verification_dependency_manifest_changed',JSON.stringify(diff));
 return {ok:true,manifestSha256:rebuilt.manifestSha256,files:rebuilt.files.length,pageApprovals:rebuilt.pageApprovals.length,diff};
}

/**
 * Page-level approval binding declared by the effective corrections modules in `baseDir`.
 * Returns [] for a page without a root-accepted correction; the empty list itself is evidence
 * that no approval entry existed in that base.
 */
export async function nativePageApprovalEntries({baseDir,sourceId,page}={}){
 if(typeof baseDir!=='string'||!baseDir||!sourceId||!page)throw fail('verification_page_approval_query_invalid');
 const key=`${sourceId}:${page}`,found=[];
 for(const [file,name] of [['textbook-audit-pdf-native-corrections.mjs','knownNativeInlineCorrections'],['textbook-audit-pdf-native-structure-corrections.mjs','knownNativePageStructureCorrections']]){
  let module;
  try{module=await import(pathToFileURL(join(resolve(baseDir),file)).href);}
  catch(error){
   if(error.code==='ERR_MODULE_NOT_FOUND')continue;
   throw error;
  }
  const entry=module[name]?.[key];
  if(entry)found.push({path:posix(entry.path),sha256:entry.sha256});
 }
 return found;
}
