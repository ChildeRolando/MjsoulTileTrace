import { createHash } from "node:crypto";
import { closeSync, openSync, writeSync } from "node:fs";
import { writeCanonicalJson } from "@riichi-coach/reasoning";

/** Export an already validated artifact without V8's whole-string limit.
 * The sink buffers bytes, so a multibyte tile label crossing a flush is intact.
 * Exclusive creation preserves historical evidence; an interrupted file is
 * never returned as a completed artifact receipt.
 */
export function writeSpikeArtifact(path, value) {
  const fd = openSync(path, "wx");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const hash = createHash("sha256");
  let used = 0;
  let byteLength = 0;
  const flush = () => {
    const chunk = buffer.subarray(0, used);
    let offset = 0;
    while (offset < chunk.length) {
      const count = writeSync(fd, chunk, offset, chunk.length - offset);
      if (count === 0) throw new Error("artifact_write_incomplete");
      offset += count;
    }
    hash.update(chunk);
    byteLength += used;
    used = 0;
  };
  try {
    writeCanonicalJson(value, part => {
      const bytes = Buffer.from(part, "utf8");
      let offset = 0;
      while (offset < bytes.length) {
        const count = Math.min(buffer.length - used, bytes.length - offset);
        bytes.copy(buffer, used, offset, offset + count);
        used += count;
        offset += count;
        if (used === buffer.length) flush();
      }
    });
    if (used > 0) flush();
    return { byteLength, sha256: hash.digest("hex") };
  } finally {
    closeSync(fd);
  }
}
