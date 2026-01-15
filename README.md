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

示例:
```bash
curl -X POST http://localhost:3838/api/ledger \
  -H "Content-Type: application/json" \
  -d '{
    "declNo": "BGD-001",
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
- declNo（精确匹配）
- amendDateFrom（YYYY-MM-DD）
- amendDateTo（YYYY-MM-DD）

示例:
```bash
curl "http://localhost:3838/api/ledger?page=1&pageSize=20&declNo=BGD-001"
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

### 查询单条记录
- GET /api/ledger/:id

示例:
```bash
curl http://localhost:3838/api/ledger/1
```

### 处理页更新
- PATCH /api/ledger/:id

请求体（camelCase）:
- finalInvoiceDate
- latestSettleDate
- docReceiptDate
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
