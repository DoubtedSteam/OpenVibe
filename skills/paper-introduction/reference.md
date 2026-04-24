# Introduction (引言) 强结构与句型库

## 6 段强结构（必须）
1) 背景极短 + 任务痛点  
2) 主流做法 + **定量成本例子（必须有数字）**  
3) 2–3 个关键局限（每个 1–2 句，最好指向图/例）  
4) 提出方法 + 一句话机制（引用 overview/motivation 图）  
5) 2–3 个关键优势（逐条回应局限）  
6) 贡献点三条（itemize，三条可验证）

## 句型（可直接套用）
说明：以下是常用英文引言句型模板，**模板本身可用英文**（便于直接粘贴到论文里），但结构与约束必须按本文执行。

- 成本量化：For instance, to process …, Model A requires …× TFLOPs and …× memory, making … impractical.
- 局限：However, this paradigm is prone to … because …
- 引入：To address these issues, we …
- 贡献：Our contributions are threefold: (i) … (ii) … (iii) …

## Checklist（pass/fail）
- [ ] 第二段包含至少 1 个数字化成本
- [ ] 局限 ≥2 且具体（coherence/noise/flexibility/feature gap/latency…）
- [ ] 引言前半出现方法名 + 图引用（若有图）
- [ ] 贡献点 = 3 且每条能在后文找到证据

## 验收字段（给 Skill 做结构化生成/验收）
- has_quantified_cost_early
- limitations_count
- has_method_name_early
- has_figure_reference_early（若有图）
- contributions_count（必须为 3）

