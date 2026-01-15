<script setup>
import { ref } from 'vue';
import LedgerList from './pages/LedgerList.vue';
import TaxDesk from './pages/TaxDesk.vue';

// 简易页面切换：不引入路由，先满足 MVP 浏览需求
const currentView = ref('list');

// 从详情回到列表
function backToList() {
  currentView.value = 'list';
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
    <LedgerList v-if="currentView === 'list'" />
    <!-- 税费岗页 -->
    <TaxDesk v-else-if="currentView === 'tax'" @back="backToList" />
  </main>
</template>
