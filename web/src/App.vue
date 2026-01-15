<script setup>
import { ref } from 'vue';
import LedgerList from './pages/LedgerList.vue';
import LedgerView from './pages/LedgerView.vue';
import TaxDesk from './pages/TaxDesk.vue';

// 简易页面切换：不引入路由，先满足 MVP 浏览需求
const currentView = ref('list');
// 当前选中的记录 id，用于查看详情
const activeId = ref(null);

// 从列表进入详情
function openView(id) {
  activeId.value = id;
  currentView.value = 'view';
}

// 从详情回到列表
function backToList() {
  currentView.value = 'list';
  activeId.value = null;
}

// 进入税费岗页面
function openTaxDesk() {
  currentView.value = 'tax';
  activeId.value = null;
}
</script>

<template>
  <main class="app-shell">
    <nav class="top-nav">
      <button class="btn ghost" type="button" @click="backToList">台账列表</button>
      <button class="btn ghost" type="button" @click="openTaxDesk">税费岗</button>
    </nav>
    <!-- 列表页：默认入口 -->
    <LedgerList v-if="currentView === 'list'" @view="openView" />
    <!-- 查看页：仅在有选中 id 时展示 -->
    <LedgerView v-else-if="currentView === 'view' && activeId" :record-id="activeId" @back="backToList" />
    <!-- 税费岗页 -->
    <TaxDesk v-else-if="currentView === 'tax'" @back="backToList" />
  </main>
</template>
