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
    def amazon_tracking_pixel(url, attrs):
        parts = urlsplit(url)
        return (parts.hostname == "www.assoc-amazon.jp" and parts.path == "/e/ir"
                and str(attrs.get("width", "")) == "1" and str(attrs.get("height", "")) == "1"
                and attrs.get("alt", "") == "")
    check(all(x.get("reason") == "explicit-book-navigation-image" or
              (x.get("reason") == "explicit-amazon-affiliate-tracking-pixel-1x1-empty-alt"
               and x.get("sourceUrls") and all(amazon_tracking_pixel(u, x.get("attrs", {})) for u in x["sourceUrls"]))
              for x in ignored), "unresolved_ignored_image")
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
                if urls and all(amazon_tracking_pixel(u, item.attrs) for u in urls):
                    check(any(x.get("reason") == "explicit-amazon-affiliate-tracking-pixel-1x1-empty-alt"
                              and set(urls) & set(x.get("sourceUrls", [])) for x in ignored), "unrecorded_tracking_pixel")
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
    table_geometry = None
    raw_tables, tables = captured_main.find_all("table"), source.get("tables", [])
    if raw_tables or tables:
        check(len(raw_tables) == len(tables), "html_table_geometry_coverage")
        cells_checked, empty_checked = 0, 0
        for node, table in zip(raw_tables, tables):
            table_id = table["tableId"]
            table_blocks = [b for b in blocks if (b.get("tableContext") or {}).get("tableId") == table_id]
            check(table.get("sourceBlockIds") == [b["id"] for b in table_blocks], "table_block_coverage:" + table_id)
            check(table.get("rawText") == node.get_text(), "table_raw_text:" + table_id)
            captions = node.find_all("caption", recursive=False)
            check(len(captions) == len(table.get("captions", [])), "table_caption_count:" + table_id)
            for caption, declared in zip(captions, table.get("captions", [])):
                caption_blocks = [b for b in table_blocks if b["tableContext"].get("role") == "caption"]
                check(declared["rawText"] == caption.get_text() and declared["sourceBlockIds"] == [b["id"] for b in caption_blocks], "table_caption_binding:" + table_id)
            rows = [r for r in node.find_all("tr") if r.find_parent("table") is node]
            check(len(rows) == len(table["rows"]), "table_row_count:" + table_id)
            for row_index, (row, declared_row) in enumerate(zip(rows, table["rows"])):
                cells = row.find_all(["td", "th"], recursive=False)
                check(declared_row["row"] == row_index and len(cells) == len(declared_row["cells"]), "table_cell_count:" + table_id)
                for column, (cell, declared) in enumerate(zip(cells, declared_row["cells"])):
                    cells_checked += 1
                    cell_blocks = [b for b in table_blocks if b["tableContext"].get("row") == row_index and b["tableContext"].get("column") == column]
                    empty = not compact(cell.get_text()) and cell.find("img") is None
                    empty_checked += int(empty)
                    check(declared["row"] == row_index and declared["column"] == column and declared["tag"] == cell.name
                          and declared["header"] == (cell.name == "th") and declared["rowspan"] == str(cell.get("rowspan", "1"))
                          and declared["colspan"] == str(cell.get("colspan", "1")) and declared["rawText"] == cell.get_text()
                          and declared["empty"] == empty and declared["sourceBlockIds"] == [b["id"] for b in cell_blocks], "table_cell_geometry:" + table_id)
                    check(compact(cell.get_text()) == compact("".join(b.get("text", "") for b in cell_blocks)), "table_cell_text:" + table_id)
                    actual_images = cell.find_all("img")
                    declared_images = [i for b in cell_blocks for i in b.get("images", [])]
                    check(len(actual_images) == len(declared_images) and all(set(image_urls(a)) & set(d["sourceUrls"]) for a, d in zip(actual_images, declared_images)), "table_cell_images:" + table_id)
        table_geometry = {"tables": len(tables), "cells": cells_checked, "emptyCells": empty_checked,
                          "method": "independent raw DOM captions, physical cells, exact whitespace and span attributes"}
    result = {"schema": "coach-textbook-web-independent-source-check/1", "passed": not errors, "errors": errors,
            "sourceFileSha256": digest(source_bytes), "rawHtmlSha256": digest(raw), "mainSha256": digest(main_bytes),
            "textBlocks": sum(b["type"] == "text" for b in blocks), "imageRuns": sum(b["type"] == "image-run" for b in blocks),
            "imageOccurrences": len(occurrences), "uniqueAssets": len(assets), "method": "offline independent html.parser character-and-image DOM event comparison", "modelCalls": 0}
    if table_geometry is not None:
        result["tableGeometry"] = table_geometry
    if effective_encoding != declared_encoding:
        result["decoderEvidence"] = {"declaredEncoding": declared_encoding, "effectiveEncoding": effective_encoding,
                                     "reason": "Strict Shift_JIS rejects Windows extension bytes; strict CP932 succeeds, without replacement characters."}
    return result


def inspect_definition_sidecar(processing, source_path, candidate_path, sidecar_path):
    from PIL import Image
    processing = processing.resolve()
    def read_path(value):
        path = (processing / value).resolve()
        assert path.is_relative_to(processing), "definition_path_outside_root"
        return path
    source = json.loads(Path(source_path).read_text(encoding="utf-8"))
    candidate = json.loads(Path(candidate_path).read_text(encoding="utf-8"))
    sidecar = json.loads(Path(sidecar_path).read_text(encoding="utf-8"))
    main = BeautifulSoup(read_path("web-sources/v1/" + source["main"]["path"]).read_text(encoding="utf-8"), "html.parser").find()
    def boundary(item):
        unit = item.find_parent(["dt", "dd"])
        if unit is None:
            return None
        parts = []
        while unit is not main:
            assert isinstance(unit, Tag), "definition_boundary_outside_main"
            index = 1 + sum(isinstance(s, Tag) and s.name == unit.name for s in unit.previous_siblings)
            parts.append(unit.name + "[" + str(index) + "]")
            unit = unit.parent
        return "main/" + "/".join(reversed(parts))
    occurrences = [i for b in source["blocks"] for i in b.get("images", [])]
    stream, image_index = [], 0
    for node in main.descendants:
        if isinstance(node, Comment) or any(p.name in ("script", "style", "noscript", "iframe", "object") for p in node.parents if isinstance(p, Tag)):
            continue
        if isinstance(node, NavigableString):
            stream.extend(("text", c, boundary(node)) for c in str(node) if not c.isspace())
        elif isinstance(node, Tag) and node.name == "img":
            url = urljoin(source["url"], node.get("src", ""))
            if re.search(r"/(back|home|next)\.gif$", urlsplit(url).path):
                continue
            if urlsplit(url).hostname == "www.assoc-amazon.jp" and urlsplit(url).path == "/e/ir" and node.get("width") == "1" and node.get("height") == "1" and node.get("alt", "") == "":
                continue
            assert image_index < len(occurrences) and url in occurrences[image_index]["sourceUrls"], "definition_image_order"
            stream.append(("image", occurrences[image_index]["occurrenceId"], boundary(node)))
            image_index += 1
    assert image_index == len(occurrences), "definition_image_coverage"
    assert sidecar["schema"] == "coach-textbook-definition-boundary-sidecar/1" and not sidecar.get("heldTextBlocks"), "definition_text_still_held"
    assert [b["sourceBlockId"] for b in sidecar["blocks"]] == [b["id"] for b in source["blocks"]], "definition_all_blocks_once"
    assets = {a["assetId"]: a for a in source["assets"]}
    def labels(tile):
        code = "牌背（未知牌面）" if tile["code"] == "back" else (tile["code"].replace("5", "0", 1) if tile["red"] else tile["code"])
        return code + {"upright": "", "sideways": "（横置）", "sideways-left": "（横向左）", "sideways-right": "（横向右）"}[tile["orientation"]]
    def mark_chars(segments):
        return [(c, s.get("marks", []), s.get("href")) for s in segments for c in s["text"]]
    cursor, text_count, group_count, pixel_count, split_rows = 0, 0, 0, 0, []
    for source_block, row in zip(source["blocks"], sidecar["blocks"]):
        assert row["type"] == source_block["type"] and row["originalParagraphId"] == source_block["paragraphId"], "definition_block_identity"
        expected = [("text", c) for c in compact(source_block["text"])] if source_block["type"] == "text" else [("image", i["occurrenceId"]) for i in source_block["images"]]
        tokens = stream[cursor:cursor + len(expected)]
        assert [(kind, value) for kind, value, _ in tokens] == expected, "definition_full_character_occurrence_order"
        cursor += len(expected)
        partitions = []
        for _, value, dom in tokens:
            if not partitions or partitions[-1]["domBoundary"] != dom:
                partitions.append({"domBoundary": dom, "values": []})
            partitions[-1]["values"].append(value)
        target = next(b for b in candidate["body"]["blocks"] if b["sourceBlockIds"] == [source_block["id"]])
        if source_block["type"] == "text":
            text_count += 1
            if len(partitions) <= 1:
                dom = partitions[0]["domBoundary"] if partitions else None
                assert row.get("domBoundary") == dom and row.get("definitionUnitId") == (source["articleId"] + ":" + dom if dom else None) and not row.get("groups"), "definition_text_unit"
            else:
                groups = row.get("groups", [])
                assert len(groups) == len(partitions), "definition_cross_text_without_accepted_parts"
                assert "".join(g["sourceText"] for g in groups) == source_block["text"] and "".join(g["translatedText"] for g in groups) == target["text"], "definition_text_parts_not_exact"
                assert mark_chars([s for g in groups for s in g["sourceSegments"]]) == mark_chars(source_block["segments"]), "definition_text_marks_changed"
                for group, part in zip(groups, partitions):
                    dom = part["domBoundary"]
                    assert group["domBoundary"] == dom and group["definitionUnitId"] == source["articleId"] + ":" + dom and compact(group["sourceText"]) == "".join(part["values"]), "definition_text_boundary_mismatch"
                split_rows.append({"sourceBlockId": source_block["id"], "groups": groups})
            continue
        figure = next(f for f in candidate["figures"] if f["figureId"] == target["figureId"])
        assert len(row["groups"]) == len(partitions), "definition_image_group_count"
        for group, part in zip(row["groups"], partitions):
            group_count += 1
            dom, ids = part["domBoundary"], part["values"]
            assert group["domBoundary"] == dom and group["definitionUnitId"] == (source["articleId"] + ":" + dom if dom else None) and group["sourceOccurrenceIds"] == ids, "definition_image_unit"
            images = [next(i for i in source_block["images"] if i["occurrenceId"] == occurrence_id) for occurrence_id in ids]
            bindings = [{"assetId": i["assetId"], "path": "web-sources/v1/" + assets[i["assetId"]]["path"], "sha256": assets[i["assetId"]]["sha256"], "url": assets[i["assetId"]]["url"]} for i in images]
            tiles = [next(t for t in figure["tiles"] if t["occurrenceId"] == occurrence_id) for occurrence_id in ids]
            assert group["sourceAssetBindings"] == bindings and group["tiles"] == tiles and group["transcription"] == " ".join(labels(t) for t in tiles), "definition_codes_or_asset_order_changed"
            originals = []
            for binding in bindings:
                path = read_path(binding["path"])
                assert digest(path.read_bytes()) == binding["sha256"], "definition_original_asset_changed"
                image = Image.open(path)
                assert getattr(image, "n_frames", 1) == 1, "definition_animated_original"
                originals.append(image.convert("RGBA"))
            expected_image = Image.new("RGBA", (sum(i.width for i in originals), max(i.height for i in originals)), (0, 0, 0, 0))
            x = 0
            for image in originals:
                expected_image.paste(image, (x, expected_image.height - image.height))
                x += image.width
            display = group["presentationAsset"]
            path = read_path(display["path"])
            assert digest(path.read_bytes()) == display["sha256"], "definition_group_png_changed"
            actual = Image.open(path)
            assert getattr(actual, "n_frames", 1) == 1 and actual.size == expected_image.size and actual.size == (display["width"], display["height"]) and actual.convert("RGBA").tobytes() == expected_image.tobytes(), "definition_group_pixels_not_original_order"
            assert display["derivation"]["sourceAssetBindings"] == bindings and (display["derivation"]["alignment"] == "bottom" or (len(bindings) == 1 and display["derivation"]["alignment"] == "original-size")), "definition_group_derivation_binding"
            pixel_count += expected_image.width * expected_image.height
    assert cursor == len(stream), "definition_unmapped_main_content"
    return {"passed": True, "checks": {"sourceBlocks": len(source["blocks"]), "textBlocks": text_count, "imageOccurrences": len(occurrences), "imageGroups": group_count, "rgbaPixelsCompared": pixel_count, "fullCharacterAndOccurrenceOrder": True, "completeTextUnitBindings": True}, "textSplitRows": split_rows, "modelCalls": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--processing-root", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--definition-sidecar")
    parser.add_argument("--candidate")
    args = parser.parse_args()
    result = inspect_definition_sidecar(Path(args.processing_root), args.source, args.candidate, args.definition_sidecar) if args.definition_sidecar else inspect(Path(args.processing_root), args.source)
    print(json.dumps(result, ensure_ascii=False))
