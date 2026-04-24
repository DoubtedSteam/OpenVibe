# Abstract (摘要) 强模板与验收

## 必须完成的 6 件事
1) 痛点（Why hard）  
2) 方法一句话定义（What）  
3) 机制（How，至少 1 个）  
4) 对比式差异（Compared with）  
5) 结果（Evidence）：**效果 + 效率**双指标  
6) 落地信息（可选）：代码/数据/硬件条件

## 5–6 句强模板（推荐）
说明：以下是常用英文摘要句型模板，**模板本身可用英文**（便于直接粘贴到论文里），但写作逻辑必须按中文要求约束。

1. 背景痛点：Due to … overhead / token explosion, … can only …, which …
2. 提出方法：We propose …, termed **X**.
3. 核心机制：X achieves … by (mechanism A) and (mechanism B).
4. 对比优势：Compared with …, X … (no extra model / unified step / robustness / coherence).
5. 结果双指标：Across …, X improves … by … while reducing … by …
6. 可选落地：Code/Models/Data are released at …

## 老师常改点（必须遵守）
- 第一句不要“宏大叙事”，直接讲瓶颈。
- 至少出现 2 个数字：一个效果，一个效率/成本。
- “significant/remarkable/SOTA”若无数字支撑必须删或改写为可验证属性（training-free / plug-and-play / only 1 hyper-parameter）。

## Checklist（pass/fail）
- [ ] 有方法名（X）
- [ ] 有机制短语（至少 1 个 by/using/through）
- [ ] 有对比对象（baseline/closest work）
- [ ] 至少 2 个数字（效果+效率）
- [ ] 所有数字都有参照系（对比对象 + 设置/预算）

## 验收字段（给 Skill 做结构化生成/验收）
- has_method_name
- has_mechanism_phrase
- has_comparison_phrase
- numbers_count_effect
- numbers_count_efficiency
- has_baseline_and_setting_for_numbers

