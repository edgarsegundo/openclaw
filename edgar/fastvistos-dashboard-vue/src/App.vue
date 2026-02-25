<script setup lang="ts">
import { ref, computed } from 'vue';
import axios from 'axios';

const tab = ref('conciliar');
const loading = ref(false);
const transactions = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(3);

const itemsPerPageOptions = computed(() => {
  const opts = [3, 5, 10, 25, 50, 100];
  return opts.includes(pageSize.value) ? opts : [pageSize.value, ...opts].sort((a, b) => a - b);
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const hasPrev = computed(() => page.value > 1 && !loading.value);
const hasNext = computed(() => page.value < totalPages.value && !loading.value);

function onPageChange(newPage: number) {
  page.value = newPage;
  fetchTransactions();
}

function onPageSizeChange(newSize: number) {
  pageSize.value = newSize;
  page.value = 1;
  fetchTransactions();
}

const headers = [
  { title: 'Data', value: 'transaction_date' },
  { title: 'CNPJ', value: 'cnpj' },
  { title: 'Pessoa', value: 'person_name' },
  { title: 'Valor', value: 'amount' },
  { title: 'Operação', value: 'operation' },
  { title: 'Tipo', value: 'type' },
  { title: 'IMAP UID', value: 'imap_uid' },
  { title: 'Nome', value: 'name' },
];

async function fetchTransactions() {
  loading.value = true;
  try {
    const res = await axios.get('http://localhost:3001/api/fastvistos/transactions', {
      params: { page: page.value, pageSize: pageSize.value },
    });
    transactions.value = res.data.rows;
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

fetchTransactions();

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(/ de /g, '-').replace(',', '');
}

function formatCurrency(value: number | string) {
  if (value === null || value === undefined) return '';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
</script>

<template>
  <div style="min-height: 100vh; width: 100%; background: #12141A; color: #fff; padding: 32px 24px; font-family: sans-serif; box-sizing: border-box;">

    <!-- Cards de gráficos -->
    <div style="display: flex; gap: 20px; margin-bottom: 32px;">
      <div v-for="n in 3" :key="n" style="flex: 1; background: #1e1e1e; border-radius: 12px; padding: 24px; min-height: 160px; display: flex; flex-direction: column;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 12px;">Gráfico {{ n }}</div>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #555;">[Gráfico mock]</div>
      </div>
    </div>

    <!-- Card principal de transações -->
    <div style="background: #1e1e1e; border-radius: 12px; padding: 28px;">

      <div style="font-size: 22px; font-weight: 700; margin-bottom: 20px;">Transações</div>

      <!-- Tabs -->
      <div style="display: flex; border-bottom: 2px solid #2a2a2a; margin-bottom: 24px;">
        <button
          v-for="t in [{ value: 'conciliar', label: 'Para conciliar' }, { value: 'todos', label: 'Todos' }]"
          :key="t.value"
          @click="tab = t.value"
          :style="{
            padding: '10px 24px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
            color: tab === t.value ? '#3b82f6' : '#888',
            borderBottom: tab === t.value ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s',
          }"
        >{{ t.label }}</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" style="text-align: center; padding: 48px; color: #555;">Carregando...</div>

      <!-- Tabela -->
      <div v-else style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 1px solid #2a2a2a;">
              <th
                v-for="col in headers"
                :key="col.value"
                style="padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #888; white-space: nowrap;"
              >{{ col.title }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in transactions"
              :key="item.id"
              style="border-bottom: 1px solid #252525; transition: background 0.15s;"
              @mouseover="($event.currentTarget as HTMLElement).style.background = '#252525'"
              @mouseleave="($event.currentTarget as HTMLElement).style.background = 'transparent'"
            >
              <td v-for="col in headers" :key="col.value" style="padding: 12px 14px; white-space: nowrap;">
                <template v-if="col.value === 'transaction_date'">{{ formatDate(item.transaction_date) }}</template>
                <template v-else-if="col.value === 'amount'">
                  <span style="color: #4ade80; font-weight: 600;">{{ formatCurrency(item.amount) }}</span>
                </template>
                <template v-else-if="col.value === 'operation'">
                  <span :style="{
                    background: item.operation === 'in' ? '#14532d' : '#450a0a',
                    color: item.operation === 'in' ? '#4ade80' : '#f87171',
                    padding: '2px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 600
                  }">{{ item.operation === 'in' ? 'Entrada' : 'Saída' }}</span>
                </template>
                <template v-else>{{ item[col.value] }}</template>
              </td>
            </tr>
            <tr v-if="transactions.length === 0">
              <td :colspan="headers.length" style="text-align: center; padding: 48px; color: #555;">Nenhum registro encontrado.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Paginação -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 24px; flex-wrap: wrap; gap: 12px;">

        <div style="display: flex; align-items: center; gap: 8px;">
          <button
            @click="onPageChange(page - 1)"
            :disabled="!hasPrev"
            :style="{
              padding: '7px 16px',
              borderRadius: '6px',
              border: '1px solid #333',
              background: hasPrev ? '#2a2a2a' : '#1a1a1a',
              color: hasPrev ? '#fff' : '#444',
              cursor: hasPrev ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 500,
            }"
          >← Anterior</button>

          <span style="font-size: 13px; color: #888; padding: 0 8px;">
            Página <strong style="color: #fff;">{{ page }}</strong> de <strong style="color: #fff;">{{ totalPages }}</strong>
          </span>

          <button
            @click="onPageChange(page + 1)"
            :disabled="!hasNext"
            :style="{
              padding: '7px 16px',
              borderRadius: '6px',
              border: '1px solid #333',
              background: hasNext ? '#2a2a2a' : '#1a1a1a',
              color: hasNext ? '#fff' : '#444',
              cursor: hasNext ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 500,
            }"
          >Próximo →</button>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #888;">
          <span>Itens por página:</span>
          <select
            :value="pageSize"
            @change="onPageSizeChange(Number(($event.target as HTMLSelectElement).value))"
            style="background: #2a2a2a; color: #fff; border: 1px solid #333; border-radius: 6px; padding: 5px 10px; font-size: 13px; cursor: pointer;"
          >
            <option v-for="opt in itemsPerPageOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <div style="font-size: 13px; color: #555;">
          Total: <strong style="color: #888;">{{ total }}</strong> registros
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
:deep(body), :deep(html) {
  margin: 0;
  padding: 0;
  background: #12141A;
}
</style>
