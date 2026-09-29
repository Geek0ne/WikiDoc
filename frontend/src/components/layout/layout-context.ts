/** AppLayout 通过 Outlet context 向子页面暴露的能力 */
export interface OutletContext {
  /** 新建/删除空间后刷新侧栏列表 */
  reloadSpaces: () => void | Promise<void>;
}
