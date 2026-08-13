import type { MahjongSoulSessionStatus } from "@riichi-coach/contracts";

export function sessionUiPolicy(
  status: MahjongSoulSessionStatus["status"],
  productionLobbyRestoreAvailable = false,
): Readonly<{
  showCatalog: boolean;
  allowSync: boolean;
  catalogNotice: string | null;
}> {
  const showCatalog = status === "valid" || status === "offline_unverified";
  return Object.freeze({
    showCatalog,
    allowSync: status === "valid" && productionLobbyRestoreAvailable,
    catalogNotice: status === "offline_unverified"
      ? "当前离线，仅显示上次缓存；恢复联网后可重新同步。"
      : null,
  });
}
