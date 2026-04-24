# Vibe Coding Assistant — 工作流改进建议

> 分析基准：多语言支持功能（vibe-coding.language）的完整实现过程
> 日期：2026-04-24

---

## 目录

1. [Memory 使用规范](#1-memory-使用规范)
2. [Todo List 异常处理规范](#2-todo-list-异常处理规范)
3. [工具调用策略](#3-工具调用策略)
4. [会话节奏控制](#4-会话节奏控制)
5. [总结：改进清单速查表](#5-总结改进清单速查表)

---

## 1. Memory 使用规范

### 1.1 问题：读了但没真的用

本次过程中虽然读取了 `.OpenVibe/memory.md`，但没有将其作为行动指南来使用。

**实际表现**：逐个 `get_file_info` 试探文件名是否存在 → 浪费多轮交互

**应该怎么做**：

```
❌ 错误做法:
  get_file_info('src/chatViewProvider.ts') → 不存在
  get_file_info('src/systemPrompt.ts')    → 不存在
  get_file_info('src/config.ts')          → 不存在
  get_file_info('src/modules/ChatViewProvider.ts') → 存在 ✅

✅ 正确做法:
  读 memory.md → Level 2 找到 "src/modules/ChatViewProvider.ts"
  → 直接 read_file('src/modules/ChatViewProvider.ts')
```

**规则**：读完 memory 后，**必须引用它的 Level 2 目录结构来决定文件访问顺序**，而不是逐个试探。

### 1.2 问题：最后才补写，不是一开始就用方向指导

本次把"更新 memory"放在 todo list 的 step 6（最后一步），这是本末倒置。

**正确顺序**：

| 时机 | 操作 |
|------|------|
| 任务开始前 | 读 memory.md → 找到相关文件路径 |
| **每改完一个模块** | **立即更新 memory 中对应 Level 3/4 的字段描述** |
| 全部完成后 | 更新 Level 1 概要部分（新增设计原则等） |

**具体来说**：
- 改完 `types.ts` → 立即更新 Level 3 中 `ApiConfig` 的字段列表
- 改完 `UIManager.ts` → 立即更新 Level 4 中 `getApiConfig()` 的副作用说明
- 改完 `MessageHandler.ts` → 立即更新 Level 4 中 `handleUserMessage()` 的描述
- 全部完成 → 更新 Level 1 设计原则

### 1.3 规范总结

```
[任务开始]
  │
  ├─ 读 memory.md (Level 2 → 确定文件路径)
  │
  ├─ 修改文件 A
  │   └─ 更新 memory.md Level 3/4 (即时)
  │
  ├─ 修改文件 B
  │   └─ 更新 memory.md Level 3/4 (即时)
  │
  └─ 全部完成
      └─ 更新 memory.md Level 1 (概要)
```

---

## 2. Todo List 异常处理规范

### 2.1 核心问题：遇到 bug 没有扩展现有 todo list

本次遇到换行符转义问题导致 edit 连续失败 4-5 次，全部在 step 4 的"黑盒"内部发生。
**错误模式**：

```
step 4: "在 MessageHandler.ts 中注入语言指令"
  ├→ edit 失败（换行符转义）
  ├→ 再试 → 又失败
  ├→ 再试 → 又失败
  ├→ 再试 → 成功了
  └→ complete_todo_item("step 4 done")
```

用户视角：**"AI 卡住了，我不知道它在干嘛"**

### 2.2 正确的做法：`expandIndex` 展开子步骤

当遇到 bug 或第 2 次 edit 失败时，应该：

```
step 4: "在 MessageHandler.ts 中注入语言指令"
  │
  └─ 发现换行符转义问题，第 2 次 edit 失败
      │
      └─ expandIndex(index_of_step_4, items=[
           "4a: 添加 _buildLanguageInstruction 方法",
           "4b: 修改 system prompt 构建处注入 langInstr",
           "4c: 修复 
 转义导致的跨行字符串语法错误",
           "4d: 编译验证并修复多余括号"
         ])
           │
           ├─ complete_todo_item("4a")
           ├─ complete_todo_item("4b")
           ├─ 编辑失败 → expandIndex("4c", [...])
           ├─ complete_todo_item("4c")
           └─ complete_todo_item("4d")
```

用户视角：**"哦，遇到语法错误了，正在修复 → 修好了"**

### 2.3 步骤粒度参考

| 场景 | 最小步骤粒度 | 例子 |
|------|------------|------|
| 简单属性添加 | 1 个文件 = 1 步 | "在 types.ts 添加 language 字段" |
| 涉及转义/模板字符串 | 拆出"语法修复"子步骤 | "修复跨行字符串"作为独立步骤 |
| 涉及编译验证 | 验证单独成步 | "编译验证"作为最后子步骤 |
| 同一文件修改 ≥2 处 | 按方法/区域拆分 | "修改 getApiConfig + 添加新方法" 拆成 2 步 |
| 同一 edit 失败 ≥2 次 | 自动 expandIndex | 展开为"分析原因 → 修复 → 验证" |

### 2.4 失败时的用户通知原则

当同一个 edit 连续失败 2 次时：

1. **暂停**，分析失败模式（转义问题？行号偏移？内容不一致？）
2. **展示当前文件混乱状态**（调用 `read_file` 展示内容）
3. **说明修复策略**（"这是 
 在 JSON 中被解析为换行符的问题，我将改用 MM_OUTPUT 协议"）
4. 然后再继续尝试

---

## 3. 工具调用策略

### 3.1 转义问题：第一次失败后立即切 MM_OUTPUT

当需要向 TS/JS 文件写入包含 `
` 的字符串时：

```
第 1 次 edit 失败（
 被解析为实际换行）
   │
   └─ 第 2 次 → 立即用 MM_OUTPUT 协议
```

本次浪费的轮次：

| 轮次 | 方案 | 状态 |
|------|------|------|
| 1 | 普通 JSON `

` | ❌ 被解析为换行 |
| 2 | 普通 JSON `\
\
` | ❌ 变成单反斜杠 |
| 3 | 普通 JSON 再试 | ❌ 同理 |
| 4 | 去调换行 + 重写为单行 | ✅ 成功了，但绕了远路 |

**第 2 次就应该直接 MM_OUTPUT**，节省 2-3 轮。

### 3.2 增量编译验证

**错误模式**：

```
改完所有 5 个源文件 → 才 tsc --noEmit
  → 报 6 个错误
  → 修复 → 再验证
  → 还有 1 个错误
  → 再修复
```

**正确模式**：

```
改完 types.ts  → tsc --noEmit（发现多余 }，立即修）
改完 UIManager → tsc --noEmit（通过 ✅）
改完 MessageHandler → tsc --noEmit（发现跨行字符串 + 多余 }，立即修）
...
最终 → tsc --noEmit（零错误 ✅）
```

**效果**：6 个错误被分散在 3 个验证点发现，每次只处理 1-2 个错误，心智负担小很多。

### 3.3 文件读取代替试探

**错误模式**（本次用的）：

```
get_file_info('src/chatViewProvider.ts')       → 不存在
get_file_info('src/systemPrompt.ts')           → 不存在
get_file_info('src/config.ts')                 → 不存在
get_file_info('src/modules/ChatViewProvider.ts') → 存在 ✅
```

**正确模式**：

```
read_file('src/toolDefinitions.ts')  # memory.md Level 2 已告诉你它存在
```

---

## 4. 会话节奏控制

### 4.1 什么时候不需要让你说"继续"

| 场景 | 应该怎么做 |
|------|-----------|
| 读完文件的配置区域 | 已有行号，立即在同一轮完成 edit |
| 读完代码上下文 | 直接发起 edit，不需要停下来展示 |
| 编译报错后 | 直接分析错误并修复，不需要等用户确认 |
| 工具调用失败后 | 立即分析失败原因并重试 |

**规则**：如果下一步操作不依赖用户输入，就不要停。

### 4.2 最小连续执行单元

一个"最小连续单元"是：**读 → 改 → 验** 三个动作绑定在一起，中间不中断。

```
✅ 一个连续单元:
  read_file('file.ts', 行号范围)
  → edit(file.ts, 行号, newContent)
  → read_file('file.ts', 验证修改)

❌ 不是连续单元（不必要的打断）:
  read_file('file.ts', 行号范围)
  → [停下来等用户]  ← 不需要！
  → edit(file.ts, 行号, newContent)
  → [停下来等用户]  ← 不需要！
  → read_file('file.ts', 验证修改)
```

### 4.3 什么时候应该让你介入

| 应该暂停让用户介入 | 原因 |
|-------------------|------|
| 同一 edit 失败 ≥2 次 | 需要展示新的修复策略让用户确认 |
| 需要选择设计方案 | 架构决策应由用户做 |
| 破坏性操作 | 删除文件/修改关键架构 |
| 预期外的大范围修改 | 需要用户授权 |

---

## 5. 总结：改进清单速查表

| 类别 | 改进项 | 优先级 |
|------|--------|--------|
| **Memory** | 任务开始前读 memory，直接引用 Level 2 目录结构决定文件访问顺序 | 🔴 高 |
| **Memory** | 改完一个文件即时更新 memory，不等到最后 | 🟡 中 |
| **Todo** | 发现 bug 时 `expandIndex` 展开子步骤，不在黑盒内重试 | 🔴 高 |
| **Todo** | 粒度原则：涉及转义的步骤事先拆出"语法修复"子步骤 | 🟡 中 |
| **Todo** | 连续失败 2 次时暂停分析 + 展示当前文件状态 + 说明修复策略 | 🔴 高 |
| **工具** | 第 1 次 `` 转义失败后，第 2 次立即切 MM_OUTPUT 协议 | 🔴 高 |
| **工具** | 增量编译验证：改一个源文件就 `tsc --noEmit` 一次 | 🟡 中 |
| **节奏** | 读-改-验绑定为最小连续单元，中间不中断 | 🔴 高 |
| **节奏** | 仅在设计决策、破坏性操作、反复失败（≥2 次）时等用户输入 | 🔴 高 |
