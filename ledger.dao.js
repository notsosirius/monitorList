// ledger.dao.js - 审价台账 DAO（数据访问层）
// 说明：
// 1) 只负责 SQL 与数据持久化，不处理业务规则。
// 2) 列表查询在 SQL 层做过滤/排序/分页。
// 3) 报关单号查询返回所有匹配记录（再分页），不做去重。
const db = require('./db');

class LedgerDao {
  // 新增台账记录（字段 1/2/3/4/5/6 + 默认值）
  async insertLedger(data) {
    const sql = `
      INSERT INTO tax_ledger (
        decl_no, tax_no, goods_name, declare_date,
        final_invoice_date, latest_settle_date, doc_receipt_date,
        attribute_flags,
        info_exchange, inquiry_start_date, challenge_date, negotiation_date,
        valuation_work_date, amend_date, tax_start_date, tax_remark, bond_balance,
        extra_bond, receipt_received, broker_name, notice_sent,
        continu_tax_duty, continu_tax_vat, additional_tax_duty, additional_tax_vat,
        remark, tax_status, tax_desk_only, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const params = [
      data.decl_no,
      // tax_no: 税号
      data.tax_no || null,
      data.goods_name || null,
      data.declare_date || null,
      data.final_invoice_date || null,
      data.latest_settle_date || null,
      data.doc_receipt_date || null,
      // attribute_flags: 属性字段（逗号分隔）
      data.attribute_flags || null,
      data.info_exchange || null,
      data.inquiry_start_date || null,
      data.challenge_date || null,
      data.negotiation_date || null,
      data.valuation_work_date || null,
      data.amend_date || null,
      // tax_start_date: 起算日期
      data.tax_start_date || null,
      data.tax_remark || null,
      // bond_balance: 保证金余额
      data.bond_balance || null,
      // extra_bond: 补保证金
      data.extra_bond || null,
      // receipt_received: 是否收到收据（是/否）
      data.receipt_received || null,
      // broker_name: 报关行
      data.broker_name || null,
      // notice_sent: 是否发送通知书（是/否）
      data.notice_sent || null,
      data.continu_tax_duty || null,
      data.continu_tax_vat || null,
      data.additional_tax_duty || null,
      data.additional_tax_vat || null,
      data.remark || null,
      data.tax_status || null,
      // tax_desk_only: 税费岗单条录入标记（1=是）
      data.tax_desk_only || null
    ];

    return db.execute(sql, params);
  }

  // 按主键查询单条记录
  async findById(id) {
    const sql = 'SELECT * FROM tax_ledger WHERE id = ?';
    const rows = await db.query(sql, [id]);
    return rows[0];
  }

  // 按报关单号查询最新一条记录（用于插件回填）
  async findLatestByDeclNo(declNo) {
    const sql = `
      SELECT * FROM tax_ledger
      WHERE decl_no = ?
      ORDER BY id DESC
      LIMIT 1
    `;
    const rows = await db.query(sql, [declNo]);
    return rows[0];
  }

  // 统计报关单号重复数量
  async countByDeclNo(declNo) {
    const sql = 'SELECT COUNT(*) AS total FROM tax_ledger WHERE decl_no = ?';
    const rows = await db.query(sql, [declNo]);
    return rows[0]?.total || 0;
  }

  // 更新处理页字段（允许修改 4~20）
  async updateLedger(id, data) {
    const sql = `
      UPDATE tax_ledger
      SET tax_no = ?,
          final_invoice_date = ?,
          latest_settle_date = ?,
          doc_receipt_date = ?,
          attribute_flags = ?,
          info_exchange = ?,
          inquiry_start_date = ?,
          challenge_date = ?,
          negotiation_date = ?,
          valuation_work_date = ?,
          amend_date = ?,
          continu_tax_duty = ?,
          continu_tax_vat = ?,
          additional_tax_duty = ?,
          additional_tax_vat = ?,
          remark = ?,
          tax_status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const params = [
      // tax_no: 税号
      data.tax_no || null,
      data.final_invoice_date || null,
      data.latest_settle_date || null,
      data.doc_receipt_date || null,
      data.attribute_flags || null,
      data.info_exchange || null,
      data.inquiry_start_date || null,
      data.challenge_date || null,
      data.negotiation_date || null,
      data.valuation_work_date || null,
      data.amend_date || null,
      data.continu_tax_duty || null,
      data.continu_tax_vat || null,
      data.additional_tax_duty || null,
      data.additional_tax_vat || null,
      data.remark || null,
      data.tax_status || null,
      id
    ];

    return db.execute(sql, params);
  }

  // 按报关单号更新插件字段（更新最新一条，仅更新传入字段）
  async updateByDeclNo(declNo, data) {
    // 允许更新的字段白名单（按需求分页面回填）
    const allowed = [
      'inquiry_start_date',  // 第9项：页面 D
      'valuation_work_date', // 第12项：页面 D
      'challenge_date',      // 第10项：页面 E
      'negotiation_date',    // 第11项：页面 E
      'info_exchange',       // 第8项：手工录入
      'remark',              // 第20项：手工录入
      'continu_tax_duty',    // 第16项：页面 B
      'continu_tax_vat',     // 第17项：页面 B
      'additional_tax_duty', // 第18项：页面 C
      'additional_tax_vat'   // 第19项：页面 C
    ];

    // 仅拼接“明确传入”的字段（undefined 不更新）
    const sets = [];
    const params = [];
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sets.push(`${key} = ?`);
        params.push(data[key]);
      }
    });

    // 若没有可更新字段，则直接返回
    if (sets.length === 0) {
      return { rowsAffected: 0 };
    }

    const sql = `
      UPDATE tax_ledger
      SET ${sets.join(', ')},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM tax_ledger
        WHERE decl_no = ?
        ORDER BY id DESC
        LIMIT 1
      )
    `;

    params.push(declNo);
    return db.execute(sql, params);
  }

  // 仅更新税费岗录入字段（避免覆盖处理页的其他字段）
  async updateTaxDeskInfo(id, data) {
    const sets = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(data, 'tax_start_date')) {
      sets.push('tax_start_date = ?');
      params.push(data.tax_start_date || null);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'tax_remark')) {
      sets.push('tax_remark = ?');
      params.push(data.tax_remark || null);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'bond_balance')) {
      sets.push('bond_balance = ?');
      params.push(data.bond_balance || null);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'extra_bond')) {
      // extra_bond: 补保证金
      sets.push('extra_bond = ?');
      params.push(data.extra_bond || null);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'receipt_received')) {
      // receipt_received: 是否收到收据（是/否）
      sets.push('receipt_received = ?');
      params.push(data.receipt_received || null);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'broker_name')) {
      // broker_name: 报关行
      sets.push('broker_name = ?');
      params.push(data.broker_name || null);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'notice_sent')) {
      // notice_sent: 是否发送通知书（是/否）
      sets.push('notice_sent = ?');
      params.push(data.notice_sent || null);
    }

    if (sets.length === 0) {
      return { rowsAffected: 0 };
    }

    const sql = `
      UPDATE tax_ledger
      SET ${sets.join(', ')},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    params.push(id);
    return db.execute(sql, params);
  }

  // 查询台账列表（过滤 + 排序 + 分页）
  async listLedgers(filters) {
    const params = [];
    let where = 'WHERE 1=1';
    // 排除税费岗单条录入记录（台账导出不包含）
    where += ' AND (tax_desk_only IS NULL OR tax_desk_only <> 1)';
    // 排除税费岗单条录入记录（台账列表不展示）
    where += ' AND (tax_desk_only IS NULL OR tax_desk_only <> 1)';

    if (filters.declNo) {
      // 报关单号精确匹配，返回所有满足条件的记录（再分页）
      where += ' AND decl_no = ?';
      params.push(filters.declNo);
    }

    if (filters.declNoSuffixes && filters.declNoSuffixes.length) {
      // 报关单号尾号筛选（多选，SQL 层组装 IN 列表）
      const placeholders = filters.declNoSuffixes.map(() => '?').join(', ');
      where += ` AND SUBSTR(decl_no, -1) IN (${placeholders})`;
      params.push(...filters.declNoSuffixes);
    }

    if (filters.amendDateFrom && filters.amendDateTo) {
      // 筛选：仅 13 非空，闭区间
      where += ' AND amend_date IS NOT NULL AND amend_date BETWEEN ? AND ?';
      params.push(filters.amendDateFrom, filters.amendDateTo);
    }

    // 复杂排序规则（SQL 层实现）：
    // A) amend_date 为空的记录排在最前
    // B) amend_date 非空的记录排在后，并按 amend_date 降序
    // C) 对于 amend_date 为空的记录：
    //    C1) 若 final_invoice_date 为空且 challenge_date 为空：排在 amend_date 为空序列的末位，按 declare_date 升序
    //    C2) 若 final_invoice_date 非空且 challenge_date 为空：排在更前，按“当前日期 - final_invoice_date”的天数降序
    //    C3) 若 final_invoice_date 非空且 challenge_date 非空：排在后一组，按 final_invoice_date 升序
    const orderBy = `
      ORDER BY
        CASE WHEN amend_date IS NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN amend_date IS NULL AND final_invoice_date IS NULL AND challenge_date IS NULL THEN 1 ELSE 0 END ASC,
        CASE WHEN amend_date IS NULL AND final_invoice_date IS NOT NULL AND challenge_date IS NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN amend_date IS NOT NULL THEN amend_date ELSE NULL END DESC,
        CASE
          WHEN amend_date IS NULL AND final_invoice_date IS NOT NULL AND challenge_date IS NULL
          THEN (CURRENT_DATE - final_invoice_date)
          ELSE NULL
        END DESC,
        CASE
          WHEN amend_date IS NULL AND final_invoice_date IS NOT NULL AND challenge_date IS NOT NULL
          THEN final_invoice_date
          ELSE NULL
        END ASC,
        CASE
          WHEN amend_date IS NULL AND final_invoice_date IS NULL AND challenge_date IS NULL THEN declare_date
          ELSE NULL
        END ASC
    `;

    const offset = (filters.page - 1) * filters.pageSize;
    const sql = `
      SELECT * FROM tax_ledger
      ${where}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const countSql = `SELECT COUNT(*) AS total FROM tax_ledger ${where}`;
    const [items, count] = await Promise.all([
      db.query(sql, [...params, filters.pageSize, offset]),
      db.query(countSql, params)
    ]);

    return {
      items,
      total: count[0]?.total || 0
    };
  }

  // 税费岗列表（仅展示改单日期非空记录）
  async listTaxDesk(filters) {
    const { items, total } = await this.listTaxDeskRaw(filters);
    const offset = (filters.page - 1) * filters.pageSize;
    return {
      items: items.slice(offset, offset + filters.pageSize),
      total
    };
  }

  // 税费岗列表原始数据（不排序、不分页）
  async listTaxDeskRaw(filters) {
    const params = [];
    let where = `WHERE (
      tax_desk_only = 1
      OR ((tax_desk_only IS NULL OR tax_desk_only = 0) AND amend_date IS NOT NULL)
    )`;
    if (filters.declNo) {
      // 报关单号精确匹配
      where += ' AND decl_no = ?';
      params.push(filters.declNo);
    }
    if (filters.startDateEmpty) {
      // 起算日期为空筛选
      where += ' AND tax_start_date IS NULL';
    }
    if (filters.noticeUnsent) {
      // 未发送通知书：空值或否
      where += " AND (notice_sent IS NULL OR notice_sent = '否')";
    }
    if (filters.receiptUnreceived) {
      // 未收到收据：仅否
      where += " AND receipt_received = '否'";
    }
    if (filters.extraBondLike) {
      // 补保证金模糊匹配（数值转文本）
      where += ' AND TO_CHAR(extra_bond) LIKE ?';
      params.push(`%${filters.extraBondLike}%`);
    }
    const sql = `
      SELECT * FROM tax_ledger
      ${where}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM tax_ledger ${where}`;
    const [items, count] = await Promise.all([
      db.query(sql, params),
      db.query(countSql, params)
    ]);

    return {
      items,
      total: count[0]?.total || 0
    };
  }

  // 查询节假日配置（日期范围内）
  async listHolidayCalendar(startDate, endDate) {
    const sql = `
      SELECT cal_date, is_workday
      FROM holiday_calendar
      WHERE cal_date BETWEEN ? AND ?
    `;
    return db.query(sql, [startDate, endDate]);
  }

  // 批量写入节假日配置（先删后插）
  async replaceHolidayCalendar(rows) {
    if (!rows.length) return { inserted: 0 };
    const dates = rows.map((row) => row.cal_date);
    const placeholders = dates.map(() => '?').join(', ');
    const deleteSql = `DELETE FROM holiday_calendar WHERE cal_date IN (${placeholders})`;
    await db.execute(deleteSql, dates);

    const insertSql = `
      INSERT INTO holiday_calendar (cal_date, is_workday, note)
      VALUES (?, ?, ?)
    `;
    for (const row of rows) {
      await db.execute(insertSql, [row.cal_date, row.is_workday, row.note || null]);
    }
    return { inserted: rows.length };
  }

  // 仅更新税费岗状态（避免覆盖处理页的其他字段）
  async updateTaxStatus(id, status) {
    const sql = `
      UPDATE tax_ledger
      SET tax_status = ?,
          -- tax_processed_date: 处置日期（用于锁定工作日数）
          tax_processed_date = CASE WHEN ? = '已处置' THEN CURRENT_DATE ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    return db.execute(sql, [status, status, id]);
  }

  // 导出列表（过滤 + 排序，不分页）
  async exportLedgers(filters) {
    const params = [];
    let where = 'WHERE 1=1';

    if (filters.declNo) {
      where += ' AND decl_no = ?';
      params.push(filters.declNo);
    }

    if (filters.declNoSuffixes && filters.declNoSuffixes.length) {
      // 报关单号尾号筛选（多选，导出同步过滤）
      const placeholders = filters.declNoSuffixes.map(() => '?').join(', ');
      where += ` AND SUBSTR(decl_no, -1) IN (${placeholders})`;
      params.push(...filters.declNoSuffixes);
    }

    if (filters.amendDateFrom && filters.amendDateTo) {
      where += ' AND amend_date IS NOT NULL AND amend_date BETWEEN ? AND ?';
      params.push(filters.amendDateFrom, filters.amendDateTo);
    }

    const orderBy = `
      ORDER BY
        CASE WHEN amend_date IS NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN amend_date IS NULL AND challenge_date IS NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN amend_date IS NOT NULL THEN amend_date ELSE NULL END DESC,
        CASE
          WHEN amend_date IS NULL AND challenge_date IS NULL THEN (CURRENT_DATE - final_invoice_date)
          ELSE NULL
        END DESC,
        CASE
          WHEN amend_date IS NULL AND challenge_date IS NOT NULL THEN final_invoice_date
          ELSE NULL
        END ASC
    `;

    const sql = `
      SELECT * FROM tax_ledger
      ${where}
      ${orderBy}
    `;

    return db.query(sql, params);
  }
}

module.exports = new LedgerDao();

