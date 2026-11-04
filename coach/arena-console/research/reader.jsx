import React, {useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import JsonView from '@uiw/react-json-view';
import './reader.css';

export function JsonReader({value}) {
  return <JsonView value={value!==null&&typeof value==='object'?value:{value}} collapsed={2} displayDataTypes={false} enableClipboard={true} shortenTextAfterLength={240} />;
}
export function Report({text,path}) {
  const [full,setFull]=useState(false), dialog=useRef(null), trigger=useRef(null), body=useRef(null), fullBody=useRef(null);
  useEffect(()=>{if(full){dialog.current.showModal();fullBody.current.scrollTop=body.current.scrollTop;}},[full]);
  let value, error;
  if(path.endsWith('.json'))try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{error='JSON 文件不完整或格式错误，以下保留原文。';}
  const download=()=>{const url=URL.createObjectURL(new Blob([text],{type:path.endsWith('.json')?'application/json':'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=path.split('/').at(-1);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const content=error?<><p role="alert">{error}</p><pre>{text}</pre></>:path.endsWith('.json')?<JsonReader value={value}/>:<div className="markdown-document"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{a:({children,href})=><a href={/^https?:\/\//i.test(href??'')||href?.startsWith('#')?href:undefined} target="_blank" rel="noreferrer">{children}</a>,img:({alt})=><span className="field-hint">{alt||'报告图片'}</span>}}>{text}</Markdown></div>;
  const close=()=>{body.current.scrollTop=fullBody.current.scrollTop;setFull(false);trigger.current?.focus();};
  return <div className="document-reader"><div className="document-toolbar">
    <span>{path.endsWith('.json')?'JSON · 可折叠结构':'Markdown · 研究报告'}</span>
    <button ref={trigger} className="quiet-button document-fullscreen-button" onClick={()=>setFull(true)}>全屏阅读</button>
    <button className="quiet-button" onClick={download}>下载原文件</button></div>
    <article ref={body} className="document-body" tabIndex={0} aria-label="研究报告正文">{content}</article>
    {full&&<dialog ref={dialog} className="report-fullscreen" aria-label="全屏研究报告" onClose={close}>
      <div className="document-toolbar"><span>{path.split('/').at(-1)}</span><button className="quiet-button document-fullscreen-button" onClick={download}>下载原文件</button><button className="quiet-button" autoFocus onClick={()=>dialog.current.close()}>退出全屏</button></div>
      <article ref={fullBody} className="document-body" tabIndex={0} aria-label="全屏报告正文">{content}</article>
    </dialog>}</div>;
}
export function mountDocument(host,doc) {const root=createRoot(host);root.render(<Report key={doc.id??doc.path} {...doc}/>);return ()=>root.unmount();}
export function mountJson(host,value) {const root=createRoot(host);root.render(<div className="json-document"><JsonReader value={value}/></div>);return ()=>root.unmount();}
