const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { metrics } = require('@opentelemetry/api');

const METRICS_INTERVAL_MS = parseInt(process.env.OTEL_METRICS_INTERVAL_MS || '15000');

function parseHeaders(raw) {
  if (!raw) return undefined;
  const normalized = raw.replace(/%20/g, ' ');
  const headers = {};
  for (const part of normalized.split(/[,\n]/)) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key && val) headers[key] = val;
  }
  return Object.keys(headers).length ? headers : undefined;
}

const otlpHeaders = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
const exporterConfig = otlpHeaders ? { headers: otlpHeaders } : {};

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'calculadora-web',
  }),
  traceExporter: new OTLPTraceExporter(exporterConfig),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(exporterConfig),
    exportIntervalMillis: METRICS_INTERVAL_MS,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch(() => {});
});

const meter = metrics.getMeter('calculadora-web');

const loginCounter = meter.createCounter('auth_logins');
const registerCounter = meter.createCounter('auth_registrations');
const calculationCounter = meter.createCounter('calculations');
const calculationHistogram = meter.createHistogram('calculations_duration', {
  unit: 'ms',
});
const errorCounter = meter.createCounter('errors');

function withDuration(fn) {
  return async (req, res, next) => {
    const start = Date.now();
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const duration = Date.now() - start;
      const route = req.route?.path || req.path;
      calculationHistogram.record(duration, { route, method: req.method });
      originalJson(body);
    };
    next();
  };
}

module.exports = {
  loginCounter,
  registerCounter,
  calculationCounter,
  calculationHistogram,
  errorCounter,
  withDuration,
};
