---
name: paper-abstract
description: 按严格约束修改/生成论文摘要：痛点 -> 方法名 -> 核心机制 -> 对比对象 -> 双指标结果（效果+效率）-> 可选开源说明。适用于修改或撰写摘要部分。
---

# 摘要修改（强约束）

## 工作流
1. **抽取必备要素**：痛点、方法名、1-2 个机制、baseline/对比对象、至少 2 个数字（效果+效率）、适用范围（模型/数据集）、可选代码/数据说明。
2. 按 `reference.md` 的 5-6 句强模板输出摘要。
3. 用清单验收（禁止空泛夸词；数字必须带 baseline 与设置/预算）。

## 输出要求
- 输出 **可直接粘贴** 的摘要文本。
- 输出 **验收报告**：
  - numbers_count（效果数字、效率数字）
  - has_comparison_phrase（是否有对比句）
  - has_method_name（是否有方法名）
  - has_mechanism_phrase（是否有机制表述）

## 补充材料
- 详见 [reference.md](reference.md)

