![OpenVibe Logo](imgs/logo.png)
# 🚀 OpenVibe — 极简AI编程助手 / Minimalist AI Assistant
> **基于三大核心工具的智能项目编辑助手 / An intelligent project editing assistant built on three core tools**

<h2 id="important-notice">⚠️ 重要提示 / Important Notice</h2>

当前项目可以完成智能编辑功能，但不推荐用于实际工作环境。然而，它的使用体验非常有趣和有感觉，因此得名OpenVibe。

初版的开发过程耗资30元巨款用于DeepSeek的API调用

> The current project can perform intelligent editing, but it is not recommended for production environments. However, the experience is very interesting and gives a great vibe, hence the name OpenVibe.
>
> The first version cost a whopping 30 RMB for DeepSeek API calls.

<h2 id="news">📰 新闻 / News</h2>

2025年4月11日: OpenVibe增加了Git支持功能！现在可以在编码过程中自动创建Git快照，并支持通过UI进行版本回滚和快照管理。

> April 11, 2025: OpenVibe has added Git support! Now automatic Git snapshots can be created during coding, and version rollback and snapshot management are supported through the UI.

2025年4月14日: OpenVibe添加了独立审查机制，包括任务清单审查和代码编辑审查功能，通过独立LLM代理提高代码修改质量。

> April 14, 2025: OpenVibe added independent review mechanisms including todolist review and code edit review, improving code modification quality through independent LLM agents.
<h2 id="table-of-contents">📋 目录 / Table of Contents</h2>


- [重要提示 / Important Notice](#important-notice)
- [新闻 / News](#news)
- [项目概述 / Project Overview](#project-overview)
- [设计理念 / Design Philosophy](#design-philosophy)
- [核心工具说明 / Core Tools Explained](#core-tools-explained)
- [多智能体架构 / Multi-Agent Architecture](#multi-agent-architecture)
- [其它辅助工具 / Other Auxiliary Tools](#other-available-tools)
- [安装 / Installation](#installation)
- [配置 / Configuration](#configuration)
- [内存管理系统 / Memory Management System](#memory-management-system)

<h2 id="project-overview">🎯 项目概述 / Project Overview</h2>

OpenVibe是一个直接在VS Code工作空间中读取和编辑文件的AI编程助手。
OpenVibe通过三个基本文件操作工具构建了完整的项目级编辑能力：

- **read** - 读取文件内容
- **find** - 定位代码位置  
- **edit** - 安全编辑代码

这三个工具形成了一套最小但完整的文件操作系统，支持从代码分析到精确修改的全流程。系统还包含任务规划、会话管理、配置管理等功能，实现智能的、可控的项目级代码编辑。

> OpenVibe is an AI programming assistant that reads and edits files directly within the VS Code workspace.
>
> OpenVibe builds complete project‑level editing capabilities through three fundamental file operations:
>
> - **read** – read file content
> - **find** – locate code positions
> - **edit** – safely edit code
>
> These three tools form a minimal yet complete file operation system that supports the entire workflow from code analysis to precise modification. The system also includes task planning, conversation management, configuration management, etc., enabling intelligent and controllable project‑level code editing.

<h2 id="design-philosophy">🎨 设计理念 / Design Philosophy</h2>

OpenVibe的设计核心是**三个基本文件操作工具**的抽象。我们相信任何项目级别的代码编辑都可以分解为这三个基本操作：

1. **信息获取** (read) - 理解现有代码
2. **位置定位** (find) - 找到需要修改的地方
3. **安全修改** (edit) - 应用精确的变更

这种设计确保了：
- **最小化复杂性**：仅三个工具实现完整功能
- **最大化可控性**：每一步操作都可验证
- **项目级一致性**：保持代码库的整体协调

> The core of OpenVibe's design is the abstraction of **three basic file operation tools**. We believe any project‑level code editing can be broken down into these three fundamental actions:
>
> 1. **Information acquisition** (read) – understand existing code
> 2. **Location positioning** (find) – find what needs to be changed
> 3. **Safe modification** (edit) – apply precise changes
>
> This design ensures:
> - **Minimal complexity**: only three tools for complete functionality
> - **Maximum controllability**: every operation is verifiable
> - **Project‑level consistency**: maintain overall coherence of the codebase

---

<h2 id="core-tools-explained">🔧 核心工具说明 / Core Tools Explained</h2>

### 📖 1. read_file — 读取文件内容 / Read File Content

```javascript
read_file(filePath, startLine, endLine)
```

**用途**：获取文件的完整或部分内容。

> **Purpose**: Retrieve full or partial file content.

### 🔍 2. find_in_file — 定位代码位置 / Locate Code Position

```javascript
find_in_file(filePath, searchString, contextBefore, contextAfter)
```

**用途**：在文件中查找特定代码片段并返回其精确位置。

> **Purpose**: Find a specific code snippet in a file and return its exact position.

### ✏️ 3. edit — 安全代码编辑 / Safe Code Editing

```javascript
edit(filePath, startLine, endLine, newContent)
```

**用途**：替换文件中的特定代码区域，包含自动LLM验证。

> **Purpose**: Replace a specific code region in a file, including automatic LLM verification.
---
<h2 id="multi-agent-architecture">🤖 多智能体架构 / Multi-Agent Architecture</h2>

OpenVibe采用先进的多智能体架构来确保代码修改的质量和安全性。系统包含主智能体和独立的审查智能体，分别负责执行任务和验证质量。

> OpenVibe employs an advanced multi‑agent architecture to ensure the quality and safety of code modifications. The system consists of a primary agent and independent review agents, responsible respectively for task execution and quality verification.

### 🛡️ 独立审查机制 / Independent Review Mechanisms

OpenVibe的关键特性是**独立的LLM代理审查系统**，包括：
1. **任务清单审查** - 在执行前验证任务计划的合理性
2. **代码编辑审查** - 在应用修改前检查代码变更的正确性

这种"执行-验证"分离的设计确保每个重要操作都经过双重检查，显著减少错误和意外行为。

> A key feature of OpenVibe is the **independent LLM agent review system**, which includes:
> 1. **Todolist review** – verifies the reasonableness of task plans before execution
> 2. **Code edit review** – checks the correctness of code changes before applying them
>
> This "execute‑then‑verify" separation ensures that every important operation undergoes double‑checking, significantly reducing errors and unintended behavior.

### 🔄 工作流程 / Workflow Process

OpenVibe采用**主智能体**、**编辑智能体**和**审查智能体**三智能体协作架构，工作流程以`edit`和`plan`操作为例：

#### 📋 以`plan`操作为例（任务规划场景）：
1. **用户请求** → 用户提出复杂的多步骤修改需求
2. **主智能体分析** → 分析代码结构并规划整体方案
3. **编辑智能体辅助** → 读取相关文件为规划提供信息支持
4. **主智能体创建计划** → 生成详细的任务清单（todo list）
5. **审查智能体验证** → 验证任务计划的合理性和安全性
6. **计划通过** → 审查通过的计划准备执行

#### ✏️ 以`edit`操作为例（代码编辑场景）：
1. **用户请求** → 用户提出具体的代码修改需求
2. **主智能体分析** → 确定需要修改的文件和位置
3. **编辑智能体执行** → 使用`edit`工具进行精确的代码替换
4. **审查智能体验证** → 验证编辑操作的语义正确性和逻辑一致性
5. **编辑通过** → 通过验证的修改被安全应用到文件
6. **结果确认** → 向用户展示修改前后的对比

> OpenVibe employs a three‑agent collaboration architecture consisting of **Primary Agent**, **Editing Agent**, and **Review Agent**, with workflow examples for `edit` and `plan` operations:
>
> #### 📋 Example for `plan` operation (task planning scenario):
> 1. **User request** → User submits a complex multi‑step modification requirement
> 2. **Primary agent analysis** → Analyzes code structure and plans overall solution
> 3. **Editing agent assistance** → Reads relevant files to provide information support for planning
> 4. **Primary agent creates plan** → Generates detailed task list (todo list)
> 5. **Review agent verification** → Verifies reasonableness and safety of the task plan
> 6. **Plan approved** → Reviewed plan is ready for execution
>
> #### ✏️ Example for `edit` operation (code editing scenario):
> 1. **User request** → User submits specific code modification requirement
> 2. **Primary agent analysis** → Determines files and locations to be modified
> 3. **Editing agent execution** → Uses `edit` tool for precise code replacement
> 4. **Review agent verification** → Verifies semantic correctness and logical consistency of the edit
> 5. **Edit approved** → Verified modification is safely applied to the file
> 6. **Result confirmation** → Shows before/after comparison to the user
### 👥 智能体职责说明 / Agent Responsibilities

#### 1. **主智能体 (Primary Agent)**
- **核心职责**：负责理解用户需求、分析代码、规划任务并协调`edit`和`plan`操作
- **具体任务**：
  - 分析用户需求和项目上下文以制定整体方案
  - 使用`plan`操作创建详细的任务清单（todo list）并提供执行指导
  - 协调编辑智能体的`edit`操作和审查智能体的验证工作
  - 与用户沟通以澄清需求并解释解决方案
- **工作特点**：主动、创造性强、承担整体协调责任，专注于`edit`和`plan`的操作管理

> #### 1. **Primary Agent**
> - **Core responsibility**: Responsible for understanding user requirements, analyzing code, planning tasks, and coordinating `edit` and `plan` operations
> - **Specific tasks**:
>   - Analyzes user requirements and project context to formulate overall solutions
>   - Uses `plan` operations to create detailed task lists (todo lists) and provide execution guidance
>   - Coordinates editing agent's `edit` operations and review agent's verification work
>   - Communicates with users to clarify requirements and explain solutions
> - **Working characteristics**: Proactive, highly creative, bears overall coordination responsibility, focused on managing `edit` and `plan` operations
#### 2. **审查智能体 (Review Agent)**
- **核心职责**：独立验证主智能体和编辑智能体的工作，确保质量和安全
- **具体任务**：
  - **任务清单审查**：验证任务计划的合理性、完整性和安全性
  - **代码编辑审查**：检查每个代码修改的正确性、一致性和无副作用性
  - **质量保证**：提供客观的第三方评估，防止错误和意外行为
  - **风险评估**：识别潜在的破坏性修改和安全隐患
- **工作特点**：中立、严谨、专注于风险识别和预防

> #### 2. **Review Agent**
> - **Core responsibility**: Independently verifies the work of primary agent and editing agent, ensuring quality and safety
> - **Specific tasks**:
>   - **Todolist review**: Verifies reasonableness, completeness, and safety of task plans
>   - **Code edit review**: Checks correctness, consistency, and absence of side effects for each code modification
>   - **Quality assurance**: Provides objective third‑party assessment, preventing errors and unintended behavior
>   - **Risk assessment**: Identifies potentially destructive modifications and security risks
> - **Working characteristics**: Neutral, rigorous, focused on risk identification and prevention

#### 3. **编辑智能体 (Editing Agent)**
- **核心职责**：负责执行具体的文件操作和代码编辑任务
- **具体任务**：
  - **文件读取**：使用`read_file`工具读取项目文件以获取上下文
  - **代码定位**：使用`find_in_file`工具定位需要修改的代码位置
  - **安全编辑**：使用`edit`工具进行精确的代码替换操作
  - **构建和测试**：使用`run_shell_command`执行构建、测试和其他命令
- **工作特点**：精确、高效、遵循规范的执行流程

> #### 3. **Editing Agent**
> - **Core responsibility**: Responsible for executing specific file operations and code editing tasks
> - **Specific tasks**:
>   - **File reading**: Uses `read_file` tool to read project files for context
>   - **Code location**: Uses `find_in_file` tool to locate code positions needing modification
>   - **Safe editing**: Uses `edit` tool for precise code replacement operations
>   - **Build and test**: Uses `run_shell_command` to execute builds, tests, and other commands
> - **Working characteristics**: Precise, efficient, follows standardized execution processes

### 🛠️ 智能体间的协作关系 / Inter‑Agent Collaboration

- **主智能体 ↔ 审查智能体**：执行与验证的分离，形成制衡机制
- **主智能体 ↔ 编辑智能体**：规划与执行的协作，确保准确实现需求
- **编辑智能体 ↔ 审查智能体**：操作与验证的分离，保证修改质量

这种多层次的协作关系确保了：
- **执行质量**：主智能体的创造力与审查智能体的严谨性互补
- **安全防护**：多层验证防止单一智能体的错误蔓延
- **系统韧性**：即使某个智能体出现异常，其他智能体仍能保障基本功能

> - **Primary agent ↔ Review agent**: Separation of execution and verification, forming a check‑and‑balance mechanism
> - **Primary agent ↔ Editing agent**: Planning and execution collaboration, ensuring accurate implementation of requirements
> - **Editing agent ↔ Review agent**: Operation and verification separation, guaranteeing modification quality
>
> This multi‑layer collaboration ensures:
> - **Execution quality**: Primary agent's creativity complements review agent's rigor
> - **Safety protection**: Multi‑layer verification prevents errors from a single agent from spreading
> - **System resilience**: Even if one agent fails, others maintain basic functionality
### 🏗️ 架构优势 / Architecture Advantages

- **质量保证**：多个智能体交叉验证，提高代码修改质量
- **安全性增强**：防止意外破坏性修改
- **透明度提升**：每个修改都有明确的执行和验证记录
- **可扩展性**：易于添加新的智能体处理特定任务类型

> - **Quality assurance**: multiple agents cross‑verify each other, improving code modification quality
> - **Enhanced safety**: prevents accidental destructive modifications
> - **Improved transparency**: each modification has clear execution and verification records
> - **Scalability**: easy to add new agents for handling specific task types

---
<h2 id="other-available-tools">📚 其它辅助工具 / Other Auxiliary Tools</h2>

除了三个核心文件操作工具外，OpenVibe还提供以下辅助工具：
> Besides the three core file operation tools, OpenVibe also provides the following auxiliary tools:

<details>
<summary>查看辅助工具详情 / View Auxiliary Tools Details</summary>

#### get_workspace_info — 工作区信息 / Workspace Information

获取当前工作空间的根目录和顶层文件列表，用于了解项目结构。

> Retrieves the root directory and top‑level file list of the current workspace, used to understand the project structure.

#### create_directory — 创建目录 / Create Directory

在项目结构中创建新目录，支持递归创建。

> Creates a new directory in the project structure, supports recursive creation.

#### create_todo_list — 任务规划工具 / Task Planning Tool

用于多步骤任务的规划和管理。遵循"先计划后执行"的原则，确保复杂任务的有序完成。

> Used for planning and managing multi‑step tasks. Follows the principle of "plan first, then execute" to ensure orderly completion of complex tasks.
#### run_shell_command — 命令行工具 / Shell Command Tool

在项目根目录下执行Shell命令，用于构建、测试、依赖管理等任务。此工具会经过独立审查确保命令的安全性。

> Executes shell commands in the project root directory, used for building, testing, dependency management, etc. This tool undergoes independent review to ensure command safety.

#### complete_todo_item — 任务进度跟踪 / Task Progress Tracking

标记todo项目为已完成，更新任务进度。

> Marks a todo item as completed, updating task progress.

#### compact — 对话压缩工具 / Conversation Compression Tool

将长对话历史压缩为简洁摘要，减少上下文窗口使用。

> Compresses a long conversation history into a concise summary, reducing context window usage.

#### 独立审查机制 / Independent Review Mechanisms

提供独立的LLM代理审查功能，提高任务清单和代码修改的质量。

> Provides independent LLM agent review functionality to improve the quality of task lists and code modifications.

#### Git快照管理工具 / Git Snapshot Tools

OpenVibe集成了Git快照功能，可以在编码过程中自动创建版本快照，并通过UI管理版本历史。

> OpenVibe integrates Git snapshot functionality, allowing automatic version snapshots to be created during coding, and managing version history through the UI.

</details>
<h2 id="configuration">⚙️ 配置 / Configuration</h2>
OpenVibe提供灵活的配置选项，可通过VS Code设置界面进行配置。

> OpenVibe provides flexible configuration options that can be set via the VS Code settings interface.

### ⚙️ 配置项说明 / Configuration Options
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| **apiBaseUrl** | `string` | `https://api.deepseek.com` | OpenAI兼容API的基础URL / Base URL of the OpenAI‑compatible API |
| **apiKey** | `string` | `""` | API密钥（**必填**） / API key (**required**) |
| **model** | `string` | `deepseek-reasoner` | 使用的AI模型 / AI model to use |
| **confirmChanges** | `boolean` | `true` | 文件修改前是否需要用户确认 / Whether to require user confirmation before modifying files |
| **maxInteractions** | `number` | `-1` | 最大工具调用迭代次数（`-1`表示无限制） / Maximum number of tool call iterations (`-1` means unlimited) |
| **maxSequenceLength** | `number` | `1000000` | 生成文本的最大长度 / Maximum length of generated text |
| **vibe-coding.todolistReview.enabled** | `boolean` | `true` | 是否启用任务清单审查（独立LLM代理） / Whether to enable todolist review by independent LLM agent |
| **vibe-coding.todolistReview.maxAttempts** | `number` | `5` | 最大审查尝试次数（最小1次） / Maximum review attempts (minimum 1) |
| **vibe-coding.todolistReview.reviewTimeoutMs** | `number` | `120000` | 任务清单审查超时时间（毫秒，最小5000） / Review timeout in ms (minimum 5000) |
| **vibe-coding.todolistReview.editorTimeoutMs** | `number` | `120000` | 编辑器超时时间（毫秒，最小5000） / Editor timeout in ms (minimum 5000) |
| **vibe-coding.editReview.enabled** | `boolean` | `true` | 是否启用代码编辑审查（独立LLM代理） / Whether to enable code edit review by independent LLM agent |
| **vibe-coding.editReview.timeoutMs** | `number` | `120000` | 代码编辑审查超时时间（毫秒，最小5000） / Code edit review timeout in ms (minimum 5000) |

<h2 id="memory-management-system">🧠 内存管理系统 / Memory Management System</h2>

OpenVibe包含一个智能内存系统，用于维护项目知识和任务历史。
> OpenVibe includes an intelligent memory system for maintaining project knowledge and task history.

### 内存文件结构 / Memory File Structure

内存文件位于 `.OpenVibe/memory.md`，采用**四层级结构**，顺序固定：

1. **Level 1 — 项目整体描述** - 项目基本信息、核心设计原则、技术栈、数据流图
2. **Level 2 — 文件目录结构** - 完整的目录树、关键文件说明、文件间依赖关系
3. **Level 3 — 类和类型定义** - 每个类的职责、关键字段、生命周期、继承关系
4. **Level 4 — 函数和方法** - 所有公共函数和重要私有方法的签名、作用、副作用、错误处理

> The memory file is located at `.OpenVibe/memory.md` and follows a **four‑level structure** in fixed order:
>
> 1. **Level 1 — Project Overview** – project basic info, core design principles, tech stack, data‑flow diagram
> 2. **Level 2 — File Directory Structure** – complete directory tree, key file descriptions, file dependencies
> 3. **Level 3 — Classes and Type Definitions** – each class's responsibility, key fields, lifecycle, inheritance
> 4. **Level 4 — Functions and Methods** – signatures, purpose, side effects, error handling for all public functions and important private methods

### 内存使用原则 / Memory Usage Principles

1. **主动规划**：内存更新应作为todo list的一部分
2. **持续积累**：重要修改及时记录到内存
3. **知识传承**：为新会话提供项目上下文
4. **一致性维护**：确保项目知识的连续性

> ### 内存使用原则 / Memory Usage Principles
>
> 1. **Proactive planning**: memory updates should be part of the todo list
> 2. **Continuous accumulation**: record important modifications into memory promptly
> 3. **Knowledge transfer**: provide project context for new sessions
> 4. **Consistency maintenance**: ensure continuity of project knowledge

## 📄 许可证 / License

MIT License - See LICENSE file for details

---

**OpenVibe — 基于三个核心工具构建的智能项目编辑助手 / An intelligent project editing assistant built on three core tools**

*简洁、可控、强大的 AI 辅助编程体验 / Simple, controllable, powerful AI‑assisted programming experience*
