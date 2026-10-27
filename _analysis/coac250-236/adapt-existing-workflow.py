"""Copy the bounded 183 integration workflow, substituting only this intake's facts."""
from pathlib import Path
import re
base = Path('_analysis/coac250-183')
out = Path('_analysis/coac250-236')
text = (base / 'integrate.mjs').read_text(encoding='utf-8')
for a, b in [
    ('load183ContextReview', 'load236FidelityReview'), ('183', '236'),
    ('Only b0018 newly reviewed; full unchanged parent inherited. Preserve 1-visible source ambiguity and explicit non-author annotation.', 'Only b0003 newly reviewed for fidelity; unchanged parent inherited. Preserve unspecified source timing direction and the complete non-author annotation.'),
    ('sourceBlocks:19', 'sourceBlocks:4'),
    ('specific-web-variant-selection.v23.json', 'specific-web-variant-selection.v24.json'),
    ('specific-web-variant-selection.v24.json', 'specific-web-variant-selection.v25.json'),
    ('Exact authorized context-stat236-v3 sidecar', 'Exact authorized fidelity236-v1 sidecar'),
]:
    text = text.replace(a, b)
# The prior selection is read from the pinned preconsume path; only the new filename above is literal.
text = re.sub(r'\bv23\b|\bv24\b|\bv24Path\b|\bv24Sha\b', lambda m: {'v23':'v24','v24':'v25','v24Path':'v25Path','v24Sha':'v25Sha'}[m[0]], text)
text = text.replace('source-note/old failure retained', 'source timing ambiguity/old uncertain retained')
(out / 'integrate.mjs').write_text(text, encoding='utf-8', newline='\n')
text = (base / 'test-route.mjs').read_text(encoding='utf-8').replace('load183ContextReview','load236FidelityReview').replace('183','236')
(out / 'test-route.mjs').write_text(text, encoding='utf-8', newline='\n')
text = (base / 'verify-persisted-route.mjs').read_text(encoding='utf-8')
for a,b in [('load183ContextReview','load236FidelityReview'),('183','236'),('chapter03-section003','chapter04-section015'),('specific-web-variant-selection.v24.json','specific-web-variant-selection.v25.json'),("builder.indexOf('async function load157VisionReview')", "builder.indexOf('async function load183ContextReview')"),('receipt.blocks,10','receipt.blocks,4'),('sourceBlocks:19','sourceBlocks:4'),('compiledBlocks:10','compiledBlocks:4')]:
    text=text.replace(a,b)
# The old183 function still follows the new236 prefix in the installed builder.
text=text.replace("builder.indexOf('async function load236ContextReview')", "builder.indexOf('async function load183ContextReview')")
(out / 'verify-persisted-route.mjs').write_text(text, encoding='utf-8', newline='\n')
