// ledger.service.js - 审价台账 Service（业务层）
// 说明：
// 1) 负责计算字段与业务校验，不直接拼 SQL。
// 2) 负责重复预检与税费岗状态联动。
// 3) 统一输出列表/详情的计算字段与紧急状态。
const ledgerDao = require('./ledger.dao');

class LedgerService {
  constructor() {
    // 税费岗状态枚举（空值表示未设置）
    this.taxStatusValues = ['未处置', '已处置'];
  }

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

  // 计算工作日差（不含起始日，含结束日；空值返回 null）
  calcBusinessDaysDiff(startDate, endDate) {
    const start = this.toDateOnlyMs(startDate);
    const end = this.toDateOnlyMs(endDate);
    if (start === null || end === null) return null;
    if (start >= end) return 0;
    let count = 0;
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor.getTime() <= end) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  // 计算工作日差（优先使用节假日表覆盖；空值返回 null）
  async calcBusinessDaysDiffWithCalendar(startDate, endDate) {
    const startMs = this.toDateOnlyMs(startDate);
    const endMs = this.toDateOnlyMs(endDate);
    if (startMs === null || endMs === null) return null;
    if (startMs >= endMs) return 0;

    const startDateStr = new Date(startMs).toISOString().slice(0, 10);
    const endDateStr = new Date(endMs).toISOString().slice(0, 10);
    const rows = await ledgerDao.listHolidayCalendar(startDateStr, endDateStr);
    const calendar = new Map();
    rows.forEach((row) => {
      const key = new Date(row.cal_date).toISOString().slice(0, 10);
      calendar.set(key, row.is_workday === 1 || row.is_workday === '1');
    });

    let count = 0;
    const cursor = new Date(startMs);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor.getTime() <= endMs) {
      const key = cursor.toISOString().slice(0, 10);
      if (calendar.has(key)) {
        if (calendar.get(key)) count += 1;
      } else {
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) count += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return count;
  }

  // 校验改单日期：必须 >= 最晚发票日期 且 >= 申报日期
  validateAmendDate(amendDate, finalInvoiceDate, declareDate) {
    if (!amendDate) return false;
    const amendMs = this.toDateOnlyMs(amendDate);
    const finalMs = this.toDateOnlyMs(finalInvoiceDate);
    const declareMs = this.toDateOnlyMs(declareDate);
    if (amendMs === null || finalMs === null || declareMs === null) return false;
    return amendMs >= finalMs && amendMs >= declareMs;
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

  // 紧急状态圆点规则（基于第13项/第10项/第4项与当前时间）
  computeUrgency(record) {
    if (record.amend_date) return 'green';

    if (!record.challenge_date) {
      // 当前时间减最晚发票日期（第4项）
      const days = this.calcDaysDiff(new Date(), record.final_invoice_date);
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

  // 税费岗列表（按新规则排序后再分页）
  async listTaxDesk(filters) {
    const { items } = await ledgerDao.listTaxDeskRaw(filters);

    // 计算起算后工作日数（用于展示）
    const today = new Date();
    const computed = await Promise.all(
      items.map(async (item) => {
        const workdays = item.tax_start_date
          ? await this.calcBusinessDaysDiffWithCalendar(item.tax_start_date, today)
          : null;
        return {
          ...item,
          workday_since_start: workdays
        };
      })
    );

    const sorted = computed.sort((a, b) => {
      // 1) 未处置在已处置前
      const processedA = a.tax_status === '已处置';
      const processedB = b.tax_status === '已处置';
      if (processedA !== processedB) return processedA ? 1 : -1;

      // 2) 已处置：按起算日期降序
      if (processedA && processedB) {
        const dateA = this.toDateOnlyMs(a.tax_start_date) ?? -Infinity;
        const dateB = this.toDateOnlyMs(b.tax_start_date) ?? -Infinity;
        return dateB - dateA;
      }

      // 3) 未处置：起算日期非空在前，空值在后
      const hasStartA = Boolean(a.tax_start_date);
      const hasStartB = Boolean(b.tax_start_date);
      if (hasStartA !== hasStartB) return hasStartA ? -1 : 1;

      // 4) 未处置且起算日期非空：按起算日期升序
      if (hasStartA && hasStartB) {
        const dateA = this.toDateOnlyMs(a.tax_start_date);
        const dateB = this.toDateOnlyMs(b.tax_start_date);
        return dateA - dateB;
      }

      // 5) 未处置且起算日期为空：按改单日期升序
      const amendA = this.toDateOnlyMs(a.amend_date) ?? 0;
      const amendB = this.toDateOnlyMs(b.amend_date) ?? 0;
      return amendA - amendB;
    });

    const offset = (filters.page - 1) * filters.pageSize;
    return {
      items: sorted.slice(offset, offset + filters.pageSize),
      total: sorted.length
    };
  }

  // 批量导入节假日配置
  async importHolidayCalendar(rows) {
    return ledgerDao.replaceHolidayCalendar(rows);
  }

  // 导出列表（附加计算字段，便于导出 7/14/15）
  async exportLedgers(filters) {
    const items = await ledgerDao.exportLedgers(filters);
    return items.map((item) => this.computeDerivedFields(item));
  }

  // 更新处理页字段，并处理税费岗状态联动
  async updateLedger(id, data) {
    // 税费岗状态规则：
    // - 初始为空
    // - 改单日期（第13项）非空时自动置为“未处置”
    // - “已处置”只允许通过专用接口在校验后更新
    let taxStatus;

    const existing = await ledgerDao.findById(id);
    taxStatus = existing?.tax_status || null;

    if (data.amend_date) {
      const finalInvoiceDate = data.final_invoice_date ?? existing?.final_invoice_date;
      const declareDate = existing?.declare_date;
      const isValid = this.validateAmendDate(data.amend_date, finalInvoiceDate, declareDate);
      if (!isValid) {
        const error = new Error('改单日期必须大于等于最晚发票日期且大于等于申报日期');
        error.code = 'AMEND_DATE_INVALID';
        throw error;
      }
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

  // 批量导入（用于 Excel 入库，统一重复策略与税费岗状态联动）
  async importLedgers(rows, options = {}) {
    const allowDuplicate = Boolean(options.allowDuplicate);
    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      // 不允许重复时：遇到已存在报关单号则跳过
      if (!allowDuplicate) {
        const existingCount = await ledgerDao.countByDeclNo(row.decl_no);
        if (existingCount > 0) {
          skipped += 1;
          continue;
        }
      }

      // 导入记录如果已有改单日期，默认置为“未处置”
      if (row.amend_date && !row.tax_status) {
        row.tax_status = '未处置';
      }

      await ledgerDao.insertLedger(row);
      inserted += 1;
    }

    return { inserted, skipped };
  }

  // 税费岗处置更新
  async updateTaxStatus(id, status) {
    // 状态只允许使用枚举值
    if (!this.taxStatusValues.includes(status)) {
      const error = new Error('税费岗状态仅允许为“未处置”或“已处置”');
      error.code = 'INVALID_TAX_STATUS';
      throw error;
    }

    // 设置为“已处置”前必须校验改单日期
    if (status === '已处置') {
      const existing = await ledgerDao.findById(id);
      const isValid = this.validateAmendDate(
        existing?.amend_date,
        existing?.final_invoice_date,
        existing?.declare_date
      );
      if (!isValid) {
        const error = new Error('改单日期不合法，无法设置为已处置');
        error.code = 'AMEND_DATE_INVALID';
        throw error;
      }
    }

    // 只更新税费岗状态，避免把其他字段置空
    await ledgerDao.updateTaxStatus(id, status);
  }

  // 更新税费岗录入字段（独立字段更新，避免覆盖其他字段）
  async updateTaxDeskInfo(id, data) {
    await ledgerDao.updateTaxDeskInfo(id, data);
  }

  // 税费岗单条录入（直接生成含改单日期的记录）
  async createTaxDeskEntry(data) {
    let isValid = false;
    if (data.final_invoice_date) {
      // 有最晚发票日期时：校验改单日期 >= 最晚发票日期 且 >= 申报日期
      isValid = this.validateAmendDate(
        data.amend_date,
        data.final_invoice_date,
        data.declare_date
      );
    } else {
      // 无最晚发票日期时：仅校验改单日期 >= 申报日期
      const amendMs = this.toDateOnlyMs(data.amend_date);
      const declareMs = this.toDateOnlyMs(data.declare_date);
      isValid = amendMs !== null && declareMs !== null && amendMs >= declareMs;
    }

    if (!isValid) {
      const message = data.final_invoice_date
        ? '改单日期必须大于等于最晚发票日期且大于等于申报日期'
        : '改单日期必须大于等于申报日期';
      const error = new Error(message);
      error.code = 'AMEND_DATE_INVALID';
      throw error;
    }

    const payload = {
      ...data,
      tax_status: '未处置'
    };

    await ledgerDao.insertLedger(payload);
  }
}

module.exports = new LedgerService();

