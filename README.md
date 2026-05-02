![OpenVibe Logo](imgs/logo.png)

# OpenVibe — 极简 AI 编程助手 / Minimalist AI Assistant

**在 VS Code 工作区内直接读写与编辑项目的智能助手。** 基于 **read**、**find**、**edit** 三类核心工具，并配合任务规划、多智能体审查与会话管理。

> **An intelligent assistant that reads and edits your project inside the VS Code workspace.** Built around **read**, **find**, and **edit**, with task planning, multi‑agent review, and session management.

<h2 id="table-of-contents">目录 / Table of contents</h2>

- [重要提示 / Important notice](#important-notice)
- [新闻 / News](#news)
- [项目概述 / Project overview](#project-overview)
- [设计理念 / Design philosophy](#design-philosophy)
- [核心工具 / Core tools](#core-tools-explained)
- [系统提示词架构 / System prompt architecture](#system-prompt-architecture)
- [双轨消息系统 / Dual-track messages](#dual-track-messages)
- [Compact 历史压缩 / History compaction](#history-compaction)
- [多智能体架构 / Multi-agent architecture](#multi-agent-architecture)
- [请求流程 / Request flow](#request-flow)
- [其它辅助工具 / Other tools](#other-available-tools)
- [技能系统 / Skills](#skills-system)
- [安装 / Installation](#installation)
- [配置 / Configuration](#configuration)
- [内存管理 / Memory](#memory-management-system)
- [关键源文件索引 / Source files index](#source-files-index)
- [许可证 / License](#license)

<h2 id="important-notice">重要提示 / Important notice</h2>

本扩展可实现智能编辑与辅助开发，**不建议作为生产环境的唯一依赖**；体验偏实验与探索，因此取名 OpenVibe。初版开发时曾用 DeepSeek API，成本约 30 元人民币。

> Smart editing works, but **this is not recommended as a production‑only workflow**; the experience is experimental and exploratory—hence the name. Early development used the DeepSeek API for roughly 30 RMB.

<h2 id="news">新闻 / News</h2>

| 日期 | 内容 |
|------|------|
| 2026-04-11 | 增加 **Git** 支持：编码过程中可自动创建快照，并在 UI 中回滚与管理版本。 |
| 2026-04-14 | 增加**独立审查**：任务清单审查与代码编辑审查，由独立 LLM 代理提升修改质量。 |
| 2026-04-16 | **强化 shell 审查与执行**：1) 严格禁止使用 shell 进行任何文件读写操作（强制使用专用工具） 2) 结构化返回 + 关键错误摘要 3) 注入 todo 与最近执行历史到审查流程 4) 多级审查流程：主智能体→shell 编辑代理→独立安全审查→用户确认 |
| 2026-04-16 | **新增转义字符处理协议**（已废弃，改用 XML content fallback）：引入 `MM_OUTPUT` 特殊标记，允许 `edit` 和 `run_shell_command` 工具直接传递原始文本，避免 JSON/Markdown 转义问题。 |
| 2026-04-25 | **技能系统 + 多语言支持 + 工作流改进规范 + 更多**：1) 动态技能加载（`list_skills`/`load_skill`） 2) `vibe-coding.language` 多语言交互配置 3) `ask_human` 人工协助工具 4) 会话自动命名 5) XML content fallback 传递原始文本 6) Memory 即时更新规范 7) 增量编译验证与 Bug 异常处理规范 8) 工作流改进四大规范（Memory 使用、Todo 异常处理、工具调用策略、会话节奏控制）。🎉 感谢 **DeepSeek V4** 的发布，让 OpenVibe 在强大模型驱动下真正胜任实际开发工作！ |
| 2026-04-26 | **Web Fetch 优化 + ask_human 交互改进**：1) `web_fetch` HTML 处理全面升级——保留标题层级（h1-h6 转 Markdown）、块级换行、`<pre>/<code>` 代码格式、提取链接列表和 meta description、移除 `<noscript>` 2) `ask_human` 对话框新增文本输入框和 Send 按钮，用户可输入消息回传 AI 3) System Prompt 中 `web_fetch` 与 `ask_human` 联动：AI 不知道 URL 时自动请求用户帮忙找到页面 |
| 2026-04-28 | **ask_human 重载容错 + 持续改进**：1) 修复 `ask_human` 在 Reload Window 后显示"Missing tool result"晦涩错误的 bug，改为显示友好提示和原始问题内容，用户发送新消息即可继续 2) `<edit-content>` 标签现也支持 `run_shell_command`，编辑和 shell 统一使用同一个标签，简化转义处理 3) XML content fallback 完善：同一轮消息支持多个标签按顺序匹配 |
| 2026-04-29 | **Compact 历史压缩重构**：放弃独立摘要 LLM，改为**复用主对话 LLM** + 保持原始消息格式，大幅提升 KV 缓存命中率。1) 使用与主对话相同的 system prompt（`SYSTEM_PROMPT + Host env + langInstr`），前缀缓存完美命中 2) 待压缩消息保持原始 `ChatMessage` 数组格式，中间 KV cache 可复用 3) 只修改 `llmMessages`（LLM 上下文），前端 `messages`（完整历史）完全不受影响 4) 新增 `_sanitizeMessageList` 确保发送前清理不完整 tool call 序列，避免 API 400 错误 |
| 2026-05-02 | **知识库泛化重构**：将单文件 `.OpenVibe/memory.md` 拆分为**三级目录结构** `.OpenVibe/memory/`（`README.md` 元定义 + `L1-purpose.md` + `L2-inventory.md` + `L3-roles.md`），实现按需读写、互不影响。架构泛化为通用知识库系统，适用于任何项目。同步更新 system prompt 为极简提醒版。 |
> **2026-04-11:** Git snapshots during coding; rollback and history in the UI.  

> **2026-04-14:** Independent review for todo lists and code edits via separate LLM agents.  

> **2026-04-16:** Enhanced shell review & execution: 1) Strict prohibition on shell file operations (use dedicated tools) 2) Structured output + key error summaries 3) Todo & recent history injection 4) Multi-level review flow: primary agent → shell editor agent → independent security review → user confirmation.

> **2026-04-16:** Raw payload protocol `MM_OUTPUT` for `edit` and `run_shell_command` tools (deprecated, use XML content fallback instead) — bypass JSON/Markdown escaping for complex multiline code and shell scripts.

> **2026-04-25:** Skills system + multi-language support + workflow guidelines + more: 1) Dynamic skill loading (`list_skills`/`load_skill`) 2) `vibe-coding.language` config 3) `ask_human` tool 4) Session auto-naming 5) XML content fallback for raw text 6) Memory instant-update rule 7) Incremental compilation & Bug exception handling 8) Workflow improvement guidelines (Memory usage, Todo exception handling, tool call strategy, session rhythm control). 🎉 Thanks to **DeepSeek V4** — OpenVibe is now truly capable of real-world development work with such a powerful model under the hood!

> **2026-04-26:** Web Fetch optimization + ask_human interaction improvements: 1) `web_fetch` HTML processing overhaul — heading hierarchy preserved (h1-h6 to Markdown), block-level line breaks, `<pre>/<code>` code formatting, link list and meta description extraction, `<noscript>` removal 2) `ask_human` dialog now includes a text input field and Send button, allowing users to type and send messages back to the AI 3) System prompt now links `web_fetch` with `ask_human`: when the AI doesn't know a URL, it automatically asks the user to help find the page
> **2026-04-28:** ask_human reload resilience + continuous improvements: 1) Fixed the "Missing tool result" cryptic error after Reload Window, replaced with a friendly prompt showing the original question — users can continue by sending a new message 2) `<edit-content>` tag now also supports `run_shell_command`, unifying the escaping protocol for both edit and shell 3) Enhanced XML content fallback: multiple tags in the same response are matched to tools in order

> **2026-04-29:** **Compact history compaction rework**: Dropped the separate summarizer LLM in favor of **reusing the main conversation LLM** + keeping original message format for maximum KV cache hit rate. 1) Uses the exact same system prompt as the main conversation (`SYSTEM_PROMPT + Host env + langInstr`) — prefix cache hits perfectly 2) Messages to be compressed stay in raw `ChatMessage` array format — intermediate KV cache is reusable 3) Only `llmMessages` (LLM context) is modified; frontend `messages` (full history) remains untouched 4) Added `_sanitizeMessageList` to strip incomplete tool_call sequences before sending, preventing API 400 errors

> **2026-05-02:** **Knowledge base generalization**: Split the single `.OpenVibe/memory.md` into a **3-level directory** `.OpenVibe/memory/` (`README.md` meta-definition + `L1-purpose.md` + `L2-inventory.md` + `L3-roles.md`), enabling on-demand reading and independent cache layers. The architecture is generalized as a universal knowledge base system applicable to any project. System prompt updated to a minimal reminder version.

<h2 id="project-overview">项目概述 / Project overview</h2>

OpenVibe 在本地工作区中完成「读 → 找 → 改」的闭环：

| 工具 | 作用 |
|------|------|
| **read** | 读取文件内容 |
| **find** | 定位代码位置 |
| **edit** | 安全替换指定区域 |

此外还有任务规划、会话与配置管理，使项目级修改**可分析、可验证、可追溯**。

> OpenVibe closes the loop with **read → find → edit**, plus planning and sessions so edits stay analyzable and traceable.

<h2 id="design-philosophy">设计理念 / Design philosophy</h2>

复杂修改可拆解为三步：**获取信息（read）→ 定位变更点（find）→ 安全写入（edit）**。工具集小、行为可预期，便于审查与自动化。

> Any project‑level edit breaks down into **read**, **find**, and **edit**—small surface area, predictable behavior, easier to review.

<h2 id="core-tools-explained">核心工具 / Core tools</h2>

### `read_file` — 读取文件

```javascript
read_file(filePath, startLine, endLine)
```

读取全文或指定行范围。

### `find_in_file` — 搜索定位

```javascript
find_in_file(filePath, searchString, contextBefore, contextAfter)
```

在文件中查找片段并返回位置上下文。

### `edit` — 安全编辑

```javascript
edit(filePath, startLine, endLine, newContent)
```

替换指定行范围；可选经独立 LLM 审查后再应用。对于多行代码或复杂脚本，可以使用 **XML content fallback** 避免 JSON/Markdown 转义问题——将 `newContent` 留空并在 visible response 中使用 `<edit-content>…</edit-content>` 标签传递原始文本，同一轮消息支持多个标签按顺序匹配。


<h2 id="system-prompt-architecture">系统提示词架构 / System prompt architecture</h2>

每次与 LLM 的交互，实际发送的消息数组由三部分拼接而成：

```
[
  system,    ← SYSTEM_PROMPT + Host environment + 语言指令
  user,      ← 用户消息（正文开头嵌入运行时 Context 块）
  assistant,
  tool,
  ...
]
```

### System 消息构成

| 区块 | 来源 | 说明 |
|------|------|------|
| **SYSTEM_PROMPT** | `src/systemPrompt.ts` | 固定提示模板（~75 行）：Tools 描述、Memory 规范、Task Planning 规则、Workflow 核心循环 |
| **Host environment** | `src/agentRuntimeContext.ts` | 动态生成：OS 信息、路径分隔符、换行符、Shell 类型、当前活动编辑器 |
| **语言指令** | `langInstr` | 根据 `vibe-coding.language` 配置生成（zh-CN / en），追加在尾部 |

### 用户消息中的 Context 块

运行时状态不额外占一条消息，而是**嵌入每一条用户消息的正文开头**：

```
─── Context ───
🔓 Edit: ON
📋 Todo: 2 item(s) remaining
────────────────

<用户的原始输入>
```

- **Edit 状态**：🔓/🔒 实时反映编辑权限开关
- **Todo 状态**：当有待办事项时显示剩余数量
- **设计理由**：用户消息每轮必定变化，嵌入上下文不增加消息数，也不破坏 prompt 前缀缓存

> Skills 不嵌入 system prompt，而是通过 `load_skill` 工具返回的指令文本进入 LLM 上下文。`activate_skill` 仅用于跨会话持久化激活状态。

<h2 id="dual-track-messages">双轨消息系统 / Dual-track messages</h2>

每个会话维护**两份消息列表**：

| 列表 | 字段 | 用途 | Compact 影响 |
|------|------|------|-------------|
| **`messages`** | `ChatSession.messages` | 前端展示：**完整对话历史** | ❌ 不受影响 |
| **`llmMessages`** | `ChatSession.llmMessages` | LLM 上下文：可能被 compact 精简 | ✅ 被替换为摘要 |

消息添加时自动同步到两份列表。`compact` 只替换 `llmMessages`，前端始终看到完整历史。

### LLM 消息过滤规则

`buildMessagesForLlm()` 中过滤掉两类消息：

| `role` | `hiddenFromLlm` | 发给 LLM？ | 用途 |
|--------|----------------|-----------|------|
| `system` | — | ✅ | 系统提示 |
| `user` | — | ✅ | 用户输入 |
| `assistant` | `false` / `undefined` | ✅ | AI 回复 + `tool_calls` |
| `assistant` | `true` | ❌ **过滤** | UI 气泡（如 todo 创建提示） |
| `tool` | — | ✅ | 工具执行结果 |
| `event` | — | ❌ **过滤** | 仅 UI 事件通知 |

### 典型消息序列

```
[user]        ← "帮我修改 xx 文件的配置"
[assistant]   ← "我来看看" + tool_calls: [read_file, find_in_file]
[tool]        ← read_file 结果
[tool]        ← find_in_file 结果
[assistant]   ← "找到了，现在修改" + tool_calls: [edit]
[tool]        ← edit 结果
[assistant]   ← "修改完成"（纯文本回复，无 tool_calls）
```

<h2 id="history-compaction">Compact 历史压缩 / History compaction</h2>

> **核心思想：** Compact 只修改 `llmMessages`（LLM 上下文），前端 `messages` 不受影响。不启动独立的摘要 LLM，而是**复用主对话 LLM**（同一条 system prompt + 原始消息格式），让旧消息的 KV cache 尽可能命中。

### 为什么传统方式缓存不命中？

假设有 10 轮对话，需压缩前 8 轮：

```
system + u1 + a1 + t1 + ... + u8 + a8 + t8 + u9 + a9 + t9 + u10
│                                                              │
└─────────── 需要压缩 ───────────┘└────── 保留 (20K token) ────┘
```

传统摘要 LLM 会：1) 使用不同的 system prompt → 前缀缓存失效 2) 将消息重铸为纯文本 → KV cache 完全浪费

### 新设计：复用主 LLM + 原始消息

```
                       复用同一个 LLM + 同一个 system prompt
          ┌────────────────────────────────────────────────────┐
          │  system + u1 + a1 + t1 + ... + u8 + a8 + t8       │
          │                                  + 压缩指令 (user) │
          └────────────────────────────────────────────────────┘
                    ↑                              ↑
              system prompt 完全相同         原始消息格式不变
              → 前缀缓存命中                 → KV cache 可复用
```

**执行过程：**

1. **计算保留窗口** — 从尾部扫描约 20K token 的消息作为保留区
2. **构建压缩请求** — `[system (相同)] + [待压缩消息 (原始格式)] + [压缩指令]`
3. **调用主 LLM** — 使用与主对话相同的 `apiConfig` 和 `TOOL_DEFINITIONS`，最大程度复用 KV cache
4. **替换 llmMessages** — `[摘要消息, ...保留消息]`，前端完全无感知

### 触发方式

| 方式 | 触发点 | 说明 |
|------|--------|------|
| **手动** | 用户输入 `/compact` | 立即触发 |
| **手动** | AI 调用 `compact` 工具 | Tool call 循环中触发 |
| **自动** | 累计 `total_tokens` ≥ 1,000,000 | Fire-and-forget |

> **自动 compact** 基于整个会话所有 API 调用返回的 `total_tokens` 之和。每次 API 调用后累加并检查，超过阈值则异步触发。

<h2 id="multi-agent-architecture">多智能体架构 / Multi-agent architecture</h2>

系统包含两个核心角色，形成「执行 ↔ 验证」分离：

| 智能体 | 职责 |
|--------|------|
| **主智能体** (Primary) | 需求分析、任务规划、工具调用协调与执行、与用户沟通 |
| **审查智能体** (Review) | 独立校验 todo 合理性、编辑正确性、shell 命令安全性 |

> 工具的调用由主智能体直接完成——不存在独立的"编辑智能体"。

### Shell 命令强化审查流程

1. **严格安全规则**：禁止使用 shell 进行任何文件读写操作（如 cat、type、dir、grep），强制使用专用工具
2. **防止命令漂移**：审查命令是否与用户请求和 todo 上下文一致
3. **结构化返回**：执行结果包含 `command`、`cwd`、`exitCode`、`durationMs`、`summary`、`keyErrors`
4. **多级审查**：主智能体 → shell 安全检查 → 独立 LLM 审查 → 用户确认（可选）
5. **XML content fallback**：多行复杂脚本使用 `<edit-content>` 标签传递原始文本
6. **上下文注入**：自动注入 todo 目标与最近执行历史
7. **防重复执行**：记录最近命令，避免无意义重复

> **Primary agent** plans, coordinates and executes tools; **review agent** independently checks plans, edits and shell commands. Failed reviews trigger rework loops.

<h2 id="request-flow">请求流程 / Request flow</h2>

```
用户输入
    │
    ▼
MessageHandler.handleUserMessage()
    │
    ├─ 1. sanitizeIncompleteToolCalls()    ← 清理未完成的 tool call 序列
    │
    ├─ 2. 构建用户消息上下文
    │   ├─ 读取 Edit Permission 状态
    │   ├─ getTodoControlInfo()            ← 检查 todo 状态
    │   └─ 嵌入 ─── Context ─── 块到用户消息正文开头
    │
    ├─ 3. buildMessagesForLlm()
    │   ├─ system = SYSTEM_PROMPT + hostContext + langInstr
    │   ├─ 过滤 hiddenFromLlm 和 role==='event'
    │   └─ 返回 [system, user1, assistant1, tool1, ...]
    │
    ├─ 4. sendChatMessage(messages, tools)  ← API 调用
    │
    ├─ 5. 循环处理工具调用（最多 20 轮）
    │   ├─ 解析 AI 回复中的 tool_calls
    │   ├─ 逐一执行工具
    │   ├─ 将 tool 结果加入消息列表
    │   └─ 新一轮 LLM 调用
    │
    ├─ 6. 检查是否需要自动 compact
    │   └─ 累计 total_tokens ≥ 1,000,000 → 自动触发 compact
    │
    └─ 7. 循环结束 → 等待下一条用户输入
```

<h2 id="other-available-tools">其它辅助工具 / Other tools</h2>

<details>
<summary>展开查看 / Expand</summary>

| 工具 | 说明 |
|------|------|
| `get_workspace_info` | 工作区根目录与顶层文件 |
| `create_directory` | 创建目录（可递归） |
| `create_todo_list` | 多步骤任务规划（先计划后执行），经独立 LLM 审查验证 |
| `run_shell_command` | 在项目根执行命令；**禁止使用 shell 进行任何文件读写操作**（强制使用专用工具），经 shell 编辑代理优化 + 独立安全审查（含防上下文获取、防漂移、结构化返回、多级审查流程）。对于复杂多行命令，可使用 **XML content fallback**（`<shell-content>` 标签）传递原始脚本，避免转义问题 |
| `complete_todo_item` | 标记 todo 完成，支持按 index 或名称标记 |
| `compact` | 压缩长对话，节省上下文 |
| `list_skills` | 列出 `.OpenVibe/skills/` 下所有可用的技能 |
| `load_skill` | 加载指定技能的 SKILL.md 文件并返回结构化指令内容 |
| `ask_human` | 请求人工协助（手动测试、设计决策、收集信息、帮忙找网页等）。对话框含输入框 + **Send**（发送消息回传 AI）/ **Done**（确认完成）/ **Cancel** 按钮，30 分钟超时 |
| `web_fetch` | 抓取网页并提取纯文本内容。支持 Cookie/自定义 Headers 访问登录页面。HTML 处理保留标题层级（h1-h6）、代码块格式（pre/code）、提取链接列表和 meta description |
| `text_diff` | 生成类似 git diff 的文本差异输出，支持上下文行数和行号显示（仅内存计算，无文件操作） |
| Git 相关 | 快照与历史管理（见新闻） |

</details>

<h2 id="skills-system">技能系统 / Skills</h2>

技能系统允许你为 AI 助手预设**角色、行为模式和专业知识**，通过 `.OpenVibe/skills/` 目录中的结构化 Markdown 文件来定义。每次与助手对话时，可通过工具动态加载所需技能，让助手立即获得对应领域的上下文和指令。

### 如何创建技能

1. 在 `.OpenVibe/skills/` 下创建一个子目录，名称即技能标识（如 `code-reviewer`）
2. 在该目录中创建 `SKILL.md` 文件，格式如下：

```markdown
---
name: 代码审查员
description: 专门负责 Pull Request 代码审查，重点关注安全性和性能
subSkills: [security-review, perf-review]
---

# 技能指令

你是一个经验丰富的代码审查员。审查代码时请重点关注：
- **安全性**：SQL 注入、XSS、权限泄露
- **性能**：不必要的循环、内存泄漏
- **可维护性**：命名规范、模块耦合度

请始终以表格形式输出审查结果。
```

**SKILL.md 结构说明：**

| 部分 | 必需 | 说明 |
|------|------|------|
| `---` YAML 前置元数据 | 否 | 包含 `name`（名称）、`description`（描述）、`subSkills`（关联子技能列表） |
| 正文 Markdown | 是 | 完整的指令文本，加载后作为 `instruction` 字段注入 AI 系统提示 |

> **注意**：`subSkills` 是对其他技能目录名的引用，其值应在 `.OpenVibe/skills/` 下存在对应子目录。

### 如何激活

在对话中直接使用工具即可：

**第一步：查看可用技能**
```
list_skills
```
返回示例：`{ "skills": ["code-reviewer", "paper-revision-router"], "total": 2 }`

**第二步：加载技能**
```
load_skill(name="paper-revision-router")
```
返回结构化的 `SkillInfo` 对象，包含 `name`、`description`、`instruction`（完整指令文本）和 `subSkills`。

**第三步：告诉助手你将使用该技能**
加载后，助手会自动将 `instruction` 纳入系统提示上下文，从而按照技能定义的角色和行为模式工作。

### 典型工作流

```
1. list_skills                    ← 发现可用技能
2. load_skill(name="xxxx")        ← 加载目标技能
3. 提出你的需求                    ← 助手按技能角色响应
```

你可以在一次对话中加载**多个技能**（重复 `load_skill` 即可），或将技能系统与任务规划（`create_todo_list`）结合使用。

### 目录结构参考

```
.OpenVibe/
├── memory/                 # 项目知识库（三级架构）
│   ├── README.md           # 定义规范
│   ├── L1-purpose.md       # 项目目的
│   ├── L2-inventory.md     # 文件清单
│   └── L3-roles.md         # 组件职责
├── sessions/               # 聊天会话
└── skills/
    ├── code-reviewer/
    │   └── SKILL.md
    └── paper-revision-router/
        └── SKILL.md
```

<h2 id="installation">安装 / Installation</h2>

**环境**：Node.js（建议 LTS）、VS Code **≥ 1.74**（见 `package.json` 中 `engines.vscode`）。

1. 克隆仓库：`git clone https://github.com/DoubtedSteam/OpenVibe.git`
2. 安装依赖：在项目根目录执行 `npm install`
3. 编译：`npm run compile`（开发时可用 `npm run watch` 监听）
4. 在 VS Code 中打开该文件夹，按 **F5** 启动 **Extension Development Host** 调试扩展；在侧栏打开 **Vibe Coding** 视图使用聊天。

> **Requirements:** Node.js (LTS recommended), VS Code **≥ 1.74**. Clone → `npm install` → `npm run compile` → open in VS Code → **F5** to run the extension host → use the **Vibe Coding** sidebar chat.

<h2 id="configuration">配置 / Configuration</h2>

在 VS Code **设置**中搜索 `vibe-coding` 即可。下列键名与 `package.json` 中 `contributes.configuration` 一致。

| 配置项 | 类型 | 默认 | 说明 |
|--------|------|------|------|
| `vibe-coding.apiBaseUrl` | `string` | `https://api.deepseek.com` | OpenAI 兼容 API 的 Base URL |
| `vibe-coding.apiKey` | `string` | `""` | API 密钥（**必填**） |
| `vibe-coding.model` | `string` | `deepseek-reasoner` | 模型名 |
| `vibe-coding.confirmChanges` | `boolean` | `true` | 应用 `edit` 前是否确认 |
| `vibe-coding.confirmShellCommand` | `boolean` | `true` | `run_shell_command` 在审查后是否再经人工确认（与 `confirmChanges` 独立） |
| `vibe-coding.maxInteractions` | `number` | `-1` | 最大工具调用轮数（`-1` 不限） |
| `vibe-coding.maxSequenceLength` | `number` | `800000` | 生成文本最大长度 |
| `vibe-coding.language` | `string` | `zh-CN` | AI 交互语言（`auto` 自动检测 VS Code UI 语言 / `en` 英文 / `zh-CN` 简体中文） |
| `vibe-coding.todolistReview.enabled` | `boolean` | `true` | 是否对 todo 生成/编辑做独立审查 |
| `vibe-coding.todolistReview.maxAttempts` | `number` | `5` | 单次 `create_todo_list` 最大审查/重试轮数（≥1） |
| `vibe-coding.todolistReview.reviewTimeoutMs` | `number` | `120000` | 审查与 regenerate 请求超时（毫秒，≥5000） |
| `vibe-coding.todolistReview.editorTimeoutMs` | `number` | `120000` | 编辑器代理请求超时（毫秒，≥5000） |
| `vibe-coding.editReview.enabled` | `boolean` | `true` | 是否对代码 `edit` 做独立审查 |
| `vibe-coding.editReview.timeoutMs` | `number` | `120000` | 编辑审查超时（毫秒，≥5000） |
| `vibe-coding.shellCommandReview.enabled` | `boolean` | `true` | 是否对 shell 命令启用编辑代理 + 安全审查 |
| `vibe-coding.shellCommandReview.maxAttempts` | `number` | `5` | 单次命令最大编辑/审查轮数（≥1） |
| `vibe-coding.shellCommandReview.reviewTimeoutMs` | `number` | `120000` | Shell 安全审查超时（毫秒，≥5000） |
| `vibe-coding.shellCommandReview.editorTimeoutMs` | `number` | `120000` | Shell 编辑代理超时（毫秒，≥5000） |

> All keys are under **`vibe-coding.*`** in Settings.

<h2 id="memory-management-system">内存管理 / Memory</h2>

项目知识库采用**三级文件拆分**设计，存放在 `.OpenVibe/memory/` 目录下，实现**按需读写、互不影响**的项目上下文管理。

### 三级架构

| 层级 | 文件 | 内容 | 稳定度 |
|------|------|------|--------|
| **定义规范** | `README.md` | 元定义：各层级用途、读写时机、维护规则 | ★★★★★ 几乎不变 |
| **Level 1** | `L1-purpose.md` | 项目概览：一句话定义、核心目标、设计原则、技术栈、数据流 | ★★★ 极少变 |
| **Level 2** | `L2-inventory.md` | 文件清单：目录树、每个文件一行描述、导入导出、删除影响 | ★★☆ 中等 |
| **Level 3** | `L3-roles.md` | 组件职责：模块/类的职责、关键字段、生命周期、关系 | ★☆☆ 经常变 |

### 设计要点

- **按需读写** — 没有自动注入/预加载，AI 自行决策何时读取哪一层，不浪费 token
- **互不影响** — 修改 `L3-roles.md`（最常见操作）不会 invalidate 对话中 L1/L2 的内容
- **定义即文件** — `README.md` 是架构的"元定义"规范，AI 通过读取它了解各层的规则
- **自举** — 本项目自身的知识库即按本目录规范管理
- **Bootstrap** — 目录非自动创建，AI 发现文件不存在时触发初始化流程

> Project knowledge is stored in **`.OpenVibe/memory/`** with three levels: purpose, inventory, and roles. See `README.md` inside that directory for the full definition.

<h2 id="source-files-index">关键源文件索引 / Source files index</h2>

| 文件 | 作用 |
|------|------|
| `src/systemPrompt.ts` | 固定系统提示模板（~75 行） |
| `src/agentRuntimeContext.ts` | 动态生成 Host environment + Active Editor |
| `src/modules/ConversationService.ts` | 消息组装（`buildMessagesForLlm`）、历史压缩（`compactHistory`） |
| `src/modules/MessageHandler.ts` | 主循环：用户消息上下文注入、tool call 循环、compact 触发 |
| `src/modules/ToolExecutor.ts` | Todo 状态管理、工具调度、shell review |
| `src/modules/ChatViewProvider.ts` | Webview 通信、UI 消息持久化 |
| `src/modules/UIManager.ts` | UI 状态管理（Edit Permission、Webview 通信） |
| `src/modules/SessionManager.ts` | 会话持久化（消息、快照、技能、压缩档案） |
| `src/modules/todolistReview.ts` | Todo 清单独立审查（LLM 代理） |
| `src/modules/codeEditReview.ts` | 代码编辑独立审查（LLM 代理） |
| `src/modules/shellCommandReview.ts` | Shell 命令编辑代理 + 安全审查 |
| `src/modules/shellSecurity.ts` | Shell 安全检测（文件操作绕过、上下文采集检测） |
| `src/tools/replaceLinesTool.ts` | `edit` 工具核心实现（行替换 + LLM 审查） |
| `src/tools/readFileTool.ts` | `read_file` 工具实现 |
| `src/tools/findInFileTool.ts` | `find_in_file` 工具实现 |
| `src/tools/shellTool.ts` | `run_shell_command` 工具实现 |
| `src/tools/webFetchTool.ts` | `web_fetch` 工具实现（HTML 解析） |
| `src/tools/workspaceTools.ts` | 工作区工具（`get_workspace_info` / `create_directory` / `get_diagnostics` / `get_file_info`） |
| `src/tools/notificationTools.ts` | `show_notification` / `ask_human` 工具实现 |
| `src/tools/gitTools.ts` | Git 快照与历史管理 |
| `src/tools/skillTools.ts` | 技能系统（`list_skills` / `load_skill` / `activate_skill` 等） |
| `src/tools/grepSearchTool.ts` | `grep_search` 工具实现 |
| `src/tools/helpers.ts` | 全局技能池变量 + 激活回调设置 |
| `src/api.ts` | API 调用封装（`sendChatMessage`） |
| `src/types.ts` | `ChatMessage`、`ToolCall`、`ChatSession` 等类型定义 |
| `src/constants.ts` | 配置常量（`COMPACT_RESERVE_TOKENS`、`AUTO_COMPACT_TOKEN_THRESHOLD`） |
| `src/toolDefinitions.ts` | 工具的 JSON Schema 定义 |
| `src/mmOutput.ts` | `<edit-content>` / `<shell-content>` XML 标签提取与占位符替换 |
| `src/operationController.ts` | 操作中止控制（`AbortController` 封装） |
| `src/utils/pathHelpers.ts` | 路径工具函数（`resolveWorkspacePath`、`readLines`、`writeLines`） |
| `src/utils/htmlParser.ts` | HTML 转纯文本（`htmlToPlainText`、提取标题/链接/描述） |


<h2 id="license">许可证 / License</h2>

**MIT** — 见仓库内 [LICENSE](LICENSE) 文件。

---

*OpenVibe — 简洁、可控的 AI 辅助编程体验 / Simple, controllable AI‑assisted coding.*
