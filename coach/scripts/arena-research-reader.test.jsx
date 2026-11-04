import React from 'react';
import {test,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Report} from '../arena-console/research/reader.jsx';

test('Markdown renders headings, tables and code while omitting executable HTML and unsafe links',()=>{
 const html=renderToStaticMarkup(<Report path="report.md" text={'# 结论\n\n| 分组 | 成功 |\n| --- | --- |\n| A | 20 |\n\n`actual input`\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))'}/>);
 expect(html).toContain('<h1>结论</h1>');expect(html).toContain('<table>');expect(html).toContain('<code>actual input</code>');
 expect(html).not.toContain('<script');expect(html).not.toContain('href="javascript:');
});
test('JSON uses an object viewer and malformed archives stay visibly malformed',()=>{
 const html=renderToStaticMarkup(<Report path="results.json" text={'{"valid":2,"missing":null}'}/>);
 expect(html).toContain('w-json-view-container');expect(html).toContain('valid');expect(html).not.toContain('<textarea');
 const broken=renderToStaticMarkup(<Report path="results.json" text={'{"partial":'}/>);
 expect(broken).toContain('JSON 文件不完整');expect(broken).toContain('&quot;partial&quot;');
});
