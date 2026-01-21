# 税收征管关键节点监控

后端 API 与 tax_ledger 表的数据模型说明。

## API 概览
Base URL: http://localhost:3838

### 健康检查
- GET /api/health

示例:
```bash
curl http://localhost:3838/api/health
```

### 新建台账记录
- POST /api/ledger

请求体（camelCase）:
- declNo（必填）
- goodsName
- declareDate
- finalInvoiceDate
- latestSettleDate
- docReceiptDate
- confirmDuplicate（是否确认重复）

说明:
- declNo 必须为 18 位数字

示例:
```bash
curl -X POST http://localhost:3838/api/ledger \
  -H "Content-Type: application/json" \
  -d '{
    "declNo": "123456789012345678",
    "goodsName": "Sample Goods",
    "declareDate": "2025-01-01",
    "finalInvoiceDate": "2025-01-05",
    "latestSettleDate": "2025-01-20",
    "docReceiptDate": "2025-01-08",
    "confirmDuplicate": false
  }'
```

### 查询台账列表
- GET /api/ledger

Query 参数:
- page（默认 1）
- pageSize（默认 100，最大 100）
- declNo（精确匹配，18 位数字）
- amendDateFrom（YYYY-MM-DD）
- amendDateTo（YYYY-MM-DD）

示例:
```bash
curl "http://localhost:3838/api/ledger?page=1&pageSize=20&declNo=123456789012345678"
```

### 税费岗列表
- GET /api/ledger/tax-desk

Query 参数:
- page（默认 1）
- pageSize（默认 100，最大 100）

示例:
```bash
curl "http://localhost:3838/api/ledger/tax-desk?page=1&pageSize=100"
```

### ????????
- amend_date ?????????
- ? amend_date ???????
  - final_invoice_date ??? challenge_date ???? (CURRENT_DATE - final_invoice_date) ????
  - final_invoice_date ??? challenge_date ???? final_invoice_date ??
  - final_invoice_date ??? challenge_date ????? amend_date ???????? declare_date ??
- amend_date ??????????? amend_date ??

### 税费岗列表排序规则
- 未处置在已处置前
- 已处置：按起算日期降序
- 未处置：起算日期非空在前、空值在后
  - 起算日期非空：按起算日期升序
  - 起算日期为空：按改单日期升序

### 税费岗单条录入
- POST /api/ledger/tax-desk

请求体（camelCase）:
- declNo（必填，18 位数字）
- declareDate（必填）
- amendDate（必填）
- finalInvoiceDate（可选）
- goodsName（可选）
- taxStartDate（可选）
- taxRemark（可选）

说明:
- 税费岗单条录入可不填最终发票日期，校验规则为：
  - 若填写最终发票日期：改单日期必须 >= 最终发票日期 且 >= 申报日期
  - 若未填写最终发票日期：改单日期必须 >= 申报日期

### 查询单条记录
- GET /api/ledger/:id

示例:
```bash
curl http://localhost:3838/api/ledger/1
```

### 导入 Excel
- POST /api/ledger/import

说明:
- 仅接收 `.xlsx`，解析首个工作表
- 单次最多 2000 行
- 报关单号必须为 18 位数字
- 若需允许重复报关单号，可加 `allowDuplicate=true`

示例:
```bash
curl -X POST "http://localhost:3838/api/ledger/import" \
  -H "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  --data-binary "@tax_ledger.xlsx"
```

### 节假日导入（Excel）
- POST /api/holiday/import

说明（用于“是否超5个工作日”计算）:
- 仅接收 `.xlsx`，解析首个工作表
- 单次最多 2000 行
- 表头必须包含：日期、是否工作日（可选：备注）
- 是否工作日：支持 1/0 或 是/否

导入流程（手工）:
1) 按模板整理 Excel（首行表头）
2) 在税费岗页面点击“节假日导入”，选择 Excel 文件
3) 导入成功后，系统按节假日表优先计算工作日

模板示例:
| 日期 | 是否工作日 | 备注 |
| ---- | ---------- | ---- |
| 2026-01-01 | 0 | 元旦 |
| 2026-01-02 | 0 | 元旦调休 |
| 2026-01-03 | 1 | 调休补班 |

### 导入数据进 TAX_LEDGER（CSV 流程）
说明（适用于数据库直接导入）:
- 先导入到临时表 `TAX_LEDGER_TMP`（全部字段用 VARCHAR）
- 再通过清洗 SQL 插入 `TAX_LEDGER`

流程:
1) 在数据库创建 `TAX_LEDGER_TMP`
2) 通过工具导入 CSV 到 `TAX_LEDGER_TMP`（不要做类型转换）
3) 执行清洗插入 SQL（去空格/去千分位/日期转化）

清洗插入示例:
```sql
INSERT INTO TAX_LEDGER (
  DECL_NO, GOODS_NAME, DECLARE_DATE,
  FINAL_INVOICE_DATE, LATEST_SETTLE_DATE, DOC_RECEIPT_DATE,
  INFO_EXCHANGE, INQUIRY_START_DATE, CHALLENGE_DATE, NEGOTIATION_DATE,
  VALUATION_WORK_DATE, AMEND_DATE,
  tax_start_date, TAX_REMARK, BOND_BALANCE,
  CONTINU_TAX_DUTY, CONTINU_TAX_VAT,
  ADDITIONAL_TAX_DUTY, ADDITIONAL_TAX_VAT,
  REMARK, UPDATED_AT
)
SELECT
  TRIM(DECL_NO),
  GOODS_NAME,
  TO_DATE(NULLIF(TRIM(DECLARE_DATE), ''), 'YYYY-MM-DD'),
  TO_DATE(NULLIF(TRIM(FINAL_INVOICE_DATE), ''), 'YYYY-MM-DD'),
  TO_DATE(NULLIF(TRIM(LATEST_SETTLE_DATE), ''), 'YYYY-MM-DD'),
  TO_DATE(NULLIF(TRIM(DOC_RECEIPT_DATE), ''), 'YYYY-MM-DD'),
  INFO_EXCHANGE,
  TO_DATE(NULLIF(TRIM(INQUIRY_START_DATE), ''), 'YYYY-MM-DD'),
  TO_DATE(NULLIF(TRIM(CHALLENGE_DATE), ''), 'YYYY-MM-DD'),
  TO_DATE(NULLIF(TRIM(NEGOTIATION_DATE), ''), 'YYYY-MM-DD'),
  TO_DATE(NULLIF(TRIM(VALUATION_WORK_DATE), ''), 'YYYY-MM-DD'),
  TO_DATE(NULLIF(TRIM(AMEND_DATE), ''), 'YYYY-MM-DD'),
  TO_DATE(NULLIF(TRIM(tax_start_date), ''), 'YYYY-MM-DD'),
  TAX_REMARK,
  CAST(REPLACE(TRIM(BOND_BALANCE), ',', '') AS DECIMAL(18,2)),
  CAST(REPLACE(TRIM(CONTINU_TAX_DUTY), ',', '') AS DECIMAL(18,2)),
  CAST(REPLACE(TRIM(CONTINU_TAX_VAT), ',', '') AS DECIMAL(18,2)),
  CAST(REPLACE(TRIM(ADDITIONAL_TAX_DUTY), ',', '') AS DECIMAL(18,2)),
  CAST(REPLACE(TRIM(ADDITIONAL_TAX_VAT), ',', '') AS DECIMAL(18,2)),
  REMARK,
  CURRENT_TIMESTAMP
FROM TAX_LEDGER_TMP;
```

### 处理页更新
- PATCH /api/ledger/:id

请求体（camelCase）:
- finalInvoiceDate
- latestSettleDate
- docReceiptDate
- attributeFlags
- infoExchange
- inquiryStartDate
- challengeDate
- negotiationDate
- valuationWorkDate
- amendDate
- continuTaxDuty
- continuTaxVat
- additionalTaxDuty
- additionalTaxVat
- remark

说明:
- 改单日期（amendDate）必须 >= 最晚发票日期 且 >= 申报日期
- 改单日期非空时，税费岗状态自动置为“未处置”
- attributeFlags 为可多选属性字段（逗号分隔）

示例:
```bash
curl -X PATCH http://localhost:3838/api/ledger/1 \
  -H "Content-Type: application/json" \
  -d '{
    "infoExchange": "Call completed",
    "inquiryStartDate": "2025-01-10",
    "challengeDate": "2025-01-12",
    "amendDate": "2025-01-18"
  }'
```

### 插件回填（按报关单号更新最新一条）
- PATCH /api/ledger/by-decl-no

请求体（camelCase）:
- declNo（必填）
- inquiryStartDate
- valuationWorkDate
- challengeDate
- negotiationDate
- infoExchange
- remark
- continuTaxDuty
- continuTaxVat
- additionalTaxDuty
- additionalTaxVat

示例:
```bash
curl -X PATCH http://localhost:3838/api/ledger/by-decl-no \
  -H "Content-Type: application/json" \
  -d '{
    "declNo": "BGD-001",
    "inquiryStartDate": "2025-01-10",
    "valuationWorkDate": "2025-01-15",
    "continuTaxDuty": 1000.50,
    "continuTaxVat": 130.00
  }'
```

### 仅更新税费岗状态
- PATCH /api/ledger/:id/tax-status

请求体:
- taxStatus（必填）

说明:
- taxStatus 仅允许为“未处置”或“已处置”
- 设置为“已处置”前会校验改单日期是否满足规则

示例:
```bash
curl -X PATCH http://localhost:3838/api/ledger/1/tax-status \
  -H "Content-Type: application/json" \
  -d '{ "taxStatus": "已处置" }'
```

### 更新起算日期
- PATCH /api/ledger/:id/tax-start-date

请求体:
- taxStartDate（必填，YYYY-MM-DD 或空字符串）

示例:
```bash
curl -X PATCH http://localhost:3838/api/ledger/1/tax-start-date \
  -H "Content-Type: application/json" \
  -d '{ "taxStartDate": "2026-01-20" }'
```

### 导出 Excel
- GET /api/ledger/export

Query 参数:
- declNo（可选）
- amendDateFrom（YYYY-MM-DD，可选）
- amendDateTo（YYYY-MM-DD，可选）

示例:
```bash
curl -o "tax_ledger.xlsx" "http://localhost:3838/api/ledger/export?amendDateFrom=2026-01-01&amendDateTo=2026-01-31"
```

说明:
- 导出使用 `xlsx` 依赖，目前存在上游高危漏洞（无修复版本）；仅在内网受控环境使用。
- 导入同样使用 `xlsx`，建议限制为可信来源文件。

## 前端运行（Vite + Vue 3）
进入前端目录后启动开发服务：

```bash
cd web
npm install
npm run dev
```

默认访问地址：
- http://localhost:5173

说明：
- 前端已配置代理，将 `/api` 转发到 `http://localhost:3838`
- 先启动后端 `node server.js`，再启动前端开发服务

## SQL 建表建议（DMDB）
与当前代码一致的建议结构:

```sql
CREATE TABLE tax_ledger (
  id INT IDENTITY(1,1) PRIMARY KEY,
  decl_no VARCHAR(50) NOT NULL,
  goods_name VARCHAR(500),
  declare_date DATE,
  final_invoice_date DATE,
  latest_settle_date DATE,
  doc_receipt_date DATE,
  info_exchange VARCHAR(500),
  inquiry_start_date DATE,
  challenge_date DATE,
  negotiation_date DATE,
  valuation_work_date DATE,
  amend_date DATE,
  tax_start_date DATE,
  attribute_flags VARCHAR(200),
  tax_remark VARCHAR(1000),
  bond_balance DECIMAL(18,2),
  continu_tax_duty DECIMAL(18,2),
  continu_tax_vat DECIMAL(18,2),
  additional_tax_duty DECIMAL(18,2),
  additional_tax_vat DECIMAL(18,2),
  remark VARCHAR(1000),
  tax_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_tax_ledger_decl_no ON tax_ledger (decl_no);
```

备注:
- 计算字段（如天数差/紧急程度）在读取时动态计算，不落库。
- /api/ledger 列表接口包含基于 amend_date 和 challenge_date 的排序规则。

紧急状态规则（列表最左侧圆点）:
- 第13项（改单日期）非空：绿色
- 第13项为空且第10项（质疑日期）为空：
  - 当前时间减第4项（最晚发票日期） > 20：红色
  - 10 < 当前时间减第4项 ≤ 20：橙色
  - 当前时间减第4项 ≤ 10：黄色
- 第13项为空且第10项（质疑日期）非空：黄色

