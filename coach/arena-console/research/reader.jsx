import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import JsonView from '@uiw/react-json-view';
import './reader.css';

export function JsonReader({value}) {
  return <JsonView value={value!==null&&typeof value==='object'?value:{value}} collapsed={2} displayDataTypes={false} enableClipboard={true} shortenTextAfterLength={240} />;
}
export function Report({text,path}) {
  const [outline,setOutline]=useState([]);
  let value, error;
  if(path.endsWith('.json'))try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{error='JSON 文件不完整或格式错误，以下保留原文。';}
  const download=()=>{const url=URL.createObjectURL(new Blob([text],{type:path.endsWith('.json')?'application/json':'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=path.split('/').at(-1);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <div className="document-reader"><div className="document-toolbar">
    <span>{path.endsWith('.json')?'JSON · 可折叠结构':'Markdown · 研究报告'}</span>
    {outline.length>0&&<label>章节<select aria-label="报告章节" onChange={e=>document.getElementById(e.target.value)?.scrollIntoView({block:'start'})}><option value="">跳转到章节</option>{outline.map(h=><option key={h.id} value={h.id}>{h.text}</option>)}</select></label>}
    <button className="quiet-button" onClick={download}>下载原文件</button></div>
    <article className="document-body" tabIndex={0} aria-label="研究报告正文" ref={node=>{if(!node||path.endsWith('.json'))return;const headings=[...node.querySelectorAll('h1,h2,h3')];headings.forEach((h,i)=>h.id=`report-heading-${i}`);const next=headings.map(h=>({id:h.id,text:h.textContent}));if(JSON.stringify(next)!==JSON.stringify(outline))setOutline(next);}}>
      {error?<><p role="alert">{error}</p><pre>{text}</pre></>:path.endsWith('.json')?<JsonReader value={value}/>:<div className="markdown-document"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{a:({children,href})=><a href={/^https?:\/\//i.test(href??'')||href?.startsWith('#')?href:undefined} target="_blank" rel="noreferrer">{children}</a>,img:({alt})=><span className="field-hint">{alt||'报告图片'}</span>}}>{text}</Markdown></div>}
    </article></div>;
}
export function mountDocument(host,doc) {const root=createRoot(host);root.render(<Report key={doc.id??doc.path} {...doc}/>);return ()=>root.unmount();}
export function mountJson(host,value) {const root=createRoot(host);root.render(<div className="json-document"><JsonReader value={value}/></div>);return ()=>root.unmount();}
