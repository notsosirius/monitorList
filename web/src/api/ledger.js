// API 调用封装：台账相关接口
const BASE_URL = '/api';

// 统一处理 JSON 响应，失败时抛出错误供页面展示
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(message || '请求失败');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// 查询台账列表（支持分页与筛选）
export function fetchLedgerList(params = {}) {
  const query = new URLSearchParams();
  // 分页参数：默认 100 条一页，由后端兜底
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  // 精确报关单号查询
  if (params.declNo) query.set('declNo', params.declNo);
  // 改单日期区间筛选（闭区间）
  if (params.amendDateFrom) query.set('amendDateFrom', params.amendDateFrom);
  if (params.amendDateTo) query.set('amendDateTo', params.amendDateTo);

  // 拼接最终 URL
  const url = `${BASE_URL}/ledger?${query.toString()}`;
  return requestJson(url);
}

// 查询单条台账详情
export function fetchLedgerById(id) {
  const url = `${BASE_URL}/ledger/${id}`;
  return requestJson(url);
}

// 更新处理页字段（4-20）
export function updateLedgerById(id, payload) {
  const url = `${BASE_URL}/ledger/${id}`;
  return requestJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// 税费岗处置状态更新
export function updateTaxStatus(id, taxStatus) {
  const url = `${BASE_URL}/ledger/${id}/tax-status`;
  return requestJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taxStatus })
  });
}

// 税费岗列表（含分页）
export function fetchTaxDeskList(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const url = `${BASE_URL}/ledger/tax-desk?${query.toString()}`;
  return requestJson(url);
}

// 导出 Excel（返回文件流）
export async function exportLedgerFile(params = {}) {
  const query = new URLSearchParams();
  if (params.declNo) query.set('declNo', params.declNo);
  if (params.amendDateFrom) query.set('amendDateFrom', params.amendDateFrom);
  if (params.amendDateTo) query.set('amendDateTo', params.amendDateTo);

  const url = `${BASE_URL}/ledger/export?${query.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(message || '导出失败');
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? decodeURIComponent(match[1]) : 'tax_ledger.xlsx';

  return { blob, filename };
}
