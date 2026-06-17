const https = require('https');
const http = require('http');

const GRAFANA_URL = process.env.GRAFANA_URL || process.argv[2];
const GRAFANA_TOKEN = process.env.GRAFANA_TOKEN || process.argv[3];
const DATASOURCE_UID = process.env.DATASOURCE_UID || '';

if (!GRAFANA_URL || !GRAFANA_TOKEN) {
  console.error('Uso: GRAFANA_URL=https://tu-stack.grafana.net GRAFANA_TOKEN=glc_xxx node scripts/setup-grafana.js');
  console.error('  O:  node scripts/setup-grafana.js https://tu-stack.grafana.net glc_xxx');
  process.exit(1);
}

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GRAFANA_URL.replace(/\/+$/, ''));
    const client = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${GRAFANA_TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: 15000,
    };
    const req = client.request(options, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(text), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: text });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function findPrometheusDatasource() {
  if (DATASOURCE_UID) {
    console.log(`Usando datasource UID: ${DATASOURCE_UID}`);
    return { uid: DATASOURCE_UID, name: 'custom' };
  }

  const res = await apiRequest('GET', '/api/datasources');
  if (res.status !== 200) {
    console.warn(`No se pudo listar datasources (${res.status}), usando type-based reference`);
    return null;
  }

  const prom = res.data.find(d => d.type === 'prometheus');
  if (prom) {
    console.log(`Datasource encontrado: ${prom.name} (uid: ${prom.uid})`);
    return { uid: prom.uid, name: prom.name };
  }

  console.warn('No se encontró datasource Prometheus, usando type-based reference');
  return null;
}

function buildDashboard(ds) {
  const dsRef = ds ? { type: 'prometheus', uid: ds.uid } : { type: 'prometheus' };

  const latencyQuery = (p) => ({
    refId: `latency_${p}`,
    expr: `histogram_quantile(${p}, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))`,
    legendFormat: `P${Math.round(p * 100)}`,
    interval: '15s',
  });

  return {
    dashboard: {
      uid: 'calculadora-monitoreo',
      title: 'Calculadora Web - Monitoreo',
      tags: ['calculadora', 'opentelemetry', 'nodejs'],
      timezone: 'browser',
      schemaVersion: 39,
      version: 0,
      refresh: '30s',
      time: { from: 'now-1h', to: 'now' },
      timepicker: {
        refresh_intervals: ['10s', '30s', '1m', '5m', '15m', '30m', '1h'],
        time_options: ['5m', '15m', '1h', '6h', '12h', '24h', '2d', '7d', '30d'],
      },
      panels: [
        /* ─────────── ROW 1: HTTP Performance ─────────── */
        {
          id: 1,
          title: 'Latencia HTTP (P50 / P90 / P95 / P99)',
          type: 'timeseries',
          gridPos: { h: 8, w: 8, x: 0, y: 0 },
          datasource: dsRef,
          fieldConfig: {
            defaults: {
              unit: 's',
              decimals: 3,
              custom: { showPoints: 'never' },
              thresholds: {
                mode: 'absolute',
                steps: [
                  { color: 'green', value: null },
                  { color: 'orange', value: 0.5 },
                  { color: 'red', value: 2 },
                ],
              },
            },
            overrides: [
              { matcher: { id: 'byName', options: 'P99' }, properties: [{ id: 'custom.lineWidth', value: 2 }] },
            ],
          },
          options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi' } },
          targets: [
            latencyQuery(0.50),
            latencyQuery(0.90),
            latencyQuery(0.95),
            latencyQuery(0.99),
          ],
        },
        {
          id: 2,
          title: 'Requests por segundo',
          type: 'timeseries',
          gridPos: { h: 8, w: 8, x: 8, y: 0 },
          datasource: dsRef,
          fieldConfig: {
            defaults: {
              unit: 'rps',
              decimals: 1,
              custom: { showPoints: 'never' },
            },
          },
          options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi' } },
          targets: [
            {
              refId: 'A',
              expr: 'sum(rate(http_server_duration_milliseconds_count[5m]))',
              legendFormat: 'Total',
              interval: '15s',
            },
          ],
        },
        {
          id: 3,
          title: 'Tasa de errores (5xx)',
          type: 'timeseries',
          gridPos: { h: 8, w: 8, x: 16, y: 0 },
          datasource: dsRef,
          fieldConfig: {
            defaults: {
              unit: 'percentunit',
              decimals: 3,
              min: 0,
              max: 1,
              custom: { showPoints: 'never' },
              thresholds: {
                mode: 'absolute',
                steps: [
                  { color: 'green', value: null },
                  { color: 'orange', value: 0.01 },
                  { color: 'red', value: 0.05 },
                ],
              },
            },
          },
          options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi' } },
          targets: [
            {
              refId: 'A',
              expr: 'sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[5m])) / sum(rate(http_server_duration_milliseconds_count[5m]))',
              legendFormat: 'Error rate',
              interval: '15s',
            },
          ],
        },

        /* ─────────── ROW 2: HTTP Status Codes ─────────── */
        {
          id: 4,
          title: 'Distribución de códigos HTTP',
          type: 'timeseries',
          gridPos: { h: 8, w: 12, x: 0, y: 8 },
          datasource: dsRef,
          fieldConfig: {
            defaults: { unit: 'rps', decimals: 1, custom: { showPoints: 'never', fillOpacity: 30 } },
          },
          options: {
            legend: { displayMode: 'table', placement: 'bottom', showLegend: true },
            tooltip: { mode: 'multi' },
            stacking: { mode: 'normal', group: 'A' },
          },
          targets: [
            {
              refId: '2xx',
              expr: 'sum(rate(http_server_duration_milliseconds_count{http_status_code=~"2.."}[5m]))',
              legendFormat: '2xx',
            },
            {
              refId: '4xx',
              expr: 'sum(rate(http_server_duration_milliseconds_count{http_status_code=~"4.."}[5m]))',
              legendFormat: '4xx',
            },
            {
              refId: '5xx',
              expr: 'sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[5m]))',
              legendFormat: '5xx',
            },
          ],
        },

        /* ─────────── ROW 3: Business Metrics ─────────── */
        {
          id: 5,
          title: 'Cálculos por minuto',
          type: 'timeseries',
          gridPos: { h: 8, w: 6, x: 12, y: 8 },
          datasource: dsRef,
          fieldConfig: {
            defaults: { unit: 'cpm', decimals: 1, custom: { showPoints: 'never' } },
          },
          options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true } },
          targets: [
            {
              refId: 'A',
              expr: 'rate(calculations_total[5m])',
              legendFormat: 'Cálculos',
              interval: '15s',
            },
          ],
        },
        {
          id: 6,
          title: 'Autenticaciones (logins + registros)',
          type: 'timeseries',
          gridPos: { h: 8, w: 6, x: 18, y: 8 },
          datasource: dsRef,
          fieldConfig: {
            defaults: { unit: 'cpm', decimals: 1, custom: { showPoints: 'never' } },
          },
          options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true } },
          targets: [
            {
              refId: 'logins',
              expr: 'rate(auth_logins_total[5m])',
              legendFormat: 'Logins',
            },
            {
              refId: 'regs',
              expr: 'rate(auth_registrations_total[5m])',
              legendFormat: 'Registros',
            },
          ],
        },

        /* ─────────── ROW 4: Duración de cálculos ─────────── */
        {
          id: 7,
          title: 'Duración de cálculos (P50 / P90 / P95)',
          type: 'timeseries',
          gridPos: { h: 8, w: 12, x: 0, y: 16 },
          datasource: dsRef,
          fieldConfig: {
            defaults: { unit: 'ms', decimals: 1, custom: { showPoints: 'never' } },
          },
          options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi' } },
          targets: [
            {
              refId: 'p50',
              expr: 'histogram_quantile(0.50, sum(rate(calculations_duration_milliseconds_bucket[5m])) by (le))',
              legendFormat: 'P50',
            },
            {
              refId: 'p90',
              expr: 'histogram_quantile(0.90, sum(rate(calculations_duration_milliseconds_bucket[5m])) by (le))',
              legendFormat: 'P90',
            },
            {
              refId: 'p95',
              expr: 'histogram_quantile(0.95, sum(rate(calculations_duration_milliseconds_bucket[5m])) by (le))',
              legendFormat: 'P95',
            },
          ],
        },
        {
          id: 8,
          title: 'Errores totales (acumulado)',
          type: 'timeseries',
          gridPos: { h: 8, w: 6, x: 12, y: 16 },
          datasource: dsRef,
          fieldConfig: {
            defaults: { unit: 'short', decimals: 0, custom: { showPoints: 'never' } },
          },
          options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true } },
          targets: [
            {
              refId: 'A',
              expr: 'rate(errors_total[5m])',
              legendFormat: 'Errores/min',
              interval: '15s',
            },
          ],
        },
        {
          id: 9,
          title: 'Estado del servicio',
          type: 'stat',
          gridPos: { h: 8, w: 6, x: 18, y: 16 },
          datasource: dsRef,
          fieldConfig: {
            defaults: {
              unit: 'none',
              thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }] },
              mappings: [
                { type: 'value', value: '1', text: '✅ Activo' },
                { type: 'value', value: '0', text: '❌ Inactivo' },
              ],
            },
          },
          options: {
            reduceOptions: { values: true, calcs: ['lastNotNull'] },
            orientation: 'horizontal',
            textMode: 'value_and_name',
            colorMode: 'none',
          },
          targets: [
            {
              refId: 'A',
              expr: 'sum(rate(http_server_duration_milliseconds_count[5m])) > bool 0',
              legendFormat: 'Activo',
            },
          ],
        },
      ],
    },
    overwrite: true,
  };
}

async function main() {
  console.log('🔍 Buscando datasource Prometheus en Grafana...');
  const ds = await findPrometheusDatasource();

  console.log('📊 Construyendo dashboard...');
  const payload = buildDashboard(ds);

  console.log('🚀 Creando dashboard via API...');
  const result = await apiRequest('POST', '/api/dashboards/db', payload);

  if (result.status === 200) {
    const dashUrl = result.data.url || `${GRAFANA_URL}/d/${result.data.uid}`;
    console.log(`\n✅ Dashboard creado exitosamente!`);
    console.log(`   URL: ${dashUrl}`);
    console.log(`   Título: ${result.data.title || 'Calculadora Web - Monitoreo'}`);
    console.log(`   Versión: ${result.data.version}`);
  } else {
    console.error(`\n❌ Error al crear dashboard (${result.status}):`);
    console.error(JSON.stringify(result.data, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
