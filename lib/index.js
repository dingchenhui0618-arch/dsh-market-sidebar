/**
 * dsh-market-sidebar —— Host 半边
 *
 * 全部行为都在浏览器里，Host 侧没有可做的事：
 * 本插件不注册路由、不读文件、不持有状态，只是给 profile 提供一个
 * 能被 `dsh.client` 扫描到的包（clientModules 按载入的条目读 `dsh.client`，
 * 再据此把 lib/client.js 作为 `/plugins` 资源发给页面）。
 *
 * 因此这里刻意保持成一个合法的空 cordis 插件：Host 半边一旦抛错，
 * 整个 DSH 进程会退出（启动全有全无），而它对功能没有任何贡献。
 */

export const name = 'dsh-market-sidebar'

/** 不做任何事。存在本身就是本插件 Host 半边的作用。 */
export function apply() {}
