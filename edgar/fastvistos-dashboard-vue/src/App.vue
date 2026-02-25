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

/* ── Tabela ── */
const headers = [
  { title: 'Data',      value: 'transaction_date' },
  { title: 'CNPJ',      value: 'cnpj' },
  { title: 'Pessoa',    value: 'person_name' },
  { title: 'Valor',     value: 'amount' },
  { title: 'Operação',  value: 'operation' },
  { title: 'Tipo',      value: 'type' },
  { title: 'IMAP UID',  value: 'imap_uid' },
  { title: 'Nome',      value: 'name' },
];

/* ── API ── */
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

/* ── Format ── */
function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(/ de /g, '-').replace(',', '');
}

function formatCurrency(value: number | string) {
  if (value === null || value === undefined) return '';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
</script>

<template>
  <div class="page-root">

    <!-- Charts -->
    <div class="chart-grid">
      <div v-for="n in 3" :key="n" class="chart-card">
        <div class="card-title">Gráfico {{ n }}</div>
        <div class="chart-card__body">[Gráfico mock]</div>
      </div>
    </div>

    <div class="card card-transactions">
      <!-- Header -->
      <div class="section-header">
        <div class="card-title">Transações</div>

        <div class="tabs">
          <button
            v-for="t in [{ value: 'conciliar', label: 'Para conciliar' }, { value: 'todos', label: 'Todos' }]"
            :key="t.value"
            :class="['tab-btn', { 'tab-btn--active': tab === t.value }]"
            @click="tab = t.value"
          >{{ t.label }}</button>
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
              <th v-for="col in headers" :key="col.value">{{ col.title }}</th>
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
                  <span :class="['badge', item.operation === 'in' ? 'badge--in' : 'badge--out']">
                    {{ item.operation === 'in' ? 'Entrada' : 'Saída' }}
                  </span>
                </template>
                <template v-else>{{ item[col.value] }}</template>
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
          >← Anterior</button>

          <span class="pagination__info">
            Página <strong>{{ page }}</strong> de <strong>{{ totalPages }}</strong>
          </span>

          <button
            class="btn btn--ghost"
            :disabled="!hasNext"
            @click="onPageChange(page + 1)"
          >Próximo →</button>
        </div>

        <div class="pagination__size">
          <span>Itens por página:</span>

          <select
            :value="pageSize"
            class="select"
            @change="onPageSizeChange(Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="opt in itemsPerPageOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <div class="pagination__total">
          Total: <strong>{{ total }}</strong> registros
        </div>
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
/* ─────────────────────────────────────────────
   Todos os valores usam variáveis do
   openclaw-bridge.css — zero hardcode de cores.
   ───────────────────────────────────────────── */

.page-root {
  width: 100%;
  color: var(--text);
  font-family: var(--font-body);
  box-sizing: border-box;
}

/* ── Chart grid ── */
.chart-grid {
  display: flex;
  gap: 20px;
  margin-bottom: 32px;
  padding: 0 12px;
}

.chart-card {
  flex: 1;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  transition: border-color var(--duration-fast) ease;
}

.chart-card:hover {
  border-color: var(--border-strong);
}

.chart-card__title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-strong);
  margin-bottom: 12px;
  letter-spacing: -0.01em;
}

.chart-card__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 12px;
}

/* ── Section header ── */
.section-header {
  padding: 0 12px;
  margin-bottom: 0;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-strong);
  margin-bottom: 20px;
}

/* ── Tabs ── */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  padding: 10px 24px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
  color: var(--muted);
  transition:
    color var(--duration-fast) ease,
    border-color var(--duration-fast) ease;
}

.tab-btn:hover {
  color: var(--text);
}

.tab-btn--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* ── Loading / empty state ── */
.state-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--muted);
  font-size: 12px;
}

.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: var(--radius-full);
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Table ── */
.table-wrap {
  overflow-x: auto;
  width: 100%;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.data-table thead tr {
  border-bottom: 1px solid var(--border);
}

.data-table th {
  padding: 10px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
}

.data-row {
  border-bottom: 1px solid var(--border);
  transition: background var(--duration-fast) ease;
}

.data-row:hover {
  background: var(--bg-hover);
}

.data-table td {
  padding: 12px 12px;
  white-space: nowrap;
  color: var(--text);
}

/* ── Cell variants ── */
.amount {
  color: var(--ok);
  font-weight: 600;
  font-family: var(--mono);
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
}

.badge--in {
  background: var(--ok-subtle);
  color: var(--ok);
  border: 1px solid var(--ok-muted);
}

.badge--out {
  background: var(--danger-subtle);
  color: var(--danger);
  border: 1px solid var(--danger-muted);
}

/* ── Pagination ── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
  padding: 0 12px;
}

.pagination__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination__info {
  font-size: 12px;
  color: var(--muted);
  padding: 0 8px;
}

.pagination__info strong {
  color: var(--text-strong);
}

.pagination__size {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.pagination__total {
  font-size: 12px;
  color: var(--muted);
}

.pagination__total strong {
  color: var(--text);
}

/* ── Button ── */
.btn {
  padding: 7px 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--duration-fast) ease,
    color var(--duration-fast) ease,
    border-color var(--duration-fast) ease;
}

.btn--ghost {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.btn--ghost:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Select ── */
.select {
  background: var(--bg-elevated);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  transition:
    border-color var(--duration-fast) ease,
    box-shadow var(--duration-fast) ease;
}

.select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

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

.card-transactions {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 24px;
  margin: 0 12px 32px 12px;
}

</style>
