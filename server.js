// server.js - 税收征管关键节点监控
// 说明：
// 1) 该文件作为后端入口，负责启动 Express、连接数据库并托管前端构建产物。
// 2) 目前仅保留健康检查接口与静态资源托管，占位后续 API 路由。
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');
const ledgerRouter = require('./ledger.controller');

// 基础应用与端口配置
const app = express();
const PORT = process.env.PORT || 3002;

// 中间件：JSON 解析、表单解析、跨域（后续插件/前端调用需要）
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API 路由：统一挂载台账相关接口
app.use('/api', ledgerRouter);

// 健康检查接口：用于快速确认服务是否存活
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'tax_ledger_monitor' });
});

// 前端静态资源托管：
// - 仅当 web/dist 存在时启用（避免开发期未构建时报错）
// - 使用单页应用兜底路由返回 index.html
const distPath = path.join(__dirname, 'web', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 启动服务：先连接数据库，再监听端口
async function startServer() {
  try {
    await db.connect();
    app.listen(PORT, () => {
      console.log(`税收征管关键节点监控启动成功: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

startServer();
