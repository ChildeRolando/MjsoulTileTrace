import {
  createManagedMortalRuntimeFromAssets,
  type ManagedMortalRuntime,
  type ManagedMortalAssetOptions,
} from "@riichi-coach/mortal-runtime";

/** Electron-main-only composition. Renderer/preload never receive paths,
 * handles or an executable capability. CLI acceptance uses the same privileged
 * asset verifier through the runtime package public entry point.
 */
export type LocalMortalRuntimeServiceOptions = ManagedMortalAssetOptions;

export async function createLocalMortalRuntimeService(
  options: LocalMortalRuntimeServiceOptions,
): Promise<ManagedMortalRuntime> {
  return createManagedMortalRuntimeFromAssets(options);
}
