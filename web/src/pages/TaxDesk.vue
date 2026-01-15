<script setup>
import { ref, computed, onMounted } from 'vue';
import { fetchTaxDeskList, updateTaxStatus } from '../api/ledger';

const emit = defineEmits(['back']);

// 税费岗列表数据与状态
const items = ref([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');

// 本页面只展示前 100 条（税费岗入口）
const page = ref(1);
const pageSize = ref(100);

// 处置操作状态
const actionLoadingId = ref(null);
const actionError = ref('');
// 全局提示：用于处置结果提示
const toast = ref({ visible: false, message: '', type: 'success' });
let toastTimer = null;

function showToast(message, type = 'success') {
  toast.value = { visible: true, message, type };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value.visible = false;
  }, 2500);
}

// 后端已按“未处置优先 + 改单日期降序”排序
const sortedItems = computed(() => items.value);

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
      pageSize: pageSize.value
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

// 处置：仅在未处置时可用
async function handleProcess(row) {
  if (!row || row.tax_status === '已处置') return;
  actionLoadingId.value = row.id;
  actionError.value = '';
  try {
    await updateTaxStatus(row.id, '已处置');
    await loadList();
    showToast('处置成功', 'success');
  } catch (error) {
    actionError.value = error.message || '处置失败';
    showToast(actionError.value, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

// 空值兜底显示
function displayValue(value) {
  if (value === null || value === undefined || value === '') return '-';
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
        <p class="eyebrow">税费岗</p>
        <h1>税收征管关键节点监控</h1>
      </div>
      <div class="page-actions">
        <button class="btn ghost" type="button" @click="emit('back')">返回列表</button>
        <button class="btn ghost" type="button" @click="loadList">刷新</button>
      </div>
    </header>

    <div class="card">
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
              <th>报关单号</th>
              <th>商品名称</th>
              <th>改单日期（已审价）</th>
              <th>延续性征税（关税）</th>
              <th>延续性征税（增值税）</th>
              <th>审价补税（关税）</th>
              <th>审价补税（增值税）</th>
              <th>税费岗状态</th>
              <th>处置</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sortedItems" :key="row.id">
              <td>{{ displayValue(row.decl_no) }}</td>
              <td>{{ displayValue(row.goods_name) }}</td>
              <td>{{ displayValue(row.amend_date) }}</td>
              <td>{{ displayValue(row.continu_tax_duty) }}</td>
              <td>{{ displayValue(row.continu_tax_vat) }}</td>
              <td>{{ displayValue(row.additional_tax_duty) }}</td>
              <td>{{ displayValue(row.additional_tax_vat) }}</td>
              <td>{{ displayValue(row.tax_status) }}</td>
              <td>
                <button
                  class="btn small"
                  type="button"
                  :disabled="row.tax_status === '已处置' || actionLoadingId === row.id"
                  @click="handleProcess(row)"
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
  </section>
</template>
