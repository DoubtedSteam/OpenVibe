# 路由 Skill 参考（全局规则 + 执行流水线 + 输出与验收）

> 本文件用于确保 `论文写作特点_可操作规范_用于Skill.md` 的关键信息在 skill 体系中都有“落点”。  
> 原则：`SKILL.md` 保持精简；所有细节放在这里（一层引用）。

---

## 1. 全局规则（跨章节通用，必须执行）

### 1.1 双主线（效果 + 效率）
- 所有“卖点”必须同时覆盖：
  - **效果**：Acc/Score/性能提升/更准确
  - **效率**：TFLOPs/延迟/吞吐/token/显存/超参数量

### 1.2 数字与参照系绑定（硬约束）
任何“更强/更快/更省”的句子，若承担结论或卖点功能，必须绑定：
- **数字**（至少 1 个）
- **baseline/对比对象**
- **设置/预算对齐**（同模型/同 frame 或 token budget/同硬件）

### 1.3 禁忌（必须避免）
- 空泛夸词无证据（significant/remarkable/SOTA 等）
- 只报 overall 不解释（缺关键消融/诊断）
- “不会说人话”的表达（中文说不清还堆生僻词）
- Method 公式链条断裂（符号未定义、目标切换无解释、预算不一致）

### 1.4 严重度（S1–S4）判定门槛（防过快升级到 S3）
**默认起步**：
- 未明确要求“像老师一样凶/训斥档”：默认 **S1**（小问题）或 **S2**（套路/证据链缺口）。
- 用户明确要求“像老师一样改/凶一点”：默认 **S2**，不是 S3。

**S3 升级门槛（必须满足其一）**：
- 至少命中 **2 条**不同的“严重信号”（见 `paper-revision-router/SKILL.md` 的 S3 列表）；或
- 命中 **1 条红线**（全篇自相矛盾/符号预算多处冲突；主结论与消融完全对不上；缺主实验主表主图支撑核心主张）。

**拿不准时的规则**：宁可判 **S2**，不要判 S3。

### 1.5 与语料库对齐（`paper_revisions_unzipped` 全量）
当前工作区解压目录下 **8 篇**老师修改稿（OneClip_CVPR2026、OneClip_IJCV、WeFlow-main、ForestPrune_camera_ready、DyVTE_NeurIPS25___Arxiv_、NeurIPS23_DAS、Routing_Experts…ICLR_、Not_All_Attention…pre_）用于**写法与实验结构**的参照验收：见 `paper-experiment/reference.md`「0.1 清单 + 0.2 版式变体」。**严重度 S1–S4 与人格情绪仍只由内容段客观缺口决定**（见 `paper-revision-router/SKILL.md`「已定稿级完备度」与 S2 排除条），**不因文件是否在该目录而切换特例**；成稿级正文在一般规则下应自然落在 **S1**，从而不会触发训斥式情绪模板。

- 英文稿合格开场句包括 `We first examine ... in Tab.~\ref{...}`、`In Table.~\ref{...}, we first present ...`、`\textbf{Topic.}` + 指表首句等（详见该文件 §1.2）。
- 段末收束允许 `Overall, these results ...` / `These results well confirm ...` 与 `In summary` 同级。
- 实验 6 块（Implementation / Benchmarks / Main / Efficiency / Ablation / Qualitative）以**信息是否覆盖**为准：允许合并小节、调序、效率并入主表、定性以 Fig 段为主（见 `paper-experiment/reference.md` §0.2）。

---

## 2. 路由与执行流水线（抽取→诊断→改写→验收）

### Step 0：章节定位与抽取
定位并抽取：
- abstract
- introduction
- related work
- method（含 preliminary）
- experiment
- conclusion

同时记录“可验收指标”：
- **数字数量**（%/×/min/GB/TFLOPs/tokens/s 等）
- **对比连接词数量**（Compared/In contrast/Different from）
- **是否出现 baseline + 对齐设置**

### Step 1：逐章诊断（按各章节 skill 的 checklist）
对每章输出三类项：
- **缺失项**（must-have 未满足）
- **可优化项**（should-have）
- **冗余项**（空话、重复、无参照的夸词）

### Step 2：生成“可执行修改清单”（必须可落地）
每条必须写成：**动作 + 位置 + 替换策略**。例如：
- Abstract：把数字结果前移到第 4–5 句，并补齐 baseline 与预算
- Intro：补 1 句量化成本；把局限拆成 2–3 条并逐条回应
- Related work：按主题分组；每组补 limitation + bridge；末尾写 closest work vs ours
- Method：补开场四要素；补公式过渡句；补符号表；补模块 IO/步骤/复杂度
- Experiment：强制三句套路；证据句必须带数字+表图编号+baseline
- Conclusion：三句闭环模板；禁止引入新内容

### Step 3：输出可直接粘贴的改写文本（最关键）
至少输出：
- Abstract（全文）
- Introduction 前两段 + contributions 列表
可选输出：
- Method opening + 关键过渡句 + closing
- Experiment 若干段落（按套路）

### Step 4：量化验收（自动回归）
- Abstract：数字 ≥2（效果+效率各 ≥1）；对比词 ≥1
- Intro 前半：量化成本 ≥1；局限条数 ≥2；贡献点 = 3
- Method：开场四要素齐全；公式链条显式过渡覆盖率高；无未定义符号
- Experiment：每段符合“开场句 + 观察(无数字)+证据(有数字)+In summary”

---

## 3. 统一输出格式（建议所有章节都用）

### 3.1 章节诊断摘要（每章 3 行）
- 缺失项：
- 可优化项：
- 冗余项：

### 3.2 修改清单（可执行）
按章节列出：
- 动作：
- 位置：
- 替换策略：

### 3.3 可粘贴改写文本
直接给出可替换段落（不要只给建议）。

### 3.4 验收结果（pass/fail）
给出可量化字段，例如：
- numbers_count_effect
- numbers_count_efficiency
- has_baseline
- has_aligned_setting
- has_in_summary（实验段）
- eq_transition_coverage（方法段，粗略描述即可）

---

## 4. 与母文档的覆盖关系（对齐表）
母文档 `论文写作特点_可操作规范_用于Skill.md` 的内容映射如下：
- **全局风格/禁忌/验收** → 本文件第 1、2、3 节
- **Abstract 规则** → `paper-abstract/`（SKILL.md + reference.md）
- **Introduction 规则** → `paper-introduction/`
- **Related work 规则** → `paper-related-work/`
- **Method 公式链条强约束** → `paper-method/`
- **Experiment 三句套路强约束** → `paper-experiment/`
- **Conclusion 三句闭环** → `paper-conclusion/`

