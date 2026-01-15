// db.js - 达梦数据库连接与辅助方法
// 详细说明：
// 1) connect(): 初始化连接池并执行建表/建索引。
// 2) query(): 执行查询并统一输出为小写字段名的对象。
// 3) execute(): 执行写入/更新/DDL，并自动提交事务。
// 4) mock 模式：数据库不可用时启用内存数据，便于本地启动与联调。
const dmdb = require('dmdb');
require('dotenv').config();

class Database {
  constructor() {
    // 读取环境变量中的连接信息
    this.config = {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    };
  }

  async connect() {
    try {
      // 连接字符串 + 连接池配置
      const connStr = `dm://${this.config.user}:${this.config.password}@${this.config.host}:${this.config.port}`;
      this.pool = await dmdb.createPool({
        connectString: connStr,
        poolMin: 2,
        poolMax: 5
      });

      console.log('达梦数据库连接成功。');
      await this.createTable();
      return this;
    } catch (error) {
      // 数据库不可用时切换为 mock 模式
      console.error('达梦连接失败:', error.message);
      console.log('启用 mock 数据库。');
      return this.useMock();
    }
  }

  useMock() {
    // 标记为 mock 模式并初始化内存存储
    this.isMock = true;
    this.records = [];
    return this;
  }

  async createTable() {
    // 税收征管关键节点监控台账表（达梦兼容）
    const createSql = `
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
      )
    `;

    // 普通索引：提高报关单号查询性能（非唯一）
    const indexSql = 'CREATE INDEX idx_tax_ledger_decl_no ON tax_ledger (decl_no)';

    try {
      await this.execute(createSql);
    } catch (error) {
      // 表已存在时忽略
    }

    try {
      await this.execute(indexSql);
    } catch (error) {
      // 索引已存在时忽略
    }
  }

  async query(sql, params = []) {
    if (this.isMock) {
      return this.mockQuery(sql, params);
    }

    let conn;
    try {
      conn = await this.pool.getConnection();
      const result = await conn.execute(sql, params);

      // 无行结果时直接返回
      if (!result.rows) return result;

      // 将元数据列名统一转为小写键名
      const rows = [];
      for (const row of result.rows) {
        const obj = {};
        if (result.metaData) {
          result.metaData.forEach((meta, index) => {
            obj[meta.name.toLowerCase()] = row[index];
          });
        }
        rows.push(obj);
      }
      return rows;
    } finally {
      if (conn) await conn.close();
    }
  }

  async execute(sql, params = []) {
    if (this.isMock) {
      return this.mockExecute(sql, params);
    }

    let conn;
    try {
      conn = await this.pool.getConnection();
      const result = await conn.execute(sql, params);
      await conn.commit();
      return { rowsAffected: result.rowsAffected || 0 };
    } finally {
      if (conn) await conn.close();
    }
  }

  mockQuery(sql, params) {
    // mock 查询：最小化实现，便于本地联调
    if (sql.includes('SELECT COUNT(*)')) {
      return [{ total: this.records.length }];
    }
    if (sql.includes('FROM tax_ledger')) {
      return this.records.map((r) => ({ ...r }));
    }
    if (sql.includes('WHERE id =')) {
      const record = this.records.find((r) => r.id === params[0]);
      return record ? [record] : [];
    }
    return [];
  }

  mockExecute(sql, params) {
    // mock 写入：模拟插入和更新
    if (sql.includes('INSERT INTO tax_ledger')) {
      const now = new Date().toISOString();
      const newRecord = {
        id: this.records.length + 1,
        decl_no: params[0],
        goods_name: params[1],
        declare_date: params[2],
        final_invoice_date: params[3],
        latest_settle_date: params[4],
        doc_receipt_date: params[5],
        info_exchange: params[6],
        inquiry_start_date: params[7],
        challenge_date: params[8],
        negotiation_date: params[9],
        valuation_work_date: params[10],
        amend_date: params[11],
        continu_tax_duty: params[12],
        continu_tax_vat: params[13],
        additional_tax_duty: params[14],
        additional_tax_vat: params[15],
        remark: params[16],
        tax_status: params[17],
        created_at: now,
        updated_at: now
      };
      this.records.unshift(newRecord);
      return { rowsAffected: 1 };
    }
    if (sql.includes('UPDATE tax_ledger')) {
      return { rowsAffected: 1 };
    }
    return { rowsAffected: 0 };
  }
}

module.exports = new Database();
