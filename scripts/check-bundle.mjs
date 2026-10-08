/* dsh-market-sidebar —— 离线自检
 *
 * 在 Node 里伪造 `window.__ModuleLoader__` / `react` / slot 服务，把
 * lib/client.js 的 factory 真正跑一遍，确认：
 *
 *   - bundle id 与 package.json 的 name 完全一致（加载协议硬要求）；
 *   - 注册进 sidebar.panellist 的是 order < 0 的 `market` 条目（位置就是需求）；
 *   - main 注册了同一个 key，且面板在有 `market` 服务时确实把它渲染出来；
 *   - Host 半边是一个合法的空 cordis 插件。
 *
 * 目的是在接线进 profile 之前把「会让 clientModules 抛错」的形态问题挡掉：
 * 那个扫描在构造时同步执行，声明畸形会直接让 fiber 失败。
 *
 * 用法：node scripts/check-bundle.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

let failures = 0
function check(label, ok, detail) {
  if (ok) {
    console.log('  ok   ' + label)
  } else {
    failures += 1
    console.log('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  }
}

// —— package.json 的声明面 ——
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
console.log('package.json')
check('name 是 dsh-market-sidebar', pkg.name === 'dsh-market-sidebar', pkg.name)
check('dsh.bundle.patch 指向存在的文件',
  typeof pkg.dsh?.bundle?.patch === 'string' && existsSync(join(ROOT, pkg.dsh.bundle.patch)),
  String(pkg.dsh?.bundle?.patch))
check('dsh.client.platform 是 web', pkg.dsh?.client?.platform === 'web', String(pkg.dsh?.client?.platform))
check('exports["./client"] 指向存在的文件',
  typeof pkg.exports?.['./client'] === 'string' && existsSync(join(ROOT, pkg.exports['./client'])),
  String(pkg.exports?.['./client']))
check('main 指向存在的文件',
  typeof pkg.main === 'string' && existsSync(join(ROOT, pkg.main)),
  String(pkg.main))
check('没有声明 dsh.client.inject（不硬依赖 dshmarket，禁用市场时不该连带炸掉）',
  pkg.dsh?.client?.inject === undefined, JSON.stringify(pkg.dsh?.client?.inject))

// —— Host 半边 ——
console.log('lib/index.js（Host 半边）')
const host = await import(new URL('../lib/index.js', import.meta.url).href)
check('export name 正确', host.name === 'dsh-market-sidebar', String(host.name))
check('export apply 是函数', typeof host.apply === 'function', typeof host.apply)
let hostThrew = null
try {
  host.apply()
} catch (error) {
  hostThrew = error
}
check('空 apply() 不抛错', hostThrew === null, hostThrew && String(hostThrew.message))

// —— Client 半边：真正执行 bundle ——
console.log('lib/client.js（Client 半边）')
const clientPath = join(ROOT, pkg.exports['./client'])
const source = readFileSync(clientPath, 'utf8')

let loaded = null
/* 伪造的 document 必须放进 vm 沙箱：bundle 里的函数是在沙箱全局里创建的，
 * 作用域链指向沙箱，而不是 Node 的 globalThis。 */
const fakeDocument = {
  head: { appendChild() {} },
  createElement() { return { setAttribute() {}, remove() {}, textContent: '' } },
}
const sandbox = {
  window: { __ModuleLoader__: { load: spec => { loaded = spec } } },
  document: fakeDocument,
  console,
}
vm.createContext(sandbox)
vm.runInNewContext(source, sandbox, { filename: clientPath })

check('调用了 window.__ModuleLoader__.load', loaded !== null)
check('bundle id 等于 package.json 的 name', loaded?.id === pkg.name, String(loaded?.id))
check('factory 是函数', typeof loaded?.factory === 'function', typeof loaded?.factory)

// 极简 React：只需要 createElement 的形状能把子节点串起来即可。
const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat().filter(child => child !== null && child !== undefined) }
  },
}
const MARKET_ELEMENT = { type: 'MarketPanel', props: {}, children: [] }
const fakeMarket = { render: () => MARKET_ELEMENT }
const dictionaries = { nav: '插件市场', unavailable: 'unavailable' }
const registered = []
const shown = []

const ctx = {
  effect(callback) { const off = callback(); return typeof off === 'function' ? off : () => {} },
  on() { return () => {} },
  get(name) { return name === 'market' ? fakeMarket : undefined },
  inject(services, callback) { shown.push({ services, callback }) },
  locale: {
    register(ns, dicts) {
      if (ns !== 'dsh-market-sidebar') throw new Error('namespace 不符：' + ns)
      if (!dicts || !dicts.zh || !dicts.en) throw new Error('字典缺 zh/en')
      return () => {}
    },
    bind() { return key => dictionaries[key] || key },
  },
  slots: {
    inject(name, callback) { callback() },
    register(meta, component) {
      registered.push({ meta, component })
      return () => {}
    },
  },
}

const mod = loaded.factory(name => {
  if (name !== 'react') throw new Error('意外的 require：' + name)
  return React
})

check('factory 返回 name', mod?.name === 'dsh-market-sidebar', String(mod?.name))
check('inject 含 slots', Array.isArray(mod?.inject) && mod.inject.includes('slots'), JSON.stringify(mod?.inject))
check('apply 是函数', typeof mod?.apply === 'function', typeof mod?.apply)

let applyThrew = null
try {
  mod.apply(ctx)
} catch (error) {
  applyThrew = error
}
check('apply(ctx) 不抛错', applyThrew === null, applyThrew && String(applyThrew.message))

const entry = registered.find(item => item.meta?.name === 'sidebar.panellist')
const panel = registered.find(item => item.meta?.name === 'main')

check('注册了 sidebar.panellist', entry !== undefined)
check('侧边栏 id 是 market', entry?.meta?.id === 'market', String(entry?.meta?.id))
check('order < 0（排在「插件」order 0 之前）',
  typeof entry?.meta?.order === 'number' && entry.meta.order < 0, String(entry?.meta?.order))
check('label 是 thunk 且返回「插件市场」',
  typeof entry?.meta?.label === 'function' && entry.meta.label() === '插件市场', String(entry?.meta?.label?.()))
check('图标是组件', typeof entry?.component === 'function', typeof entry?.component)

let icon = null
let iconThrew = null
try {
  icon = entry.component({ size: 18, active: false })
} catch (error) {
  iconThrew = error
}
check('图标能渲染', iconThrew === null && icon?.type === 'svg', iconThrew && String(iconThrew.message))

check('注册了 main 面板', panel !== undefined)
check('main 的 key 与侧边栏 id 一致', panel?.meta?.key === 'market', String(panel?.meta?.key))

let rendered = null
let panelThrew = null
try {
  rendered = panel.component()
} catch (error) {
  panelThrew = error
}
check('面板能渲染且不抛错', panelThrew === null, panelThrew && String(panelThrew.message))
check('面板把 market.render() 的结果挂进了容器',
  rendered?.type === 'div' && rendered.children.length === 1 && rendered.children[0] === MARKET_ELEMENT,
  JSON.stringify(rendered?.children?.map(child => child && child.type)))

// 取不到 market 服务时应退化成提示，而不是白屏或抛错。
const ctxNoMarket = Object.assign({}, ctx, { get: () => undefined })
mod.apply(ctxNoMarket)
const panelNoMarket = registered.filter(item => item.meta?.name === 'main').pop()
let fallback = null
let fallbackThrew = null
try {
  fallback = panelNoMarket.component()
} catch (error) {
  fallbackThrew = error
}
check('市场缺席时退化为提示而不是抛错',
  fallbackThrew === null && fallback?.children?.[0] === dictionaries.unavailable,
  fallbackThrew ? String(fallbackThrew.message) : JSON.stringify(fallback?.children))

console.log('')
if (failures > 0) {
  console.log('结果：' + failures + ' 项失败')
  process.exit(1)
}
console.log('结果：全部通过')
