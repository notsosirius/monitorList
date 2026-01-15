// ledger.controller.js - 审价台账 Controller（路由层）
// 说明：
// 1) 处理 HTTP 请求参数校验与返回格式。
// 2) 调用 Service 完成业务逻辑。
// 3) 仅负责协议与错误码，不处理 SQL。
const express = require('express');
const XLSX = require('xlsx');
const ledgerService = require('./ledger.service');

const router = express.Router();

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
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const rawPageSize = parseInt(req.query.pageSize || '100', 10);
    const pageSize = rawPageSize > 100 ? 100 : rawPageSize;

    const filters = {
      declNo: req.query.declNo || null,
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
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const rawPageSize = parseInt(req.query.pageSize || '100', 10);
    const pageSize = rawPageSize > 100 ? 100 : rawPageSize;

    const result = await ledgerService.listTaxDesk({ page, pageSize });
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

// 导出 Excel（按当前筛选条件）
router.get('/ledger/export', async (req, res) => {
  try {
    const filters = {
      declNo: req.query.declNo || null,
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

module.exports = router;
