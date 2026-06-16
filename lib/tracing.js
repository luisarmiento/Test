const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { metrics } = require('@opentelemetry/api');

const METRICS_INTERVAL_MS = parseInt(process.env.OTEL_METRICS_INTERVAL_MS || '15000');

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'calculadora-web',
  }),
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
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
