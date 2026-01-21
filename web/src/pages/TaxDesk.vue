<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  fetchTaxDeskList,
  updateTaxStatus,
  updateTaxStartDate,
  createTaxDeskEntry,
  importLedgerFile,
  importHolidayFile
} from '../api/ledger';

const emit = defineEmits(['back']);

// 税费岗列表数据与状态
const items = ref([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const declNo = ref('');
const startDateEmpty = ref(false);

// 本页面只展示前 100 条（税费岗入口）
const page = ref(1);
const pageSize = ref(100);

// 处置操作状态
const actionLoadingId = ref(null);
const actionError = ref('');
// 全局提示：用于处置结果提示
const toast = ref({ visible: false, message: '', type: 'success' });
let toastTimer = null;

// 起算日期录入弹窗状态
const taxDateVisible = ref(false);
const taxDateLoading = ref(false);
const taxDateError = ref('');
const taxDateId = ref(null);
const taxDateValue = ref('');
const taxRemarkValue = ref('');
const bondBalanceValue = ref('');
const extraBondValue = ref('');
const receiptReceivedValue = ref('');
const brokerNameValue = ref('');
const noticeSentValue = ref('');

// 税费岗单条录入弹窗状态
const entryVisible = ref(false);
const entryForm = ref({
  declNo: '',
  goodsName: '',
  declareDate: '',
  amendDate: '',
  taxStartDate: '',
  taxRemark: '',
  bondBalance: '',
  extraBond: '',
  receiptReceived: '',
  brokerName: '',
  noticeSent: ''
});
const entryLoading = ref(false);
const entryError = ref('');

// 导入状态
const importing = ref(false);
const importInput = ref(null);
const holidayImporting = ref(false);
const holidayImportInput = ref(null);

// 处置确认弹窗状态
const confirmVisible = ref(false);
const confirmRow = ref(null);
const confirmLoading = ref(false);

function showToast(message, type = 'success') {
  toast.value = { visible: true, message, type };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value.visible = false;
  }, 2500);
}

// 后端已按“未处置优先 + 改单日期降序”排序
const sortedItems = computed(() => items.value);

// 税费岗紧急状态：已处置 -> 绿色；按起算日期工作日差分级
function getTaxDeskUrgency(row) {
  if (!row) return 'yellow';
  if (row.tax_status === '已处置') return 'green';
  if (!row.tax_start_date) return 'yellow';
  const businessDays =
    row.workday_since_start ?? calcBusinessDaysDiff(row.tax_start_date, new Date());
  if (businessDays <= 1) return 'yellow';
  if (businessDays <= 3) return 'orange';
  return 'red';
}

// 计算总页数，避免分页为 0
const totalPages = computed(() => {
  const pages = Math.ceil(total.value / pageSize.value);
  return pages > 0 ? pages : 1;
});

// 页码输入（文本 -> 数字）
const pageInput = ref('1');

// 加载税费岗列表
async function loadList() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const data = await fetchTaxDeskList({
      page: page.value,
      pageSize: pageSize.value,
      declNo: declNo.value || undefined,
      startDateEmpty: startDateEmpty.value
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

function handleSearch() {
  page.value = 1;
  loadList();
}

function handleReset() {
  declNo.value = '';
  startDateEmpty.value = false;
  page.value = 1;
  loadList();
}

// 处置：仅在未处置时可用
function openConfirm(row) {
  if (!row || row.tax_status === '已处置') return;
  confirmRow.value = row;
  confirmVisible.value = true;
}

function closeConfirm() {
  confirmVisible.value = false;
  confirmRow.value = null;
}

async function confirmProcess() {
  if (!confirmRow.value) return;
  confirmLoading.value = true;
  actionError.value = '';
  actionLoadingId.value = confirmRow.value.id;
  try {
    await updateTaxStatus(confirmRow.value.id, '已处置');
    await loadList();
    showToast('处置成功', 'success');
    closeConfirm();
  } catch (error) {
    actionError.value = error.message || '处置失败';
    showToast(actionError.value, 'error');
  } finally {
    confirmLoading.value = false;
    actionLoadingId.value = null;
  }
}

// 空值兜底显示
function displayValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  const dateText = formatDate(value);
  if (dateText) return dateText;
  return value;
}

function displayWorkdayCount(count) {
  if (count === null || count === undefined) return '-';
  return String(count);
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

// 计算两个日期之间的工作日差（不含起始日，含结束日）
function calcBusinessDaysDiff(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (startOnly >= endOnly) return 0;

  let count = 0;
  const cursor = new Date(startOnly);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= endOnly) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function openTaxDate(row) {
  if (!row) return;
  taxDateVisible.value = true;
  taxDateError.value = '';
  taxDateId.value = row.id;
  taxDateValue.value = toDateInput(row.tax_start_date);
  taxRemarkValue.value = row.tax_remark || '';
  bondBalanceValue.value = row.bond_balance ?? '';
  extraBondValue.value = row.extra_bond ?? '';
  receiptReceivedValue.value = row.receipt_received || '';
  brokerNameValue.value = row.broker_name || '';
  noticeSentValue.value = row.notice_sent || '';
}

function closeTaxDate() {
  taxDateVisible.value = false;
  taxDateError.value = '';
  taxDateId.value = null;
  taxDateValue.value = '';
  taxRemarkValue.value = '';
  bondBalanceValue.value = '';
  extraBondValue.value = '';
  receiptReceivedValue.value = '';
  brokerNameValue.value = '';
  noticeSentValue.value = '';
}

async function submitTaxDate() {
  if (!taxDateId.value) return;
  taxDateLoading.value = true;
  taxDateError.value = '';
  try {
    await updateTaxStartDate(
      taxDateId.value,
      taxDateValue.value || null,
      taxRemarkValue.value || null,
      bondBalanceValue.value === '' ? null : bondBalanceValue.value,
      extraBondValue.value === '' ? null : extraBondValue.value,
      receiptReceivedValue.value || null,
      brokerNameValue.value || null,
      noticeSentValue.value || null
    );
    await loadList();
    showToast('起算日期已更新', 'success');
    closeTaxDate();
  } catch (error) {
    taxDateError.value = error.message || '更新失败';
    showToast(taxDateError.value, 'error');
  } finally {
    taxDateLoading.value = false;
  }
}

function openEntry() {
  entryVisible.value = true;
  entryError.value = '';
}

function closeEntry() {
  entryVisible.value = false;
  entryError.value = '';
}

async function submitEntry() {
  entryError.value = '';
  entryLoading.value = true;
  try {
    await createTaxDeskEntry({
      declNo: entryForm.value.declNo,
      goodsName: entryForm.value.goodsName || undefined,
      declareDate: entryForm.value.declareDate,
      amendDate: entryForm.value.amendDate,
      taxStartDate: entryForm.value.taxStartDate || undefined,
      taxRemark: entryForm.value.taxRemark || undefined,
      bondBalance: entryForm.value.bondBalance === '' ? undefined : entryForm.value.bondBalance,
      extraBond: entryForm.value.extraBond === '' ? undefined : entryForm.value.extraBond,
      receiptReceived: entryForm.value.receiptReceived || undefined,
      brokerName: entryForm.value.brokerName || undefined,
      noticeSent: entryForm.value.noticeSent || undefined
    });
    entryForm.value = {
      declNo: '',
      goodsName: '',
      declareDate: '',
      amendDate: '',
      taxStartDate: '',
      taxRemark: '',
      bondBalance: '',
      extraBond: '',
      receiptReceived: '',
      brokerName: '',
      noticeSent: ''
    };
    await loadList();
    showToast('录入成功', 'success');
    closeEntry();
  } catch (error) {
    entryError.value = error.message || '录入失败';
    showToast(entryError.value, 'error');
  } finally {
    entryLoading.value = false;
  }
}

async function handleImportChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    showToast('仅支持 .xlsx 文件', 'error');
    event.target.value = '';
    return;
  }

  try {
    importing.value = true;
    const result = await importLedgerFile(file);
    showToast(`导入完成：新增 ${result.inserted}，跳过 ${result.skipped}`, 'success');
    await loadList();
  } catch (error) {
    showToast(error.message || '导入失败', 'error');
  } finally {
    importing.value = false;
    event.target.value = '';
  }
}

function triggerImport() {
  importInput.value?.click();
}

async function handleHolidayImportChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    showToast('仅支持 .xlsx 文件', 'error');
    event.target.value = '';
    return;
  }

  try {
    holidayImporting.value = true;
    const result = await importHolidayFile(file);
    showToast(`节假日导入完成：${result.inserted}`, 'success');
  } catch (error) {
    showToast(error.message || '导入失败', 'error');
  } finally {
    holidayImporting.value = false;
    event.target.value = '';
  }
}

function triggerHolidayImport() {
  holidayImportInput.value?.click();
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">税费岗</p>
        <h1>税收征管关键节点监控</h1>
      </div>
      <div class="page-actions">
        <button class="btn ghost" type="button" @click="emit('back')">返回列表</button>
        <button class="btn ghost" type="button" @click="loadList">刷新</button>
      </div>
    </header>

    <div class="card">
      <div class="filters">
        <div class="filter-item">
          <label>报关单号</label>
          <input
            v-model.trim="declNo"
            type="text"
            inputmode="numeric"
            pattern="[0-9]{18}"
            maxlength="18"
            placeholder="精确匹配"
            @keydown.enter.prevent="handleSearch"
          />
        </div>
        <div class="filter-item">
          <label>起算日期</label>
          <label class="inline-check">
            <input v-model="startDateEmpty" type="checkbox" />
            <span>仅看为空</span>
          </label>
        </div>
        <div class="filter-actions">
          <button class="btn" type="button" @click="handleSearch">查询</button>
          <button class="btn ghost" type="button" @click="handleReset">重置</button>
          <div class="filter-actions-right">
            <input
              ref="holidayImportInput"
              class="visually-hidden"
              type="file"
              accept=".xlsx"
              @change="handleHolidayImportChange"
            />
            <button
              class="btn ghost"
              type="button"
              :disabled="holidayImporting"
              @click="triggerHolidayImport"
            >
              {{ holidayImporting ? '导入中...' : '节假日导入' }}
            </button>
            <input
              ref="importInput"
              class="visually-hidden"
              type="file"
              accept=".xlsx"
              @change="handleImportChange"
            />
            <button class="btn ghost" type="button" :disabled="importing" @click="triggerImport">
              {{ importing ? '导入中...' : 'Excel 导入' }}
            </button>
            <button class="btn" type="button" @click="openEntry">录入</button>
          </div>
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
      <div v-else-if="sortedItems.length === 0" class="state">暂无数据</div>

      <div v-else class="table-wrap">
        <table class="ledger-table">
          <thead>
            <tr>
              <th class="sticky">紧急</th>
              <th class="sticky">报关单号</th>
              <th>商品名称</th>
              <th>改单日期</th>
              <th>补保证金</th>
              <th>保证金余额</th>
              <th>是否收到收据</th>
              <th>报关行</th>
              <th>是否发送通知书</th>
              <th>起算日期</th>
              <th>是否超5个工作日</th>
              <th class="col-text single-line">税费岗备注</th>
              <th>税费岗状态</th>
              <th>处置</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sortedItems" :key="row.id">
              <td class="sticky">
                <span class="dot" :class="`dot-${getTaxDeskUrgency(row)}`"></span>
              </td>
              <td class="sticky">{{ displayValue(row.decl_no) }}</td>
              <td>{{ displayValue(row.goods_name) }}</td>
              <td>{{ displayValue(row.amend_date) }}</td>
              <td>{{ displayValue(row.extra_bond) }}</td>
              <td>{{ displayValue(row.bond_balance) }}</td>
              <td>{{ displayValue(row.receipt_received) }}</td>
              <td>{{ displayValue(row.broker_name) }}</td>
              <td>{{ displayValue(row.notice_sent) }}</td>
              <td>{{ displayValue(row.tax_start_date) }}</td>
              <td>{{ displayWorkdayCount(row.workday_since_start) }}</td>
              <td class="col-text single-line">{{ displayValue(row.tax_remark) }}</td>
              <td>{{ displayValue(row.tax_status) }}</td>
              <td>
                <button
                  class="btn small ghost"
                  type="button"
                  :disabled="row.tax_status === '已处置'"
                  @click="openTaxDate(row)"
                >
                  {{ row.tax_start_date ? '修改' : '录入' }}
                </button>
                <button
                  class="btn small"
                  type="button"
                  :disabled="row.tax_status === '已处置' || actionLoadingId === row.id"
                  @click="openConfirm(row)"
                >
                  {{ row.tax_status === '已处置' ? '已处置' : '处置' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="actionError" class="state error">{{ actionError }}</div>
    </div>

    <div v-if="toast.visible" class="toast" :class="`toast-${toast.type}`">
      {{ toast.message }}
    </div>

    <div v-if="entryVisible" class="modal-mask" role="dialog" aria-modal="true">
      <div class="modal-card">
        <header class="modal-header">
          <div>
            <p class="eyebrow">税费岗录入</p>
            <h2>税收征管关键节点监控</h2>
          </div>
        </header>
        <form class="modal-body" @submit.prevent="submitEntry">
          <div class="form-grid">
            <label>
              报关单号
              <input
                v-model.trim="entryForm.declNo"
                type="text"
                inputmode="numeric"
                pattern="[0-9]{18}"
                maxlength="18"
                placeholder="18 位数字"
              />
            </label>
            <label>
              商品名称
              <input v-model.trim="entryForm.goodsName" type="text" placeholder="可选" />
            </label>
            <label>
              申报日期
              <input v-model="entryForm.declareDate" type="date" lang="en-CA" />
            </label>
            <label>
              改单日期
              <input v-model="entryForm.amendDate" type="date" lang="en-CA" />
            </label>
            <label>
              起算日期
              <input v-model="entryForm.taxStartDate" type="date" lang="en-CA" class="align-left" />
            </label>
            <label>
              补保证金
              <input v-model="entryForm.extraBond" type="number" step="0.01" placeholder="可选" class="num-input" />
            </label>
            <label>
              保证金余额
              <input v-model="entryForm.bondBalance" type="number" step="0.01" placeholder="可选" class="num-input" />
            </label>
            <label>
              是否收到收据
              <select v-model="entryForm.receiptReceived" class="select-input">
                <option value="">可选</option>
                <option value="是">是</option>
                <option value="否">否</option>
              </select>
            </label>
            <label>
              报关行
              <input v-model.trim="entryForm.brokerName" type="text" placeholder="可选" />
            </label>
            <label>
              是否发送通知书
              <select v-model="entryForm.noticeSent" class="select-input">
                <option value="">可选</option>
                <option value="是">是</option>
                <option value="否">否</option>
              </select>
            </label>
            <label class="full">
              税费岗备注
              <textarea v-model="entryForm.taxRemark" rows="3" placeholder="可选"></textarea>
            </label>
          </div>
          <div v-if="entryError" class="state error">{{ entryError }}</div>
          <div class="modal-actions">
            <button class="btn" type="submit" :disabled="entryLoading">
              {{ entryLoading ? '录入中...' : '录入' }}
            </button>
            <button class="btn ghost" type="button" @click="closeEntry">取消</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="taxDateVisible" class="modal-mask" role="dialog" aria-modal="true">
      <div class="modal-card compact">
        <header class="modal-header">
          <div>
            <h2>税收征管关键节点监控</h2>
          </div>
        </header>

        <form class="modal-body" @submit.prevent="submitTaxDate">
          <div class="form-grid">
            <label>
              起算日期
              <input v-model="taxDateValue" type="date" lang="en-CA" class="align-left" />
            </label>
            <label>
              补保证金
              <input v-model="extraBondValue" type="number" step="0.01" placeholder="可选" class="num-input" />
            </label>
            <label>
              保证金余额
              <input v-model="bondBalanceValue" type="number" step="0.01" placeholder="可选" class="num-input" />
            </label>
            <label>
              是否收到收据
              <select v-model="receiptReceivedValue" class="select-input">
                <option value="">可选</option>
                <option value="是">是</option>
                <option value="否">否</option>
              </select>
            </label>
            <label>
              报关行
              <input v-model.trim="brokerNameValue" type="text" placeholder="可选" />
            </label>
            <label>
              是否发送通知书
              <select v-model="noticeSentValue" class="select-input">
                <option value="">可选</option>
                <option value="是">是</option>
                <option value="否">否</option>
              </select>
            </label>
            <label class="full">
              税费岗备注
              <textarea v-model="taxRemarkValue" rows="3"></textarea>
            </label>
          </div>
          <div v-if="taxDateError" class="state error">{{ taxDateError }}</div>
          <div class="modal-actions">
            <button class="btn" type="submit" :disabled="taxDateLoading">
              {{ taxDateLoading ? '保存中...' : '保存' }}
            </button>
            <button class="btn ghost" type="button" @click="closeTaxDate">取消</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="confirmVisible" class="modal-mask" role="dialog" aria-modal="true">
      <div class="modal-card compact">
        <header class="modal-header">
          <div>
            <p class="eyebrow">处置确认</p>
            <h2>税收征管关键节点监控</h2>
          </div>
        </header>
        <div class="modal-body">
          <p>
            确认将报关单号
            <strong>{{ confirmRow?.decl_no || '-' }}</strong>
            标记为已处置吗？
          </p>
          <div class="modal-actions">
            <button class="btn" type="button" :disabled="confirmLoading" @click="confirmProcess">
              {{ confirmLoading ? '处理中...' : '确认处置' }}
            </button>
            <button class="btn ghost" type="button" @click="closeConfirm">取消</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

