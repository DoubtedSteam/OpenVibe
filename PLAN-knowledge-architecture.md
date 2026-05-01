# 知识库三级架构泛化方案（迭代版）

> 目标：将 `memory.md` 从 OpenVibe 项目专用知识库改造为**任何项目可用的通用知识库系统**，同时通过三文件拆分优化 API cache 命中率。

---

## 一、设计原则

1. **系统提示词只做提醒，不规定行为** — sys prompt 仅告知 AI 有 `.OpenVibe/memory/` 这个目录存在，具体读不读、何时读由 AI 自行判断
2. **定义即文件** — 三级架构的定义规范独立存放（`memory/README.md`），AI 通过读取该文件了解各层的用途和规则
3. **按需读写** — 没有自动注入，没有预加载。AI 在需要项目上下文时才 `read_file` 对应的层级文件
4. **按需初始化** — bootstrap 不在 session 启动时触发，而是在 AI 第一次试图读取 memory 文件但发现不存在时触发

---

## 二、文件结构

```
.OpenVibe/
├── memory/
│   ├── README.md          # 三级架构定义规范（新增）
│   ├── L1-purpose.md      # 项目目的（极少变）
│   ├── L2-inventory.md    # 文件清单（中等变化）
│   └── L3-roles.md        # 组件角色（高频变化）
└── memory.md              # ❌ 移除
```

### 各文件职责

| 文件 | 角色 | 内容 | 稳定度 |
|------|------|------|--------|
| `README.md` | **定义存档** | 三级架构规范：每层是什么、何时读写、规则 | 几乎不变 |
| `L1-purpose.md` | 项目全局 | 一句话定义、核心目标、设计原则、技术栈、数据流 | ★★★ 极少变 |
| `L2-inventory.md` | 文件索引 | 目录树、每个文件的一行描述、导入导出、删除影响 | ★★☆ 中等 |
| `L3-roles.md` | 组件职责 | 模块/类/组件的职责、关键字段、生命周期、关系 | ★☆☆ 经常变 |

---

## 三、README.md 定义规范（存档）

这是整个知识库的"元定义"文件，AI 读取它来了解三级架构的含义：

```markdown
# Knowledge Base (.OpenVibe/memory/)

This directory stores the project's structured knowledge across three
independent files. **Read only what you need.**

## L1-purpose.md — Project overview
What is this project for? Core goals, design principles, technology stack,
architecture and data flow, key decisions.
- **Read**: at session start, or when you need the big picture.
- **Update**: only when the project's high-level direction changes.

## L2-inventory.md — File inventory
Directory tree, each file's one-line purpose, imports/exports, impact if
deleted. Think of it as a project map.
- **Read**: when exploring unfamiliar files or deciding where to place new code.
- **Update**: when files are added, removed, or reorganized.

## L3-roles.md — Component roles
Each key component/module/class: responsibility, key fields (name·type·
purpose), lifecycle, relationships/inheritance.
- **Read**: **before** modifying any component's source code.
- **Update**: **immediately after** modifying a component's structure or fields.

## Rules
- If knowledge contradicts code → **trust the code**, then update the files.
- Do NOT read all three at once — read only the level you need.
- When creating a new component → add it to L3.
- When adding a new file → add it to L2.
```

---

## 四、System Prompt 设计

极简提醒，不规定 AI 行为：

```markdown
## Project Knowledge

The project may store structured context in `.OpenVibe/memory/`
(three levels: purpose/inventory/roles). See `README.md` inside
that directory for the full definition. Read the relevant file
when you need project context.
```

相比之前的版本：

| 之前（自动注入方案） | 现在 |
|---------------------|------|
| "L1 is always available (auto-injected)" | 无自动注入 |
| "Read L3 before modifying" — 指令性 | "Read the relevant file when you need project context" — 提醒性 |
| 10+ 行具体规则 | 3 行轻提示 |
| 耦合读写时机 | 定义交给 README.md，AI 自行决策 |

---

## 五、Bootstrap 初始化流程

### 触发时机

不是 session 开始自动触发，而是 **AI 第一次尝试读取 memory 文件时，发现文件不存在** 时触发。

典型流程：

```
AI 思考："我需要了解这个项目的结构来完成任务"
  → read_file .OpenVibe/memory/README.md
  → 返回 error: "file not found"（目录或文件不存在）
  → AI 识别出这是"未初始化的知识库"场景
  → 执行 bootstrap
```

### Bootstrap 步骤

```
Step 1: create_directory .OpenVibe/memory/

Step 2: 扫描项目信息
  ├─ read_file README.md（项目根目录的 README）
  ├─ read_file package.json（如果存在）
  └─ get_workspace_info（查看目录结构）

Step 3: 写入 README.md（定义规范模板，见第三章）

Step 4: 写入 L1-purpose.md
  ├─ 从 README/package.json 提取项目描述
  ├→ 技术栈、设计原则、数据流
  └→ 保持简短（200-400 tokens 以内）

Step 5: 写入 L2-inventory.md
  ├─ 从 get_workspace_info 生成目录树
  └→ 关键文件的一行描述

Step 6: 写入 L3-roles.md
  └→ 从关键源文件头部提取导出/类定义

Step 7: ask_human "知识库已自动建好，请确认内容是否正确"
```

---

## 六、访问路径

### 场景 1：AI 刚启动，需要理解项目

```
思考："这是一个新项目/会话，我需要先了解项目是做什么的"
  → read_file .OpenVibe/memory/README.md（了解三层定义）
  → read_file .OpenVibe/memory/L1-purpose.md（了解项目目的）
  ⚡ 这两次 read 返回的内容进入 conversation context
  ⚡ 后续同一 session 不再需要重复读取（已在上下文中）
```

### 场景 2：AI 需要修改某个文件

```
思考："用户要求修改 src/tools/readFileTool.ts"
  → read_file .OpenVibe/memory/L3-roles.md（查看 readFileTool 的职责和字段）
  → 修改代码
  → edit .OpenVibe/memory/L3-roles.md（更新组件描述）
  ⚡ 只读 L3，不影响 L1/L2 的 cache
```

### 场景 3：AI 需要在项目中添加新功能

```
思考："需要创建一个新的工具函数"
  → read_file .OpenVibe/memory/L2-inventory.md（确认在哪个目录下添加）
  → read_file .OpenVibe/memory/L3-roles.md（了解现有组件避免重复）
  → 创建文件 + 实现代码
  → edit .OpenVibe/memory/L2-inventory.md（添加新文件条目）
  → edit .OpenVibe/memory/L3-roles.md（添加新组件条目）
```

---

## 七、API Cache 命中率分析

### 当前（单文件 memory.md）

```
memory.md 任何修改 → 文件 mtime 变更 → AI 重新 read_file
  → conversation 中 memory 内容更新
  → 后续 API 请求的 kv cache 涉及 memory 部分失效
  ⚠ 但 system prompt 本身未变 → prefix caching 仍可命中
```

### 改造后（四个独立文件）

```
README.md     （几乎不变） → 第一次 session 读一次后不再碰
L1-purpose.md （极少变）   → session 起始读一次，后续不重读
L2-inventory.md（中等变化）→ 探索时读，修改时写，独立于 L1/L3
L3-roles.md   （经常变）   → 频繁读写，但只影响自身
```

**核心收益**：修改 L3-roles.md（最常见操作）不会 invalidate L1 和 L2 在 conversation 中的内容。从 API 侧看——

- 修改 L3 → 只有包含 L3 内容的 assistant/tool 消息变化
- system prompt 未变 → ✅ API prefix caching 命中
- L1/L2 在 conversation 中未变 → ✅ 相关 kv cache 仍有效
- 对比单文件：修改 memory.md 任何部分 → conversation 中整个 memory 内容变化 → 关联 cache 失效

### 最佳实践建议

为了让 AI 最大化 cache 收益，在 README.md 中强调：

> **Read only what you need.** Reading all three files at once wastes
> tokens and reduces cache effectiveness. Each file is independent.

---

## 八、实现步骤

### Phase 1：文件拆分

| # | 操作 | 产出 |
|---|------|------|
| 1 | 创建 `.OpenVibe/memory/` 目录 | 目录 |
| 2 | 写入 `README.md`（三级定义模板） | `.OpenVibe/memory/README.md` |
| 3 | 从 `memory.md` 提取 L1 内容 → 写入 | `.OpenVibe/memory/L1-purpose.md` |
| 4 | 从 `memory.md` 提取 L2 内容 → 写入 | `.OpenVibe/memory/L2-inventory.md` |
| 5 | 从 `memory.md` 提取 L3 内容 → 写入 | `.OpenVibe/memory/L3-roles.md` |
| 6 | 删除 `.OpenVibe/memory.md` | — |

### Phase 2：代码改动

| # | 操作 | 文件 |
|---|------|------|
| 7 | 更新 system prompt 为极简提醒版 | `src/systemPrompt.ts` |
| 8 | 更新 `loadMemoryExcerpt()` 读取路径（优先读 `memory/` 目录，回退 `memory.md`） | `src/modules/todolistReview.ts` |
| 9 | 清理 TSDoc 中对 `memory.md` 的硬编码引用 | 各工具文件 |

### Phase 3：文档

| # | 操作 |
|---|------|
| 10 | 更新 `PLAN-memory-rename.md` 记录最终方向 |

---

## 九、开放问题

1. **README.md 是否真的需要？** 三级定义也可以直接写在 system prompt 中（现在是轻提醒）。但独立文件的好处是：AI 可以 read 一次就理解规范，且定义不受 sys prompt 更新影响。

2. **Bootstrap 中 `ask_human` 是否必要？** 自动生成的 L1/L2/L3 初稿可能不够准确。是必须用户确认，还是允许 AI 直接创建后让用户在后续对话中修正？

3. **memory.md 回退保留多久？** 现有用户的 memory.md 需要兼容。建议保留 `loadMemoryExcerpt()` 的回退逻辑至少一个版本周期。

4. **L1 的 token 规模控制**：不注入 system prompt 后 L1 不再有 token 成本压力，可适当丰富，但建议仍控制在 400-600 tokens 以内，避免 AI 不愿读取（太长）。
