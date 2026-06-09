# Yoda 顶级 Tabs Phase 2 设计稿 — task 工作台 tab 提层

- 日期：2026-06-10
- 版本：v0.1（讨论稿）
- 前置：Phase 1 已落地（AppTabsStore + titlebar 内常驻 strip + `file` 视图 + project-view workspace）

---

## 1. 目标与非目标

**目标**

1. 消灭 task 视图内部的第二行 tab strip（`TaskTabStrip`）——所有 tab 只存在于顶部唯一一行
2. 用户期望的顶级 tab 序列成立：`[任务 Overview] [session A] [session B] [文件 x] …`
3. 保留 task 工作台的全部能力：split 侧栏、拖出独立窗口、归档联动、快捷键

**非目标（明确不做）**

- 不重做 task 视图内部布局（sidebar 文件树、bottom terminal、右侧 side pane 不动）
- 不做跨窗口 tab 拖拽合并（dock 机制后移）
- 不做 per-tab 前进后退历史

---

## 2. 现状：两层 tab 模型

```
顶级 AppTabsStore（Phase 1）          task 内部 TabManagerStore（838 行）
┌─────────────────────────┐          ┌──────────────────────────────────┐
│ tab = {viewId, params}  │          │ tabOrder + activeTabId（所有权）   │
│ home/project/task/file  │── 指向 ──→│ overview/conversation/file/diff   │
└─────────────────────────┘          │ + sidePaneTab + detach + 快捷键   │
                                     └──────────────────────────────────┘
```

问题：`{viewId:'task'}` 的顶级 tab 只指到 task 这一层，task 内部还有一套独立的顺序/激活/持久化，于是出现第二行。

## 3. 核心洞察：TaskWindowTabTarget 就是提层的钥匙

`src/shared/task-window.ts` 已定义 `TaskWindowTabTarget`——task 内单个 tab 的**可序列化描述**：

```ts
{ kind: 'overview' }
{ kind: 'conversation', conversationId }
{ kind: 'file', path }
{ kind: 'diff', path, diffGroup, refs, pr… }
```

detach 窗口已经在用它：把一个内部 tab 变成独立窗口的 URL 参数，窗口冷启动后通过 `openProvisionedTaskTab()` 还原。

**Phase 2 = 把"每个内部 tab 是一个潜在的独立窗口"推广为"每个内部 tab 是一个常驻的顶级 tab"。**

顶级 route 扩展（唯一的 schema 变化）：

```ts
// AppTabEntry.params for viewId 'task'
{ projectId, taskId, tab: TaskWindowTabTarget }   // tab 缺省 = { kind:'overview' }
```

顶级 tab、detach 窗口、深链（yoda://）三者从此同构——一个 target，三种宿主。

## 4. 设计决策

### D1 所有权翻转：顺序与激活归顶级，实体状态留在 task

- `AppTabsStore` 拥有：tab 顺序、激活、关闭、去重、持久化
- `TabManagerStore` 降级为 **实体宿主**：持有 `FileTabStore` / conversation entries / renderer 状态，
  不再拥有 `tabOrder`/`activeTabId` 的语义所有权
- task 视图变为**受控组件**：监听 `params.tab`，反应式调用
  `openProvisionedTaskTab(provisioned, params.tab)`（现有函数，零新逻辑）来对齐内部状态
- `TaskTabStrip` 从 main-panel 移除（文件保留到 2b 拆其 context-menu 逻辑后删除）

切同一 task 的两个顶级 tab：viewId 不变、params 变 → task 视图单实例内 Activity 切换，
性能与现在切内部 tab 完全一致；Monaco host、conversations panel 均复用现状。

### D2 Overview = "任务本身" tab

- 点击 sidebar 任务 → `openTab('task', {projectId, taskId, tab:{kind:'overview'}})`（已有 route 去重 → 聚焦）
- Overview 面板现有的 sessions 列表/新建按钮全部改调 `appTabs.openTab(...)`
- 内部 strip 那个"不可关闭的 overview tab"概念消失——顶级 overview tab 可以关（关了从 sidebar 再进）

### D3 分组插入规则（用户期望的序列）

`openTab` 的插入位置从"active 之后"改为：

```
同 (projectId, taskId) 的最后一个 tab 之后   → 同任务 tabs 自然聚拢
无同组 tab 时                                → active tab 之后（现状）
```

视觉分组：同 task 的 tabs 用细分隔 + conversation tab 显示 agent logo（复用 `AgentLogo`），
overview tab 显示任务名、conversation tab 显示 session 标题（`describeTab` 扩展，数据源都是现成 store）。

### D4 文件 tab 双轨并存（Phase 2 不强行统一）

| 来源 | route | workspace |
|---|---|---|
| 项目根（Harness 等） | `{viewId:'file', {projectId, filePath}}` | project-view workspace |
| task worktree | `{viewId:'task', {…, tab:{kind:'file', path}}}` | task workspace |

两者图标/标题一致，用户无感知差异。统一成单一 file 视图（带 workspace 来源参数）放 2c。

### D5 Split 侧栏（sidePaneTab）保留

side pane 是 task 内的辅助面板，不参与顶级 strip。失去"从内部 strip 拖入侧栏"的入口后，
改为顶级 tab 右键菜单项「在侧栏打开」（仅 task 类 tab 显示）。`moveTabToSidePane` 逻辑复用。

### D6 Detach 窗口

顶级 task 类 tab 拖出 strip 边界 → `openTaskTabInWindow(target)`（现有）+ `closeTab`。
拖拽撕出交互（ghost 预览、drop zone 上报）从 `TaskTabStrip` 平移到 `AppTabStrip`（2b）。
home/project/file tab 暂不可拖出（需要新的 window launch target，2c）。

### D7 快捷键迁移

| 快捷键 | 现在（task 内） | Phase 2（全局） |
|---|---|---|
| Mod+W | 关内部 tab | 关顶级 tab |
| Mod+Alt+←/→ | 内部 tab 循环 | 顶级 tab 循环 |
| Mod+1–9 | 内部 tab 跳转 | 顶级 tab 跳转 |
| Mod+T（新 session） | task 内 | 当前 tab 属于某 task 时新建该 task 的 session |

`useTabShortcuts` 改挂到 `AppTabsStore`，从 task 视图移除。

### D8 生命周期联动

- conversation 删除/归档 → 现有 reaction 从 `TabManagerStore` 平移：`AppTabsStore` 增加一个
  按谓词关 tab 的 API（`closeTabsWhere(predicate)`），由 conversations manager 的删除/归档路径调用
- task 归档/删除 → 关闭该 task 的所有顶级 tabs（同一 API）
- 项目卸载 → 同理

### D9 持久化与迁移

- `AppTabsSnapshot` 已有，task 类 tab 的 params 含 `tab` target，天然可序列化
- `TabManagerSnapshot`（tabs/activeTabId）退役，只保留 `sidePaneTab` 字段
- **迁移策略：不迁移**。升级首启时旧内部 tabs 丢弃（成本＝用户重新点开 session），换取零迁移代码。
  sidePaneTab 保留不动。

### D10 detached task window 的行为

detached 窗口（单 task 窗口）内：`AppTabStrip` 隐藏（Phase 1 已不恢复 tabs），
窗口内仍是单 target 渲染——与现状一致，不受提层影响。

## 5. 数据流（Phase 2 终态）

```
sidebar 点任务 ──┐
overview 点 session ──┤
harness 打开文件 ──┼──→ AppTabsStore.openTab(route)     ←─ 唯一入口
task 内点文件 ──┘            │
                             ├─ 去重（route 相等 → activate）
                             ├─ 分组插入（同 task 聚拢）
                             └─ _applyNavigation(viewId, params)
                                       │
                       task 视图 reaction(params.tab)
                                       │
                       openProvisionedTaskTab(provisioned, tab)   ←─ 现有函数
                                       │
                       TabManagerStore 实体对齐 + Activity 切换
```

## 6. 实施切分

**2a — 核心提层（一个 PR，可独立合并）**
1. `task` 视图 params 增加 `tab?: TaskWindowTabTarget`（缺省 overview）
2. `AppTabsStore`：route 去重、分组插入、`closeTabsWhere`
3. task 视图受控化（reaction: params.tab → openProvisionedTaskTab）
4. 移除 `TaskTabStrip` 渲染；快捷键迁移
5. 入口改造：sidebar 任务点击、overview sessions 列表、新建 conversation、task 内文件/diff 打开
6. 生命周期联动（归档/删除关 tab）
7. `describeTab` 扩展（session 标题 / agent logo / 任务名）

**2b — 交互补全**
右键菜单（close others/right/all、在侧栏打开、open in window、archive、copy link）、
拖拽 reorder、拖出 detach、detached window dock 回主窗。

**2c — 收敛**
file 视图统一（workspace 来源参数）、project/file tab 拖出窗口、内部 `TabManagerStore` 瘦身
（删除 tabOrder/activeTabId 残留）、per-tab history（可选）。

## 7. 风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| 切顶级 tab 触发 `modalStore.closeModal()`（_applyNavigation 现行为） | 低 | 浏览器语义可接受；必要时切 tab 路径跳过关 modal |
| 同 task 多 tab 下 focusTracker/telemetry 重复计数 | 低 | viewId 不变时 transition 不触发（现有逻辑已如此） |
| Mod+W 语义全局化误关 tab | 中 | 保持"最后一个 tab 关闭→回 Home"兜底；2b 加 reopen（Mod+Shift+T） |
| strip 拥挤（多 task × 多 session） | 中 | 分组聚拢 + max-w 截断 + overflow 滚动（Phase 1 已有）；后续可加分组折叠 |
| 旧 TabManagerSnapshot 不迁移引起的"tab 丢失"观感 | 低 | 升级说明一句话；sidebar/overview 一键找回 |

## 8. 工作量预估

- 2a：主改动 ~8 个文件（app-tabs-store、task view、open-task-target、main-panel、overview-panel、
  sidebar 任务点击、useTabShortcuts、describeTab），无主进程改动，无 DB 迁移
- 2b：~5 个文件，纯 renderer
- 2c：含 file 视图重构，需要再出一节细化设计
