<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import axios from 'axios';

const tab = ref('conciliar');
const loading = ref(false);
const transactions = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(5);

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

/* ── Description ── */
const descriptionValue = ref("");
const descriptionSaving = ref(false);
let descriptionTimeout: any = null;

/* ── Error dialog ── */
const errorDialogOpen = ref(false);
const errorMessage = ref("");

function showError(msg: string) {
  errorMessage.value = msg;
  errorDialogOpen.value = true;
}

const ORDER_PAGE_SIZE = 5;
let orderSearchTimeout: any = null;

function openModal(transaction) {
  selectedTransaction.value = transaction;
  descriptionValue.value = transaction.description || "";
  isModalOpen.value = true;
  orderPage.value = 1;
  orderSearch.value = "";
  fetchOrders();
}

function onDescriptionInput() {
  if (!selectedTransaction.value) return;
  if (descriptionTimeout) clearTimeout(descriptionTimeout);
  descriptionTimeout = setTimeout(() => {
    saveDescription();
  }, 500);
}

async function saveDescription() {
  if (!selectedTransaction.value) return;
  descriptionSaving.value = true;
  try {
    await axios.patch(
      `http://localhost:3001/api/fastvistos/transactions/${selectedTransaction.value.id}/description`,
      { description: descriptionValue.value }
    );
    selectedTransaction.value.description = descriptionValue.value;
  } catch (err: any) {
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.details ||
      "Erro ao salvar a descrição. Tente novamente.";
    showError(msg);
  } finally {
    descriptionSaving.value = false;
  }
}

function fetchOrders() {
  orderLoading.value = true;
  const q = orderSearch.value.trim();
  const params: any = {
    q,
    page: orderPage.value,
    page_size: ORDER_PAGE_SIZE,
  };
  axios
    .get("/api/fastvistos/microservicesadm/proxy/customer-orders/search", { params })
    .then((res) => {
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
    if (descriptionTimeout) clearTimeout(descriptionTimeout);
    descriptionValue.value = "";
  }
});

function formatOrderDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const mon = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${mon}/${year}`;
}

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
  const d = new Date(dateStr);
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const mon = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  const hour = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${day}/${mon}/${year} ${hour}:${min}`;
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
                  <span class="amount">{{ formatCurrency(item.amount) }}</span>
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
              <td :colspan="headers.length" class="state-empty">Nenhum registro encontrado.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="pagination">
        <div class="pagination__nav">
          <button class="btn btn--ghost" :disabled="!hasPrev" @click="onPageChange(page - 1)">← Anterior</button>
          <span class="pagination__info">
            Página <strong>{{ page }}</strong> de <strong>{{ totalPages }}</strong>
          </span>
          <button class="btn btn--ghost" :disabled="!hasNext" @click="onPageChange(page + 1)">Próximo →</button>
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
    <div v-show="isModalOpen" class="modal-overlay" @click="isModalOpen = false">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <div class="modal-title">Detalhes da Transação</div>
          <button class="modal-close" @click="isModalOpen = false">×</button>
        </div>

        <div v-if="selectedTransaction" class="modal-body">
          <!-- Detalhes em duas colunas -->
          <div class="modal-section">
            <div class="details-grid">
              <div class="details-col">
                <table class="data-table">
                  <tbody>
                    <tr><th>Data</th><td>{{ formatDate(selectedTransaction.transaction_date) }}</td></tr>
                    <tr><th>CNPJ</th><td>{{ selectedTransaction.cnpj }}</td></tr>
                    <tr><th>Pessoa</th><td>{{ selectedTransaction.person_name }}</td></tr>
                    <tr><th>Valor</th><td>{{ formatCurrency(selectedTransaction.amount) }}</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="details-col">
                <table class="data-table">
                  <tbody>
                    <tr><th>Operação</th><td>{{ selectedTransaction.operation }}</td></tr>
                    <tr><th>Tipo</th><td>{{ selectedTransaction.type }}</td></tr>
                    <tr><th>IMAP UID</th><td>{{ selectedTransaction.imap_uid }}</td></tr>
                    <tr><th>Nome</th><td>{{ selectedTransaction.name }}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Descrição fora do grid, ocupando 100% -->
            <div class="description-row">
              <span class="description-row__label">
                Descrição
                <span v-if="descriptionSaving" class="saving-indicator">salvando...</span>
              </span>
              <input
                type="text"
                v-model="descriptionValue"
                @input="onDescriptionInput"
                class="description-input"
                placeholder="Adicionar descrição..."
              />
            </div>
          </div>

          <!-- Pedidos do Cliente -->
          <div class="modal-section">
            <div class="modal-section-title">Pedidos do Cliente</div>
            <input
              v-model="orderSearch"
              @input="onOrderSearchInput"
              placeholder="Buscar cliente..."
              class="input-search"
              autocomplete="off"
            />

            <div :class="['orders-table-wrap', { 'orders-table-wrap--loading': orderLoading }]">
              <table class="data-table">
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
                    <td colspan="6" class="state-empty-inline">
                      {{ orderLoading ? 'Carregando...' : 'Nenhum pedido encontrado.' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="pagination modal-pagination" v-show="orderCount > 0">
              <button
                class="btn btn--ghost"
                :disabled="!orderPrev || orderLoading"
                @click="onOrderPageChange(orderPage - 1)"
              >← Anterior</button>
              <span class="pagination__info">
                Página <strong>{{ orderPage }}</strong>
                <span v-if="orderCount"> · Total: <strong>{{ orderCount }}</strong></span>
              </span>
              <button
                class="btn btn--ghost"
                :disabled="!orderNext || orderLoading"
                @click="onOrderPageChange(orderPage + 1)"
              >Próximo →</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ERROR DIALOG (Vue nativo, sem Headless UI) -->
    <Teleport to="body">
      <div v-if="errorDialogOpen" class="error-dialog-root">
        <div class="error-dialog-overlay" @click="errorDialogOpen = false" />
        <div class="error-dialog-wrapper">
          <div class="error-dialog-panel">
            <div class="error-dialog-icon">⚠️</div>
            <div class="error-dialog-title">Erro ao salvar</div>
            <p class="error-dialog-message">{{ errorMessage }}</p>
            <button class="btn btn--primary" @click="errorDialogOpen = false">OK, entendi</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
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

.chart-card:hover { border-color: var(--border-strong); }

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
  transition: color var(--duration-fast) ease, border-color var(--duration-fast) ease;
}

.tab-btn:hover { color: var(--text); }

.tab-btn--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* ── Loading / empty ── */
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

.data-table thead tr { border-bottom: 1px solid var(--border); }

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

.data-row:hover { background: var(--bg-hover); }

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

.modal-pagination {
  margin-top: 12px;
  padding: 0;
  justify-content: flex-start;
  gap: 8px;
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

.pagination__info strong { color: var(--text-strong); }

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

.pagination__total strong { color: var(--text); }

/* ── Button ── */
.btn {
  padding: 7px 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--duration-fast) ease, color var(--duration-fast) ease, border-color var(--duration-fast) ease;
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

.btn--primary {
  background: var(--accent, #6366f1);
  color: #fff;
  border: none;
  padding: 8px 24px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-md);
  cursor: pointer;
  margin-top: 8px;
  transition: opacity 0.15s ease;
}

.btn--primary:hover { opacity: 0.85; }

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
  transition: border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
}

.select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--card, #18181b);
  border-radius: 12px;
  box-shadow: var(--shadow-md);
  padding: 32px;
  width: 900px;
  max-width: 90vw;
  max-height: 650px;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
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

.modal-body {
  overflow-y: auto;
  flex: 1;
  padding-right: 4px;
  padding-left: 4px;
}

.modal-section {
  margin-top: 24px;
}

.modal-section:first-child { margin-top: 0; }

.modal-section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

/* ── Details two-column grid ── */
.details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.details-col .data-table { margin-bottom: 0; }

/* ── Description row (full width below grid) ── */
.description-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 4px 10px;
}

.description-row__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
  min-width: 70px;
}

.saving-indicator {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: var(--muted, #888);
  text-transform: none;
  letter-spacing: 0;
  margin-top: 2px;
}

.description-input {
  flex: 1;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #333;
  background: #222;
  color: #fff;
  font-size: 12px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s ease;
}

.description-input:focus {
  border-color: var(--accent, #6366f1);
}

/* ── Search input ── */
.input-search {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #333;
  background: #222;
  color: #fff;
  margin-bottom: 16px;
  font-size: 12px;
  box-sizing: border-box;
}

/* ── Orders table ── */
.orders-table-wrap {
  max-height: 200px;
  min-height: 200px;
  overflow-y: scroll;
  border: 1px solid #252525;
  border-radius: 6px;
  transition: opacity 0.15s ease;
}

.orders-table-wrap--loading {
  opacity: 0.4;
  pointer-events: none;
}

.state-empty-inline {
  text-align: center;
  color: #888;
  padding: 16px;
  font-size: 12px;
}

.card-transactions {
  padding: 24px;
  border-radius: var(--radius-lg);
  background: var(--card);
  border: 1px solid var(--border);
  margin: 0 12px;
}

/* ── Modal table compact ── */
.modal .data-table th {
  padding: 4px 10px;
}

.modal .data-table td {
  padding: 4px 10px;
}

/* ── Error Dialog ── */
.error-dialog-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.error-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
}

.error-dialog-wrapper {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: none;
}

.error-dialog-panel {
  background: #18181b;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 32px 40px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  pointer-events: all;
  position: relative;
  z-index: 10000;
}

.error-dialog-icon {
  font-size: 40px;
  margin-bottom: 16px;
}

.error-dialog-title {
  font-size: 18px;
  font-weight: 700;
  color: #f87171;
  margin-bottom: 12px;
}

.error-dialog-message {
  font-size: 13px;
  color: #888;
  margin-bottom: 24px;
  line-height: 1.5;
}
</style>
