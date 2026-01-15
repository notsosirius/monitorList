// ledger.service.js - 审价台账 Service（业务层）
// 说明：
// 1) 负责计算字段与业务校验，不直接拼 SQL。
// 2) 负责重复预检与税费岗状态联动。
// 3) 统一输出列表/详情的计算字段与紧急状态。
const ledgerDao = require('./ledger.dao');

class LedgerService {
  // 将日期格式化为“仅日期”的时间戳（忽略时分秒），用于天数差计算
  toDateOnlyMs(value) {
    if (!value) return null;
    const date = new Date(value);
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    return new Date(y, m, d).getTime();
  }

  // 计算天数差（按日期天数，不考虑时分秒；空值返回 null）
  calcDaysDiff(dateA, dateB) {
    const a = this.toDateOnlyMs(dateA);
    const b = this.toDateOnlyMs(dateB);
    if (a === null || b === null) return null;
    const diffMs = a - b;
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }

  // 计算字段 7/14/15
  computeDerivedFields(record) {
    const daysReceiptInvoice = this.calcDaysDiff(record.doc_receipt_date, record.final_invoice_date);
    const daysAmendInvoice = this.calcDaysDiff(record.amend_date, record.final_invoice_date);
    const daysAmendDeclare = this.calcDaysDiff(record.amend_date, record.declare_date);

    return {
      ...record,
      days_receipt_invoice: daysReceiptInvoice,
      days_amend_invoice: daysAmendInvoice,
      days_amend_declare: daysAmendDeclare
    };
  }

  // 紧急状态圆点规则
  computeUrgency(record) {
    if (record.amend_date) return 'green';

    if (!record.challenge_date) {
      const days = this.calcDaysDiff(record.doc_receipt_date, record.final_invoice_date);
      if (days !== null && days > 20) return 'red';
      if (days !== null && days > 10) return 'orange';
      return 'yellow';
    }

    return 'yellow';
  }

  // 新建台账（含重复预检）
  async createLedger(data, confirmDuplicate) {
    const existingCount = await ledgerDao.countByDeclNo(data.decl_no);
    if (existingCount > 0 && !confirmDuplicate) {
      return {
        duplicate: true,
        existingCount
      };
    }

    await ledgerDao.insertLedger(data);
    return { duplicate: false };
  }

  // 查询单条并附加计算字段
  async getLedgerById(id) {
    const record = await ledgerDao.findById(id);
    if (!record) return null;
    const computed = this.computeDerivedFields(record);
    return {
      ...computed,
      urgency: this.computeUrgency(record)
    };
  }

  // 查询列表并附加计算字段
  async listLedgers(filters) {
    const { items, total } = await ledgerDao.listLedgers(filters);
    const computedItems = items.map((item) => {
      const computed = this.computeDerivedFields(item);
      return {
        ...computed,
        urgency: this.computeUrgency(item)
      };
    });
    return { items: computedItems, total };
  }

  // 更新处理页字段，并处理税费岗状态联动
  async updateLedger(id, data) {
    // 税费岗状态规则：
    // - 初始为空
    // - 第13项（amend_date）非空时自动置为“未处置”
    // - 手动处置后可更新为“已处置”
    let taxStatus = data.tax_status;

    if (taxStatus === undefined) {
      const existing = await ledgerDao.findById(id);
      taxStatus = existing?.tax_status || null;
    }

    if (data.amend_date) {
      taxStatus = taxStatus || '未处置';
    }

    await ledgerDao.updateLedger(id, {
      ...data,
      tax_status: taxStatus
    });
  }

  // 插件回填（按报关单号更新最新一条）
  async pluginUpdateByDeclNo(declNo, data) {
    // 只传递明确包含的字段，避免无意覆盖
    const payload = {};
    Object.keys(data || {}).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        payload[key] = data[key];
      }
    });

    await ledgerDao.updateByDeclNo(declNo, payload);
  }

  // 税费岗处置更新
  async updateTaxStatus(id, status) {
    await ledgerDao.updateLedger(id, { tax_status: status });
  }
}

module.exports = new LedgerService();
