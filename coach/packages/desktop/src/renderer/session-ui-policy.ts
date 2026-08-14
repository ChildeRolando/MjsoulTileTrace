import type { MahjongSoulSessionStatus } from "@riichi-coach/contracts";

export function sessionUiPolicy(
  status: MahjongSoulSessionStatus["status"],
  productionLobbyRestoreAvailable = false,
): Readonly<{
  showCatalog: boolean;
  showPaipuImport: boolean;
  allowSync: boolean;
  catalogNotice: string | null;
}> {
  const showCatalog = status === "valid" || status === "offline_unverified";
  // H2 assumes an already-connected official-client session for URL import:
  // the capture window rides the app's persistent authenticated partition,
  // and an unauthenticated window simply fails visibly as no capture.
  return Object.freeze({
    showCatalog,
    showPaipuImport: showCatalog,
    allowSync: status === "valid" && productionLobbyRestoreAvailable,
    catalogNotice: status === "offline_unverified"
      ? "当前离线，仅显示上次缓存；恢复联网后可重新同步。"
      : null,
  });
}
