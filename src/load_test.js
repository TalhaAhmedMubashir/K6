import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter, Gauge } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

// Pick scenario based on env variable
const selectedScenario = __ENV.choose_scenario;
const sub_Scenaris = __ENV.choose_sub_scenario;

const vu = (sub_Scenaris === "steady_smoke_test" ? 50 : (sub_Scenaris === "steady_stability_test" || sub_Scenaris === "spike") ? 70 : (sub_Scenaris === "sustained_throughput_test" || sub_Scenaris === "stress") ? 100 : 50);

const chooseScenario = {

  // Main scenario , Request per second , Response Time (MilliSeconds) , Sub - Scenario , Constant Virtual Users (optional)
  constant_arrival_rate: getScenarioConfig("constant-arrival-rate", 29, 1000, sub_Scenaris, vu),
  ramping_arrival_rate: getScenarioConfig("ramping-arrival-rate", 29, 1000, sub_Scenaris, vu),
};

// --- OPTIONS ---
export const options = {
  scenarios: {
    [selectedScenario]: chooseScenario[selectedScenario],
  },

  thresholds: {
    http_req_duration: ["p(90)<1000", "p(95)<1100", "p(99)<1200"],
    custom_http_req_duration: ["p(50)<600"],
    spike_latency_duration: ['p(90)<2000', 'p(95)<2500'],
    http_req_failed: ["rate<0.01"],
    custom_failure_rate: ["rate<0.01"],
    requests_total_under_1s: ["count>0"],
    requests_failed_under_1s: ["count>=0"],
  },
};

function getScenarioConfig(executorName, rps, AvgResMs, testgoal = "", constantVU = 0) {
  // Convert avg response time to seconds
  const resSec = AvgResMs / 1000;

  //ramping-arrival-rate
  // Calculate number of Virtual Users needed to sustain desired RPS
  const vus = constantVU > 0 ? constantVU : Math.ceil(rps * resSec);

  //ramping-arrival-rate
  // Allow some buffer by setting maxVUs to x of estimated VUs
  let maxVUs = 0;
  if (executorName === "ramping-arrival-rate" && sub_Scenaris === "spike") {
    maxVUs = Math.max(600, Math.ceil(vus * 5));
  } else {
    if (executorName === "ramping-arrival-rate") {
      maxVUs = 500;
    }
  }

  //ramping-arrival-rate
  // Start RPS slowly to avoid sudden spike (20% of target RPS, minimum 1)
  const startRate = (sub_Scenaris === "spike" ? Math.max(1, Math.floor(rps * 1.0)) : Math.max(1, Math.floor(rps * 0.2)));

  //constant-arrival-rate
  const preAllocatedVUsforConstantarrivalrate = constantVU > 0 ? constantVU : Math.ceil(rps * 0.2);;

  //constant-arrival-rate
  // Max number of virtual users = Pre-allocated virtual users * buffer for unexpected delays
  const maxVUsforConstantarrivalrate = (sub_Scenaris === "sustained_throughput_test" ? preAllocatedVUsforConstantarrivalrate * 7 : preAllocatedVUsforConstantarrivalrate * 5);

  const testGoal = testgoal === "steady_smoke_test" ? "1m" : testgoal === "steady_stability_test" ? "5m" : testgoal === "sustained_throughput_test" ? "10m" : "30s";

  // Return scenario configuration
  if (executorName === "constant-arrival-rate") {
    return {
      executor: "constant-arrival-rate",
      rate: rps, // How many RPS remains constant
      timeUnit: "1s",  // Time unit used between requests
      duration: testGoal,
      preAllocatedVUs: preAllocatedVUsforConstantarrivalrate,
      maxVUs: maxVUsforConstantarrivalrate,
    };
  } else {
    const commonRampingConfig = {
      executor: "ramping-arrival-rate",
      startRate,
      timeUnit: "1s",
      preAllocatedVUs: vus,
      maxVUs: maxVUs,
    };
    if (sub_Scenaris === "stress") {
      return {
        ...commonRampingConfig,
        stages: [
          { target: rps, duration: '1m' },
          { target: rps * 2, duration: '2m' },
          { target: rps * 3, duration: '2m' },
          { target: rps * 4, duration: '2m' },
          { target: rps * 5, duration: '2m' },
          { target: rps * 6, duration: '2m' },
          { target: 0, duration: '30s' },
        ],
      }
    } else {
      if (sub_Scenaris === "spike") {
        return {
          ...commonRampingConfig,
          stages: [
            { target: rps, duration: '1m' },
            { target: rps * 10, duration: '30s' },
            { target: rps, duration: '3m' },
            { target: 0, duration: '30s' },
          ],
        };
      } else {
        return {
          ...commonRampingConfig,
          stages: [
            { target: rps, duration: '1m' },
            { target: rps + (Math.floor(rps * 0.05) === 0 ? 1 : Math.floor(rps * 0.2)), duration: '2m' },
            { target: rps + (Math.floor(rps * 0.05) === 0 ? 1 : Math.floor(rps * 0.2)), duration: '2m' },
            { target: rps + (Math.floor(rps * 0.1) === 0 ? 1 : Math.floor(rps * 0.1)), duration: '2m' },
            { target: 0, duration: '30s' },
          ],
        };
      }
    }
  }
}
// --- METRICS ---
const fastResponses = new Counter("fast_responses");
const slow_1_to_2s = new Counter("slow_1_to_2s");
const slow_2_to_5s = new Counter("slow_2_to_5s");
const slow_5s_plus = new Counter("slow_5s_plus");
const totalRequests = new Counter("total_requests");
const numberofdegradedResponses = new Counter("degraded_responses");
const slowResponses = new Counter("slow_responses");
const failedUnder1s = new Counter("requests_failed_under_1s");
const totalUnder1s = new Counter("requests_total_under_1s");
export const first_degraded_info = new Counter("first_degraded_info");
const durationTrend = new Trend("custom_http_req_duration");
const failureRate = new Rate("custom_failure_rate");
export const activeVUApprox = new Counter("active_vu_approx");
const spikeLatency = new Trend('spike_latency_duration');
export const vuGauge = new Gauge("active_vus_gauge");

export const avg_duration = new Trend("avg_duration");
export const avg_rps = new Trend("avg_rps");
export let responseTrend = new Trend("response_time");
const queue_wait_time = new Trend("request_queue_wait_time");

// --- SETUP ---
const chooseENV = __ENV.choose_env || 'ebs_staging'
const BASE_URL = (chooseENV === 'ebs_staging' ? "https://domain.org" : chooseENV === 'ebs_production' ? "https://https://domain.com" : "https://https://domain_another.org");
const targetUrl = `${BASE_URL}/rest_api/${__ENV.API_ENDPOINT || ""}`;
const LOGIN_URL = BASE_URL + "/rest_api/login";
const email = __ENV.USER_EMAIL || "dummyuser@yopmail.com";
const password = __ENV.USER_PASSWORD || "Asd@1234";
const APP_ID = 118;
const LANGUAGE = "en";
const METHOD = (__ENV.METHOD || "GET").toUpperCase();
const loginForEachIteration = __ENV.LOGIN_MODE === "true";
const skipLogin = __ENV.PERFORM_LOGIN === "false";
const PAYLOAD_type = __ENV.PAYLOAD_TYPE || "application/json";
const PAYLOAD = __ENV.PAYLOAD || "{}";

let localCount = 0;
let totalResponseTime = 0;
let requestCount = 0;
let non200Counter = 0;
let requestsInCurrentSecond = 0;
let currentSecondTimestamp = Math.floor(Date.now() / 1000);

let smoothedRPS = 0;
let previousSecondTimestamp = Date.now();

const httpStatusCounters = {};
const groups = ["0", "2xx", "3xx", "4xx", "5xx"];

for (const group of groups) {
  httpStatusCounters[group] = new Counter(`http_status_${group}`);
}

function trackRequestCount() {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);  // Ensure we use time in seconds for comparison

  if (nowSec !== currentSecondTimestamp) {
    // New second, reset counters
    requestsInCurrentSecond = 1;
    currentSecondTimestamp = nowSec;
  } else {
    // Continue counting requests for the current second
    requestsInCurrentSecond++;
  }
}

function trackRPS() {
  const nowSec = Math.floor(Date.now() / 1000);

  if (nowSec === previousSecondTimestamp) {
    // Increment current second's RPS
    requestsInCurrentSecond++;
  } else {
    // Calculate and update EMA when the second has passed
    const rpsForCurrentSecond = requestsInCurrentSecond;
    smoothedRPS = rpsForCurrentSecond;  // No smoothing    ;
    avg_rps.add(smoothedRPS);

    // Reset for the next second
    requestsInCurrentSecond = 1;
    previousSecondTimestamp = nowSec;
  }
}

let parsedPayload;
const bill_Submit_PayLoad =
  "email=loadtest@example.com&signature=Best%20regards%2C%20John%20Doe&image=https%3A%2F%2Fexample.com%2Fimages%2Fprofile.jpg&bill_id=BILL-78239&testimony=I%20strongly%20support%20this%20bill%20and%20urge%20others%20to%20do%20the%20same.&title=Support%20for%20Clean%20Energy%20Act";
const organizemyworkplace_payload = `{
  "fname": "Load",
  "lname": "Test",
  "email": "john.doe@example.com",
  "phone": "+1234567890",
  "employer": "Tech Solutions Inc.",
  "occupation": "Software Developer",
  "country": "USA",
  "address": "1234 Elm Street",
  "state": "California",
  "city": "Los Angeles",
  "postal": "90001",
  "peoplework": "10",
  "issues": "No major issues"
}`;

let headers = {
  "Content-Type": "application/x-www-form-urlencoded",
  "Accept": "application/json"
}

function performLoginWithRetry(retries = 2) {
  const payload = `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  const loginUrl = `${LOGIN_URL}?app_id=${APP_ID}&language=${LANGUAGE}`;

  console.log("Login payload: ", payload);  // Ensure correct payload
  console.log("Login URL: ", loginUrl);

  let res = null;
  for (let i = 0; i < retries; i++) {
    res = http.post(loginUrl, payload, { headers });

    if (res.status === 200 && res.body) {
      const body = res.json();

      console.log(`✅ Login successful`);
      sleep(2)
      return {
        token: body.access_token,
        userId: body.data?.id,
      };
    }

    console.error(`❌ Login failed after ${i + 1} attempt(s) | Status: ${res.status} | Response: ${res.body}`);
  }

  console.error(
    `❌ Login failed after ${retries} attempt(s) | Last status: ${res?.status || 'N/A'} | Payload: ${payload}`
  );
  return null;
}


export function setup() {
  if (!loginForEachIteration && !skipLogin) {
    return performLoginWithRetry();
  }
  return null;
}
// --- MAIN TEST ---
export default function (data) {
  vuGauge.add(__VU);
  activeVUApprox.add(1);
  localCount++;

  // Start measuring queue/wait time
  const queuedAt = Date.now();

  let token, userId;

  if (loginForEachIteration) {
    const loginData = performLoginWithRetry();
    if (!loginData) return;
    token = loginData.token;
    userId = loginData.userId;
  } else {
    token = data?.token;
    userId = data?.userId ?? __ENV.USER_ID;
  }

  headers = {
    "Content-Type":
      PAYLOAD_type === "application/json"
        ? "application/json"
        : "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (METHOD === "POST") {
    try {
      if (PAYLOAD_type === "application/json") {
        parsedPayload = JSON.parse(
          PAYLOAD !== "{}" ? PAYLOAD : organizemyworkplace_payload
        );
      } else if (PAYLOAD_type === "application/x-www-form-urlencoded") {
        parsedPayload = PAYLOAD !== "{}" ? PAYLOAD : bill_Submit_PayLoad;
      } else {
        console.error(`❌ Unsupported payload type: ${PAYLOAD_type}`);
        parsedPayload = {};
      }
    } catch (err) {
      console.error("❌ Failed to parse PAYLOAD:", err.message);
      parsedPayload = PAYLOAD_type === "application/json" ? {} : "";
    }
  }

  const url = `${targetUrl}?app_id=${APP_ID}&user_id=${userId || 15428081
    }&language=${LANGUAGE}`;
  const bodyStr =
    PAYLOAD_type === "application/json"
      ? JSON.stringify(parsedPayload)
      : parsedPayload;

  // Track wait time just before the HTTP request
  const beforeRequest = Date.now();
  queue_wait_time.add(beforeRequest - queuedAt); // ⬅️ Log wait time in ms

  const res =
    METHOD === "GET"
      ? http.get(url, { headers })
      : http.post(url, bodyStr, { headers });

  avg_duration.add(res.timings.duration);
  responseTrend.add(res.timings.duration);

  totalRequests.add(1); // Increment metric Counter
  trackRequestCount(); // Increment numeric counter for RPS

  const resTime = res.timings.duration;

  const spikeThresholdMs = 2000;

  if (resTime >= spikeThresholdMs) {
    spikeLatency.add(resTime);
  }

  durationTrend.add(res.timings.duration);
  requestCount++;
  totalResponseTime += res.timings.duration;

  if (resTime < 1000) {
    fastResponses.add(1);
    totalUnder1s.add(1);
    if (!res || res.status >= 400) {
      failedUnder1s.add(1);
    }
  } else {
    numberofdegradedResponses.add(1);
    slowResponses.add(1);
    if (resTime < 2000) slow_1_to_2s.add(1);
    else if (resTime < 5000) slow_2_to_5s.add(1);
    else slow_5s_plus.add(1);
  }

  if (res && res.status && res.status < 400) {
    failureRate.add(false); // success
  } else {
    failureRate.add(true); // failure
  }

  if (res.status !== 200) {
    non200Counter += 1;
    if (non200Counter >= 70) {
      console.error(
        `❌ Aborting test: Non-200 responses reached ${non200Counter} : ${res.status}`
      );
      exec.test.abort("Too many non-200 responses");
    }
  }

  let statusGroup = "0";

  if (res && res.status) {
    const code = res.status;
    if (code !== 200) {
      console.log(`Response status code: ${code}`);
    }
    if (code >= 200 && code < 300) statusGroup = "2xx";
    else if (code >= 300 && code < 400) statusGroup = "3xx";
    else if (code >= 400 && code < 500) statusGroup = "4xx";
    else if (code >= 500 && code < 600) statusGroup = "5xx";
  }

  httpStatusCounters[statusGroup].add(1);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response body is not empty": (r) => r.body && r.body.length > 0,
  });

  trackRequestCount();
  trackRPS();
}

export function handleSummary(data) {
  const maxVUs = data.root_group?.meta?.vus_max || 0;
  const activeVUs = data.root_group?.meta?.vus || 0;
  const durationMs = data.state.testRunDurationMs || 1;
  const durationSec = durationMs / 1000;
  const totalReqs = data.metrics.total_requests?.count || 0;

  const avgRPS = durationSec > 0 ? totalReqs / durationSec : 0;

  const avgRPS_Metric = data.metrics.avg_rps?.avg || 0;

  // Extract custom group counts  
  const statusGroups = ["2xx", "3xx", "4xx", "5xx"];
  const groupedStatusCounts = {};

  const scenarioDetails = {
    selectedScenario: selectedScenario,
    sub_Scenaris: sub_Scenaris,
    choose_env: __ENV.choose_env,
    end_point: __ENV.API_ENDPOINT,
    testRunDurationMs: durationMs,
    avgRPS: avgRPS,
  };

  for (const group of statusGroups) {
    const key = `http_status_${group}`;
    if (data.metrics[key]) {
      groupedStatusCounts[key] = data.metrics[key].count || 0;
    }
  }

  const failedStatusSummary = Object.entries(groupedStatusCounts)
    .filter(([group, count]) => group === "4xx" || group === "5xx")
    .map(([group, count]) => `- ${group}: ${count.toLocaleString()} times`)
    .join("\n");

  // Safely access spike_latency_duration and its percentiles
  const spike = data.metrics.spike_latency_duration || {};
  const spikeAvg = spike.avg ? spike.avg.toFixed(2) : "N/A";
  const spikeP95 = spike.percentiles?.["95"] ? spike.percentiles["95"].toFixed(2) : "N/A";
  const spikeP99 = spike.percentiles?.["99"] ? spike.percentiles["99"].toFixed(2) : "N/A";
  const spikeMax = spike.max ? spike.max.toFixed(2) : "N/A";
  const spikeCount = spike.count || 0;

  data.custom = {
    givenVU: vu,
    ...scenarioDetails,
    testRunDurationMs: durationMs,
    avgRPS: avgRPS,
    non200Counter: non200Counter
  };

  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "summary.json": JSON.stringify(
      {
        metrics: {
          avg_rps: avgRPS_Metric?.toFixed(2),
          total_requests: totalReqs,
          requests_success_under_1s: data.metrics.fast_responses?.count || 0,
          degraded_responses: data.metrics.degraded_responses?.count || 0,
          slow_responses: data.metrics.slow_responses?.count || 0,
          requests_1_2s: data.metrics.slow_1_to_2s?.count || 0,
          requests_2_5s: data.metrics.slow_2_to_5s?.count || 0,
          requests_over_5s: data.metrics.slow_5s_plus?.count || 0,
          avg_duration: data.metrics.avg_duration?.avg?.toFixed(2) || 0,
          data_sent: data.metrics.data_sent?.value || 0,
          data_received: data.metrics.data_received?.value || 0,
          failed_requests: (data.metrics.http_req_failed?.rate || 0).toFixed(2),
          failedStatusSummary: failedStatusSummary,
          custom_http_req_duration: data.metrics.custom_http_req_duration || {},
          custom_failure_rate: data.metrics.custom_failure_rate || {},
          spike_latency_duration: {
            avg: spikeAvg,
            p95: spikeP95,
            p99: spikeP99,
            max: spikeMax,
            count: spikeCount,
          },
          activeVUApprox: activeVUs,
          max_vu: maxVUs,
          ...groupedStatusCounts,
          request_queue_wait_time: {
            avg: data.metrics.request_queue_wait_time?.avg?.toFixed(2),
            p95: data.metrics.request_queue_wait_time?.percentiles["95"]?.toFixed(2),
            max: data.metrics.request_queue_wait_time?.max?.toFixed(2),
          },
        },
        thresholds: data.metrics.http_req_duration?.thresholds || {},
        state: data.state,
      },
      null,
      2
    ),
  };
}

