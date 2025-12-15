# GitHub Actions Setup for E2E Tests

Complete guide for setting up automated E2E tests in GitHub Actions.

---

## 📋 Overview

The GitHub Actions workflow automatically runs E2E tests on:
- **Pull Requests** to `main` or `develop` branches
- **Pushes** to `main` or `develop` branches
- **Manual triggers** via workflow_dispatch

---

## 🚀 Quick Setup

### 1. Copy Workflow File

```bash
# Copy the workflow file to your repository
mkdir -p .github/workflows
cp e2e-tests/.github/workflows/e2e-tests.yml .github/workflows/
```

### 2. Copy Docker Compose File

```bash
# Copy the test environment configuration
cp e2e-tests/docker-compose.test.yml ./
```

### 3. Configure GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | `https://hooks.slack.com/services/...` |
| `TEST_USER_EMAIL` | Test user email (optional) | `test.user@neobank.com` |
| `TEST_USER_PASSWORD` | Test user password (optional) | `TestPassword123!` |

---

## 🔧 Workflow Configuration

### Trigger Conditions

```yaml
on:
  pull_request:
    branches: [main, develop]
    paths:
      - 'frontend/**'
      - 'backend/**'
      - 'e2e-tests/**'
  push:
    branches: [main, develop]
  workflow_dispatch:
```

**Explanation**:
- Tests run on PRs to `main` or `develop`
- Tests run on pushes to `main` or `develop`
- Tests only run if relevant files changed
- Manual trigger available via GitHub UI

### Browser Matrix

```yaml
strategy:
  matrix:
    browser: [chromium]
    # Uncomment to test all browsers
    # browser: [chromium, firefox, webkit]
```

**Options**:
- **Single browser** (default): Fast, tests Chromium only
- **All browsers**: Comprehensive, tests Chromium, Firefox, WebKit

### Parallel Execution

```yaml
pytest -v -n 4
```

**Configuration**:
- `-n 4`: Run 4 tests in parallel
- Adjust based on runner resources
- Speeds up test execution significantly

---

## 📊 Workflow Steps

### 1. **Setup** (5 minutes)
- Checkout code
- Setup Python 3.11
- Cache Playwright browsers
- Install dependencies

### 2. **Services** (2 minutes)
- Start PostgreSQL
- Start Redis
- Start OpenSearch (optional)
- Run database migrations

### 3. **Application** (3 minutes)
- Start backend server
- Start frontend server
- Wait for services to be ready

### 4. **Tests** (5-7 minutes)
- Run E2E tests with pytest
- Generate HTML report
- Generate JUnit XML
- Generate Allure results

### 5. **Reporting** (1 minute)
- Upload test results
- Upload screenshots/videos
- Publish test results
- Comment on PR

### 6. **Cleanup** (1 minute)
- Stop services
- Remove temporary files
- Clean up Docker containers

**Total Duration**: ~15-20 minutes

---

## 📈 Test Reports

### 1. **HTML Report**

Generated at: `e2e-tests/reports/test_report_{browser}.html`

**Features**:
- Test results summary
- Pass/fail statistics
- Execution time
- Failure screenshots
- Stack traces

**Access**:
- Download from GitHub Actions artifacts
- View in browser locally

### 2. **JUnit XML Report**

Generated at: `e2e-tests/reports/junit_{browser}.xml`

**Features**:
- Machine-readable format
- CI/CD integration
- Test result publishing

**Used by**:
- `EnricoMi/publish-unit-test-result-action`
- Displays results in PR checks

### 3. **Allure Report**

Generated at: `e2e-tests/reports/allure-results/`

**Features**:
- Interactive web report
- Test history
- Trend analysis
- Detailed test steps
- Screenshots and videos

**Access**:
- Deployed to GitHub Pages (on main branch)
- URL: `https://{username}.github.io/{repo}/allure-report/`

### 4. **PR Comment**

Automatically posts test results as PR comment.

**Includes**:
- Test summary
- Pass/fail count
- Link to full report
- Failed test details

---

## 🔍 Viewing Test Results

### Option 1: GitHub Actions UI

1. Go to **Actions** tab
2. Click on workflow run
3. View test results in **Summary**
4. Download artifacts for detailed reports

### Option 2: PR Checks

1. Open Pull Request
2. Scroll to **Checks** section
3. Click **E2E Test Results**
4. View inline test results

### Option 3: Allure Report (Main Branch)

1. Navigate to GitHub Pages URL
2. View interactive Allure report
3. Explore test history and trends

### Option 4: Slack Notification

1. Receive notification in Slack channel
2. Click link to view full results
3. Review test status and details

---

## 🐛 Debugging Failed Tests

### 1. **View Screenshots**

```bash
# Download artifacts from GitHub Actions
gh run download {run-id} -n test-results-chromium

# View screenshots
open e2e-tests/screenshots/
```

### 2. **View Videos**

```bash
# Videos are recorded for failed tests
open e2e-tests/videos/
```

### 3. **View Traces**

```bash
# Download traces
gh run download {run-id} -n test-results-chromium

# View in Playwright trace viewer
playwright show-trace e2e-tests/traces/trace.zip
```

### 4. **View Logs**

```bash
# View workflow logs
gh run view {run-id} --log

# View specific job logs
gh run view {run-id} --job={job-id} --log
```

---

## ⚙️ Advanced Configuration

### Run Tests on Specific Browsers

```yaml
# Edit .github/workflows/e2e-tests.yml
strategy:
  matrix:
    browser: [chromium, firefox, webkit]
```

### Adjust Timeout

```yaml
# Edit .github/workflows/e2e-tests.yml
jobs:
  e2e-tests:
    timeout-minutes: 30  # Adjust as needed
```

### Change Parallel Workers

```yaml
# Edit .github/workflows/e2e-tests.yml
pytest -v -n 8  # Increase for more parallelism
```

### Add More Services

```yaml
# Edit docker-compose.test.yml
services:
  tigerbeetle:
    image: ghcr.io/tigerbeetle/tigerbeetle:latest
    ports:
      - "3000:3000"
```

### Custom Environment Variables

```yaml
# Edit .github/workflows/e2e-tests.yml
env:
  CUSTOM_VAR: value
  ANOTHER_VAR: ${{ secrets.SECRET_NAME }}
```

---

## 🔒 Security Best Practices

### 1. **Use Secrets for Sensitive Data**

```yaml
env:
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
  DATABASE_PASSWORD: ${{ secrets.DB_PASSWORD }}
```

### 2. **Restrict Workflow Permissions**

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

### 3. **Use Dependabot for Updates**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

### 4. **Enable Branch Protection**

- Require status checks to pass
- Require E2E tests before merging
- Enforce code review

---

## 📊 Performance Optimization

### 1. **Cache Dependencies**

```yaml
- uses: actions/cache@v3
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('**/requirements.txt') }}
```

**Benefit**: Reduces setup time by 2-3 minutes

### 2. **Parallel Test Execution**

```yaml
pytest -v -n 4
```

**Benefit**: Reduces test execution time by 50-70%

### 3. **Conditional Service Startup**

```yaml
- name: Start OpenSearch
  if: contains(github.event.head_commit.message, '[full-test]')
```

**Benefit**: Faster tests for simple changes

### 4. **Fail Fast Strategy**

```yaml
strategy:
  fail-fast: false  # Set to true to stop on first failure
```

**Benefit**: Saves CI minutes on obvious failures

---

## 📞 Troubleshooting

### Issue: Tests Timeout

**Solution**:
```yaml
# Increase timeout
timeout-minutes: 60

# Or increase service wait time
timeout 120 bash -c 'until curl -f http://localhost:8000/health; do sleep 2; done'
```

### Issue: Browser Installation Fails

**Solution**:
```yaml
# Install with dependencies
python -m playwright install --with-deps chromium
```

### Issue: Services Not Ready

**Solution**:
```yaml
# Add healthchecks to docker-compose.test.yml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U test"]
  interval: 5s
  timeout: 5s
  retries: 5
```

### Issue: Flaky Tests

**Solution**:
```yaml
# Retry failed tests
pytest -v --reruns 2 --reruns-delay 5
```

### Issue: Out of Memory

**Solution**:
```yaml
# Reduce parallel workers
pytest -v -n 2

# Or use larger runner
runs-on: ubuntu-latest-4-cores
```

---

## 🎯 Best Practices

1. ✅ **Run tests on every PR** - Catch issues early
2. ✅ **Use caching** - Speed up workflow
3. ✅ **Parallel execution** - Reduce test time
4. ✅ **Upload artifacts** - Debug failures easily
5. ✅ **Comment on PRs** - Visibility for reviewers
6. ✅ **Monitor test trends** - Use Allure reports
7. ✅ **Keep tests fast** - Target <10 minutes total
8. ✅ **Retry flaky tests** - Reduce false negatives
9. ✅ **Clean up resources** - Prevent resource leaks
10. ✅ **Notify team** - Use Slack/email notifications

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Playwright CI Documentation](https://playwright.dev/docs/ci)
- [pytest Documentation](https://docs.pytest.org/)
- [Allure Report Documentation](https://docs.qameta.io/allure/)

---

## 📄 Example PR Comment

```
## 🎯 E2E Test Results

✅ **35/35 tests passed** (100%)

### Summary
- **Duration**: 6m 32s
- **Browser**: Chromium
- **Parallel Workers**: 4

### Test Breakdown
- Login Flow: 17/17 ✅
- Transaction Flow: 18/18 ✅

[View Full Report](https://github.com/{owner}/{repo}/actions/runs/{run-id})
```

---

**GitHub Actions workflow is production-ready!** 🚀
