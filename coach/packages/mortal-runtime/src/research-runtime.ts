import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  LabConstructRequestSchema,
  LabConstructResultSchema,
  libriichiRuleCanonicalJson,
  type LabConstructRequest,
  type LabConstructResult,
  type LibriichiRuleIdentity,
} from "@riichi-coach/contracts";

/** Privileged constructor owner. Serialized bounded JSONL; no model loading. */
export class ManagedResearchRuntime {
  #child: ChildProcessWithoutNullStreams | null = null;
  #tail: Promise<unknown> = Promise.resolve();
  #pending: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  } | null = null;
  #closed = false;
  readonly identity;
  private constructor(
    private readonly options: {
      python: string;
      worker: string;
      nativeModule: string;
      timeoutMs: number;
    },
    native: LibriichiRuleIdentity,
    workerSha256: string,
  ) {
    this.identity = {
      protocolVersion: "riichi-lab-construct/v1" as const,
      native,
      workerSha256,
    };
  }
  static async create(options: {
    python: string;
    packageRoot: string;
    nativeModule: string;
    native: LibriichiRuleIdentity;
    timeoutMs?: number;
  }) {
    const worker = resolve(options.packageRoot, "runtime/research_worker.py");
    const hash = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");
    const manifest = JSON.parse(
      await readFile(
        resolve(options.packageRoot, "manifests/question-lab.json"),
        "utf8",
      ),
    ) as { workerSha256: string };
    const workerSha256 = hash(await readFile(worker));
    if (
      manifest.workerSha256 !== workerSha256 ||
      hash(
        await readFile(
          resolve(options.packageRoot, "runtime/local_mortal_runtime.py"),
        ),
      ) !== options.native.wrapperSha256 ||
      hash(await readFile(options.nativeModule)) !==
        options.native.nativeArtifactSha256
    )
      throw new Error("construction_identity_mismatch");
    return new ManagedResearchRuntime(
      {
        python: options.python,
        worker,
        nativeModule: options.nativeModule,
        timeoutMs: options.timeoutMs ?? 30000,
      },
      options.native,
      workerSha256,
    );
  }
  construct(raw: LabConstructRequest): Promise<LabConstructResult> {
    const request = LabConstructRequestSchema.parse(raw);
    const run = this.#tail.then(async () => {
      if (this.#closed) throw new Error("construction_runtime_closed");
      if (
        libriichiRuleCanonicalJson(request.identity) !==
        libriichiRuleCanonicalJson(this.identity)
      )
        throw new Error("construction_identity_mismatch");
      if (!this.#child) this.#start();
      const line = await new Promise<string>((resolveLine, reject) => {
        const timer = setTimeout(() => {
          this.close();
          reject(new Error("construction_timeout"));
        }, this.options.timeoutMs);
        this.#pending = {
          resolve: (value) => {
            clearTimeout(timer);
            resolveLine(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        this.#child!.stdin.write(
          libriichiRuleCanonicalJson(request) + "\n",
          (error) => {
            if (error)
              this.#pending?.reject(new Error("construction_transport_failed"));
          },
        );
      });
      const result = LabConstructResultSchema.parse(JSON.parse(line));
      if (
        result.requestId !== request.requestId ||
        (result.status === "ok" &&
          libriichiRuleCanonicalJson(result.identity) !==
            libriichiRuleCanonicalJson(this.identity))
      )
        throw new Error("construction_result_mismatch");
      return result;
    });
    this.#tail = run.catch(() => undefined);
    return run;
  }
  #start() {
    const child = spawn(
      this.options.python,
      ["-u", this.options.worker, "--native-module", this.options.nativeModule],
      {
        stdio: "pipe",
        windowsHide: true,
        cwd: dirname(this.options.worker),
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    );
    this.#child = child;
    let bytes = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) this.close();
    });
    createInterface({ input: child.stdout }).on("line", (line) => {
      bytes = 0;
      const pending = this.#pending;
      this.#pending = null;
      if (!pending) {
        this.close();
        return;
      }
      pending.resolve(line);
    });
    child.stderr.resume();
    child.once("error", () => this.close());
    child.once("exit", () => this.close());
  }
  close() {
    this.#closed = true;
    this.#pending?.reject(new Error("construction_runtime_unavailable"));
    this.#pending = null;
    this.#child?.kill();
    this.#child = null;
  }
}
