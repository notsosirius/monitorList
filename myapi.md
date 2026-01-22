# 页面接口对接说明（插件/页面回填）

## 使用方式
### 方式 1：页面按钮自动调用（推荐）
1) 读取页面字段  
2) 拼装 JSON  
3) `fetch('/api/ledger/…', { method, headers, body })`

通用调用模板：
```js
async function callApi(url, payload) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## 字段选择器模板（示例占位）
> 以下仅为占位示例，请替换为你实际页面的选择器或 JS 变量路径。

```js
function readText(selector) {
  const el = document.querySelector(selector);
  return el ? el.textContent.trim() : '';
}

function readInput(selector) {
  const el = document.querySelector(selector);
  return el ? el.value.trim() : '';
}
```

页面A示例（读取字段）:
```js
const declNo = readText('#declNo');         // 报关单号
const taxNo = readText('#taxNo');           // 税号
const goodsName = readText('#goodsName');   // 商品名称
const declareDate = readText('#declareDate'); // 申报日期
```

页面F示例（读取税额）:
```js
const continuTaxDuty = readInput('#continuTaxDuty'); // 延续性征税-关税
const continuTaxVat = readInput('#continuTaxVat');   // 延续性征税-增值税
```

页面G示例（读取税额）:
```js
const additionalTaxDuty = readInput('#additionalTaxDuty'); // 审价补税-关税
const additionalTaxVat = readInput('#additionalTaxVat');   // 审价补税-增值税
```

---

## 页面按钮注入模板
> 以下模板可作为扩展/脚本注入使用，注意替换 `TARGET_SELECTOR`。

```js
function injectButton(text, onClick) {
  if (document.querySelector('#codex-action-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'codex-action-btn';
  btn.textContent = text;
  btn.style.cssText = 'margin-left:8px;padding:6px 10px;border:1px solid #333;border-radius:6px;background:#fff;cursor:pointer;';
  btn.addEventListener('click', onClick);
  const target = document.querySelector('TARGET_SELECTOR');
  if (target) target.appendChild(btn);
}
```

页面B示例（点击回填询价发起日期）:
```js
injectButton('回填询价日期', async () => {
  const declNo = readText('#declNo');
  const payload = {
    declNo,
    inquiryStartDate: new Date().toISOString().slice(0, 10)
  };
  await callApi('/api/ledger/by-decl-no', payload);
  alert('已回填');
});
```

页面F示例（点击回填延续性征税）:
```js
injectButton('回填延续性征税', async () => {
  const declNo = readText('#declNo');
  const payload = {
    declNo,
    continuTaxDuty: readInput('#continuTaxDuty'),
    continuTaxVat: readInput('#continuTaxVat')
  };
  await callApi('/api/ledger/by-decl-no', payload);
  alert('已回填');
});
```

### 方式 2：手工调试（Postman/curl）
直接调用下述接口与请求体即可。

---

## 页面A（登记）
用途：创建新台账记录  
接口：`POST /api/ledger`

请求体（camelCase）:
```json
{
  "declNo": "18位",
  "taxNo": "税号",
  "goodsName": "商品名称",
  "declareDate": "YYYY-MM-DD",
  "finalInvoiceDate": "YYYY-MM-DD",
  "docReceiptDate": "YYYY-MM-DD",
  "attributeFlags": ["公式定价", "特殊关系"],
  "remark": "备注",
  "confirmDuplicate": false
}
```

说明:
- 报关单号重复时会返回 409（提示是否继续）。
- 页面A读取：报关单号、税号、商品名称、申报日期。
- 弹窗录入：最终发票日期、资料签收日期、属性字段多选、备注。

---

## 页面B（询价发起日期）
用途：回填当前时间  
接口：`PATCH /api/ledger/by-decl-no`
```json
{
  "declNo": "18位",
  "inquiryStartDate": "YYYY-MM-DD"
}
```

## 页面C（质疑日期）
接口：`PATCH /api/ledger/by-decl-no`
```json
{
  "declNo": "18位",
  "challengeDate": "YYYY-MM-DD"
}
```

## 页面D（磋商日期）
接口：`PATCH /api/ledger/by-decl-no`
```json
{
  "declNo": "18位",
  "negotiationDate": "YYYY-MM-DD"
}
```

## 页面E（审价作业表日期）
接口：`PATCH /api/ledger/by-decl-no`
```json
{
  "declNo": "18位",
  "valuationWorkDate": "YYYY-MM-DD"
}
```

## 页面F（延续性征税）
用途：从页面F读取两项税额并回填  
接口：`PATCH /api/ledger/by-decl-no`
```json
{
  "declNo": "18位",
  "continuTaxDuty": 1234.56,
  "continuTaxVat": 789.01
}
```

## 页面G（审价补税）
用途：从页面G读取两项税额并回填  
接口：`PATCH /api/ledger/by-decl-no`
```json
{
  "declNo": "18位",
  "additionalTaxDuty": 1234.56,
  "additionalTaxVat": 789.01
}
```
