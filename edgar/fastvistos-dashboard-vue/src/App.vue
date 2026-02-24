
<script setup lang="ts">
import { ref, computed } from 'vue';
import axios from 'axios';

const tab = ref('conciliar');
const loading = ref(false);
const transactions = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(3);

// Garante que o valor atual de pageSize sempre aparece no seletor
const itemsPerPageOptions = computed(() => {
  const opts = [3, 5, 10, 25, 50, 100];
  return opts.includes(pageSize.value) ? opts : [pageSize.value, ...opts].sort((a, b) => a - b);
});

function onPageChange(newPage: number) {
  page.value = newPage;
  fetchTransactions();
}

function onPageSizeChange(newSize: number) {
  pageSize.value = newSize;
  page.value = 1; // volta para a primeira página ao mudar o tamanho
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
    console.log('[fetchTransactions] page:', page.value, 'pageSize:', pageSize.value);
    const res = await axios.get('http://localhost:3001/api/fastvistos/transactions', {
      params: { page: page.value, pageSize: pageSize.value },
    });
    transactions.value = res.data.rows;
    total.value = res.data.total;
    console.log('[fetchTransactions] total:', res.data.total, 'rows:', res.data.rows.length, 'rows:', res.data.rows);
  } finally {
    loading.value = false;
  }
}

fetchTransactions();

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  // Convert to São Paulo timezone (America/Sao_Paulo)
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(/ de /g, '-').replace(',', '');
}

function formatCurrency(value: number|string) {
  if (value === null || value === undefined) return '';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
</script>

<template>
  <v-app>
    <v-main>
      <v-container fluid class="pa-4">
        <!-- Row com 3 cards de gráficos mock -->
        <v-row class="mb-6" no-gutters align="stretch">
          <v-col cols="12" md="4" style="padding: 0 12px 0 0;">
            <v-card class="pa-4 h-100">
              <v-card-title>Gráfico 1</v-card-title>
              <v-card-text>
                <div style="height:120px;display:flex;align-items:center;justify-content:center;">[Gráfico mock]</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" md="4" style="padding: 0 12px 0 12px;">
            <v-card class="pa-4 h-100">
              <v-card-title>Gráfico 2</v-card-title>
              <v-card-text>
                <div style="height:120px;display:flex;align-items:center;justify-content:center;">[Gráfico mock]</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" md="4" style="padding: 0 0 0 12px;">
            <v-card class="pa-4 h-100">
              <v-card-title>Gráfico 3</v-card-title>
              <v-card-text>
                <div style="height:120px;display:flex;align-items:center;justify-content:center;">[Gráfico mock]</div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Row com card único, tabs e tabela -->
        <v-row>
          <v-col cols="12">
            <v-card class="mb-6 pa-4 mt-8">
              <v-card-title>
                Transações
              </v-card-title>
              <v-tabs v-model="tab" bg-color="primary" dark>
                <v-tab value="conciliar">Para conciliar</v-tab>
                <v-tab value="todos">Todos</v-tab>
              </v-tabs>
              <v-card-text>
                <v-window v-model="tab">
                  <v-window-item value="conciliar">
                    <v-data-table
                      :headers="headers"
                      :items="transactions"
                      :loading="loading"
                      :page="page"
                      :items-per-page="pageSize"
                      :items-per-page-options="itemsPerPageOptions"
                      :server-items-length="total"
                      class="elevation-1"
                      @update:page="onPageChange"
                      @update:items-per-page="onPageSizeChange"
                    >
                      <template #item.transaction_date="{ item }">
                        {{ formatDate(item.transaction_date) }}
                      </template>
                      <template #item.amount="{ item }">
                        {{ formatCurrency(item.amount) }}
                      </template>
                    </v-data-table>
                  </v-window-item>
                  <v-window-item value="todos">
                    <v-data-table
                      :headers="headers"
                      :items="transactions"
                      :loading="loading"
                      :page="page"
                      :items-per-page="pageSize"
                      :items-per-page-options="itemsPerPageOptions"
                      :server-items-length="total"
                      class="elevation-1"
                      @update:page="onPageChange"
                      @update:items-per-page="onPageSizeChange"
                    >
                      <template #item.transaction_date="{ item }">
                        {{ formatDate(item.transaction_date) }}
                      </template>
                      <template #item.amount="{ item }">
                        {{ formatCurrency(item.amount) }}
                      </template>
                    </v-data-table>
                  </v-window-item>
                </v-window>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
body {
  background: #f5f5f5;
}
</style>
