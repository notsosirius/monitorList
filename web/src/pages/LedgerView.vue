<script setup>
import { ref, watchEffect } from 'vue';
import { fetchLedgerById } from '../api/ledger';

const props = defineProps({
  recordId: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['back']);

// 详情数据与 UI 状态
const record = ref(null);
const loading = ref(false);
const errorMessage = ref('');

// 详情字段定义，统一用于渲染
const fields = [
  { key: 'decl_no', label: '报关单号' },
  { key: 'tax_no', label: '税号' },
  { key: 'goods_name', label: '商品名称' },
  { key: 'declare_date', label: '申报日期' },
  { key: 'final_invoice_date', label: '最终发票日期' },
  { key: 'latest_settle_date', label: '最晚结算资料日期' },
  { key: 'doc_receipt_date', label: '资料签收日期' },
  { key: 'days_receipt_invoice', label: '是否超30天（签收-发票）' },
  { key: 'info_exchange', label: '资料交互情况' },
  { key: 'inquiry_start_date', label: '询价发起日期' },
  { key: 'challenge_date', label: '质疑日期' },
  { key: 'negotiation_date', label: '磋商日期' },
  { key: 'valuation_work_date', label: '审价作业表日期' },
  { key: 'amend_date', label: '改单日期（已审价）' },
  { key: 'days_amend_invoice', label: '是否超30天（改单-发票）' },
  { key: 'days_amend_declare', label: '是否超270天（改单-申报）' },
  { key: 'continu_tax_duty', label: '延续性征税（关税）' },
  { key: 'continu_tax_vat', label: '延续性征税（增值税）' },
  { key: 'additional_tax_duty', label: '审价补税（关税）' },
  { key: 'additional_tax_vat', label: '审价补税（增值税）' },
  { key: 'remark', label: '备注' },
  { key: 'tax_status', label: '税费岗状态' }
];

// 将属性字段插入到“资料交互情况”之前展示
const infoExchangeIndex = fields.findIndex((field) => field.key === 'info_exchange');
const fieldsBeforeAttribute = infoExchangeIndex === -1 ? fields : fields.slice(0, infoExchangeIndex);
const fieldsAfterAttribute = infoExchangeIndex === -1 ? [] : fields.slice(infoExchangeIndex);

const attributeOptions = [
  '公式定价',
  '特殊关系',
  '特许权使用费',
  '事中验估',
  '事后验估',
  '虚拟混矿',
  '报税内销有内销价',
  '报税内销无内销价'
];

// 详情加载逻辑
async function loadRecord(id) {
  loading.value = true;
  errorMessage.value = '';
  try {
    record.value = await fetchLedgerById(id);
  } catch (error) {
    errorMessage.value = error.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

// 当 recordId 变化时重新加载
watchEffect(() => {
  if (props.recordId) {
    loadRecord(props.recordId);
  }
});

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

function getAttributeFlags(recordValue) {
  if (!recordValue) return [];
  return String(recordValue)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">查看详情</p>
        <h1>税收征管关键节点监控</h1>
      </div>
      <div class="page-actions">
        <button class="btn ghost" type="button" @click="emit('back')">返回列表</button>
      </div>
    </header>

    <div class="card">
      <div v-if="loading" class="state">加载中...</div>
      <div v-else-if="errorMessage" class="state error">{{ errorMessage }}</div>
      <div v-else-if="!record" class="state">暂无数据</div>
      <div v-else>
        <div class="detail-grid">
          <div v-for="field in fieldsBeforeAttribute" :key="field.key" class="detail-row">
            <div class="detail-label">{{ field.label }}</div>
            <div class="detail-value">{{ displayValue(record[field.key]) }}</div>
          </div>
        </div>
        <div class="attr-group">
          <div class="attr-title">属性字段</div>
          <div class="attr-options">
            <label v-for="option in attributeOptions" :key="option" class="attr-item">
              <input
                type="checkbox"
                disabled
                :checked="getAttributeFlags(record.attribute_flags).includes(option)"
              />
              <span>{{ option }}</span>
            </label>
          </div>
        </div>
        <div class="detail-grid">
          <div v-for="field in fieldsAfterAttribute" :key="field.key" class="detail-row">
            <div class="detail-label">{{ field.label }}</div>
            <div class="detail-value">{{ displayValue(record[field.key]) }}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
