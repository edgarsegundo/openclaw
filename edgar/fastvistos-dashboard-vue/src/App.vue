<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import axios from 'axios';

const tab = ref('conciliar');
const loading = ref(false);
const transactions = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(3);

/* ── Modal ── */
const isModalOpen = ref(false);
const selectedTransaction = ref(null);
const orderSearch = ref("");
const orderResults = ref([]);
const orderCount = ref(0);
const orderPage = ref(1);
const orderLoading = ref(false);
const orderNext = ref(null);
const orderPrev = ref(null);

let orderSearchTimeout: any = null;

function openModal(transaction) {
  selectedTransaction.value = transaction;
  isModalOpen.value = true;
  orderPage.value = 1;
  orderSearch.value = "";
  fetchOrders();
}

function fetchOrders() {
  orderLoading.value = true;
  const q = orderSearch.value.trim();
  const params: any = { q };
  console.log("[fetchOrders] params:", params);
  if (orderPage.value > 1) params.page = orderPage.value;
  axios
    .get("/api/fastvistos/microservicesadm/proxy/customer-orders/search", { params })
    .then((res) => {
      console.log("[fetchOrders] response:", res.data);
      orderResults.value = res.data.results || [];
      orderCount.value = res.data.count || 0;
      orderNext.value = res.data.next;
      orderPrev.value = res.data.previous;
    })
    .finally(() => {
      orderLoading.value = false;
    });
}

function onOrderSearchInput() {
  orderPage.value = 1;
  if (orderSearchTimeout) clearTimeout(orderSearchTimeout);
  orderSearchTimeout = setTimeout(fetchOrders, 400);
}

function onOrderPageChange(nextPage) {
  orderPage.value = nextPage;
  fetchOrders();
}

watch(isModalOpen, (open) => {
  if (!open) {
    orderResults.value = [];
    orderCount.value = 0;
    orderSearch.value = "";
    orderPage.value = 1;
  }
});

function formatOrderDate(dateStr) {
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

/* ── Orders Mock ── */
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
    <div v-if="isModalOpen" class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Detalhes da Transação</div>
          <button class="modal-close" @click="isModalOpen = false">×</button>
        </div>
        <div class="modal-body">
          <!-- Detalhes da Transação -->
          <div class="modal-section">
            <div class="modal-section-title">Pedidos do Cliente</div>
            <input
              v-model="orderSearch"
              @input="onOrderSearchInput"
              placeholder="Buscar cliente..."
              class="input-search"
              autocomplete="off"
            />
            <div v-if="orderLoading" class="state-empty">Carregando pedidos...</div>
            <table v-else class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Data/Hora</th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>WhatsApp</th>
                  <th>CPF/CNPJ</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="order in orderResults" :key="order.id">
                  <td>{{ order.id }}</td>
                  <td>{{ formatOrderDate(order.timestamp) }}</td>
                  <td>{{ order.customer_name }}</td>
                  <td>{{ order.customer_email }}</td>
                  <td>{{ order.customer_whatsapp }}</td>
                  <td>{{ order.customer_cpf_cnpj }}</td>
                </tr>
                <tr v-if="orderResults.length === 0">
                  <td colspan="6" class="state-empty">Nenhum pedido encontrado.</td>
                </tr>
              </tbody>
            </table>
            <div class="pagination" v-if="orderCount > 0">
              <button
                class="btn btn--ghost"
                :disabled="!orderPrev"
                @click="onOrderPageChange(orderPage - 1)"
              >← Anterior</button>
              <span class="pagination__info">
                Página <strong>{{ orderPage }}</strong>
              </span>
              <button
                class="btn btn--ghost"
                :disabled="!orderNext"
                @click="onOrderPageChange(orderPage + 1)"
              >Próximo →</button>
              <span class="pagination__total">
                Total: <strong>{{ orderCount }}</strong> pedidos
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

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
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: var(--card, #18181b);
  border-radius: 12px;
  box-shadow: var(--shadow-md);
  padding: 32px;
  min-width: 480px;
  max-width: 90vw;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #888;
  cursor: pointer;
}

.modal-section {
  margin-top: 24px;
}

.modal-section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.input-search {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #333;
  background: #222;
  color: #fff;
  margin-bottom: 16px;
  font-size: 14px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  margin-bottom: 12px;
}

.data-table th, .data-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #252525;
  text-align: left;
}

.state-empty {
  text-align: center;
  color: #888;
  padding: 24px;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.btn--ghost {
  background: #222;
  color: #fff;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
}

.btn--ghost:disabled {
  background: #18181b;
  color: #444;
  cursor: not-allowed;
}

.pagination__info {
  font-size: 13px;
  color: #888;
}

.pagination__total {
  font-size: 13px;
  color: #888;
}
</style>
