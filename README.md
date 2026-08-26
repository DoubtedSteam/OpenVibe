![OpenVibe Logo](imgs/logo.png)

# OpenVibe — 极简 AI 编程助手 / Minimalist AI Assistant

**在 VS Code 工作区内直接读写与编辑项目的智能助手。** 基于 **read**、**find**、**edit** 三类核心工具，并配合任务规划、多智能体审查与会话管理。当前版本 **v0.10.0**：纯 JSON 工具参数、可视化设置中心、工具模式（Tool Profiles）、多模型切换、思考强度与历史压缩（见[版本历史](#changelog)）。

> **An intelligent assistant that reads and edits your project inside the VS Code workspace.** Built around **read**, **find**, and **edit**, with task planning, multi-agent review, and session management. Current version **v0.10.0** (see [changelog](#changelog)).

<h2 id="table-of-contents">目录 / Table of contents</h2>

- [重要提示 / Important notice](#important-notice)
- [版本历史 / Changelog](#changelog)
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

<h2 id="changelog">版本历史 / Changelog</h2>

> **2026-08-22 · v0.10.0**：**废弃 `<edit-content>` XML fallback**——工具参数回归纯 JSON 字符串，多行内容直接写入 `newContent` / `command`，由 JSON 转义处理，不再需要 XML 标签提取/注入。消除了「空 `newContent` 静默删除」风险、并行工具调用标签错位以及历史消息中 `tool_calls` 参数与执行结果不一致的问题；工具参数 JSON 解析失败时返回错误要求模型重试，绝不带空参数执行。自 v0.8.0（2026-06-06）以来累计 0.8.1 ~ 0.9.1 五个小版本。

> **2026-08-21 · v0.9.1（主要版本）**：1) **可视化设置中心**——聊天工具栏 ⚙ 或 `vibe-coding.openSettings`：全部 `vibe-coding.*` 设置的可视化编辑、工具模式插件矩阵（可用/隐藏切换、全启/全隐、免审查标记）、模式新建/删除/改名、工作区覆盖检测（⚠ 徽标 + 一键清除） 2) **工具模式 Tool Profiles**——跨工作区工具可见性配置（`~/.openvibe/tool-profiles/*.json`），内置「标准 full」/「故事（隐藏 `run_shell_command` + 免审查）」模式，隐藏工具从 LLM 工具列表移除且执行层拒绝；会话级模式记忆 + 底部栏切换 3) **多模型切换 UI**——`vibe-coding.models` 数组（每项可覆写 apiBaseUrl/apiKey/maxInteractions/maxSequenceLength），底部栏模型选择器 + 会话级记忆（重载不丢失） 4) **思考强度**——`vibe-coding.reasoningEffort` 五档（off/low/medium/high/max），DeepSeek `thinking` 模式 5) **Memory Sync（L2 harness）**——子 Agent 完成后自动检测未登记的修改文件并注入同步指令（接触即记录），可配置关闭 6) **shell 进程树终止**——停止按钮可终止整棵进程树（Windows `taskkill /T /F`；POSIX 进程组 SIGTERM→SIGKILL） 7) **会话持久化增强**——todo 状态、最近会话、模型/模式选择均落盘 8) **独立审查配置化**——edit/todo/shell 审查开关与超时可配置（`editReview.*` / `todolistReview.*` / `shellCommandReview.*`）。

<details>
<summary>更早版本 / Earlier versions（2026-04 ~ 2026-08）</summary>

| 版本 | 日期 | 要点 |
|------|------|------|
| v0.9.0 | 2026-08-16 | 修复与体验优化 |
| v0.8.3 | 2026-08-15 | 新增 `get_terminal_content` 工具（Shell Integration API 读取终端输出，支持按终端名过滤与行数限制） |
| v0.8.2 | 2026-08-02 | 修复与体验优化 |
| v0.8.1 | 2026-07-31 | 修复与体验优化 |
| v0.8.0 | 2026-06-06 | **多智能体调度架构**：主循环三 Phase（自由→调度→自由）；`create_todo_list` 触发逐项派遣执行 Agent（封锁 todo 修改）+ 评估 Agent（只读 + 可改计划）；子消息按边界压缩（零 LLM 成本）；全局 compact 仅限自由模式 |
| — | 2026-05-20 | **BTW 临时子对话**：输入以 `\btw` 开头即启动旁支对话，结束后自动从 LLM 上下文移除，主对话不受影响 |
| — | 2026-05-09 | **浏览器子智能体**：`browser_sub_agent`（独立 LLM 循环 + Playwright 无头浏览器 + SSRF 防护） |
| — | 2026-05-02 | **知识库三级化**：`.OpenVibe/memory/`（README 元定义 + L1/L2/L3），按需读写、互不影响，泛化为通用知识库 |
| — | 2026-04-29 | **Compact 重构**：复用主对话 LLM + 原始消息格式，前缀/KV 缓存高命中 |
| — | 2026-04-26 ~ 04-28 | `web_fetch` HTML 处理升级（标题层级/代码块/链接提取）；`ask_human` 重载容错 + 输入框消息回传 |
| — | 2026-04-25 | **技能系统**（`list_skills` / `load_skill`）、多语言（`vibe-coding.language`）、会话自动命名、工作流规范 |
| — | 2026-04-16 | **shell 强化审查**（禁止 shell 文件读写、结构化返回、多级审查 + 用户确认）；转义协议演进（MM_OUTPUT → XML fallback，最终被纯 JSON 取代） |
| — | 2026-04-14 | **独立审查**：todo 清单与代码编辑由独立 LLM 代理校验 |
| — | 2026-04-11 | **Git 快照**：编码过程中自动快照，UI 中回滚与管理版本 |

</details>

> **2026-08-22 · v0.10.0 (EN)**: `<edit-content>` XML fallback deprecated — tool arguments are pure JSON strings again; multiline content goes directly into `newContent` / `command`. Removes the silent-deletion risk of empty `newContent`, parallel tool-call misalignment, and history inconsistency (persisted `tool_calls` args now always match what was executed). A failed JSON parse returns an error and asks the model to retry — tools are never executed with empty args.


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

替换指定行范围；可选经独立 LLM 审查后再应用。`newContent` 以纯 JSON 字符串直接传递完整文本——多行内容由 JSON 转义（`\n`）处理，无需任何 XML 标签。传空字符串 `""` 仅用于删除该行段：⚠️ 不可逆（无撤销），务必确认删除意图后再传空。工具参数 JSON 解析失败时返回错误要求模型重试，不会带空参数执行。


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
| **SYSTEM_PROMPT** | `src/systemPrompt.ts` | 固定提示模板（~104 行）：Tools 描述、Memory 增量学习规范、Task Planning 规则、Workflow 核心循环 |
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

> Skills 不嵌入 system prompt，而是通过 `load_skill` 工具返回的指令文本进入 LLM 上下文。

<h2 id="dual-track-messages">双轨消息系统 / Dual-track messages</h2>

每个会话维护**两份消息列表**：

| 列表 | 字段 | 用途 | Compact 影响 |
|------|------|------|-------------|
| **`messages`** | `ChatSession.messages` | 前端展示：**完整对话历史** | ❌ 不受影响 |
| **`llmMessages`** | `ChatSession.llmMessages` | LLM 上下文：可能被 compact 精简 | ✅ 被替换为摘要 |

消息添加时自动同步到两份列表。`compact` 只替换 `llmMessages`，前端始终看到完整历史。

### LLM 消息过滤规则

`buildMessagesForLlm()` 中过滤消息：

| `role` | `hiddenFromLlm` | `btwBranch` | 发给 LLM？ | 用途 |
|--------|----------------|-------------|-----------|------|
| `system` | — | — | ✅ | 系统提示 |
| `user` | — | `false` / `undefined` | ✅ | 主对话用户输入 |
| `user` | — | `true` | ⚠️ **仅 BTW 活动时发送** | BTW 临时子对话输入 |
| `assistant` | `false` / `undefined` | — | ✅ | AI 回复 + `tool_calls` |
| `assistant` | `true` | — | ❌ **过滤** | UI 气泡（如 todo 创建提示） |
| `tool` | — | — | ✅ | 工具执行结果 |
| `event` | — | — | ❌ **过滤** | 仅 UI 事件通知 |

**BTW（By The Way）过滤逻辑：** 当最后一条用户消息的 `btwBranch === true`（BTW 活动期间），全部消息保留 → LLM 上下文 = `[历史][btw 对话]`；否则过滤掉所有 `btwBranch` 消息 → LLM 上下文 = `[历史][新对话]`。UI 前端始终显示完整历史，BTW 过滤只影响 LLM 上下文。

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

### 子 Agent 压缩 (Scoped Compaction)

调度模式中，每个子 Agent 完成后**立即在其自身边界内压缩**，不跨 agent 边界：

| Agent 类型 | 压缩方式 | 成本 | 产出 |
|-----------|---------|------|------|
| **执行 Agent** (`executor:N`) | 提取最后一条 assistant 回复作为摘要 + 统计修改文件 + 工具调用次数 | 零 LLM 调用 | 1 条 system 消息 |
| **评估 Agent** (`evaluator:N`) | 扫描是否调用了 `create_todo_list` 修改计划 | 零 LLM 调用 | 1 条 system 消息（"计划不变" / "计划已修改"） |

压缩后的消息替换原始子 Agent 消息流（通常 10-30 条），使上下文保持紧凑。

### 全局压缩 (Global Compaction)

全局 compact 只能由**主 Agent（自由模式）**触发，子 Agent 内部禁止：

| 模式 | 自动 compact | 手动 compact 工具 | `/compact` 命令 |
|------|------------|------------------|----------------|
| 自由模式 | ✅ | ✅ | ✅ |
| 执行 Agent | ❌ | ❌ 返回错误 | ❌ |
| 评估 Agent | ❌ | ❌ 返回错误 | ❌ |

### 触发方式

| 方式 | 触发点 | 说明 |
|------|--------|------|
| **手动** | 用户输入 `/compact` | 立即触发（仅自由模式） |
| **手动** | AI 调用 `compact` 工具 | Tool call 循环中触发（仅自由模式） |
| **自动** | 累计 `total_tokens` ≥ 1,000,000 | Fire-and-forget（仅自由模式） |

> **自动 compact** 基于整个会话所有 API 调用返回的 `total_tokens` 之和。每次 API 调用后累加并检查，超过阈值则异步触发。

<h2 id="multi-agent-architecture">多智能体架构 / Multi-agent architecture</h2>

### 调度架构 (Scheduling Architecture)

系统通过三阶段循环实现「探索 → 执行 → 验证」分离：

```
用户输入
  ↓
自由模式 (Free mode)           ← 全工具可用，探索/规划/简单任务
  ├─ no-tool-calls → 完成
  └─ create_todo_list → 进入调度模式
        ↓
调度模式 (Scheduling mode)     ← 按 todo list 逐项派遣子 Agent
  for each todo item:
    执行 Agent (Executor)       ← 封锁 todo 修改，专注完成任务
    评估 Agent (Evaluator)      ← 只读 + 可修改计划，不能写代码
  todo 清空 → 回到自由模式
        ↓
自由模式 (Final)               ← 最终总结，LLM 自然结束
```

三种 Agent 共享同一条消息流，通过 `subAgentTag` 标签区分归属：

| 阶段 | 标签 | 可用工具 | 压缩规则 |
|------|------|---------|---------|
| **自由模式** | `free` | 全部 | 全局 compact（token 阈值触发） |
| **执行 Agent** | `executor:N` | 除 `create_todo_list` 外的全部 | 完成后压缩为摘要（末轮回复 + 文件列表） |
| **评估 Agent** | `evaluator:N` | 只读工具 + `create_todo_list` | 完成后压缩为标记（计划是否被修改） |

> **核心原则**：代码控制调度（何时 dispatch 下一个 item），LLM 只负责执行。子 Agent 完成检测基于 `no-tool-calls` 信号，无需 LLM 显式标记。

### 审查智能体 (Review Agents)

系统包含多个独立审查角色，形成「执行 ↔ 验证」分离：

| 智能体 | 职责 |
|--------|------|
| **调度器** (Scheduler) | 按 todo list 顺序派遣执行/评估 Agent，控制压缩边界 |
| **执行 Agent** (Executor) | 完成单个子任务，无权修改 todo list |
| **评估 Agent** (Evaluator) | 检查执行结果，评估是否需要修改计划，无权写代码 |
| **审查智能体** (Review) | 独立校验 todo 合理性、编辑正确性、shell 命令安全性 |

> 工具的调用由执行 Agent 直接完成——不存在独立的"编辑智能体"。

### Shell 命令强化审查流程

1. **严格安全规则**：禁止使用 shell 进行任何文件读写操作（如 cat、type、dir、grep），强制使用专用工具
2. **防止命令漂移**：审查命令是否与用户请求和 todo 上下文一致
3. **结构化返回**：执行结果包含 `command`、`cwd`、`exitCode`、`durationMs`、`summary`、`keyErrors`
4. **多级审查**：主智能体 → shell 安全检查 → 独立 LLM 审查 → 用户确认（可选）
5. **上下文注入**：自动注入 todo 目标与最近执行历史
6. **防重复执行**：记录最近命令，避免无意义重复

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
    ├─ 2. BTW 检测
    │   └─ 消息以 `\btw` 开头 → 剥离前缀并标记 `btwBranch: true`
    │
    ├─ 3. 构建用户消息上下文
    │   ├─ 读取 Edit Permission 状态
    │   ├─ getTodoControlInfo()            ← 检查 todo 状态
    │   └─ 嵌入 ─── Context ─── 块到用户消息正文开头
    │
    ├─ 4. Phase 1: _agentPhase('free', [])  ← 自由模式
    │   ├─ buildMessagesForLlm()
    │   ├─ sendChatMessage()
    │   ├─ 循环处理工具调用
    │   └─ no-tool-calls → 结束
    │
    ├─ 5. Phase 2: _schedulingLoop()        ← 调度模式（若有 todo）
    │   for each pending item:
    │     ├─ _agentPhase('executor:N', blocked=['create_todo_list'])
    │     ├─ compactAgentMessages('executor:N')  ← 机械压缩执行者消息
    │     ├─ _agentPhase('evaluator:N', blocked=['edit','run_shell_command',...])
    │     └─ compactAgentMessages('evaluator:N') ← 机械压缩评估者消息
    │
    ├─ 6. Phase 3: _agentPhase('free', [])  ← 最终自由模式
    │
    └─ 7. 循环结束 → 等待下一条用户输入

注：全局 compact（自动+手动）仅在自由模式（_currentTag === 'free'）触发
```

<h2 id="other-available-tools">其它辅助工具 / Other tools</h2>

<details>
<summary>展开查看 / Expand</summary>

| 工具 | 说明 |
|------|------|
| `get_workspace_info` | 工作区根目录与顶层文件 |
| `create_directory` | 创建目录（可递归） |
| `get_diagnostics` | 获取 VS Code 诊断（问题/警告/错误），可按文件过滤或全工作区 |
| `get_file_info` | 文件/目录元数据（存在性、大小、修改时间），用于编辑前验证路径 |
| `show_notification` | 向用户显示 VS Code 通知（toast） |
| `create_todo_list` | 多步骤任务规划（先计划后执行），经独立 LLM 审查验证；支持 `expandIndex` 展开子计划 |
| `complete_todo_item` / `advance_todo_item` | 标记 todo 完成 / 推进到下一步（含摘要） |
| `task_complete` | 任务完成信号，结束当前请求 |
| `compact` | 压缩长对话，节省上下文（仅自由模式） |
| `run_shell_command` | 在项目根执行命令；**禁止使用 shell 进行任何文件读写操作**（强制使用专用工具），经 shell 编辑代理优化 + 独立安全审查（含防上下文获取、防漂移、结构化返回、多级审查流程）。多行命令直接以 JSON 字符串传递（转义换行），无需 XML 标签 |
| `list_skills` / `load_skill` | 列出 / 加载技能（`.OpenVibe/skills/` 与全局技能池，SKILL.md → 指令注入上下文） |
| `grep_search` | 跨工作区文件搜索（**字面子串匹配，非正则**；默认排除 node_modules/.git 等，支持 include/exclude glob） |
| `get_terminal_content` | 读取用户 VS Code 终端（Shell Integration API）的最近输出，可按终端名过滤、指定返回行数；用于查看长任务（dev server / 构建）状态或排查手动命令错误 |
| `ask_human` | 请求人工协助（手动测试、设计决策、收集信息、帮忙找网页等）。对话框含输入框 + **Send**（发送消息回传 AI）/ **Done**（确认完成）/ **Cancel** 按钮，30 分钟超时 |
| `web_fetch` | 抓取网页并提取纯文本内容。支持 Cookie/自定义 Headers 访问登录页面。HTML 处理保留标题层级（h1-h6）、代码块格式（pre/code）、提取链接列表和 meta description |
| `browser_sub_agent` | **浏览器子智能体**——委派复杂浏览器任务给独立的 LLM 循环代理。可自主导航、填表、点击、提取文本和搜索，基于 Playwright 无头浏览器自动化 + SSRF 防护。返回结构化 JSON（状态摘要 + 操作日志 + 页面状态）。需配置 API Key |
| Git 快照 | 编码过程中自动创建 Git 快照，可在 UI 中回滚与管理版本（非 LLM 工具，由 MessageHandler/ToolExecutor 自动触发） |

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

> **配置分层 / Config layering**
> - **用户级（`application` scope）**：`apiBaseUrl`、`apiKey`、`model`、`models`、`language`、`confirmChanges`、`confirmShellCommand`、`editReview.enabled`、`todolistReview.enabled`、`shellCommandReview.enabled` —— 只能写在 **User Settings**，不会被工作区 `.vscode/settings.json` 覆盖（API Key 等敏感项无法被仓库静默改写）。
> - **工作区级（`window` scope）**：`toolProfile`、`reasoningEffort`、`maxInteractions`、`maxSequenceLength`、`memorySync.enabled` 及各 review 的 `timeoutMs` / `maxAttempts` —— 允许项目在 Workspace Settings 中按需覆盖。
> - **API Key 存储**：`vibe-coding.apiKey` 已不再推荐长期明文保存。扩展优先从 **SecretStorage**（VS Code 安全存储）读取 `openvibe.apiKey`；老配置中的 `vibe-coding.apiKey` 会在激活时自动迁移到 SecretStorage（**不自动清除明文**）。可执行命令 **`OpenVibe: 迁移 API Key 到 SecretStorage`** 手动迁移并选择是否清除 Settings 中的明文。
> - **工作区数据**：`.OpenVibe/` 目录（会话、记忆）属于**工作区本地数据**，请勿提交敏感信息；建议加入 `.gitignore`。


| 配置项 | 类型 | 默认 | 说明 |
|--------|------|------|------|
| `vibe-coding.apiBaseUrl` | `string` | `https://api.deepseek.com` | OpenAI 兼容 API 的 Base URL |
| `vibe-coding.apiKey` | `string` | `""` | API 密钥（**必填**，用户级）。**推荐**改用 SecretStorage：设置后台的 API Key 输入框或迁移命令会写入 SecretStorage，不再明文落盘 |
| `vibe-coding.model` | `string` | `deepseek-reasoner` | 模型名 |
| `vibe-coding.models` | `array` | `[]` | 多模型列表（底部栏模型选择器）。每项含 `name`（显示名）+ `model`（模型名），可覆写 `apiBaseUrl` / `apiKey` / `maxInteractions` / `maxSequenceLength`；未配置时回退全局设置 |
| `vibe-coding.toolProfile` | `string` | `full` | 当前工具模式（tool profile，如 `full` 标准 / `写作` 故事）；profile 文件位于 `~/.openvibe/tool-profiles/`，被隐藏的工具不会发给 LLM 且在执行层被拒绝。会话级选择优先于该全局默认 |
| `vibe-coding.reasoningEffort` | `string` | `high` | 思考强度：`off` 关闭思考（DeepSeek `thinking: disabled`）/ `low` / `medium` / `high` / `max`（`thinking: enabled` + 对应 `reasoning_effort`） |
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
| `vibe-coding.shellCommandReview.reviewTimeoutMs` | `number` | `120000` | Shell 安全审查超时（毫秒，≥5000） |
| `vibe-coding.memorySync.enabled` | `boolean` | `true` | Memory Sync（L2 harness）：子 Agent 完成后自动检测已修改但未登记于 `.OpenVibe/memory/L2-inventory.md` 的文件并注入同步指令（接触即记录）；设为 `false` 关闭自动记忆同步 |

### 完整配置示例 / Full configuration example

将以下内容放入 **User** 的 `settings.json`（用户级配置；`apiKey` 推荐改用 SecretStorage，见下方说明）：

```jsonc
{
  // ── API 配置 ──────────────────────────────────────────────
  // 推荐：在设置中心（或命令面板执行
  //   "OpenVibe: 迁移 API Key 到 SecretStorage"）填写密钥，
  // 密钥会写入 SecretStorage，不在此处明文保存。
  // 老用户若已在 settings 中配置明文 apiKey，扩展会在激活时自动迁移（不清除明文）。
  "vibe-coding.apiBaseUrl": "https://api.deepseek.com",
  "vibe-coding.model": "deepseek-reasoner",

  // ── 多模型切换（可选）─────────────────────────────────────────
  "vibe-coding.models": [
    {
      "name": "DeepSeek R1",
      "model": "deepseek-reasoner"
    },
    {
      "name": "DeepSeek Chat",
      "model": "deepseek-chat",
      "apiBaseUrl": "https://api.deepseek.com",
      "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"   // ← 可覆写 Key
    },
    {
      "name": "Claude 3.5 Sonnet",
      "model": "claude-3-5-sonnet-latest",
      "apiBaseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
  ],

  // ── 交互控制 ─────────────────────────────────────────────────
  "vibe-coding.language": "auto",         // auto / en / zh-CN
  "vibe-coding.confirmChanges": true,      // edit 前确认
  "vibe-coding.confirmShellCommand": true, // shell 命令确认
  "vibe-coding.maxInteractions": -1,       // -1 = 不限
  "vibe-coding.maxSequenceLength": 800000,

  // ── 独立审查（默认开启，可单独关闭）─────────────────────────
  "vibe-coding.editReview.enabled": true,
  "vibe-coding.todolistReview.enabled": true,
  "vibe-coding.shellCommandReview.enabled": true,
}
```
> All keys are under **`vibe-coding.*`** in Settings.

<h2 id="memory-management-system">内存管理 / Memory</h2>

项目知识库采用**三级文件拆分**设计，存放在 `.OpenVibe/memory/` 目录下，实现**按需读写、互不影响**的项目上下文管理。知识**随需求渐进积累**（增量学习），而非启动时一次性建立对项目的完整认识。

### 三级架构

| 层级 | 文件 | 内容 | 稳定度 |
|------|------|------|--------|
| **定义规范** | `README.md` | 元定义：各层级用途、读写时机、维护规则 | ★★★★★ 几乎不变 |
| **Level 1** | `L1-purpose.md` | 项目概览：一句话定义、核心目标、设计原则、技术栈、数据流 | ★★★ 极少变 |
| **Level 2** | `L2-inventory.md` | 已探索文件的学习记录：接触过的文件 + 一行描述 + 关键导出/依赖（增量增长） | ★★☆ 随探索增长 |
| **Level 3** | `L3-roles.md` | 已理解组件的职责档案：模块/类的职责、关键字段、生命周期、关系（首次接触才建档） | ★☆☆ 经常变 |

### 设计要点

- **增量学习（v2.1）** — 接触哪里学哪里：首次 `read_file`/`edit` 一个文件 → 记录到 L2；首次理解组件 → 建档到 L3。**未接触 = 无条目**，不为未读文件预写职责
- **按需读写** — 没有自动注入/预加载，AI 自行决策何时读取哪一层，不浪费 token
- **互不影响** — 修改 `L3-roles.md`（最常见操作）不会 invalidate 对话中 L1/L2 的内容
- **定义即文件** — `README.md` 是架构的"元定义"规范，AI 通过读取它了解各层的规则
- **自举** — 本项目自身的知识库即按本目录规范管理
- **最小 Bootstrap** — 目录非自动创建；初始化只建骨架（README + L1），**不扫描整个项目**，L2/L3 随接触逐步增长

> Project knowledge is stored in **`.OpenVibe/memory/`** with three levels: purpose, inventory, and roles. Knowledge accumulates incrementally — contact is recorded, untouched files have no entries. See `README.md` inside that directory for the full definition.

<h2 id="source-files-index">关键源文件索引 / Source files index</h2>

| 文件 | 作用 |
|------|------|
| `src/systemPrompt.ts` | 固定系统提示模板（~104 行，含 Memory 增量学习规范） |
| `src/agentRuntimeContext.ts` | 动态生成 Host environment + Active Editor |
| `src/modules/ConversationService.ts` | 消息组装（`buildMessagesForLlm`：含 BTW 过滤 + 历史压缩`compactHistory` + 子 Agent 消息压缩`compactAgentMessages`） |
| `src/modules/MessageHandler.ts` | 主循环：三阶段调度（自由→调度→自由）、BTW 检测、tool call 循环、compact 权限控制 |
| `src/modules/ToolExecutor.ts` | Todo 状态管理、工具调度与阻断（`setBlockedTools`）、shell review |
| `src/modules/ChatViewProvider.ts` | Webview 通信、UI 消息持久化、模块连线 |
| `src/modules/UIManager.ts` | UI 状态管理（Edit Permission、Webview 通信） |
| `src/modules/ConfigService.ts` | 配置统一入口：`vibe-coding.*` 默认值与读取、API Key SecretStorage 缓存、`getApiConfig` 组装 |
| `src/modules/SessionManager.ts` | 会话持久化（消息、快照、技能、压缩档案） |
| `src/modules/todoListManager.ts` | Todo 清单状态管理（创建、展开、标记完成、状态查询） |
| `src/modules/activatedSkillsManager.ts` | 激活技能持久化管理（注册回调、恢复状态） |
| `src/modules/webviewReplay.ts` | 会话回放逻辑（消息重放到前端 UI） |
| `src/modules/messageSanitizer.ts` | 消息清理（去除不完整 tool_call 序列） |
| `src/modules/historyCompactor.ts` | 历史压缩核心（保留窗口计算 + 边界调整 + 压缩请求构建） |
| `src/modules/chatViewHtml.ts` | Webview HTML/CSS 模板（约 960 行纯模板代码） |
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
| `src/tools/skillTools.ts` | 技能系统（`list_skills` / `load_skill`） |
| `src/tools/grepSearchTool.ts` | `grep_search` 工具实现 |
| `src/tools/terminalTool.ts` | `get_terminal_content` 工具实现（Shell Integration API 读取终端输出） |
| `src/tools/browserAgentTool.ts` | `browser_sub_agent` 浏览器子智能体工具实现（Playwright） |
| `src/tools/toolProfiles.ts` | 工具模式（Tool Profiles）：跨工作区工具可见性配置、内置模式 seed、profile 增删改查 |
| `src/modules/settingsDashboard.ts` + `settingsDashboardHtml.ts` | 可视化设置中心（Webview 面板：设置白名单编辑、工具模式插件矩阵、覆盖检测） |
| `src/tools/helpers.ts` | 全局技能池变量 + 激活回调设置 |
| `src/api.ts` | API 调用封装（`sendChatMessage`） |
| `src/types.ts` | `ChatMessage`、`ToolCall`、`ChatSession` 等类型定义（含 `btwBranch` 字段） |
| `src/constants.ts` | 配置常量（`COMPACT_RESERVE_TOKENS`、`AUTO_COMPACT_TOKEN_THRESHOLD`） |
| `src/toolDefinitions.ts` | 工具的 JSON Schema 定义 |
| `src/mmOutput.ts` | ~~XML 标签提取与占位符替换~~（2026-08-22 已废弃，仅剩说明注释，可手动删除） |
| `src/operationController.ts` | 操作中止控制（`AbortController` 封装） |
| `src/utils/pathHelpers.ts` | 路径工具函数（`resolveWorkspacePath`、`readLines`、`writeLines`） |
| `src/utils/htmlParser.ts` | HTML 转纯文本（`htmlToPlainText`、提取标题/链接/描述） |
| `src/utils/browserAgent.ts` | 浏览器子智能体执行循环（Playwright） |
| `src/utils/browserManager.ts` | 浏览器实例管理（含 forceClose 清理） |
| `src/webview/` | 前端逻辑：`main.js`（消息渲染、diff 卡片、底部栏 mode/模型/思考强度选择器）、`settingsDashboard.js`（设置中心前端） |


<h2 id="license">许可证 / License</h2>

**MIT** — 见仓库内 [LICENSE](LICENSE) 文件。

---

*OpenVibe — 简洁、可控的 AI 辅助编程体验 / Simple, controllable AI‑assisted coding.*
