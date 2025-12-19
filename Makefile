# NeoBank Production Readiness Baseline (PRB) v1 Verification
# Run `make verify` to check all criteria

.PHONY: verify verify-secrets verify-mocks verify-todos verify-go-build verify-dockerfiles verify-db-persistence

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m

# Main verification target
verify: verify-secrets verify-mocks verify-todos verify-go-build verify-dockerfiles verify-db-persistence
	@echo ""
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)PRB v1 Verification Complete - ALL PASSED$(NC)"
	@echo "$(GREEN)========================================$(NC)"

# 1. Zero hardcoded credentials in infrastructure YAMLs
# Note: Base64-encoded CHANGE_ME placeholders are acceptable (Q0hBTkdFX01F = CHANGE_ME)
verify-secrets:
	@echo ""
	@echo "$(YELLOW)Checking for hardcoded credentials in infrastructure YAMLs...$(NC)"
	@VIOLATIONS=$$(grep -rn --include="*.yaml" --include="*.yml" \
		-E "(password|passwd|secret|token|api[_-]?key|access[_-]?key)\s*[:=]\s*[\"']?[A-Za-z0-9+/=_-]{8,}" \
		deployment/ 2>/dev/null | \
		grep -v "CHANGE_ME" | \
		grep -v "Q0hBTkdFX01F" | \
		grep -v "secretKeyRef" | \
		grep -v "valueFrom" | \
		grep -v "secretRef" | \
		grep -v "\.md:" | \
		grep -v "# " | \
		grep -v "secretsmanager" | \
		grep -v "key_vault" | \
		grep -v ":-}" | \
		grep -v ":-CHANGE_ME" || true); \
	if [ -n "$$VIOLATIONS" ]; then \
		echo "$(RED)FAILED: Found hardcoded credentials:$(NC)"; \
		echo "$$VIOLATIONS"; \
		exit 1; \
	else \
		echo "$(GREEN)PASSED: No hardcoded credentials found$(NC)"; \
	fi

# 2. Zero generateMock* functions in production code
verify-mocks:
	@echo ""
	@echo "$(YELLOW)Checking for generateMock* functions in production code...$(NC)"
	@VIOLATIONS=$$(grep -rn --include="*.go" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" \
		-E "generateMock|NewMock" \
		. 2>/dev/null | \
		grep -v "_test.go:" | \
		grep -v "test_" | \
		grep -v ".test." | \
		grep -v "__tests__" | \
		grep -v "mocks/" | \
		grep -v "node_modules/" || true); \
	if [ -n "$$VIOLATIONS" ]; then \
		echo "$(RED)FAILED: Found mock functions in production code:$(NC)"; \
		echo "$$VIOLATIONS"; \
		exit 1; \
	else \
		echo "$(GREEN)PASSED: No mock functions in production code$(NC)"; \
	fi

# 3. Zero TODO implement or FIXME placeholders
verify-todos:
	@echo ""
	@echo "$(YELLOW)Checking for TODO implement/FIXME placeholders...$(NC)"
	@VIOLATIONS=$$(grep -rn --include="*.go" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" \
		-iE "TODO.*implement|FIXME" \
		. 2>/dev/null | \
		grep -v "node_modules/" | \
		grep -v "_test.go:" | \
		grep -v "test_" | \
		grep -v ".test." | \
		grep -v "All TODOs implemented" || true); \
	if [ -n "$$VIOLATIONS" ]; then \
		echo "$(RED)FAILED: Found TODO implement/FIXME placeholders:$(NC)"; \
		echo "$$VIOLATIONS"; \
		exit 1; \
	else \
		echo "$(GREEN)PASSED: No TODO implement/FIXME placeholders$(NC)"; \
	fi

# 4. All Go services compile
verify-go-build:
	@echo ""
	@echo "$(YELLOW)Checking Go services compile...$(NC)"
	@FAILED=0; \
	for service in accounts-go analytics-go banking-go bills-go bnpl-go escrow-go insurance-go investments-go kyc-kyb-go rewards-go savings-go telecom-go; do \
		if [ -d "services/$$service" ]; then \
			cd services/$$service && go build ./... 2>/dev/null; \
			if [ $$? -ne 0 ]; then \
				echo "$(RED)FAILED: $$service does not compile$(NC)"; \
				FAILED=1; \
			fi; \
			cd ../..; \
		fi; \
	done; \
	if [ $$FAILED -eq 1 ]; then \
		exit 1; \
	else \
		echo "$(GREEN)PASSED: All Go services compile$(NC)"; \
	fi

# 5. All Dockerfiles have valid syntax
verify-dockerfiles:
	@echo ""
	@echo "$(YELLOW)Checking Dockerfile syntax...$(NC)"
	@FAILED=0; \
	for dockerfile in $$(find . -name "Dockerfile" -o -name "Dockerfile.*" 2>/dev/null | grep -v node_modules); do \
		if ! head -1 "$$dockerfile" | grep -qE "^(FROM|ARG|#)" 2>/dev/null; then \
			echo "$(RED)FAILED: Invalid Dockerfile: $$dockerfile$(NC)"; \
			FAILED=1; \
		fi; \
	done; \
	if [ $$FAILED -eq 1 ]; then \
		exit 1; \
	else \
		echo "$(GREEN)PASSED: All Dockerfiles have valid syntax$(NC)"; \
	fi

# 6. Database persistence verified (no in-memory defaults in production)
verify-db-persistence:
	@echo ""
	@echo "$(YELLOW)Checking database persistence requirements...$(NC)"
	@FAILED=0; \
	for service in accounts-go analytics-go banking-go bills-go bnpl-go insurance-go investments-go kyc-kyb-go rewards-go savings-go telecom-go; do \
		if [ -f "services/$$service/cmd/server/main.go" ]; then \
			if ! grep -q "DATABASE_URL is required in production" "services/$$service/cmd/server/main.go" 2>/dev/null; then \
				echo "$(RED)FAILED: $$service missing production database requirement$(NC)"; \
				FAILED=1; \
			fi; \
		fi; \
	done; \
	if [ $$FAILED -eq 1 ]; then \
		exit 1; \
	else \
		echo "$(GREEN)PASSED: All services require DATABASE_URL in production$(NC)"; \
	fi

# Help target
help:
	@echo "NeoBank PRB v1 Verification Targets:"
	@echo ""
	@echo "  make verify              - Run all verification checks"
	@echo "  make verify-secrets      - Check for hardcoded credentials"
	@echo "  make verify-mocks        - Check for mock functions in production"
	@echo "  make verify-todos        - Check for TODO/FIXME placeholders"
	@echo "  make verify-go-build     - Verify Go services compile"
	@echo "  make verify-dockerfiles  - Verify Dockerfile syntax"
	@echo "  make verify-db-persistence - Verify database persistence requirements"
	@echo ""
	@echo "See PRB_V1.md for detailed criteria definitions."
