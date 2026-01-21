// ledger.controller.js - 审价台账 Controller（路由层）
// 说明：
// 1) 处理 HTTP 请求参数校验与返回格式。
// 2) 调用 Service 完成业务逻辑。
// 3) 仅负责协议与错误码，不处理 SQL。
const express = require('express');
const XLSX = require('xlsx');
const ledgerService = require('./ledger.service');

const router = express.Router();

// 报关单号校验：仅允许 18 位数字
function isValidDeclNo(value) {
  return typeof value === 'string' && /^\d{18}$/.test(value);
}

// 文本字段规范化：去空白 + 长度限制（超限返回错误对象）
function normalizeText(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (maxLength && text.length > maxLength) {
    return { error: `字段长度超过限制（最大 ${maxLength}）` };
  }
  return text;
}

// 数值字段规范化：空值 -> null，非数字 -> 错误对象
function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  // 允许千分位与尾部空格（如 "1,234.00 "）
  const text = String(value).trim().replace(/,/g, '');
  if (!text) return null;
  const num = Number(text);
  if (!Number.isFinite(num)) {
    return { error: '数值格式不合法' };
  }
  return num;
}

function normalizeWorkdayFlag(value) {
  if (value === null || value === undefined || value === '') {
    return { error: '是否工作日不能为空' };
  }
  const text = String(value).trim();
  if (text === '1' || text === '是' || text.toLowerCase() === 'true') return 1;
  if (text === '0' || text === '否' || text.toLowerCase() === 'false') return 0;
  const num = Number(text);
  if (num === 1) return 1;
  if (num === 0) return 0;
  return { error: '是否工作日仅允许为 1/0 或 是/否' };
}

// 日期字段规范化：统一输出 YYYY-MM-DD（仅接受 yyyy/mm/dd 或 yyyy-mm-dd）
function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return { error: '日期格式不合法' };
  const year = match[1];
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 新建记录（含重复预检）
// 字段来源：
// - declNo / goodsName / declareDate：插件从页面 A 抓取
// - finalInvoiceDate / latestSettleDate / docReceiptDate：用户手工录入
router.post('/ledger', async (req, res) => {
  try {
    const {
      declNo,
      goodsName,
      declareDate,
      finalInvoiceDate,
      latestSettleDate,
      docReceiptDate,
      confirmDuplicate
    } = req.body;

    if (!declNo) {
      return res.status(400).json({ message: '报关单号不能为空' });
    }
    if (!isValidDeclNo(declNo)) {
      return res.status(400).json({ message: '报关单号必须为 18 位数字' });
    }

    const result = await ledgerService.createLedger(
      {
        decl_no: declNo,
        goods_name: goodsName,
        declare_date: declareDate,
        final_invoice_date: finalInvoiceDate,
        latest_settle_date: latestSettleDate,
        doc_receipt_date: docReceiptDate
      },
      Boolean(confirmDuplicate)
    );

    if (result.duplicate) {
      return res.status(409).json({
        code: 'DUPLICATE_DECL_NO',
        message: '报关单号已存在，是否仍要新增？',
        existingCount: result.existingCount
      });
    }

    return res.status(201).json({ message: '创建成功' });
  } catch (error) {
    return res.status(500).json({ message: '创建失败' });
  }
});

// 查询列表（含分页与筛选）
router.get('/ledger', async (req, res) => {
  try {
    if (req.query.declNo && !isValidDeclNo(req.query.declNo)) {
      return res.status(400).json({ message: '报关单号必须为 18 位数字' });
    }
    // 报关单号尾号筛选（支持多选，格式：0,1,2）
    let declNoSuffixes = null;
    if (req.query.declNoSuffixes) {
      const raw = String(req.query.declNoSuffixes)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const deduped = Array.from(new Set(raw));
      const valid = deduped.filter((value) => /^\d$/.test(value));
      declNoSuffixes = valid.length ? valid : null;
    }
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const rawPageSize = parseInt(req.query.pageSize || '100', 10);
    const pageSize = rawPageSize > 100 ? 100 : rawPageSize;

    const filters = {
      declNo: req.query.declNo || null,
      declNoSuffixes,
      amendDateFrom: req.query.amendDateFrom || null,
      amendDateTo: req.query.amendDateTo || null,
      page,
      pageSize
    };

    const result = await ledgerService.listLedgers(filters);
    res.json({
      page,
      pageSize,
      total: result.total,
      items: result.items
    });
  } catch (error) {
    res.status(500).json({ message: '查询失败' });
  }
});

// 税费岗列表（含分页）
router.get('/ledger/tax-desk', async (req, res) => {
  try {
    if (req.query.declNo && !isValidDeclNo(req.query.declNo)) {
      return res.status(400).json({ message: '报关单号必须为 18 位数字' });
    }
    // 起算日期为空筛选（仅显示空值记录）
    const startDateEmpty = req.query.startDateEmpty === '1' || req.query.startDateEmpty === 'true';
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const rawPageSize = parseInt(req.query.pageSize || '100', 10);
    const pageSize = rawPageSize > 100 ? 100 : rawPageSize;

    const result = await ledgerService.listTaxDesk({
      page,
      pageSize,
      declNo: req.query.declNo || null,
      startDateEmpty
    });
    res.json({
      page,
      pageSize,
      total: result.total,
      items: result.items
    });
  } catch (error) {
    res.status(500).json({ message: '查询失败' });
  }
});

// 税费岗单条录入（仅包含必要字段）
router.post('/ledger/tax-desk', async (req, res) => {
  try {
    const {
      declNo,
      goodsName,
      declareDate,
      finalInvoiceDate,
      amendDate,
      taxStartDate,
      taxRemark,
      bondBalance
    } = req.body || {};

    if (!declNo) {
      return res.status(400).json({ message: '报关单号不能为空' });
    }
    if (!isValidDeclNo(declNo)) {
      return res.status(400).json({ message: '报关单号必须为 18 位数字' });
    }
    if (!declareDate || !amendDate) {
      return res.status(400).json({ message: '申报日期、改单日期不能为空' });
    }

    const normalizedDeclareDate = normalizeDate(declareDate);
    if (normalizedDeclareDate?.error) {
      return res.status(400).json({ message: '申报日期格式不合法' });
    }
    let normalizedFinalInvoiceDate = null;
    if (finalInvoiceDate) {
      const normalized = normalizeDate(finalInvoiceDate);
      if (normalized?.error) {
        return res.status(400).json({ message: '最晚发票日期格式不合法' });
      }
      normalizedFinalInvoiceDate = normalized;
    }
    const normalizedAmendDate = normalizeDate(amendDate);
    if (normalizedAmendDate?.error) {
      return res.status(400).json({ message: '改单日期格式不合法' });
    }

    let normalizedTaxStartDate = null;
    if (taxStartDate) {
      const normalized = normalizeDate(taxStartDate);
      if (normalized?.error) {
        return res.status(400).json({ message: '起算日期格式不合法' });
      }
      normalizedTaxStartDate = normalized;
    }

    let normalizedTaxRemark = null;
    if (taxRemark) {
      const normalized = normalizeText(taxRemark, 1000);
      if (normalized?.error) {
        return res.status(400).json({ message: '税费岗备注过长' });
      }
      normalizedTaxRemark = normalized;
    }

    let normalizedBondBalance = null;
    if (bondBalance !== undefined && bondBalance !== null && bondBalance !== '') {
      const normalized = normalizeNumber(bondBalance);
      if (normalized?.error) {
        return res.status(400).json({ message: '保证金余额格式不合法' });
      }
      normalizedBondBalance = normalized;
    }

    await ledgerService.createTaxDeskEntry({
      decl_no: declNo,
      goods_name: goodsName,
      declare_date: normalizedDeclareDate,
      final_invoice_date: normalizedFinalInvoiceDate,
      amend_date: normalizedAmendDate,
      tax_start_date: normalizedTaxStartDate,
      tax_remark: normalizedTaxRemark,
      bond_balance: normalizedBondBalance
    });

    return res.status(201).json({ message: '创建成功' });
  } catch (error) {
    if (error?.code === 'AMEND_DATE_INVALID') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: '创建失败' });
  }
});

// Excel 导入（只读取首个工作表 + 严格校验字段，拒绝异常内容）
router.post(
  '/ledger/import',
  express.raw({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ],
    limit: '5mb'
  }),
  async (req, res) => {
    try {
      if (!req.body || !req.body.length) {
        return res.status(400).send('未收到 Excel 文件内容');
      }

      // 仅解析首个工作表，避免多表混淆
      const workbook = XLSX.read(req.body, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return res.status(400).send('Excel 内容为空');
      }

      // 统一按二维数组读取，第一行作为表头
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (!rows.length) {
        return res.status(400).send('Excel 内容为空');
      }

      const header = rows[0].map((cell) => String(cell).trim());
      const headerMap = {
        '报关单号': 'decl_no',
        '商品名称': 'goods_name',
        '申报日期': 'declare_date',
        '最晚发票日期': 'final_invoice_date',
        '最晚结算资料日期': 'latest_settle_date',
        '资料签收日期': 'doc_receipt_date',
        '资料交互情况': 'info_exchange',
        '询价发起日期': 'inquiry_start_date',
        '质疑日期': 'challenge_date',
        '磋商日期': 'negotiation_date',
        '审价作业表日期': 'valuation_work_date',
        '改单日期（已审价）': 'amend_date',
        '保证金余额': 'bond_balance',
        '延续性征税（关税）': 'continu_tax_duty',
        '延续性征税（增值税）': 'continu_tax_vat',
        '审价补税（关税）': 'additional_tax_duty',
        '审价补税（增值税）': 'additional_tax_vat',
        '备注': 'remark'
      };

      // 将表头映射成字段名数组（未知列忽略）
      const columns = header.map((name) => headerMap[name] || null);
      if (!columns.includes('decl_no')) {
        return res.status(400).send('缺少必填列：报关单号');
      }

      // 控制导入规模，降低滥用与误操作风险
      if (rows.length > 2001) {
        return res.status(400).send('单次导入最多支持 2000 行');
      }

      const errors = [];
      const records = [];

      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        const record = {};
        let hasValue = false;

        columns.forEach((key, index) => {
          if (!key) return;
          const value = row[index];
          if (value !== null && value !== undefined && value !== '') {
            hasValue = true;
          }

          // 日期字段：统一转 YYYY-MM-DD
          if (
            key === 'declare_date' ||
            key === 'final_invoice_date' ||
            key === 'latest_settle_date' ||
            key === 'doc_receipt_date' ||
            key === 'inquiry_start_date' ||
            key === 'challenge_date' ||
            key === 'negotiation_date' ||
            key === 'valuation_work_date' ||
            key === 'amend_date'
          ) {
            const normalized = normalizeDate(value);
            if (normalized?.error) {
              errors.push(`第 ${i + 1} 行日期格式不合法`);
            } else {
              record[key] = normalized;
            }
            return;
          }

          // 税费字段：仅允许数值
          if (
            key === 'continu_tax_duty' ||
            key === 'continu_tax_vat' ||
            key === 'additional_tax_duty' ||
            key === 'additional_tax_vat' ||
            key === 'bond_balance'
          ) {
            const normalized = normalizeNumber(value);
            if (normalized?.error) {
              errors.push(`第 ${i + 1} 行税费数值不合法`);
            } else {
              record[key] = normalized;
            }
            return;
          }

          // 文本字段：长度限制与去空白
          if (key === 'goods_name') {
            const normalized = normalizeText(value, 500);
            if (normalized?.error) {
              errors.push(`第 ${i + 1} 行商品名称过长`);
            } else {
              record[key] = normalized;
            }
            return;
          }

          if (key === 'info_exchange') {
            const normalized = normalizeText(value, 500);
            if (normalized?.error) {
              errors.push(`第 ${i + 1} 行资料交互情况过长`);
            } else {
              record[key] = normalized;
            }
            return;
          }

          if (key === 'remark') {
            const normalized = normalizeText(value, 1000);
            if (normalized?.error) {
              errors.push(`第 ${i + 1} 行备注过长`);
            } else {
              record[key] = normalized;
            }
            return;
          }

          // 报关单号：必须 18 位数字
          if (key === 'decl_no') {
            const declNo = normalizeText(value);
            if (!declNo || !isValidDeclNo(declNo)) {
              errors.push(`第 ${i + 1} 行报关单号必须为 18 位数字`);
            } else {
              record[key] = declNo;
            }
            return;
          }

          // 其他字段统一走文本清洗（当前无其他字段）
          const normalized = normalizeText(value);
          if (normalized?.error) {
            errors.push(`第 ${i + 1} 行字段格式不合法`);
          } else {
            record[key] = normalized;
          }
        });

        if (!hasValue) {
          continue;
        }
        records.push(record);
      }

      if (!records.length) {
        return res.status(400).send('没有可导入的数据行');
      }

      if (errors.length) {
        const list = errors.slice(0, 10).join('；');
        return res.status(400).send(`导入数据校验失败：${list}`);
      }

      const allowDuplicate = req.query.allowDuplicate === '1' || req.query.allowDuplicate === 'true';
      const result = await ledgerService.importLedgers(records, { allowDuplicate });
      return res.json({
        message: '导入完成',
        inserted: result.inserted,
        skipped: result.skipped,
        total: records.length
      });
    } catch (error) {
      return res.status(500).send('导入失败');
    }
  }
);

// 节假日导入（仅包含日期 + 是否工作日 + 备注）
router.post(
  '/holiday/import',
  express.raw({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ],
    limit: '2mb'
  }),
  async (req, res) => {
    try {
      if (!req.body || !req.body.length) {
        return res.status(400).send('未收到 Excel 文件内容');
      }

      const workbook = XLSX.read(req.body, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return res.status(400).send('Excel 内容为空');
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (!rows.length) {
        return res.status(400).send('Excel 内容为空');
      }

      const header = rows[0].map((cell) => String(cell).trim());
      const headerMap = {
        '日期': 'cal_date',
        '是否工作日': 'is_workday',
        '备注': 'note'
      };
      const columns = header.map((name) => headerMap[name] || null);
      if (!columns.includes('cal_date') || !columns.includes('is_workday')) {
        return res.status(400).send('缺少必填列：日期、是否工作日');
      }

      if (rows.length > 2001) {
        return res.status(400).send('单次导入最多支持 2000 行');
      }

      const errors = [];
      const records = [];
      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        let hasValue = false;
        const record = {};
        columns.forEach((key, index) => {
          if (!key) return;
          const value = row[index];
          if (value !== null && value !== undefined && value !== '') {
            hasValue = true;
          }
          if (key === 'cal_date') {
            const normalized = normalizeDate(value);
            if (normalized?.error) {
              errors.push(`第 ${i + 1} 行日期格式不合法`);
            } else {
              record.cal_date = normalized;
            }
            return;
          }
          if (key === 'is_workday') {
            const normalized = normalizeWorkdayFlag(value);
            if (normalized?.error) {
              errors.push(`第 ${i + 1} 行是否工作日不合法`);
            } else {
              record.is_workday = normalized;
            }
            return;
          }
          if (key === 'note') {
            const normalized = normalizeText(value, 200);
            if (normalized?.error) {
              errors.push(`第 ${i + 1} 行备注过长`);
            } else {
              record.note = normalized;
            }
          }
        });

        if (!hasValue) continue;
        records.push(record);
      }

      if (!records.length) {
        return res.status(400).send('没有可导入的数据行');
      }

      if (errors.length) {
        const list = errors.slice(0, 10).join('；');
        return res.status(400).send(`导入数据校验失败：${list}`);
      }

      const result = await ledgerService.importHolidayCalendar(records);
      return res.json({
        message: '导入完成',
        inserted: result.inserted,
        total: records.length
      });
    } catch (error) {
      return res.status(500).send('导入失败');
    }
  }
);

// 导出 Excel（按当前筛选条件）
router.get('/ledger/export', async (req, res) => {
  try {
    // 报关单号尾号筛选（用于导出时同步过滤）
    let declNoSuffixes = null;
    if (req.query.declNoSuffixes) {
      const raw = String(req.query.declNoSuffixes)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const deduped = Array.from(new Set(raw));
      const valid = deduped.filter((value) => /^\d$/.test(value));
      declNoSuffixes = valid.length ? valid : null;
    }
    const filters = {
      declNo: req.query.declNo || null,
      declNoSuffixes,
      amendDateFrom: req.query.amendDateFrom || null,
      amendDateTo: req.query.amendDateTo || null
    };

    const items = await ledgerService.exportLedgers(filters);
    const header = [
      '报关单号',
      '商品名称',
      '申报日期',
      '最晚发票日期',
      '最晚结算资料日期',
      '资料签收日期',
      '是否超30天（签收-发票）',
      '资料交互情况',
      '询价发起日期',
      '质疑日期',
      '磋商日期',
      '审价作业表日期',
      '改单日期（已审价）',
      '是否超30天（改单-发票）',
      '是否超270天（改单-申报）',
      '延续性征税（关税）',
      '延续性征税（增值税）',
      '审价补税（关税）',
      '审价补税（增值税）',
      '备注'
    ];

    const rows = items.map((item) => [
      item.decl_no,
      item.goods_name,
      item.declare_date,
      item.final_invoice_date,
      item.latest_settle_date,
      item.doc_receipt_date,
      item.days_receipt_invoice,
      item.info_exchange,
      item.inquiry_start_date,
      item.challenge_date,
      item.negotiation_date,
      item.valuation_work_date,
      item.amend_date,
      item.days_amend_invoice,
      item.days_amend_declare,
      item.continu_tax_duty,
      item.continu_tax_vat,
      item.additional_tax_duty,
      item.additional_tax_vat,
      item.remark
    ]);

    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'tax_ledger');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const from = filters.amendDateFrom || '全部';
    const to = filters.amendDateTo || '全部';
    const filename = `税收征管关键节点监控_改单日期_${from}_至_${to}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: '导出失败' });
  }
});

// 查询单条
router.get('/ledger/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const record = await ledgerService.getLedgerById(id);
    if (!record) {
      return res.status(404).json({ message: '记录不存在' });
    }
    return res.json(record);
  } catch (error) {
    return res.status(500).json({ message: '查询失败' });
  }
});

// 处理页更新（字段 4~20）
// 说明：第1~3项不可修改；计算字段 7/14/15 不接受前端提交
router.patch('/ledger/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};

    await ledgerService.updateLedger(id, {
      final_invoice_date: body.finalInvoiceDate,
      latest_settle_date: body.latestSettleDate,
      doc_receipt_date: body.docReceiptDate,
      info_exchange: body.infoExchange,
      inquiry_start_date: body.inquiryStartDate,
      challenge_date: body.challengeDate,
      negotiation_date: body.negotiationDate,
      valuation_work_date: body.valuationWorkDate,
      amend_date: body.amendDate,
      continu_tax_duty: body.continuTaxDuty,
      continu_tax_vat: body.continuTaxVat,
      additional_tax_duty: body.additionalTaxDuty,
      additional_tax_vat: body.additionalTaxVat,
      remark: body.remark
    });

    return res.json({ message: '更新成功' });
  } catch (error) {
    // 业务校验不通过时返回 400，其余错误返回 500
    if (error?.code === 'INVALID_TAX_STATUS' || error?.code === 'AMEND_DATE_INVALID') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: '更新失败' });
  }
});

// 插件回填（按报关单号更新最新一条，仅更新传入字段）
// 来源约定：
// - 页面 D：第9项（询价发起日期）、第12项（审价作业表日期）
// - 页面 E：第10项（质疑日期）、第11项（磋商日期）
// - 页面 B：第16项（延续性征税-关税）、第17项（延续性征税-增值税）
// - 页面 C：第18项（审价补税-关税）、第19项（审价补税-增值税）
// - 手工输入：第8项（资料交互情况）、第20项（备注）
router.patch('/ledger/by-decl-no', async (req, res) => {
  try {
    const {
      declNo,
      inquiryStartDate,   // 页面 D：第9项
      valuationWorkDate,  // 页面 D：第12项
      challengeDate,      // 页面 E：第10项
      negotiationDate,    // 页面 E：第11项
      infoExchange,       // 手工：第8项
      remark,             // 手工：第20项
      continuTaxDuty,     // 页面 B：第16项
      continuTaxVat,      // 页面 B：第17项
      additionalTaxDuty,  // 页面 C：第18项
      additionalTaxVat    // 页面 C：第19项
    } = req.body;

    if (!declNo) {
      return res.status(400).json({ message: '报关单号不能为空' });
    }
    if (!isValidDeclNo(declNo)) {
      return res.status(400).json({ message: '报关单号必须为 18 位数字' });
    }

    const payload = {};
    if (inquiryStartDate !== undefined) payload.inquiry_start_date = inquiryStartDate;
    if (valuationWorkDate !== undefined) payload.valuation_work_date = valuationWorkDate;
    if (challengeDate !== undefined) payload.challenge_date = challengeDate;
    if (negotiationDate !== undefined) payload.negotiation_date = negotiationDate;
    if (infoExchange !== undefined) payload.info_exchange = infoExchange;
    if (remark !== undefined) payload.remark = remark;
    if (continuTaxDuty !== undefined) payload.continu_tax_duty = continuTaxDuty;
    if (continuTaxVat !== undefined) payload.continu_tax_vat = continuTaxVat;
    if (additionalTaxDuty !== undefined) payload.additional_tax_duty = additionalTaxDuty;
    if (additionalTaxVat !== undefined) payload.additional_tax_vat = additionalTaxVat;

    await ledgerService.pluginUpdateByDeclNo(declNo, payload);
    return res.json({ message: '回填成功' });
  } catch (error) {
    return res.status(500).json({ message: '回填失败' });
  }
});

// 税费岗处置
router.patch('/ledger/:id/tax-status', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = req.body?.taxStatus;
    if (!status) {
      return res.status(400).json({ message: '税费岗状态不能为空' });
    }
    // 接口层枚举校验，避免非法状态进入业务层
    const allowedStatuses = ['未处置', '已处置'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: '税费岗状态仅允许为“未处置”或“已处置”' });
    }
    await ledgerService.updateTaxStatus(id, status);
    return res.json({ message: '更新成功' });
  } catch (error) {
    // 业务校验不通过时返回 400，其余错误返回 500
    if (error?.code === 'INVALID_TAX_STATUS' || error?.code === 'AMEND_DATE_INVALID') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: '更新失败' });
  }
});

// 更新税费岗录入字段（独立字段，避免覆盖其他字段）
router.patch('/ledger/:id/tax-start-date', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const taxStartDateRaw = req.body?.taxStartDate;
    const taxRemarkRaw = req.body?.taxRemark;
    const bondBalanceRaw = req.body?.bondBalance;

    let taxStartDate;
    if (taxStartDateRaw !== undefined) {
      const normalized = normalizeDate(taxStartDateRaw);
      if (normalized?.error) {
        return res.status(400).json({ message: '起算日期格式不合法' });
      }
      taxStartDate = normalized || null;
    }

    let taxRemark;
    if (taxRemarkRaw !== undefined) {
      const normalizedRemark = normalizeText(taxRemarkRaw, 1000);
      if (normalizedRemark?.error) {
        return res.status(400).json({ message: '税费岗备注过长' });
      }
      taxRemark = normalizedRemark || null;
    }

    let bondBalance;
    if (bondBalanceRaw !== undefined) {
      const normalizedBalance = normalizeNumber(bondBalanceRaw);
      if (normalizedBalance?.error) {
        return res.status(400).json({ message: '保证金余额格式不合法' });
      }
      bondBalance = normalizedBalance;
    }

    if (
      taxStartDateRaw === undefined &&
      taxRemarkRaw === undefined &&
      bondBalanceRaw === undefined
    ) {
      return res.status(400).json({ message: '起算日期、备注或保证金余额不能为空' });
    }

    const payload = {};
    if (taxStartDateRaw !== undefined) payload.tax_start_date = taxStartDate;
    if (taxRemarkRaw !== undefined) payload.tax_remark = taxRemark;
    if (bondBalanceRaw !== undefined) payload.bond_balance = bondBalance;

    await ledgerService.updateTaxDeskInfo(id, payload);
    return res.json({ message: '更新成功' });
  } catch (error) {
    return res.status(500).json({ message: '更新失败' });
  }
});

module.exports = router;

