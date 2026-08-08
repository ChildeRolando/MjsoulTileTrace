import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import readline, { type Interface as ReadlineInterface } from "node:readline";
import type { FactEngineTransport } from "./port.js";
import { PACKAGED_FACT_ENGINE_MANIFEST } from "./packaged-manifest.js";

interface PendingRequest {
  resolve(line: string): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export function resolveManagedFactEngineBinary(
  appResourcesDir: string,
): string {
  const resourcesRoot = path.resolve(appResourcesDir);
  const binary = path.resolve(
    resourcesRoot,
    "mahjong-facts",
    "windows-x64",
    "mahjong-facts.exe",
  );
  const relative = path.relative(resourcesRoot, binary);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("managed fact engine binary escaped app resources");
  }
  return binary;
}

export function verifyManagedFactEngineBinary(
  appResourcesDir: string,
): string {
  const binary = resolveManagedFactEngineBinary(appResourcesDir);
  const manifestPath = path.join(path.dirname(binary), "manifest.json");
  let packagedManifest: unknown;
  try {
    packagedManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    throw new Error("managed fact engine integrity check failed: manifest unavailable");
  }
  if (packagedManifest === null || typeof packagedManifest !== "object" ||
    Array.isArray(packagedManifest)) {
    throw new Error("managed fact engine integrity check failed: invalid manifest");
  }
  const actualManifest = packagedManifest as Record<string, unknown>;
  const expectedManifest = PACKAGED_FACT_ENGINE_MANIFEST as Record<string, unknown>;
  const actualKeys = Object.keys(actualManifest).sort();
  const expectedKeys = Object.keys(expectedManifest).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index] ||
      actualManifest[key] !== expectedManifest[key])
  ) {
    throw new Error("managed fact engine integrity check failed: manifest mismatch");
  }
  try {
    if (statSync(binary).size !== PACKAGED_FACT_ENGINE_MANIFEST.size) {
      throw new Error("size mismatch");
    }
    const digest = createHash("sha256")
      .update(readFileSync(binary))
      .digest("hex");
    if (digest !== PACKAGED_FACT_ENGINE_MANIFEST.sha256) {
      throw new Error("digest mismatch");
    }
  } catch {
    throw new Error("managed fact engine integrity check failed: binary mismatch");
  }
  return binary;
}

export class ManagedFactEngineTransport implements FactEngineTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private output: ReadlineInterface | null = null;
  private readonly pending: PendingRequest[] = [];
  private readonly stderrTail: string[] = [];
  private closed = false;

  constructor(private readonly appResourcesDir: string) {}

  private diagnosticSuffix(): string {
    if (this.stderrTail.length === 0) {
      return "";
    }
    return `; stderr: ${this.stderrTail.join(" | ")}`;
  }

  private rejectPending(error: Error): void {
    while (this.pending.length > 0) {
      const pending = this.pending.shift()!;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  private stopProcess(error: Error): void {
    const child = this.child;
    this.child = null;
    this.output?.close();
    this.output = null;
    this.rejectPending(error);
    if (child !== null) {
      child.removeAllListeners();
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.stdin.destroy();
      child.kill();
    }
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.closed) {
      throw new Error("managed fact engine transport is closed");
    }
    if (this.child !== null) {
      return this.child;
    }

    this.stderrTail.length = 0;
    const child = spawn(verifyManagedFactEngineBinary(this.appResourcesDir), [], {
      stdio: "pipe",
      windowsHide: true,
    });
    this.child = child;
    this.output = readline.createInterface({ input: child.stdout });
    this.output.on("line", (line) => {
      const pending = this.pending.shift();
      if (pending === undefined) {
        this.stopProcess(new Error("fact engine emitted an unexpected response"));
        return;
      }
      clearTimeout(pending.timer);
      pending.resolve(line);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) {
        this.stderrTail.push(line);
        if (this.stderrTail.length > 20) {
          this.stderrTail.shift();
        }
      }
    });
    child.once("error", (error) => {
      if (this.child === child) {
        this.stopProcess(new Error(
          `fact engine process error: ${error.message}${this.diagnosticSuffix()}`,
        ));
      }
    });
    child.once("exit", (code, signal) => {
      if (this.child === child) {
        this.stopProcess(new Error(
          `fact engine exited (code=${String(code)}, signal=${String(signal)})${this.diagnosticSuffix()}`,
        ));
      }
    });
    return child;
  }

  async request(line: string, timeoutMs: number): Promise<string> {
    if (line.includes("\n") || line.includes("\r")) {
      throw new Error("fact engine request must be one JSONL line");
    }
    const child = this.ensureProcess();
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stopProcess(new Error(
          `fact engine request timed out after ${timeoutMs}ms${this.diagnosticSuffix()}`,
        ));
      }, timeoutMs);
      this.pending.push({ resolve, reject, timer });
      child.stdin.write(`${line}\n`, "utf8", (error) => {
        if (error !== null && error !== undefined && this.child === child) {
          this.stopProcess(new Error(
            `fact engine request write failed: ${error.message}${this.diagnosticSuffix()}`,
          ));
        }
      });
    });
  }

  async restart(): Promise<void> {
    if (this.closed) {
      throw new Error("managed fact engine transport is closed");
    }
    this.stopProcess(new Error("fact engine restarted"));
    this.ensureProcess();
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopProcess(new Error("fact engine transport closed"));
  }
}
