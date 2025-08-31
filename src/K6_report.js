const fs = require('fs');
const path = require('path');

const summaryPath = path.join(__dirname, 'summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error(`❌ File not found: ${summaryPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
const metrics = summary.metrics || {};

// Read selected scenario and sub-scenario from the summary
const selectedScenario = summary.custom.selectedScenario || "N/A";
const sub_Scenaris = selectedScenario === "constant_arrival_rate" ? summary.custom.sub_Scenaris : (summary.custom.sub_Scenaris === "stress" || summary.custom.sub_Scenaris === "spike") ? summary.custom.sub_Scenaris : "N/A";
const API_ENDPOINT = summary.custom.end_point || "N/A";
const Folder = summary.custom.choose_env || "N/A";
const isAborted = summary.custom.non200Counter > 69 ? "Test Aborted." : "Test is not aborted."


// Check if summary.json exists and proceed, otherwise exit
if (!fs.existsSync(summaryPath)) {
  console.error(`❌ File not found: ${summaryPath}`);
  process.exit(1);
}

// Utility functions to extract metrics
function getMetric(metric, stat, fallback = 0) {
  return metrics?.[metric]?.[stat] ?? fallback;
}

function ms(val) {
  if (val === undefined || val === null) return 'N/A';
  return val < 1 ? `${val.toFixed(2)}ms` : (val >= 1000 ? `${(val / 1000).toFixed(2)}s` : `${val.toFixed(1)}ms`);
}


function percent(val) {
  if (val === undefined || val === null) return 'N/A';
  return `${(val * 100).toFixed(2)}%`;
}

function count(val) {
  return val?.toLocaleString() ?? '0';
}

// Metrics calculations
const totalRequests = getMetric("http_reqs", "count");
const durationMs = summary.custom?.testRunDurationMs || 1; // fallback to avoid division by zero
const durationSeconds = durationMs / 1000;
const avgRPS = +(totalRequests / durationSeconds).toFixed(2);
const duration = `${durationSeconds.toFixed(2)}s`;
const givenVU = summary.custom?.givenVU || 'N/A';

const thresholdMin = 100;     // ms — e.g., good if min < 100ms
const thresholdMax = 1000;    // ms — e.g., good if max < 1000ms

const minRT = getMetric("http_req_duration", "min");
const maxRT = getMetric("http_req_duration", "max");

// Verdict calculation for response time (min and max)
const minVerdict = minRT < thresholdMin ? "✅" : "⚠️ Too high";
const maxVerdict = maxRT < thresholdMax ? "✅" : "❌ Too slow";

// Calculate pass/fail based on HTTP status checks
const statusCheckFails = summary.root_group?.checks?.["status is 200"]?.fails ?? 0;
const passedRequests = (metrics.http_status_2xx?.count || 0) + (metrics.http_status_3xx?.count || 0);
const successRate = totalRequests > 0 ? passedRequests / totalRequests : 0;
const failedRate = getMetric("http_req_failed", "value", 0);

// Calculate response times for categorization
const successUnder1s = getMetric("fast_responses", "count", 0);
const slow1to2s = getMetric("slow_1_to_2s", "count", 0);
const slow2to5s = getMetric("slow_2_to_5s", "count", 0);
const slow5sPlus = getMetric("slow_5s_plus", "count", 0);
// Fetching the degraded response count from the metrics data
const degradedCount = getMetric("degraded_responses", "count", 0);

// Calculate RPS and custom failure rate
const spike = metrics.spike_latency_duration || {};
const customFailureRate = metrics.custom_failure_rate?.value;
const totalSlowRequests = slow1to2s + slow2to5s + slow5sPlus;

// Active virtual users (VU) metrics
const testend_activeVUApprox = getMetric("active_vus_gauge", "value", 0);
const minactiveVUsGauge = getMetric("active_vus_gauge", "min", 0);
const maxActiveVUsGauge = getMetric("active_vus_gauge", "max", 0);
const avgActiveVU = (minactiveVUsGauge + maxActiveVUsGauge) / 2;

// Group status codes for reporting
const statusCodeBreakdown = Object.entries(metrics)
  .filter(([key]) => key.startsWith("http_status_"))
  .reduce((acc, [key, val]) => {
    const code = key.replace("http_status_", "");
    acc[code] = val?.count || 0;
    return acc;
  }, {});

const groupedStatusCodes = {
  '1xx': 0,
  '2xx': 0,
  '3xx': 0,
  '4xx': 0,
  '5xx': 0,
  'Others': 0,
};

for (const [code, count] of Object.entries(statusCodeBreakdown)) {
  const group = code.startsWith('1') ? '1xx'
    : code.startsWith('2') ? '2xx'
      : code.startsWith('3') ? '3xx'
        : code.startsWith('4') ? '4xx'
          : code.startsWith('5') ? '5xx'
            : 'Others';
  groupedStatusCodes[group] += count;
}

// Queue wait times metrics
function getQueueMetric(stat, fallback = 'N/A') {
  const q = metrics.request_queue_wait_time;
  if (!q || !(stat in q)) return fallback;
  return ms(q[stat]);
}

// Verdict for latency and thresholds
function verdictLabel(value, threshold) {
  if (value === undefined || value === null) return "N/A";
  if (value < threshold) return "✅ Good";
  if (value < 1000) return "⚠️ Borderline (<1s)";
  return "❌ Exceeds Target";
}

// Status code summary table
const groupedStatusCodeTable = `
## 📊 HTTP Status Code Summary

| Group | Total Count |
|-------|-------------|
${Object.entries(groupedStatusCodes)
    .map(([group, total]) => `| ${group} | ${total} |`)
    .join('\n')}
`;

// Request queueing summary table
const queueTimeTable = `
## ⏳ Request Queueing / Wait Time

| Metric | Value |
|--------|--------|
| Avg    | ${getQueueMetric("avg")} |
| P95    | ${getQueueMetric("p(95)")} |
| P99    | ${getQueueMetric("p(99)")} |
| Max    | ${getQueueMetric("max")} |
`;

// Check thresholds for response times
const thresholdStatus = (metric, threshold) => {
  const val = getMetric("http_req_duration", metric);
  return val < threshold ? "✅" : "❌";
};

// Verdict and report generation
const failedCheckRate = percent(failedRate);
const allChecksPassed = statusCheckFails === 0;
const allThresholdsPassed =
  getMetric("http_req_duration", "p(90)") < 1000 &&
  getMetric("http_req_duration", "p(95)") < 1100 &&
  getMetric("http_req_duration", "p(99)") < 1200 &&
  failedRate < 0.01 &&
  allChecksPassed;

const verdict = allThresholdsPassed
  ? `Your API handled the simulated load very well.  
✅ Most requests were fast.  
⚠️ Some were slower than 1 second — worth reviewing, but overall performance is **strong**.`
  : `❌ Some thresholds or checks failed under load.  
🔍 Please investigate failing requests or performance degradation.`;

// Spike latency table
const spikeLatencyTable = `
### 🔺 Spike Latency Duration

| Metric  | Value    | Verdict           |
|---------|----------|-------------------|
| p(90)   | ${ms(spike["p(90)"])} | ${verdictLabel(spike["p(90)"], 800)} |
| p(95)   | ${ms(spike["p(95)"])} | ${verdictLabel(spike["p(95)"], 900)} |
| p(99)   | ${ms(spike["p(99)"])} | ${verdictLabel(spike["p(99)"], 1000)} |
| Max     | ${ms(spike["max"])}   | ${verdictLabel(spike["max"], 1200)} |
| Min     | ${ms(spike["min"])}   | ${verdictLabel(spike["min"], 800)} |
| Avg     | ${ms(spike["avg"])}   | ${verdictLabel(spike["avg"], 500)} |
| Median  | ${ms(spike["med"])}   | ${verdictLabel(spike["med"], 500)} |
`;

// Final report block
const overallSummaryBlock = `
# 🚀 Overall Summary

| Key Metric               | Value                                     |
|--------------------------|-------------------------------------------|
| Test                     | Load testing  |  ${isAborted}             
| API Endpoint Tested      | ${Folder}_${API_ENDPOINT}
| Load Pattern (Scenario)  | ${selectedScenario}
| Test Type (Sub-Scenario) | ${sub_Scenaris}
| Test Duration            | ${duration}
| Given VUs                | ${givenVU}                                                            
| Active VUs (Avg)         | ${avgActiveVU}
| Max Active VUs (Max)     | ${maxActiveVUsGauge} | Peak
| Active VUs on test end   | ${testend_activeVUApprox}
| Total Requests Sent      | ${count(totalRequests)} requests                                       
| Total Requests Passed    | ${count(passedRequests)} (${percent(successRate)})                     
| Average RPS              | ${avgRPS !== undefined ? avgRPS.toFixed(2) : 'N/A'} requests/sec | ${avgRPS < 29 ? '⚠️ Couldn’t reach full load target (slow responses)' : '✅ Reached expected load'} | 
| Average Response Time    | ${ms(metrics["http_req_duration"].avg)}                      
| Fast Requests (<1s)      | ${count(successUnder1s)}                                               
| Slow Requests (>1s)      | ${totalSlowRequests}                               
| Degraded Count           | ${count(degradedCount)}                                                
| Custom Failure Rate      | ${percent(customFailureRate)}                                          

---

## ✅ Threshold Summary

| Metric                   | Goal        | Result                                | Status |
|--------------------------|-------------|----------------------------------------|--------|
| Response time (p90)      | < 1000ms    | ${ms(getMetric("http_req_duration", "p(90)"))} | ${thresholdStatus("p(90)", 1000)} |
| Response time (p95)      | < 1100ms    | ${ms(getMetric("http_req_duration", "p(95)"))} | ${thresholdStatus("p(95)", 1100)} |
| Response time (p99)      | < 1200ms    | ${ms(getMetric("http_req_duration", "p(99)"))} | ${thresholdStatus("p(99)", 1200)} |
| Response time (avg)      | -           | ${ms(getMetric("http_req_duration", "avg"))}     | ${getMetric("http_req_duration", "avg") < 1000 ? "✅" : "❌"} |
| Response time (min)      | < ${thresholdMin}ms | ${ms(minRT)} | ${minVerdict} |
| Response time (max)      | < ${thresholdMax}ms | ${ms(maxRT)} | ${maxVerdict} |
| Request failures         | < 1%        | ${failedCheckRate} | ${failedRate < 0.01 ? "✅" : "❌"} |
| Custom checks passed     | All passed  | ${allChecksPassed ? "✅" : "❌"} |

---

## 🐢 Slow Request Ranges

| Range       | Count | Notes                                  |
|-------------|-------|----------------------------------------|
| 1–2s        | ${count(slow1to2s)} | Slightly slow – not ideal, but usually acceptable. |
| 2–5s        | ${count(slow2to5s)} | Noticeably slow – may impact user experience |
| 5s+         | ${count(slow5sPlus)} | Very slow – should be investigated immediately. |

---

${spikeLatencyTable}

---

${queueTimeTable}

---

${groupedStatusCodeTable}

---

## 📦 Network Data

| Metric              | Value   |
|---------------------|---------|
| Total Data Sent     | ~${(getMetric("data_sent", "count") / 1024).toFixed(2)} KB |
| Total Data Received | ~${(getMetric("data_received", "count") / 1024).toFixed(2)} KB |

---

## ${allThresholdsPassed ? "✅ Final Verdict" : "❌ Final Verdict"}

${verdict}

---

*Generated from k6 summary.json*
`;

const folderPath = path.join(__dirname, Folder);
// Check if folder exists
if (!fs.existsSync(folderPath)) {
  try {
    // Create output directory if it doesn't exist
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Output directory ${folderPath} is ready`);
  } catch (err) {
    console.error(`❌ Folder not found: ${folderPath}`, err.message); // Include error details
    process.exit(1);
  }
}

try {
  // Example: Process K6 output files (adjust based on your setup)
  const allFiles = fs.readdirSync(folderPath);
  const parts = API_ENDPOINT.split('/');
  const lastWord = parts[parts.length - 1];
  const add_Subpart = selectedScenario === "ramping_arrival_rate" && (sub_Scenaris === "stress" || sub_Scenaris === "spike") ? true : selectedScenario === "constant_arrival_rate" ? true : false

  const reportName = selectedScenario + "_" + (add_Subpart ? (sub_Scenaris === "N/A" ? "NA" : sub_Scenaris) + "_" + lastWord : lastWord)

  // In K6_report.js, update the report path calculation
  const reportPath = path.join(__dirname, Folder, `${reportName}_(${allFiles.length}).md`);
  if (!fs.existsSync(reportPath)) {
    console.error('❌ Invalid report path:', reportPath);
  }

  try {
    fs.writeFileSync(reportPath, overallSummaryBlock.trim());
    console.log(`✅ Markdown report written to: ${reportPath}`);
  } catch (err) {
    console.error('❌ Failed to write k6_report.md:', err.message);
  }

  // Add your reporting logic here
} catch (error) {
  console.error('Error generating report:', error.message);
  process.exit(1);
}