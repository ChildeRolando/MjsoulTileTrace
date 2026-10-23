"""Independent, offline DOM coverage check for captured textbook articles."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
from bs4 import BeautifulSoup, Comment, NavigableString, Tag


def digest(data):
    return hashlib.sha256(data).hexdigest()


def compact(text):
    # HTML layout whitespace is immaterial; every non-whitespace character remains.
    return re.sub(r"\s", "", text)


def inspect(processing, source_path):
    source_path = Path(source_path).resolve()
    source_bytes = source_path.read_bytes()
    source = json.loads(source_bytes)
    web_root = processing / "web-sources" / "v1"
    def asset_path(value):
        path = (web_root / value).resolve()
        if not path.is_relative_to(web_root.resolve()):
            raise ValueError("web_source_path_outside_root")
        return path
    errors = []
    def check(ok, message):
        if not ok:
            errors.append(message)
    check(source.get("schema") == "coach-textbook-web-article-source/1", "source_schema")
    check(not source.get("status", "").startswith("blocked"), "source_blocked")
    raw = asset_path(source["html"]["path"]).read_bytes()
    main_bytes = asset_path(source["main"]["path"]).read_bytes()
    check(digest(raw) == source["html"]["sha256"], "raw_html_hash")
    check(digest(main_bytes) == source["main"]["sha256"], "main_html_hash")
    assets = {a["assetId"]: a for a in source["assets"]}
    check(len(assets) == len(source["assets"]), "duplicate_asset_id")
    for asset in assets.values():
        check(asset.get("status") == "downloaded", "asset_not_downloaded:" + asset["assetId"])
        check("default_s_bmiddle.gif" not in asset.get("finalUrl", ""), "placeholder_asset")
        if asset.get("path"):
            check(digest(asset_path(asset["path"]).read_bytes()) == asset["sha256"], "asset_hash:" + asset["assetId"])
    blocks = source["blocks"]
    check(len({b["id"] for b in blocks}) == len(blocks), "duplicate_source_block_id")
    occurrences = [image for block in blocks if block["type"] == "image-run" for image in block["images"]]
    check(len({i["occurrenceId"] for i in occurrences}) == len(occurrences), "duplicate_occurrence_id")
    for block in blocks:
        if block["type"] == "text":
            check("".join(s["text"] for s in block["segments"]) == block["text"], "source_segment_text:" + block["id"])
        else:
            check(block["type"] == "image-run", "unknown_source_block_type")
    expected = []
    for block in blocks:
        if block["type"] == "text":
            expected.extend(compact(block["text"]))
        else:
            expected.extend("<image:" + image["occurrenceId"] + ">" for image in block["images"])

    ignored = source.get("ignoredPlaceholders", [])
    check(all(x.get("reason") == "explicit-book-navigation-image" for x in ignored), "unresolved_ignored_image")
    def image_urls(node):
        result = []
        parent = node.find_parent("a", href=True)
        if parent and "showpic.html" in parent["href"]:
            match = re.search(r"(?:#|&)url=(.+?)(?:&|$)", parent["href"])
            if match:
                result.append(unquote(match[1]))
        for key in ("real_src", "data-src", "src"):
            value = node.get(key)
            if value and "sg_trans.gif" not in value:
                resolved = urljoin(source["url"], value)
                if "hdslb.com/bfs/article/" in resolved and "@" in resolved:
                    result.append(resolved.split("@", 1)[0])
                result.append(resolved)
        return result

    def tokens(node):
        output, image_number = [], 0
        for item in node.descendants:
            if isinstance(item, Comment):
                continue
            parents = [p.name for p in item.parents if isinstance(p, Tag)]
            if any(p in ("script", "style", "noscript", "iframe", "object") for p in parents):
                continue
            if isinstance(item, NavigableString):
                output.extend(compact(str(item)))
            elif isinstance(item, Tag) and item.name == "img":
                urls = image_urls(item)
                if urls and all(re.search(r"/(back|home|next)\.gif$", urlsplit(u).path) for u in urls):
                    check(any(set(urls) & set(x.get("sourceUrls", [])) for x in ignored), "unrecorded_navigation_image")
                    continue
                if image_number >= len(occurrences):
                    errors.append("raw_image_not_in_source_coverage")
                    continue
                occurrence = occurrences[image_number]
                image_number += 1
                check(bool(set(urls) & set(occurrence.get("sourceUrls", []))), "raw_image_occurrence_order:" + occurrence["occurrenceId"])
                asset = assets.get(occurrence["assetId"])
                check(bool(asset) and asset["url"] in occurrence["sourceUrls"], "occurrence_asset_url:" + occurrence["occurrenceId"])
                check(item.get("alt", "") == occurrence.get("alt", "") and item.get("title", "") == occurrence.get("title", ""), "image_alt_title:" + occurrence["occurrenceId"])
                output.append("<image:" + occurrence["occurrenceId"] + ">")
        check(image_number == len(occurrences), "source_image_missing_from_raw")
        return output

    # Different parser and a flat character/image event stream, independent of
    # the producer's paragraph/group traversal and block identifiers.
    captured_main = BeautifulSoup(main_bytes.decode("utf-8"), "html.parser")
    declared_encoding = source["html"]["encoding"]
    effective_encoding = declared_encoding
    try:
        decoded = raw.decode(declared_encoding, errors="strict")
    except UnicodeDecodeError:
        if declared_encoding.lower().replace("-", "_") != "shift_jis":
            raise
        effective_encoding = "cp932"
        decoded = raw.decode(effective_encoding, errors="strict")
    raw_dom = BeautifulSoup(decoded, "html.parser")
    raw_main = raw_dom.select_one(source["main"]["selector"])
    check(raw_main is not None, "raw_main_selector_missing")
    check(tokens(captured_main) == expected, "main_dom_character_image_coverage_order")
    if raw_main is not None:
        check(tokens(raw_main) == expected, "raw_dom_character_image_coverage_order")
    result = {"schema": "coach-textbook-web-independent-source-check/1", "passed": not errors, "errors": errors,
            "sourceFileSha256": digest(source_bytes), "rawHtmlSha256": digest(raw), "mainSha256": digest(main_bytes),
            "textBlocks": sum(b["type"] == "text" for b in blocks), "imageRuns": sum(b["type"] == "image-run" for b in blocks),
            "imageOccurrences": len(occurrences), "uniqueAssets": len(assets), "method": "offline independent html.parser character-and-image DOM event comparison", "modelCalls": 0}
    if effective_encoding != declared_encoding:
        result["decoderEvidence"] = {"declaredEncoding": declared_encoding, "effectiveEncoding": effective_encoding,
                                     "reason": "Strict Shift_JIS rejects Windows extension bytes; strict CP932 succeeds, without replacement characters."}
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--processing-root", required=True)
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(Path(args.processing_root), args.source), ensure_ascii=False))
