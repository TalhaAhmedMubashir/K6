# K6 Load Testing Workflow

![k6 Load Testing](https://img.shields.io/badge/k6-Load%20Testing-blueviolet?style=flat-square&logo=k6)
![GitHub Actions](https://img.shields.io/badge/GitHub-Actions-2088FF?style=flat-square&logo=github-actions&logoColor=white)
![Performance Testing](https://img.shields.io/badge/Performance-Testing-green?style=flat-square)

Welcome to the **K6 Load Testing Workflow** repository! This project empowers developers and QA teams to run robust, configurable load tests on APIs using [k6](https://k6.io/), seamlessly integrated with GitHub Actions. Whether you're simulating steady traffic, stress testing for bottlenecks, or spiking loads to mimic real-world surges, this workflow delivers actionable insights into your API's performance.

Designed for scalability and ease-of-use, it supports multiple environments (staging/production), request types (GET/POST), and authentication flows. Generate detailed Markdown reports, JSON summaries, and artifacts to analyze response times, failure rates, and more—helping you optimize your systems before they break under pressure.

## Why Use This Workflow? 🚀
- **Flexible Scenarios**: Choose from constant or ramping arrival rates, with sub-scenarios like smoke tests, stability checks, sustained throughput, stress, or spikes.
- **Customizable Inputs**: Tailor tests with environment selection, API endpoints, payloads, login options, and more via GitHub workflow dispatch.
- **Insightful Reporting**: Automatically generates human-readable Markdown reports, JSON metrics, and artifacts for deep dives into latencies, RPS, and thresholds.
- **Threshold Enforcement**: Built-in checks for response times (p90/p95/p99), failure rates, and custom metrics—fail the workflow if performance dips.
- **Engaging Visuals**: Emojis, tables, and verdicts in reports make results easy to interpret and share with your team.

Perfect for API teams looking to integrate performance testing into CI/CD pipelines!

## Features ✨
- **Scenario Options**:
  - Constant Arrival Rate: Steady RPS for smoke, stability, or throughput tests.
  - Ramping Arrival Rate: Gradual ramps, stress builds, or sudden spikes.
- **Environment Support**: Test against staging (EBS/EKS) or production domains.
- **Request Customization**: GET/POST methods, JSON or form-urlencoded payloads, optional login (per-iteration or once).
- **Metrics & Thresholds**: Tracks RPS, response durations, queue times, spikes, and HTTP status breakdowns.
- **Artifacts**: Uploads JSON results and Markdown reports for post-run analysis.
- **Abort on Failures**: Stops tests if non-200 responses exceed limits.

## Prerequisites 📋
- A GitHub repository with this workflow setup.
- k6 installed (handled automatically in the workflow via apt-get).
- Access to your API endpoints (e.g., staging/production URLs).
- Node.js for report generation (included in the workflow).

## Setup 🛠️
1. **Clone the Repository**:
   ```
   git clone https://github.com/your-username/k6-load-testing-workflow.git
   cd k6-load-testing-workflow
   ```

2. **Add Files to Your Repo**:
   - Place `K6.yml` in `.github/workflows/`.
   - Add `load_test.js` and `K6_report.js` to a `src/` directory.
   - Commit and push to GitHub.

3. **Configure Secrets (Optional)**:
   - If using custom credentials, add GitHub Secrets for `USER_EMAIL` and `USER_PASSWORD`.

## Usage 📈
Trigger the workflow via GitHub Actions dispatch:

1. Go to your repo's **Actions** tab.
2. Select the "Run K6 Load Test" workflow.
3. Provide inputs:
   - **Choose Scenario**: `constant_arrival_rate` or `ramping_arrival_rate`.
   - **Choose Sub-Scenario**: e.g., `steady_smoke_test`, `stress`, `spike` (or `N/A`).
   - **Choose Environment**: `ebs_staging`, `ebs_production`, or `eks_staging`.
   - **Request Method**: `Get` or `Post`.
   - **Perform Login**: Enable/disable authentication.
   - **Login Mode**: Login per iteration (true/false).
   - **API Endpoint**: Path like `/restAPI/endpoint`.
   - **Payload**: JSON or form data (default: `{}`).
   - **Payload Type**: `application/json` or `application/x-www-form-urlencoded`.
4. Run the workflow and monitor the logs.

### Example Dispatch
For a stress test on staging:
- Scenario: `ramping_arrival_rate`
- Sub-Scenario: `stress`
- Environment: `ebs_staging`
- Method: `Post`
- Endpoint: `/api/v1/submit`
- Payload: `{"key": "value"}`

## Outputs & Artifacts 📊
- **JSON Summaries**: `summary.json` and `results.json` for raw metrics.
- **Markdown Report**: Generated in `src/<env>/*.md` with tables, verdicts, and breakdowns (e.g., response times, status codes, queue waits).
- **Artifacts**: Download from the workflow run for easy sharing.

Example Report Snippet:
```
# 🚀 Overall Summary
| Key Metric          | Value                  |
|---------------------|------------------------|
| Test Duration       | 120.00s                |
| Average RPS         | 28.50 requests/sec     |
| Average Response Time | 450ms                |
...
## ✅ Final Verdict
Your API handled the load well! ✅
```

## Troubleshooting ⚠️
- **Login Failures**: Check payload/URL logs; ensure credentials are valid.
- **Threshold Breaches**: Workflow fails if p90 > 1000ms or failures >1%.
- **Aborted Tests**: If non-200 responses hit 70+, the test stops to prevent overload.
- **Debug**: Use the "Debug Directory Contents" step for file listings.

## Contributing 🤝
We welcome contributions! Fork the repo, create a feature branch, and submit a PR. Ideas for new scenarios or metrics are especially appreciated.

## License 📄
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

Built with ❤️ by performance enthusiasts. Let's make your APIs unbreakable! If you find this useful, star the repo ⭐ and share your load testing stories.