---
name: paper-introduction
description: 按严格 6 段结构修改/生成论文引言：必须有量化成本、2-3 条具体局限、前半段引用 overview 图、最后给 3 条可验证贡献点。适用于修改或撰写引言部分。
---

# 引言修改（强约束）

## 工作流
1. 强制使用 **6 段骨架**（见 `reference.md`）。
2. 在前半段插入至少 **1 句量化成本**（TFLOPs/显存/分钟/token/倍率等）。
3. 明确写出 **2-3 条具体局限**（禁止空泛），并在后文逐条回应。
4. 以 **3 条可验证贡献点** 收尾（必须能在 Method/Experiment 中找到证据）。

## 输出要求
- 输出 **逐段改写计划**（每段写什么、放在哪里）。
- 至少输出前 2 段 + 贡献点列表的 **可直接粘贴改写文本**。
- 输出验收指标：
  - has_quantified_cost_early（前半段是否有量化成本）
  - limitations_count（局限条数）
  - contributions_count（贡献点条数）

## 补充材料
- 详见 [reference.md](reference.md)

