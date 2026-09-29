# ADR-007: Excel 导入使用 exceljs 4.4.0，不使用 SheetJS

## Status

Accepted — 2026-09-28（项目总监裁决，采用架构师提出的降级方案）

## Background

需要把 `.xlsx` 导入为文档正文或多维表格。SheetJS（`xlsx`）是事实标准，但 npm 公共源停留在 `0.18.5`，
该版本含 CVE-2023-30533（原型污染）与 CVE-2024-22363（ReDoS）；修复版 0.19.3+ 只在 `cdn.sheetjs.com` 发布。

## Decision

直接使用降级方案 **exceljs 4.4.0**（npm 可达、维护中、无已知 CVE），不下载 vendor tarball。

- 导入链路：`POST /import/xlsx` → `exceljs` 读工作簿 → 每工作表转 Markdown 表格或 `data_tables` 记录。
- 不引入 `xlsx` 依赖；若后续有人试图加回，需先确认版本不等于 0.18.5。

## Consequences

正面：
- 不依赖构建期对 `cdn.sheetjs.com` 的可达性。内网构建机很可能访问不到该 CDN，直接走降级方案更稳。
- 无 CVE，无需 vendor 二进制入库，依赖树干净。

负面：
- 读取性能略低于 SheetJS，超大工作簿（10 万行以上）需分页读取与进度提示。
- 部分边缘格式（老旧 `.xls`、非常规公式结果）兼容性需实测补齐。
- 若将来需要 SheetJS 独有的写能力（如写出带样式的 xlsx），需重新评估并走 vendor 流程。

## Related ADRs

ADR-001
