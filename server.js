// server.js - 主应用
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3002;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 人员配置（从图片提取）
const DEPARTMENT_PERSONS = {
  '监管一科': [
    { name: '胡鹏', code: '6796880' },
    { name: '邱保坚', code: '6796260' },
    { name: '黎俐宏', code: '6784780' },
    { name: '陈国忠', code: '6790910' },
    { name: '胡轶凯', code: '6787380' },
    { name: '罗伊昕', code: '6779320' },
    { name: '陈晓红', code: '6782240' },
    { name: '黄恒', code: '6782370' },
    { name: '梁光辉', code: '6792120' },
    { name: '任洪海', code: '6792190' },
    { name: '张栋文', code: '6779590' },
    { name: '刘娜', code: '6790280' }
  ],
  '监管二科': [
    { name: '吴卓伟', code: '6781500' },
    { name: '邢旭琴', code: '6784540' },
    { name: '郭锐', code: '6793290' },
    { name: '吴英彬', code: '6788610' },
    { name: '郭超钦', code: '6792910' },
    { name: '叶振龙', code: '6797640' },
    { name: '邓柳', code: '6794720' },
    { name: '李沂原', code: '6779610' },
    { name: '何武权', code: '6789250' },
    { name: '黄江伟', code: '6792170' }
  ]
};

// API: 获取人员列表
app.get('/api/persons', (req, res) => {
  res.json({ success: true, data: DEPARTMENT_PERSONS });
});

// API: 派单
app.post('/api/dispatch', async (req, res) => {
  try {
    const { 
      declare_id, imo, voyage_no, customs_code, ship_name_cn, 
      berth, plan_time, co_cn_name, operator, operator_code, 
      goods_name, persons, remark 
    } = req.body;
    
    // 验证
    if (!declare_id || !operator || !persons || persons.length < 3) {
      return res.status(400).json({ 
        success: false, 
        message: '物料编号、派单人和至少3个检查人员是必需的' 
      });
    }
    
    // 随机选择2人
    const shuffled = [...persons].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 2);
    
    const sql = `
      INSERT INTO material_check_records 
      (declare_id, imo, voyage_no, customs_code, ship_name_cn, berth, 
       plan_time, co_cn_name, operator, operator_code, goods_name,
       person1, person1_code, person2, person2_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await db.execute(sql, [
      declare_id, imo, voyage_no, customs_code, ship_name_cn,
      berth, plan_time, co_cn_name, operator, operator_code,
      goods_name || '',
      selected[0].name, selected[0].code,
      selected[1].name, selected[1].code
    ]);
    
    res.json({
      success: true,
      message: '派单成功',
      data: {
        declare_id,
        selected: [
          { person: selected[0].name, code: selected[0].code },
          { person: selected[1].name, code: selected[1].code }
        ],
        dispatch_time: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('派单失败:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message.includes('unique') ? '物料编号已存在' : '派单失败' 
    });
  }
});

// API: 录入检查结果
app.post('/api/result', async (req, res) => {
  try {
    const { declare_id, check_result } = req.body;
    
    if (!declare_id || !check_result) {
      return res.status(400).json({ 
        success: false, 
        message: '物料编号和检查结果是必需的' 
      });
    }
    
    const sql = `
      UPDATE material_check_records 
      SET check_result = ?, result_time = CURRENT_TIMESTAMP, status = 2
      WHERE declare_id = ?
    `;
    
    await db.execute(sql, [check_result, declare_id]);
    
    res.json({ success: true, message: '检查结果已录入' });
  } catch (error) {
    console.error('录入失败:', error);
    res.status(500).json({ success: false, message: '录入失败' });
  }
});

// API: 查询记录
app.get('/api/records', async (req, res) => {
  try {
    const { 
      page = 1, pageSize = 20, declare_id, customs_code, 
      imo, voyage_no, operator, start_date, end_date, status 
    } = req.query;
    
    let where = 'WHERE 1=1';
    const params = [];
    
    if (declare_id) {
      where += ' AND declare_id LIKE ?';
      params.push(`%${declare_id}%`);
    }
    if (customs_code && customs_code !== 'all') {
      where += ' AND customs_code = ?';
      params.push(customs_code);
    }
    if (imo) {
      where += ' AND imo LIKE ?';
      params.push(`%${imo}%`);
    }
    if (voyage_no) {
      where += ' AND voyage_no LIKE ?';
      params.push(`%${voyage_no}%`);
    }
    if (operator) {
      where += ' AND operator LIKE ?';
      params.push(`%${operator}%`);
    }
    if (start_date) {
      where += ' AND plan_time >= ?';
      params.push(start_date);
    }
    if (end_date) {
      where += ' AND plan_time <= ?';
      params.push(end_date);
    }
    if (status && status !== 'all') {
      where += ' AND status = ?';
      params.push(parseInt(status));
    }
    
    const offset = (page - 1) * pageSize;
    
    const sql = `
      SELECT * FROM material_check_records
      ${where}
      ORDER BY dispatch_time DESC
      LIMIT ? OFFSET ?
    `;
    
    const countSql = `SELECT COUNT(*) as total FROM material_check_records ${where}`;
    
    const [data, count] = await Promise.all([
      db.query(sql, [...params, parseInt(pageSize), parseInt(offset)]),
      db.query(countSql, params)
    ]);
    
    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: count[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('查询失败:', error);
    res.status(500).json({ success: false, message: '查询失败' });
  }
});

// API: 获取单条记录
app.get('/api/record/:declare_id', async (req, res) => {
  try {
    const { declare_id } = req.params;
    const sql = 'SELECT * FROM material_check_records WHERE declare_id = ?';
    const result = await db.query(sql, [declare_id]);
    
    if (result.length === 0) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    
    res.json({ success: true, data: result[0] });
  } catch (error) {
    console.error('查询失败:', error);
    res.status(500).json({ success: false, message: '查询失败' });
  }
});

// API: 获取关区代码
app.get('/api/customs-codes', async (req, res) => {
  try {
    const sql = 'SELECT DISTINCT customs_code FROM material_check_records WHERE customs_code IS NOT NULL';
    const result = await db.query(sql);
    res.json({ 
      success: true, 
      data: result.map(item => item.customs_code) 
    });
  } catch (error) {
    res.json({ success: true, data: ['海关'] });
  }
});

// 页面路由
app.get('/dispatch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dispatch.html'));
});

app.get('/result', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/result.html'));
});

app.get('/query', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/query.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// 启动服务
async function startServer() {
  try {
    await db.connect();
    
    app.listen(PORT, () => {
      console.log(`
🚀 物料检查派单系统启动成功！
📡 访问地址: http://localhost:${PORT}
🎯 功能页面:
   派单页面:   http://localhost:${PORT}/dispatch
   录入结果:   http://localhost:${PORT}/result
   查询页面:   http://localhost:${PORT}/query
      `);
    });
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

startServer();
