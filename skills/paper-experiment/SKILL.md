---
name: paper-experiment
description: 按老师风格“观察→证据→（可选强调）→收束”撰写/修改实验：等价开场句（中英均可）；抽象观察（禁数字）；证据句（数字+表图+baseline+对齐）；段末收束句（In summary / Overall / These results … 等同义改写呼应贡献点）。适用于主结果、消融、效率、鲁棒性或定性分析。
---

# 实验修改（强约束：三句套路）

## 工作流
1. 对每个实验段落强制执行：
   - **等价开场句**（交代模型/设置、数据集或任务、实验类型、表或图；见 reference 中「语料对齐」英/中模板）
   - 至少 1 组“抽象观察（无数字）-> 具体证据（有数字+表/图编号）”
   - 可选强调句（仅在差距大或对应贡献点时使用）
   - 段末 **收束句**（可用 `In summary` / `Overall, ...` / `These results ...` 等，同义改写呼应贡献点，不引入新数字）
2. 每条证据句必须包含 baseline 且说明对齐设置/预算。

## 输出要求
- 输出可直接粘贴的段落改写文本。
- 按段输出合规性报告：
  - has_opening_sentence（是否有开场句）
  - observation_has_no_numbers（观察句是否无数字）
  - evidence_has_numbers_and_fig_id（证据句是否有数字+表图编号）
  - has_closing_sentence（是否有段末收束句，含 In summary / Overall 等）

## 补充材料
- 详见 [reference.md](reference.md)

