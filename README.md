# dsh-market-sidebar

把 [dshmarket](https://github.com/dsh-market/dsh-market) 插件市场搬到 DSH **侧边栏**，作为一个正式面板 ——
位置就在「新会话」按钮正下方、内置「插件」之上。

```
┌────────────────────┐
│  ⊕  新会话          │
│  ▦  插件市场        │  ← 本插件加的
│  ✥  插件            │
│  ∿  任务监控        │
└────────────────────┘
```

## 为什么不自己画一个市场

dshmarket 把「宿主把市场放进自己的容器」这件事作为公开契约发布了
（其 `UPDATE-API-V1.md`「Rendering the market's panel elsewhere」一节，对应源码里的 #602）：

```ts
const market = ctx.reflect.get('market')
const element = market.render({ preferredSubsectionId: 'installed' })
```

它交出来的是**同一个面板**：同一份目录数据、同一份评论、同一套安装与更新流程。
自己重画一遍必然与之漂移，所以本插件只做搬运，**不含任何市场逻辑**。

## 它做了什么

全部代码在 `lib/client.js`（宿主半边 `lib/index.js` 是空操作）：

1. 往 `sidebar.panellist` 注册 `{ id: 'market', order: -10, label: '插件市场' }`
   —— `order` 负数即排在内置「插件」（order 0）之前；图标复用 dshmarket 自己的品牌标几何
   （`market-mark.ts`），与设置里那条不会长得不一样。
2. 往 `main` 注册同一个 key `market`，渲染 `ctx.get('market').render()`。

`market` 服务是**惰性读取**的：
- 不写 `dsh.client.inject`，不硬依赖 dshmarket —— 市场被禁用时这里只退化成一个侧边栏项 + 一句提示，
  不会让整个客户端装配失败；
- 与 dshmarket 的装载顺序无关。

## 可选：让设置里那条同名入口让位

装好之后市场会有两个入口：侧边栏这个，以及「设置 → 插件市场」。后者是 dshmarket 自己注册的
`settings.section`。dshmarket 的建议是宿主自己渲染时把那条收起来（`setSettingsVisible(false)`，其 #602），
本插件默认**不动它**（纯增量）。

想让它让位，把 `lib/client.js` 里的

```js
var HIDE_SETTINGS_SECTION = false
```

改成 `true`，刷新页面即可。

## 安装（本机 profile）

走标准的 bundle 安装路径（和 dshmarket、dsh-taskwatch 一致），**不需要重启** ——
profile 的 loader 会重组，客户端图随之增量更新（约 1 秒）：

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"

# 1) 让 profile 能解析到这个包
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-market-sidebar" -Target 'D:\Projects\dsh-market-sidebar'
```

接着在 `$profile\package.json` 里加两处：

```jsonc
{
  "dependencies": {
    "dsh-market-sidebar": "link:D:/Projects/dsh-market-sidebar"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dshmarket",
        "dsh-market-sidebar"   // ← 加在 dshmarket 之后
      ]
    }
  }
}
```

写在 `bundles` 里而不是手写 `cordis.patch.yml` 的 `insert` 行，理由是：
本包自己的 `cordis.patch.yml` 就是那把插入语句，两处都写会出现重复 id；
而进了 `bundles` 才算「已安装的 bundle」——市场和「插件」页才管得到它
（`plugin_manager` 里能看到 `installed: true`）。

卸载：从 `bundles` 和 `dependencies` 里删掉，再删掉那个 junction。市场本身不受影响。

> 已验证的现场（2026-10-08，desktop profile）：加进 `bundles` 后约 1 秒侧边栏即出现该项，
> `sidebar.panellist` 占位顺序为 `market(-10)` → `plugins(0)` → `taskwatch(60)`，
> 点击后面板渲染的是 dshmarket v1.66.11 的真实市场界面。

## 自检

```bash
node scripts/check-bundle.mjs
```

在 Node 里伪造 `window.__ModuleLoader__` / react / slot 服务，把 bundle 真正跑一遍，覆盖：
bundle id 与包名一致、注册的是 `order < 0` 的 `market` 条目、`main` key 与侧边栏 id 一致、
面板确实把 `render()` 的结果挂进容器、市场缺席时退化为提示而不是抛错。

## 协议要求

- DSH Web ≥ 0.1.0-rc.6（`sidebar.panellist` / `main` slot、client bundle 加载协议）
- 已安装 dshmarket（本插件不自带市场）

## License

MIT
