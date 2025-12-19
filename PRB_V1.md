# Production Readiness Baseline (PRB) v1

## Scope Definition

This document defines the objective pass/fail criteria for production readiness of the NeoBank platform.

## Verification Criteria

### 1. Zero Hardcoded Credentials in Infrastructure YAMLs

**Definition:** No literal passwords, API keys, or secrets in deployment YAML files. All secrets must use:
- Environment variable references (`${VAR}` or `$VAR`)
- Kubernetes Secret references
- CHANGE_ME placeholders indicating required configuration

**Verification Command:**
```bash
make verify-secrets
```

**Pass Criteria:** Zero matches for hardcoded credential patterns in infrastructure YAMLs (excluding documentation and CHANGE_ME placeholders).

### 2. Zero generateMock* Functions in Production Code

**Definition:** No mock data generators in production code paths. Mock functions are only allowed in test files (`*_test.go`, `test_*.py`, `*.test.ts`).

**Verification Command:**
```bash
make verify-mocks
```

**Pass Criteria:** Zero matches for `generateMock*` or `NewMock*` patterns outside test files.

### 3. Zero TODO implement or FIXME Placeholders

**Definition:** No incomplete implementation markers in production code.

**Verification Command:**
```bash
make verify-todos
```

**Pass Criteria:** Zero matches for `TODO.*implement` or `FIXME` patterns in source files (`.py`, `.go`, `.ts`, `.tsx`, `.js`).

### 4. All Services Compile

**Definition:** All Go services must compile without errors using `go build ./...`.

**Verification Command:**
```bash
make verify-go-build
```

**Pass Criteria:** All 12 Go services compile successfully (exit code 0).

### 5. All Dockerfiles Build Successfully

**Definition:** All Dockerfiles must have valid syntax and build without errors.

**Verification Command:**
```bash
make verify-dockerfiles
```

**Pass Criteria:** All Dockerfiles pass syntax validation.

### 6. Database Persistence Verified

**Definition:** No in-memory database defaults in production paths. Services must:
- Require DATABASE_URL environment variable in production
- Fail fast if DATABASE_URL is not set when ENVIRONMENT=production

**Verification Command:**
```bash
make verify-db-persistence
```

**Pass Criteria:** All Go service main.go files contain production database requirement check.

## Running Full Verification

```bash
make verify
```

This runs all verification checks and reports PASS or FAIL for each criterion.

## Exit Codes

- `0`: All checks passed
- `1`: One or more checks failed

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2025-12-19 | Initial PRB definition |
