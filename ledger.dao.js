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
        decl_no, goods_name, declare_date,
        final_invoice_date, latest_settle_date, doc_receipt_date,
        info_exchange, inquiry_start_date, challenge_date, negotiation_date,
        valuation_work_date, amend_date,
        continu_tax_duty, continu_tax_vat, additional_tax_duty, additional_tax_vat,
        remark, tax_status, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const params = [
      data.decl_no,
      data.goods_name || null,
      data.declare_date || null,
      data.final_invoice_date || null,
      data.latest_settle_date || null,
      data.doc_receipt_date || null,
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
      data.tax_status || null
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
      SET final_invoice_date = ?,
          latest_settle_date = ?,
          doc_receipt_date = ?,
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
      data.final_invoice_date || null,
      data.latest_settle_date || null,
      data.doc_receipt_date || null,
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

  // 查询台账列表（过滤 + 排序 + 分页）
  async listLedgers(filters) {
    const params = [];
    let where = 'WHERE 1=1';

    if (filters.declNo) {
      // 报关单号精确匹配，返回所有满足条件的记录（再分页）
      where += ' AND decl_no = ?';
      params.push(filters.declNo);
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
    //    C1) 若 challenge_date 为空：排在更前，按“当前日期 - final_invoice_date”的天数降序
    //    C2) 若 challenge_date 非空：排在后一组，按 final_invoice_date 升序
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
}

module.exports = new LedgerDao();
