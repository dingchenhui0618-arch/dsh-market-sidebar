/* dsh-market-sidebar client bundle —— 手写，无打包器
 *
 * 加载协议：执行时调用 window.__ModuleLoader__.load({ id, factory })，
 * id 必须精确等于 package.json 的 name。factory 是懒 CJS 形态：
 * 只能用 module.exports，React 必须 React.createElement。
 *
 * 本插件只做两件事，都建立在 DSH 自己的 slot 契约上：
 *
 *   1. `sidebar.panellist` 注册一个 id 为 `market` 的入口，order = -10，
 *      于是它落在内置「插件」（order 0）之前，也就是「新会话」按钮正下方；
 *   2. `main` 注册同名 key，渲染 dshmarket 交出来的那块面板。
 *
 * 为什么不自己画一遍市场：dshmarket 的 UPDATE-API-V1.md 明确把
 * `render()` / `setSettingsVisible()` 作为「宿主把市场放进自己容器」的公开
 * 契约发布（对应其源码里的 #602）。自己重画必然与其目录数据、评论、安装
 * 流程漂移，所以这里只做搬运。
 *
 * 客户端服务 `market` 用 ctx.get 惰性取：装载顺序无关，dshmarket 没装或
 * 被禁用时这里退化成一句提示，而不是让整个侧边栏炸掉。
 */
window.__ModuleLoader__.load({
  id: 'dsh-market-sidebar',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var NS = 'dsh-market-sidebar'

    /** 侧边栏入口 id。它同时是 sidebar.panellist 的 id 和 main 面板的 key ——
     * 「每个 list id 对应同名 main 面板」正是 sidebar.panellist 的契约。 */
    var PANEL_ID = 'market'

    /** 排序位置。内置「插件」是 order 0、「任务监控」是 order 60；
     * 取负数即排在最前，也就是「新会话」按钮下方第一项。 */
    var ORDER = -10

    /** 设置对话框里那条同名的「插件市场」入口要不要让位。
     *
     * dshmarket 为「宿主已经自己渲染市场」的场面提供了 setSettingsVisible(false)
     * （其源码 #602），理由是同一个面板不该在两个导航里各出现一次。
     * 默认 false = 保持原样、纯增量，不动你已有的入口；改成 true 即可让它让位
     * （改完刷新页面生效）。 */
    var HIDE_SETTINGS_SECTION = false

    var ZH = { nav: '插件市场', unavailable: '插件市场暂时不可用：dshmarket 客户端未加载。' }
    var EN = { nav: 'Plugin Market', unavailable: 'Plugin market unavailable: the dshmarket client half is not loaded.' }

    var CSS = [
      '.dmsb-main{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0}',
      '.dmsb-wait{display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.6}',
    ].join('\n')

    /* dshmarket 的品牌标：8 格网格 + 斜插进来的那一块。几何逐字取自它的
     * market-mark.ts（MARK_GRID_BLOCKS / MARK_PLUG_BLOCK），这样侧边栏图标
     * 与设置里那一条不会长得不一样。 */
    var BLOCK = 3.3
    var RADIUS = 0.53
    var GRID = [
      [1.96, 3.36], [5.71, 3.36],
      [1.96, 7.11], [5.71, 7.11], [9.46, 7.11],
      [1.96, 10.86], [5.71, 10.86], [9.46, 10.86],
    ]

    function Icon(props) {
      var size = props && typeof props.size === 'number' ? props.size : 18
      var fill = props && props.active ? 'var(--dsw-alias-brand-primary)' : 'currentColor'
      var cells = GRID.map(function (point, index) {
        return React.createElement('rect', {
          key: 'g' + index,
          x: point[0], y: point[1],
          width: BLOCK, height: BLOCK, rx: RADIUS,
        })
      })
      cells.push(React.createElement('rect', {
        key: 'plug',
        x: 10.74, y: 2.09,
        width: BLOCK, height: BLOCK, rx: RADIUS,
        transform: 'rotate(9 12.39 3.74)',
      }))
      return React.createElement('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true',
      }, React.createElement('g', { fill: fill }, cells))
    }

    /** 读客户端 `market` 服务。取不到就返回 undefined —— 不抛。 */
    function readMarket(ctx) {
      try {
        if (ctx && typeof ctx.get === 'function') return ctx.get('market')
        if (ctx && ctx.reflect && typeof ctx.reflect.get === 'function') return ctx.reflect.get('market')
      } catch (error) {
        console.warn('[dsh-market-sidebar] 读取 market 服务失败：' + String((error && error.message) || error))
      }
      return undefined
    }

    function makePanel(ctx, t) {
      return function MarketPanel() {
        var market = readMarket(ctx)
        if (!market || typeof market.render !== 'function') {
          return React.createElement('div', { className: 'dmsb-wait' }, t('unavailable'))
        }
        /* market.render() 给的是 dshmarket 自己 bundle 里的 React element，
         * 与这里共用宿主的 module table，因此可以安全地当作子节点挂载。 */
        return React.createElement('div', { className: 'dmsb-main' }, market.render())
      }
    }

    function apply(ctx) {
      var t = function (key) { return ZH[key] || key }
      try {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: ZH, en: EN })
        }, 'dsh-market-sidebar: dictionaries')
        t = ctx.locale.bind(NS)
      } catch (error) {
        console.warn('[dsh-market-sidebar] 字典注册失败，改用中文字面量：' + String((error && error.message) || error))
      }

      ctx.effect(function () {
        var el = document.createElement('style')
        el.setAttribute('data-dsh-market-sidebar', '')
        el.textContent = CSS
        document.head.appendChild(el)
        return function () { el.remove() }
      }, 'dsh-market-sidebar: styles')

      var slots = ctx.slots
      slots.inject('sidebar.panellist', function () {
        return slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: ORDER, label: function () { return t('nav') } },
          Icon)
      })
      slots.inject('main', function () {
        return slots.register({ name: 'main', key: PANEL_ID }, makePanel(ctx, t))
      })

      if (HIDE_SETTINGS_SECTION && typeof ctx.inject === 'function') {
        /* 按服务动态注入，与 dshmarket 的装载顺序无关。 */
        ctx.inject(['market'], function (scoped) {
          var market = scoped.market
          if (market && typeof market.setSettingsVisible === 'function') {
            try {
              market.setSettingsVisible(false)
            } catch (error) {
              console.warn('[dsh-market-sidebar] 收回设置入口失败：' + String((error && error.message) || error))
            }
          }
        })
      }
    }

    module.exports = { name: 'dsh-market-sidebar', inject: ['slots', 'locale'], apply: apply }
    return module.exports
  },
})
