import importlib.util
import pathlib
import re
import unittest
from html.parser import HTMLParser

spec=importlib.util.spec_from_file_location('separators',pathlib.Path(__file__).with_name('isolate-ascii-separators.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
RUN='-'*84

class SeparatorTests(unittest.TestCase):
    def test_inline_chinese(self):
        self.assertEqual(module.isolate_separator_lines('前文 '+RUN+' 后文'),'前文 \n'+RUN+'\n 后文')

    def test_multiple_groups_keep_lengths(self):
        text='前'+RUN+'中'+'-'*69+'后'
        result=module.isolate_separator_lines(text)
        self.assertEqual(result,'前\n'+RUN+'\n中\n'+'-'*69+'\n后')
        self.assertEqual(re.findall('-+',result),re.findall('-+',text))

    def test_already_separate_and_edges(self):
        for text in [RUN,'前\n'+RUN+'\n后','\n'+RUN+'\n',RUN+'\n后']:
            self.assertEqual(module.isolate_separator_lines(text),text)

    def test_crlf_and_lf(self):
        for eol in ['\n','\r\n']:
            text='段一'+eol+'前'+RUN+'后'+eol+'段二'
            self.assertEqual(module.isolate_separator_lines(text),'段一'+eol+'前'+eol+RUN+eol+'后'+eol+'段二')

    def test_ordinary_hyphens_minus_and_threshold(self):
        for text in ['a-b -1 3m-6m --- ----- '+'-'*15,'前'+'-'*63+'后','identifier'+RUN+'suffix']:
            self.assertEqual(module.isolate_separator_lines(text),text)
        self.assertEqual(module.isolate_separator_lines('前'+'-'*64+'后'),'前\n'+'-'*64+'\n后')

    def test_url_code_and_markdown_tables(self):
        cases=['https://example.test/'+RUN+'/path','www.example.test/'+RUN,'`'+RUN+'`','``'+RUN+'``','```sh\n'+RUN+'\n```','~~~\n'+RUN+'\n~~~','| A | B |\n| '+RUN+' | --- |','A | '+RUN+' | B']
        for text in cases:
            with self.subTest(text=text):self.assertEqual(module.isolate_separator_lines(text),text)

    def test_idempotence_nonwhitespace(self):
        for text in ['前 '+RUN+' 后','前'+RUN+'中'+RUN+'后','前\r\n'+RUN+' 后']:
            result=module.isolate_separator_lines(text)
            self.assertEqual(module.isolate_separator_lines(result),result)
            self.assertEqual(re.sub(r'\s','',result),re.sub(r'\s','',text))

    def bodies(self,**overrides):
        return {'chapters':[{'blocks':[{'id':'p1','type':'p','text':'前'+RUN+'后',**overrides}]}]}

    def test_scoped_html_and_visual_rule(self):
        html='<html><head></head><body><div class="chapter-body"><p id="p1">前'+RUN+'后</p></div><script>'+RUN+'</script></body></html>'
        result,hits=module.transform_html(html,self.bodies())
        self.assertEqual(len(hits),1);self.assertIn('display:block;white-space:pre',result)
        self.assertIn('<span class="ascii-separator-line">'+RUN+'</span>',result)
        self.assertIn('<script>'+RUN+'</script>',result)
        self.assertEqual(module.transform_html(result,self.bodies()),(result,[]))

    def test_attributes_links_figures_code_and_notes_untouched(self):
        tags='<a href="https://x/'+RUN+'">'+RUN+'</a><code>'+RUN+'</code><pre>'+RUN+'</pre><figure><figcaption>'+RUN+'</figcaption></figure>'
        html='<html><head></head><div class="chapter-body"><p id="p1" title="'+RUN+'">'+tags+'</p><p id="note">'+RUN+'</p></div></html>'
        self.assertEqual(module.transform_html(html,self.bodies()),(html,[]))
        note='<html><head></head><div class="chapter-body"><p id="p1">'+RUN+'</p></div></html>'
        self.assertEqual(module.transform_html(note,self.bodies(authorText=False)),(note,[]))

    def test_source_table_untouched(self):
        html='<html><head></head><div class="chapter-body"><table><tr><td><p id="p1">'+RUN+'</p></td></tr></table></div></html>'
        self.assertEqual(module.transform_html(html,self.bodies()),(html,[]))

    def test_existing_entities_marks_and_crlf_retained(self):
        html='<html>\r\n<head></head>\r\n<div class="chapter-body"><p id="p1"><em>前</em> &amp; '+RUN+' 后</p></div></html>'
        result,hits=module.transform_html(html,self.bodies())
        self.assertEqual(len(hits),1);self.assertIn('<em>前</em> &amp;',result)
        self.assertEqual(re.findall(r'<em>.*?</em>',result),['<em>前</em>'])
        self.assertEqual(module.transform_html(result,self.bodies()),(result,[]))

if __name__=='__main__':unittest.main(verbosity=2)
