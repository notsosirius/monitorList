<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  fetchLedgerList,
  fetchLedgerById,
  updateLedgerById,
  exportLedgerFile
} from '../api/ledger';

// 列表数据与分页状态
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(100);
// UI 状态：加载/错误提示
const loading = ref(false);
const errorMessage = ref('');
// 筛选条件：报关单号 + 改单日期区间
const declNo = ref('');
const amendDateFrom = ref('');
const amendDateTo = ref('');
// 处理弹窗状态
const editVisible = ref(false);
const editLoading = ref(false);
const editError = ref('');
const editId = ref(null);
const viewMode = ref(false);
const editForm = ref({
  finalInvoiceDate: '',
  latestSettleDate: '',
  docReceiptDate: '',
  infoExchange: '',
  inquiryStartDate: '',
  challengeDate: '',
  negotiationDate: '',
  valuationWorkDate: '',
  amendDate: '',
  continuTaxDuty: '',
  continuTaxVat: '',
  additionalTaxDuty: '',
  additionalTaxVat: '',
  remark: ''
});

// 导出状态：防止重复点击
const exporting = ref(false);
// 全局提示：用于保存/导出结果提示
const toast = ref({ visible: false, message: '', type: 'success' });
let toastTimer = null;

function showToast(message, type = 'success') {
  toast.value = { visible: true, message, type };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value.visible = false;
  }, 2500);
}

// 计算总页数，避免分页为 0
const totalPages = computed(() => {
  const pages = Math.ceil(total.value / pageSize.value);
  return pages > 0 ? pages : 1;
});

// 页码输入（文本 -> 数字）
const pageInput = ref('1');

// 加载列表数据
async function loadList() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const data = await fetchLedgerList({
      page: page.value,
      pageSize: pageSize.value,
      declNo: declNo.value || undefined,
      amendDateFrom: amendDateFrom.value || undefined,
      amendDateTo: amendDateTo.value || undefined
    });
    items.value = data.items || [];
    total.value = data.total || 0;
    pageInput.value = String(page.value);
  } catch (error) {
    errorMessage.value = error.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

// 翻页：上一页
function previousPage() {
  if (page.value <= 1) return;
  page.value -= 1;
  loadList();
}

// 翻页：下一页
function nextPage() {
  if (page.value >= totalPages.value) return;
  page.value += 1;
  loadList();
}

// 页码跳转
function jumpToPage() {
  const raw = parseInt(pageInput.value, 10);
  if (!raw || raw < 1) {
    pageInput.value = String(page.value);
    return;
  }
  const target = raw > totalPages.value ? totalPages.value : raw;
  if (target === page.value) return;
  page.value = target;
  loadList();
}

// 查看详情
function viewRecord(id) {
  openView(id);
}

// 将日期转为输入框需要的 YYYY-MM-DD
function toDateInput(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    if (value.includes('T')) return value.split('T')[0];
    return value;
  }
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
}

// 打开处理弹窗并加载详情
async function openEdit(id) {
  editVisible.value = true;
  editLoading.value = true;
  editError.value = '';
  editId.value = id;
  viewMode.value = false;
  try {
    const record = await fetchLedgerById(id);
    editForm.value = {
      finalInvoiceDate: toDateInput(record.final_invoice_date),
      latestSettleDate: toDateInput(record.latest_settle_date),
      docReceiptDate: toDateInput(record.doc_receipt_date),
      infoExchange: record.info_exchange || '',
      inquiryStartDate: toDateInput(record.inquiry_start_date),
      challengeDate: toDateInput(record.challenge_date),
      negotiationDate: toDateInput(record.negotiation_date),
      valuationWorkDate: toDateInput(record.valuation_work_date),
      amendDate: toDateInput(record.amend_date),
      continuTaxDuty: record.continu_tax_duty ?? '',
      continuTaxVat: record.continu_tax_vat ?? '',
      additionalTaxDuty: record.additional_tax_duty ?? '',
      additionalTaxVat: record.additional_tax_vat ?? '',
      remark: record.remark || ''
    };
  } catch (error) {
    editError.value = error.message || '加载失败';
  } finally {
    editLoading.value = false;
  }
}

// 打开查看弹窗（只读）
async function openView(id) {
  editVisible.value = true;
  editLoading.value = true;
  editError.value = '';
  editId.value = id;
  viewMode.value = true;
  try {
    const record = await fetchLedgerById(id);
    editForm.value = {
      finalInvoiceDate: toDateInput(record.final_invoice_date),
      latestSettleDate: toDateInput(record.latest_settle_date),
      docReceiptDate: toDateInput(record.doc_receipt_date),
      infoExchange: record.info_exchange || '',
      inquiryStartDate: toDateInput(record.inquiry_start_date),
      challengeDate: toDateInput(record.challenge_date),
      negotiationDate: toDateInput(record.negotiation_date),
      valuationWorkDate: toDateInput(record.valuation_work_date),
      amendDate: toDateInput(record.amend_date),
      continuTaxDuty: record.continu_tax_duty ?? '',
      continuTaxVat: record.continu_tax_vat ?? '',
      additionalTaxDuty: record.additional_tax_duty ?? '',
      additionalTaxVat: record.additional_tax_vat ?? '',
      remark: record.remark || ''
    };
  } catch (error) {
    editError.value = error.message || '加载失败';
  } finally {
    editLoading.value = false;
  }
}

// 关闭处理弹窗
function closeEdit() {
  editVisible.value = false;
  editError.value = '';
  editId.value = null;
  viewMode.value = false;
}

// 提交处理页更新
async function submitEdit() {
  if (viewMode.value) return;
  if (!editId.value) return;
  editLoading.value = true;
  editError.value = '';
  try {
    await updateLedgerById(editId.value, { ...editForm.value });
    editVisible.value = false;
    await loadList();
    showToast('保存成功', 'success');
  } catch (error) {
    editError.value = error.message || '保存失败';
    showToast(editError.value, 'error');
  } finally {
    editLoading.value = false;
  }
}

// 导出当前筛选条件下的 Excel
async function handleExport() {
  errorMessage.value = '';
  try {
    if (exporting.value) return;
    // 改单日期筛选需成对出现
    if ((amendDateFrom.value && !amendDateTo.value) || (!amendDateFrom.value && amendDateTo.value)) {
      showToast('请同时填写改单日期起止时间', 'error');
      return;
    }
    if (amendDateFrom.value && amendDateTo.value && amendDateFrom.value > amendDateTo.value) {
      showToast('改单日期起止时间不合法', 'error');
      return;
    }

    exporting.value = true;
    const { blob, filename } = await exportLedgerFile({
      declNo: declNo.value || undefined,
      amendDateFrom: amendDateFrom.value || undefined,
      amendDateTo: amendDateTo.value || undefined
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    showToast('导出完成', 'success');
  } catch (error) {
    showToast(error.message || '导出失败', 'error');
  } finally {
    exporting.value = false;
  }
}

// 查询：重置到第一页后加载
function handleSearch() {
  page.value = 1;
  loadList();
}

// 重置筛选条件
function handleReset() {
  declNo.value = '';
  amendDateFrom.value = '';
  amendDateTo.value = '';
  page.value = 1;
  loadList();
}

// 格式化日期为 YYYY-MM-DD，避免时区显示偏移
function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string' && value.includes('T')) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return '';
}

// 空值兜底显示
function displayValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  const dateText = formatDate(value);
  if (dateText) return dateText;
  return value;
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">审价台账</p>
        <h1>税收征管关键节点监控</h1>
      </div>
      <div class="page-actions">
        <button class="btn ghost" type="button" @click="loadList">刷新</button>
      </div>
    </header>

    <div class="card">
      <div class="filters">
        <div class="filter-item">
          <label>报关单号</label>
          <input v-model.trim="declNo" type="text" placeholder="精确匹配" />
        </div>
        <div class="filter-item">
          <label>改单日期起</label>
          <input v-model="amendDateFrom" type="date" />
        </div>
        <div class="filter-item">
          <label>改单日期止</label>
          <input v-model="amendDateTo" type="date" />
        </div>
        <div class="filter-actions">
          <button class="btn" type="button" @click="handleSearch">查询</button>
          <button class="btn ghost" type="button" @click="handleReset">重置</button>
          <button class="btn ghost" type="button" :disabled="exporting" @click="handleExport">
            {{ exporting ? '导出中...' : '导出 Excel' }}
          </button>
        </div>
      </div>

      <div class="card-header">
        <div class="meta">
          <span>当前页：{{ page }}</span>
          <span>总条数：{{ total }}</span>
          <span>每页：{{ pageSize }}</span>
        </div>
        <div class="pagination">
          <button class="btn ghost" type="button" :disabled="page <= 1" @click="previousPage">
            上一页
          </button>
          <span class="page-indicator">/ {{ totalPages }}</span>
          <label class="page-jump">
            <span>跳转</span>
            <input v-model="pageInput" type="number" min="1" :max="totalPages" />
          </label>
          <button class="btn ghost" type="button" @click="jumpToPage">确定</button>
          <button class="btn ghost" type="button" :disabled="page >= totalPages" @click="nextPage">
            下一页
          </button>
        </div>
      </div>

      <div v-if="loading" class="state">加载中...</div>
      <div v-else-if="errorMessage" class="state error">{{ errorMessage }}</div>
      <div v-else-if="items.length === 0" class="state">暂无数据</div>

      <div v-else class="table-wrap">
        <table class="ledger-table">
          <thead>
            <tr>
              <th>紧急</th>
              <th>报关单号</th>
              <th>商品名称</th>
              <th>申报日期</th>
              <th>最晚发票日期</th>
              <th>最晚结算资料日期</th>
              <th>资料签收日期</th>
              <th>是否超30天（签收-发票）</th>
              <th>资料交互情况</th>
              <th>询价发起日期</th>
              <th>质疑日期</th>
              <th>磋商日期</th>
              <th>审价作业表日期</th>
              <th>改单日期（已审价）</th>
              <th>是否超30天（改单-发票）</th>
              <th>是否超270天（改单-申报）</th>
              <th>延续性征税（关税）</th>
              <th>延续性征税（增值税）</th>
              <th>审价补税（关税）</th>
              <th>审价补税（增值税）</th>
              <th>备注</th>
              <th>税费岗状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id">
              <td>
                <span class="dot" :class="`dot-${row.urgency || 'yellow'}`"></span>
              </td>
              <td>
                <button class="link" type="button" @click="viewRecord(row.id)">
                  {{ displayValue(row.decl_no) }}
                </button>
              </td>
              <td>{{ displayValue(row.goods_name) }}</td>
              <td>{{ displayValue(row.declare_date) }}</td>
              <td>{{ displayValue(row.final_invoice_date) }}</td>
              <td>{{ displayValue(row.latest_settle_date) }}</td>
              <td>{{ displayValue(row.doc_receipt_date) }}</td>
              <td>{{ displayValue(row.days_receipt_invoice) }}</td>
              <td>{{ displayValue(row.info_exchange) }}</td>
              <td>{{ displayValue(row.inquiry_start_date) }}</td>
              <td>{{ displayValue(row.challenge_date) }}</td>
              <td>{{ displayValue(row.negotiation_date) }}</td>
              <td>{{ displayValue(row.valuation_work_date) }}</td>
              <td>{{ displayValue(row.amend_date) }}</td>
              <td>{{ displayValue(row.days_amend_invoice) }}</td>
              <td>{{ displayValue(row.days_amend_declare) }}</td>
              <td>{{ displayValue(row.continu_tax_duty) }}</td>
              <td>{{ displayValue(row.continu_tax_vat) }}</td>
              <td>{{ displayValue(row.additional_tax_duty) }}</td>
              <td>{{ displayValue(row.additional_tax_vat) }}</td>
              <td>{{ displayValue(row.remark) }}</td>
              <td>{{ displayValue(row.tax_status) }}</td>
              <td>
                <button class="btn small" type="button" @click="viewRecord(row.id)">查看</button>
                <button class="btn small ghost" type="button" @click="openEdit(row.id)">处理</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="editVisible" class="modal-mask" role="dialog" aria-modal="true">
      <div class="modal-card">
        <header class="modal-header">
          <div>
            <p class="eyebrow">{{ viewMode ? '查看' : '处理' }}</p>
            <h2>税收征管关键节点监控</h2>
          </div>
          <button class="btn ghost" type="button" @click="closeEdit">关闭</button>
        </header>

        <div v-if="editLoading" class="state">加载中...</div>
        <div v-else-if="editError" class="state error">{{ editError }}</div>
        <form v-else class="modal-body" @submit.prevent="submitEdit">
          <div class="form-grid">
            <label>
              最晚发票日期
              <input v-model="editForm.finalInvoiceDate" type="date" :disabled="viewMode" />
            </label>
            <label>
              最晚结算资料日期
              <input v-model="editForm.latestSettleDate" type="date" :disabled="viewMode" />
            </label>
            <label>
              资料签收日期
              <input v-model="editForm.docReceiptDate" type="date" :disabled="viewMode" />
            </label>
            <label>
              资料交互情况
              <input v-model="editForm.infoExchange" type="text" :disabled="viewMode" />
            </label>
            <label>
              询价发起日期
              <input v-model="editForm.inquiryStartDate" type="date" :disabled="viewMode" />
            </label>
            <label>
              质疑日期
              <input v-model="editForm.challengeDate" type="date" :disabled="viewMode" />
            </label>
            <label>
              磋商日期
              <input v-model="editForm.negotiationDate" type="date" :disabled="viewMode" />
            </label>
            <label>
              审价作业表日期
              <input v-model="editForm.valuationWorkDate" type="date" :disabled="viewMode" />
            </label>
            <label>
              改单日期（已审价）
              <input v-model="editForm.amendDate" type="date" :disabled="viewMode" />
            </label>
            <label>
              延续性征税（关税）
              <input v-model="editForm.continuTaxDuty" type="number" step="0.01" :disabled="viewMode" />
            </label>
            <label>
              延续性征税（增值税）
              <input v-model="editForm.continuTaxVat" type="number" step="0.01" :disabled="viewMode" />
            </label>
            <label>
              审价补税（关税）
              <input v-model="editForm.additionalTaxDuty" type="number" step="0.01" :disabled="viewMode" />
            </label>
            <label>
              审价补税（增值税）
              <input v-model="editForm.additionalTaxVat" type="number" step="0.01" :disabled="viewMode" />
            </label>
            <label class="full">
              备注
              <textarea v-model="editForm.remark" rows="3" :disabled="viewMode"></textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button v-if="!viewMode" class="btn" type="submit">保存</button>
            <button class="btn ghost" type="button" @click="closeEdit">
              {{ viewMode ? '关闭' : '取消' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="toast.visible" class="toast" :class="`toast-${toast.type}`">
      {{ toast.message }}
    </div>
  </section>
</template>
