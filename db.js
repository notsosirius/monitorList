// db.js - 达梦数据库连接
const dmdb = require('dmdb');
require('dotenv').config();

class Database {
 constructor() {
    this.config = {
      host: process.env.DB_HOST ,
      port: parseInt(process.env.DB_PORT) ,
      user: process.env.DB_USER ,
      password: process.env.DB_PASSWORD ,
      database: process.env.DB_NAME ,
      connectString: `dm://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}`
    };
  }

  async connect() {
    try {
      const connStr = `dm://${this.config.user}:${this.config.password}@${this.config.host}:${this.config.port}`;
      
      this.pool = await dmdb.createPool({
        connectString: connStr,
        poolMin: 2,
        poolMax: 5
      });
      
      console.log('✅ 达梦数据库连接成功');
      
      // 创建表
      await this.createTable();
      
      return this;
    } catch (error) {
      console.error('❌ 达梦连接失败:', error.message);
      console.log('📦 使用模拟数据库...');
      return this.useMock();
    }
  }

  useMock() {
    console.log('📦 使用模拟数据库模式');
    this.isMock = true;
    this.records = [];
    return this;
  }

  async createTable() {
    try {
      const sql = `
        CREATE TABLE IF NOT EXISTS material_check_records (
          id INT IDENTITY(1,1) PRIMARY KEY,
          declare_id VARCHAR(100) NOT NULL UNIQUE,
          imo VARCHAR(50),
          voyage_no VARCHAR(50),
          customs_code VARCHAR(50),
          ship_name_cn VARCHAR(200),
          berth VARCHAR(100),
          plan_time VARCHAR(20),
          co_cn_name VARCHAR(200),
          operator VARCHAR(100) NOT NULL,
          operator_code VARCHAR(50),
          goods_name VARCHAR(500),
          person1 VARCHAR(100),
          person1_code VARCHAR(50),
          person2 VARCHAR(100),
          person2_code VARCHAR(50),
          check_result VARCHAR(1000),
          dispatch_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          result_time TIMESTAMP,
          status INT DEFAULT 1
        )
      `;
      
      await this.execute(sql);
      console.log('✅ 数据库表创建完成');
    } catch (error) {
      console.log('📋 表已存在:', error.message);
    }
  }

  async query(sql, params = []) {
    if (this.isMock) {
      console.log('📝 模拟查询:', sql.substring(0, 100));
      
      if (sql.includes('SELECT COUNT(*)')) {
        return [{ total: this.records.length }];
      } else if (sql.includes('SELECT DISTINCT customs_code')) {
        const codes = [...new Set(this.records.map(r => r.customs_code).filter(Boolean))];
        return codes.map(code => ({ customs_code: code }));
      } else if (sql.includes('WHERE declare_id =')) {
        const record = this.records.find(r => r.declare_id === params[0]);
        return record ? [record] : [];
      } else if (sql.includes('FROM material_check_records')) {
        return this.records.map(r => ({ ...r }));
      }
      return [];
    }
    
    let conn;
    try {
      conn = await this.pool.getConnection();
      const result = await conn.execute(sql, params);
      
      if (result.rows) {
        const rows = [];
        for (let row of result.rows) {
          const obj = {};
          if (result.metaData) {
            result.metaData.forEach((meta, index) => {
              obj[meta.name.toLowerCase()] = row[index];
            });
          }
          rows.push(obj);
        }
        return rows;
      }
      return result;
    } finally {
      if (conn) await conn.close();
    }
  }

  async execute(sql, params = []) {
    if (this.isMock) {
      console.log('📝 模拟执行:', sql.substring(0, 100));
      
      if (sql.includes('INSERT INTO')) {
        const newRecord = {
          id: this.records.length + 1,
          declare_id: params[0],
          imo: params[1],
          voyage_no: params[2],
          customs_code: params[3],
          ship_name_cn: params[4],
          berth: params[5],
          plan_time: params[6],
          co_cn_name: params[7],
          operator: params[8],
          operator_code: params[9],
          goods_name: params[10],
          person1: params[11],
          person1_code: params[12],
          person2: params[13],
          person2_code: params[14],
          check_result: null,
          dispatch_time: new Date().toISOString().replace('T', ' ').substring(0, 19),
          result_time: null,
          status: 1
        };
        this.records.unshift(newRecord);
        console.log('✅ 模拟插入成功:', newRecord.declare_id);
        return { rowsAffected: 1 };
      } else if (sql.includes('UPDATE')) {
        const record = this.records.find(r => r.declare_id === params[1]);
        if (record) {
          record.check_result = params[0];
          record.result_time = new Date().toISOString().replace('T', ' ').substring(0, 19);
          record.status = 2;
          console.log('✅ 模拟更新成功:', record.declare_id);
          return { rowsAffected: 1 };
        }
      }
      return { rowsAffected: 0 };
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
}

module.exports = new Database();
