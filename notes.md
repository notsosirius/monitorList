# Session Notes

## DB
- TAX_LEDGER has ENTERPRISE_TAX_DATE (DATE).
- TEMP table TAX_LEDGER_TMP lives in TAX_LEDGER schema.
- Import strategy: CSV -> TAX_LEDGER_TMP (all VARCHAR), then INSERT ... SELECT with TRIM + REPLACE(',', '') for numeric fields.

## Frontend UX
- Ledger list: sticky header + sticky left columns (Urgency, Decl No), vertical scroll inside table area.
- Ledger list: info_exchange and remark are single-line, fixed-width, ellipsis.
- Ledger list: decl_no suffix filter (multi-select 0-9) + export uses same filter.
- Tax desk: urgent dot uses business-day diff vs enterprise_tax_date; processed -> green.
- Tax desk: enterprise tax date entry modal (compact), input centered; entry disabled when processed.
- Tax desk: action order is Entry (left) then Process (right).

## Backend
- Decl No validation: 18 digits enforced.
- Tax status update only updates tax_status (no other fields reset).
- New endpoint: PATCH /api/ledger/:id/enterprise-tax-date (date only).
- Excel import endpoint supports cleaning numeric fields (trim + remove commas).

## Pending
- Provide TEMP table + INSERT SQL that includes ENTERPRISE_TAX_DATE column.

## Run
- Backend: node server.js
- Frontend: cd web && npm run dev

## Plugin Plan (Page A)
- Flow: inject button -> read 3 fields from JS globals -> POST to backend -> store in DB.
- Backend endpoint: POST http://localhost:3838/api/ledger
- Payload fields: declNo (18-digit), goodsName, declareDate (YYYY-MM-DD).
- Injection: Chrome extension content script; no DOM read needed if JS globals exist.
- Template code uses JS_PATH_DECL_NO / JS_PATH_GOODS_NAME / JS_PATH_DECLARE_DATE placeholders.
