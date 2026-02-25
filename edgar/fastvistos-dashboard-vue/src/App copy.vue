<script setup lang="ts">
import { ref, computed } from 'vue';
import axios from 'axios';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  TransitionRoot,
  TransitionChild
} from '@headlessui/vue';

const tab = ref('conciliar');
const loading = ref(false);
const transactions = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(3);

/* ── Modal ── */
const selectedTransaction = ref<any>(null);
const isModalOpen = ref(false);

function openModal(item: any) {
  selectedTransaction.value = item;
  isModalOpen.value = true;
}

function closeModal() {
  isModalOpen.value = false;
}

/* ── Orders Mock ── */
const orderSearch = ref('');

const customerOrders = ref([
  { id: 101, name: 'João Silva', value: 250.5 },
  { id: 102, name: 'Maria Souza', value: 120.0 },
  { id: 103, name: 'Pedro Santos', value: 89.9 },
  { id: 104, name: 'Ana Costa', value: 540.3 },
]);

const filteredOrders = computed(() => {
  if (!orderSearch.value) return customerOrders.value;
  return customerOrders.value.filter(o =>
    o.name.toLowerCase().includes(orderSearch.value.toLowerCase())
  );
});

/* ── Paginação ── */
const itemsPerPageOptions = computed(() => {
  const opts = [3, 5, 10, 25, 50, 100];
  return opts.includes(pageSize.value)
    ? opts
    : [pageSize.value, ...opts].sort((a, b) => a - b);
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize.value))
);

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

/* ── Tabela ── */
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

/* ── API ── */
async function fetchTransactions() {
  loading.value = true;
  try {
    const res = await axios.get(
      'http://localhost:3001/api/fastvistos/transactions',
      {
        params: { page: page.value, pageSize: pageSize.value },
      }
    );
    transactions.value = res.data.rows;
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

fetchTransactions();

/* ── Format ── */
function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr)
    .toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(/ de /g, '-')
    .replace(',', '');
}

function formatCurrency(value: number | string) {
  if (value === null || value === undefined) return '';
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}
</script>

<template>
  <div class="page-root">

    <!-- Charts -->
    <div class="chart-grid">
      <div v-for="n in 3" :key="n" class="chart-card">
        <div class="chart-card__title">Gráfico {{ n }}</div>
        <div class="chart-card__body">[Gráfico mock]</div>
      </div>
    </div>

    <!-- Header -->
    <div class="section-header">
      <h2 class="page-title">Transações</h2>

      <div class="tabs">
        <button
          v-for="t in [
            { value: 'conciliar', label: 'Para conciliar' },
            { value: 'todos', label: 'Todos' }
          ]"
          :key="t.value"
          :class="['tab-btn', { 'tab-btn--active': tab === t.value }]"
          @click="tab = t.value"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="state-empty">
      <span class="spinner" />
      Carregando...
    </div>

    <!-- Table -->
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="col in headers" :key="col.value">
              {{ col.title }}
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="item in transactions"
            :key="item.id"
            class="data-row"
            @click="openModal(item)"
            style="cursor: pointer"
          >
            <td v-for="col in headers" :key="col.value">

              <template v-if="col.value === 'transaction_date'">
                {{ formatDate(item.transaction_date) }}
              </template>

              <template v-else-if="col.value === 'amount'">
                <span class="amount">
                  {{ formatCurrency(item.amount) }}
                </span>
              </template>

              <template v-else-if="col.value === 'operation'">
                <span
                  :class="[
                    'badge',
                    item.operation === 'in'
                      ? 'badge--in'
                      : 'badge--out'
                  ]"
                >
                  {{ item.operation === 'in' ? 'Entrada' : 'Saída' }}
                </span>
              </template>

              <template v-else>
                {{ item[col.value] }}
              </template>

            </td>
          </tr>

          <tr v-if="transactions.length === 0">
            <td :colspan="headers.length" class="state-empty">
              Nenhum registro encontrado.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pagination">

      <div class="pagination__nav">
        <button
          class="btn btn--ghost"
          :disabled="!hasPrev"
          @click="onPageChange(page - 1)"
        >
          ← Anterior
        </button>

        <span class="pagination__info">
          Página <strong>{{ page }}</strong>
          de <strong>{{ totalPages }}</strong>
        </span>

        <button
          class="btn btn--ghost"
          :disabled="!hasNext"
          @click="onPageChange(page + 1)"
        >
          Próximo →
        </button>
      </div>

      <div class="pagination__size">
        <span>Itens por página:</span>

        <select
          :value="pageSize"
          class="select"
          @change="onPageSizeChange(Number(($event.target as HTMLSelectElement).value))"
        >
          <option
            v-for="opt in itemsPerPageOptions"
            :key="opt"
            :value="opt"
          >
            {{ opt }}
          </option>
        </select>
      </div>

      <div class="pagination__total">
        Total: <strong>{{ total }}</strong> registros
      </div>

    </div>

    <!-- MODAL -->
    <TransitionRoot appear :show="isModalOpen" as="template">
      <Dialog as="div" class="modal-root" @close="closeModal">

        <TransitionChild
          as="template"
          enter="ease-out duration-200"
          enter-from="opacity-0"
          enter-to="opacity-100"
          leave="ease-in duration-150"
          leave-from="opacity-100"
          leave-to="opacity-0"
        >
          <div class="modal-overlay" />
        </TransitionChild>

        <div class="modal-container">

          <TransitionChild
            as="template"
            enter="ease-out duration-200"
            enter-from="opacity-0 scale-95"
            enter-to="opacity-100 scale-100"
            leave="ease-in duration-150"
            leave-from="opacity-100 scale-100"
            leave-to="opacity-0 scale-95"
          >

            <DialogPanel class="modal-panel">

              <DialogTitle class="modal-title">
                Detalhes da Transação
              </DialogTitle>

              <div v-if="selectedTransaction" class="modal-grid">
                <div><strong>Data:</strong> {{ formatDate(selectedTransaction.transaction_date) }}</div>
                <div><strong>Pessoa:</strong> {{ selectedTransaction.person_name }}</div>
                <div><strong>Valor:</strong> {{ formatCurrency(selectedTransaction.amount) }}</div>
                <div><strong>Operação:</strong> {{ selectedTransaction.operation }}</div>
                <div><strong>Tipo:</strong> {{ selectedTransaction.type }}</div>
              </div>

              <!-- Orders -->
              <div class="orders-card">
                <input
                  v-model="orderSearch"
                  class="input"
                  placeholder="Buscar cliente..."
                />

                <table class="orders-table">
                  <thead>
                    <tr>
                      <th>ID Pedido</th>
                      <th>Nome Cliente</th>
                      <th>Valor</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr v-for="order in filteredOrders" :key="order.id">
                      <td>{{ order.id }}</td>
                      <td>{{ order.name }}</td>
                      <td>{{ formatCurrency(order.value) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="modal-actions">
                <button class="btn btn--ghost" @click="closeModal">
                  Fechar
                </button>
              </div>

            </DialogPanel>

          </TransitionChild>
        </div>
      </Dialog>
    </TransitionRoot>

  </div>
</template>

<style scoped>
/* mantém todo seu CSS original + modal */

.modal-root {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
}

.modal-container {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-panel {
  width: 100%;
  max-width: 720px;
  background: var(--card);
  border-radius: var(--radius-lg);
  padding: 24px;
  border: 1px solid var(--border);
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
}

.modal-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.orders-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
}

.input {
  width: 100%;
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
}

.orders-table {
  width: 100%;
  border-collapse: collapse;
}

.orders-table th,
.orders-table td {
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

.modal-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
