# WikiDoc 设计规范（UIUX.md）

> 产品：企业内部文档 Wiki 知识库｜v1.0｜作者：颜好看（UI/UX）
> 运行：内网部署，**零外部字体 / 零 CDN**；首帧前内联脚本写入 `data-theme`（主题与明暗独立持久化）
> 图标：**lucide-react 唯一图标库**（stroke 2，尺寸 16/20/24）；**禁止 emoji**
> 令牌源：`client/src/styles/tokens.css`；业务样式禁止裸 hex（唯一例外 `#fff` / `#000`）

## 1. 设计语言与对标品牌

**寄存器：Product**——不是营销站：不做 Hero、不做渐变主视觉、不做居中大标题。

| 维度 | 对标 | 取什么 | 弃什么 |
|---|---|---|---|
| 信息密度 / 导航 | **Linear** | 行高 32px、侧边树懒加载、`⌘K` 命令面板、键盘优先 | 极暗背景与霓虹强调（不利长文） |
| 长文阅读 | **Notion / Outline** | 正文 16px/1.75、880px 阅读宽、标题锚点、右侧大纲 | 插画风与过量留白 |
| 后台控件 / 代码 | **GitHub Primer** | 表格密度、代码块与 diff 配色、边框优先于阴影 | 蓝紫按钮堆叠 |
| 中文密度 | **Ant Design（仅密度）** | 14px UI 基准、紧凑表单 | 默认蓝 `#1677ff` 与重度圆角 |

**气质三词**：克制 restrained、致密 dense、可信 authoritative。**原则**：层级靠**边框 + 亮度**表达，不用彩色边条；强调色每屏 ≤2 处；动效只做状态确认，不做表演。

## 2. 主题与配色（3 套 × 明暗 = 6 组）

`<html data-theme="graphite-dark">`；主题与明暗各自持久化到 `localStorage`。

| 主题 | 气质 | 主色 `--color-brand-500`（light/dark） | 中性倾向 |
|---|---|---|---|
| **graphite 石墨蓝**（默认） | 专业、冷静、工程 | `#2F6CEF` / `#6B9DF5` | 冷灰微蓝 |
| **inkgreen 墨绿** | 沉稳、耐读、长文友好 | `#17785A` / `#47A87C` | 中性灰微绿 |
| **slate 石板灰** | 严肃、合规、去品牌化 | `#3D4F63` / `#7A8898` | 纯中性灰 |

**中性色阶** 11 阶 `gray-0/50…900`（暗色追加 `gray-950`）。明暗共用同名阶但**语义反转**：light 下 `gray-0=#fff` 为表面、`gray-900` 为主文本；dark 下 `gray-0` 为凹陷底、`gray-950` 为主文本。派生别名统一在 `[data-theme$="-light"|"-dark"]` 映射，切主题时结构零漂移。

| 派生别名 | light | dark |
|---|---|---|
| `--color-bg-base` / `-subtle` / `-sunken` | g50 / g100 / g100 | g50 / g100 / g0 |
| `--color-surface` / `-raised` / `-overlay` | g0 / g0 / g0 | g200 / g300 / g400 |
| `--color-border-subtle` / `-border` / `-strong` | g100 / g200 / g300 | g400 / g500 / g600 |
| `--color-text-primary`/`-secondary`/`-tertiary`/`-disabled` | g900/g600/g500/g400 | g950/g900/g800/g700 |

**语义色**（各含 `-bg` / `-border` / `-fg` 四件套，明暗两套）：success `#12805C`→`#4CC38A`；warning `#B25E09`→`#E0A33A`；danger `#C8283C`→`#EE5A5F`；info 复用品牌色。
**代码高亮**：`--color-code-bg/fg/border/gutter` + `keyword` `string` `number` `comment` `function` `variable` `type` `attr` `tag` `punctuation` + `inserted-bg/deleted-bg`（diff）。紫色**仅作语法关键字单一色相**，不参与品牌面与渐变。
**场景色**：`--color-mark-*`（搜索命中）、`--color-sidebar-*`（树导航）、`--color-table-*`（多维表格）、`--color-editor-*`（光标/选区/占位符）、`--color-chart-1..6`（分类色，无紫，画板填充同源）。**画板图元**（矩形/椭圆/线段/箭头/文本/自由笔迹）强制取令牌不写字面色：`--color-canvas-stroke`（默认描边）、`-stroke-selected`（选中描边）、`-guide`（对齐参考线）、`-fill-default`（无填充 transparent）、`-fill-1..6`（语义填充）、`-arrow-fill`（箭头头部，跟随描边）、`-canvas-text`（文本图元）、`-canvas-handle(-border)`（变换控制点）、`--canvas-fill-opacity`（填充不透明度，亮 .16 / 暗 .24）。

## 3. 字体方案（本地栈，禁止 Web Font）

`--font-sans`: `system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif`
`--font-serif`（仅阅读页可选）: `Georgia, "Times New Roman", "Songti SC", "SimSun", serif`
`--font-mono`: `"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", "Courier New", monospace`

| 阶梯 | 值 | 用途 |
|---|---|---|
| `--text-2xs/xs/sm` | 11 / 12 / 13px | 元信息、表头、标签 |
| `--text-base` | 14px | **UI 基准**（导航 / 表单 / 列表） |
| `--text-md/lg` · `--text-xl/2xl/3xl` · `--text-4xl/5xl/6xl` | 15·16 / 18·20·24 / 28·32·40px | 卡片标题 / 区块与页面标题 / 空状态与品牌字 |
| 文档阶梯 | 16px / 1.75 | h1 32 · h2 24 · h3 20 · h4 16 |

行高 `tight 1.25`（标题）/ `normal 1.6`（UI）/ `relaxed 1.75`（长文）；字重仅 400/500/600/700；字距：正文 `0`、小字 `0.02em`、全大写标签 `0.06em`、≥32px 标题 `-0.02em`。中英混排由排版层补 1/4 空格，不以 letter-spacing 撑中文。

## 4. 间距 · 圆角 · 阴影 · 边框 · 动效

- **间距** 4px 网格，仅 `0/4/8/12/16/20/24/32/40/48/64/80px`；卡片内距 16–20，区块 24，节区 40–64。
- **圆角** `xs2 / sm4 / md6 / lg8 / xl12 / 2xl16 / pill`；按钮与输入 6，卡片 8，弹窗 12，**卡片上限 12px**。
- **阴影** `--shadow-1` 卡片静置 / `2` 下拉与悬浮卡 / `3` 模态与抽屉 / `4` 拖拽 / `drag` / `inset-top`；暗色模式由 `--shadow-color-1..3` 加深 + 亮度分层。**禁止「1px 边框 + ≥16px 模糊阴影」同现（幽灵卡片）**。
- **边框** `--border-1/2/3`；卡片默认 `1px solid var(--color-border)`，悬停升 `border-strong`；**禁用彩色左边条**。
- **动效** `instant 80`（按下）/ `fast 140`（hover、选中）/ `base 200`（下拉、Toast）/ `slow 280`（抽屉、模态）/ `slower 400`（页面级）。缓动仅允许 `--ease-standard cubic-bezier(.2,0,0,1)`、`--ease-out`、`--ease-in`、`--ease-emphasis`；**禁止弹跳缓动**；`prefers-reduced-motion` 下全部降为 0.01ms。

## 5. 布局规范

| 令牌 | 值 | 说明 |
|---|---|---|
| `--layout-sidebar-w` / `-collapsed` · `--layout-toc-w` | 260 / 56px · 240px | 空间树可折叠为图标条；右侧大纲 |
| `--layout-header-h` · `--layout-breadcrumb-h` · `--layout-gutter` | 52px · 40px · 24px | 顶栏、面包屑、桌面栅格沟槽 |
| `--layout-content-max` · `--layout-wide-max` | 880px · 1280px | 文档正文 65–75 字符 / 列表与设置容器 |

栅格：桌面 12 列 / 平板 8 列 / 移动 4 列。断点 `≥1536` 大纲常驻 → `≥1280` 完整三栏 → `≥1024` 右栏转浮层 → `≥768` 侧栏抽屉化、单列 → `<768`（含 375）单列 + 全屏遮罩抽屉 + 44px 触控区。

## 6. 组件清单与状态

统一 6 态：**Default / Hover / Focus-visible / Active / Disabled / Loading**，另含 Empty / Error / Success 内容态。

| 组件 | 默认 | 悬停 | 聚焦 | 禁用 |
|---|---|---|---|---|
| 按钮 Primary | `brand` 底 + `brand-on` 字，h 32/40，r6 | `brand-hover` | `--ring-focus` | `opacity .5` + not-allowed |
| 按钮 Secondary / Ghost / Danger | 透明+`border`+`text-primary`（Ghost 无边框）/ `danger-bg`+`danger-fg` | `surface-hover` / `danger-border` | `--ring-focus` | `border-subtle` + `text-disabled` |
| 输入 / 下拉 | `surface` + `border`，下拉右侧 `chevron-down` 16 | `border-strong` | `border-focus` + `--ring-focus` | `bg-subtle` + `text-disabled` |
| 标签 Tag / 卡片 Card | `bg-subtle`+`text-secondary` r-sm / `surface`+1px `border` r8 | — / `border-strong`（不加阴影） | 内部元素继承 | `text-disabled` |
| 表格 | 表头 `table-header-bg` 12px 字距 .06em；行 40px；`border-subtle` 分隔 | 行 `table-row-hover` | 单元格 `table-cell-focus` 2px 内环 | — |
| 模态 / 抽屉 | `surface-overlay` + `--shadow-3`，r12，遮罩 `scrim` | — | 打开聚焦首控件、`Esc` 关、焦点陷阱 | — |
| 面包屑 / 树导航 | `text-tertiary` 13px，分隔 `chevron-right` 12 / 行高 28，缩进 12 | 非末级 `text-link` / `sidebar-item-hover` | 焦点环 / 选中 `sidebar-item-active-bg`+`-fg` + 500 | 无权限 `text-disabled` |
| 代码块 | `code-bg`+`code-border`，13px mono，行号 `code-gutter`，顶栏含语言 + `copy` | 顶栏操作显形 | 滚动容器可聚焦 | — |

空态 = 24px 图标 + 一句可执行文案 + 单个主按钮；错误态 = 字段下方 `danger-fg` 12px + `--ring-error`，全局错误用带重试的 Toast；加载态 = 骨架屏（`skeleton-base` + `shine` 扫光）。

## 7. 核心页面布局（ASCII 线框）

### 7.1 登录页 `/login` — 左右分栏，非居中卡片

```
┌──────────────────────────┬───────────────────────┐
│ 品牌区 bg-sunken         │ 表单区 surface max 400│
│  WikiDoc                 │ [logo] 企业知识库     │
│  最近更新                 │ ┌─────────────────┐  │
│  · 研发手册 v3  2 小时前   │ │ 用户名 / 邮箱   │  │
│  · API 网关规范 3 天前     │ │ 密码 •••• [eye]│  │
│                          │ └─────────────────┘  │
│                          │ [x]记住我  [登录][SSO]│
└──────────────────────────┴───────────────────────┘
角落：[sun/moon] 主题 · [中/EN] 语言 · <768px 隐藏品牌区
```

### 7.2 首页 / 工作台 `/`

```
┌──────┬──────────────────────────────────────────┐
│WikiDoc│顶栏 [search ⌘K]   [plus 新建▾][bell][头像]│
│ search│ 最近访问                      查看全部 →│
│ 空间  │ ┌─────┬─────┬─────┬─────┐              │
│ 收藏  │ │doc卡│doc卡│doc卡│doc卡│ ← 标题+空间  │
│ 模板  │ └─────┴─────┴─────┴─────┘              │
│ 团队  │ 我的空间            [全部▾][网格/列表]  │
│ 回收站│ ┌───────────┬───────────┐              │
│[折叠<]│ └───────────┴───────────┘ 关注动态…  │
└──────┴──────────────────────────────────────────┘
```

### 7.3 空间页 `/space/:key`

```
┌──────┬──────────────────────────┬──────────────┐
│空间树│ 面包屑 空间 / 子页面      │ 空间概览      │
│▾ 入门│ [plus 新建][filter 筛选▾] │ · 32 篇文档   │
│ ▾研发│───────────────────────────│ · 8 位成员    │
│  手册│ 标题        更新者  时间   │ · 最近更新    │
│  规范│ · API 网关规范 李四 2h    │ [成员][设置]  │
└──────┴──────────────────────────┴──────────────┘
<1024px：右栏收起为「概览」浮层按钮
```

### 7.4 文档阅读页 `/doc/:id` — 三栏，正文 880px

```
┌──────┬──────────────────────────────────┬───────┐
│侧边树│ 面包屑 空间/父页/当前页[star][share…]│ 大纲  │
│(260) │ H1 部署手册     作者 · 时间 · 阅读 │ (240) │
│      │──────────────────────────────────│ ·概览 │
│      │ 正文 16px/1.75，最大宽 880px       │ ·准备 │
│      │ 段落… [代码块][表格][图片 r8][引用] │ ·步骤 │
│      │ 子页面列表 · 附件 · 评论            │[回顶]│
└──────┴──────────────────────────────────┴───────┘
<1280px 右栏转浮层；<768px 单列 + 目录顶部抽屉
```

### 7.5 Markdown 编辑器 `/doc/:id/edit`

```
┌────────────────────────────────────────────────┐
│[←返回] 无标题文档 · 已保存 14:02 [头像组][预览][发布]│
├────────────────────────────────────────────────┤
│ 编辑区 880px（与阅读页同宽，WYSIWYG 一致）      │
│ ⠿ 段落… 选中浮出 Bubble：[B][I][S][code][link] │
│ ⠿ / 斜杠菜单（分组：基础 / 媒体 / 高级）        │
│ ⠿ ┌ 分栏区块 2:1 ─────────────────────┐      │
│   │ 左栏内容      │ 右栏内容           │     │
│ ⠿ ┌ 多维表格（表头 table-header-bg，行 32px）┐│
│   │ 文本│单选(chart 色)│日期│成员│附件│     │ │
│ ⠿ └ 在线画板：canvas-bg + grid，工具条浮左上 ┘│
└────────────────────────────────────────────────┘
画板 / 多维表格 / 分栏共用 surface·border·radius(8) 与 chart 分类色。
```

### 7.6 搜索结果页 `/search?q=`

```
┌─────────────────────────────────────────────────┐
│ 顶栏 [ 搜索框（保留 query）                 ] ⌘K│
├──────────┬──────────────────────────────────────┤
│ 筛选 240 │ 共 128 条 · 42ms    [相关度▾][时间▾] │
│ [x]研发42│ API 网关规范             研发 · 2 天前│
│ [ ]产品18│ …限流见 <mark>令牌桶</mark> 章节…     │
│ 类型[ ]文档│ …<mark>令牌桶</mark> 位于 gateway.yaml│
│ 时间[近7天▾]│ [1][2][3] … [13] · 空态含清除筛选  │
└──────────┴──────────────────────────────────────┘
```

### 7.7 权限管理 `/settings/permissions`

```
┌──────┬────────────────────────────────────────┐
│设置导航│ 权限管理                   [+ 添加授权]│
│ 通用  │ [x] 继承上级空间权限（提示条 info-bg） │
│ 权限● │ 主体    类型   权限   来源   操作      │
│ 集成  │ 研发组  用户组 可编辑 继承 [编辑][移除]│
│ 导入  │ 李四    用户   可管理 直接 [编辑][移除]│
│      │ 矩阵：空间级 → 页面级，冲突取最大并标黄│
└──────┴────────────────────────────────────────┘
```

### 7.8 导入中心 `/import`

```
┌──────────────────────────────────────────────┐
│ 1 选择来源 > 2 映射配置 > 3 执行导入 ←步骤条  │
│──────────────────────────────────────────────│
│ 来源：[Confluence][Markdown ZIP][Word][HTML]  │
│ ┌────────────────────────────────────────┐  │
│ │ 拖拽文件到此处，或 [upload] 选择（虚线） │  │
│ └────────────────────────────────────────┘  │
│ 任务：文件名 · 进度条(brand) · 状态 Tag ·     │
└──────────────────────────────────────────────┘
```

### 7.9 系统设置 `/settings/*`

```
┌──────┬──────────────────────────────────────┐
│设置导航│ 外观与主题                          │
│ 工作区│ 主题：[石墨蓝][墨绿][石板灰] ←实时预览│
│  通用 │ 模式：[明亮][暗色][跟随系统]         │
│  成员 │ 密度：[紧凑][标准] 正文字号：[14][16]│
│ 集成  │ LDAP：服务器/端口/Base DN/绑定[测试] │
│  LDAP │ SSO：协议(OIDC/SAML)/元数据/回调[保存]│
│ 内容  │ 语言：[简体中文][English] 即时生效   │
│  导入 │ [保存更改] [放弃] ← 底部 sticky 操作条│
└──────┴──────────────────────────────────────┘
```

## 8. 图标规范（lucide-react 唯一）

统一 `strokeWidth={2}`、`size` 仅 **16 / 20 / 24**、`color: currentColor`。行内与表格 16，按钮与工具栏 20，空状态与独立展示 24。**禁止 emoji、禁止第二套图标库、禁止纯图标导航（导航必须 图标 + 文字）**。

| 语义 | 图标 |
|---|---|
| 文档与空间 | 新建文档 `file-plus` · 新建空间 `folder-plus` · 文档 `file-text` · 目录 `folder` / `folder-open` |
| 导航与操作 | 搜索 `search` · 命令面板 `command` · 筛选 `filter` · 排序 `arrow-up-down` · 更多 `more-horizontal` |
| 编辑与协作 | 编辑 `pencil` · 删除 `trash-2` · 收藏 `star` · 分享 `share-2` · 评论 `message-square` · 附件 `paperclip` |
| 系统与账号 | 设置 `settings` · 主题 `sun`/`moon` · 语言 `languages` · 通知 `bell` · 权限 `shield` · 成员 `users` |
| 内容与区块 | 历史 `history` · 导入/导出 `upload`/`download` · 画板 `pen-tool` · 多维表格 `table-2` · 分栏 `columns-2` |
| 结构与其他 | 大纲 `list` · 面包屑 `chevron-right`/`home` · 树折叠 `chevron-down` · 拖拽 `grip-vertical` · 复制 `copy` |
| 状态与表单 | 成功 `check-circle-2` · 警告 `alert-triangle` · 错误 `x-circle` · 加载 `loader-2` · 密码 `eye`/`eye-off` · 返回 `arrow-left` · 首页 `layout-dashboard` |

图标按钮必须带 `aria-label`（中英双语），视觉 20px 时用 padding 撑到 **44×44 触控热区**。

## 9. 无障碍要求

1. **对比度**：正文与图标 ≥4.5:1，大字号（≥18px/600）与图形边界 ≥3:1；已逐主题校验 `--color-text-*` 在 `surface` 与 `bg-base` 上达标（最低 4.6:1）；禁用态与纯装饰豁免。
2. **不靠颜色单独传意**：状态 = 图标 + 文本 + 颜色三重编码；搜索命中保留 `<mark>` 语义。
3. **焦点可见**：`:focus-visible` 统一 `--ring-focus`（3px），**禁止移除 outline**；模态/抽屉实现焦点陷阱、`Esc` 关闭、关闭后焦点归还触发元素。
4. **键盘可达**：`⌘K` 命令面板、`g+d` 跳转、Tab 顺序遵循视觉顺序；树导航方向键展开/收起；表格方向键移动单元格；编辑器 slash 菜单上下键 + Enter。
5. **动效**：`prefers-reduced-motion` 下所有过渡/动画降为 0.01ms，禁用视差与自动播放。
6. **缩放与语义**：200% 缩放不丢内容；`h1–h3` 真实层级、`nav/main/aside` 地标、`aria-current` 标记当前项；表单可见 `<label>` + `aria-describedby` 关联错误说明。
