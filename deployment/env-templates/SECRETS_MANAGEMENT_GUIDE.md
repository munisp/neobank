# Secrets Management Guide

## Overview

This guide explains how to securely manage secrets and environment variables for the NeoBank platform across different deployment environments and cloud providers.

---

## General Principles

### ✅ DO:
- Use dedicated secrets management services (AWS Secrets Manager, Azure Key Vault, etc.)
- Rotate secrets regularly (every 90 days minimum)
- Use different secrets for each environment (production, staging, development)
- Encrypt secrets at rest and in transit
- Audit secret access and usage
- Use service accounts with minimal permissions
- Store secrets in `.env` files locally (never commit to Git)

### ❌ DON'T:
- Commit secrets to version control
- Share secrets via email, Slack, or other messaging platforms
- Use the same secrets across environments
- Hardcode secrets in application code
- Store secrets in plain text
- Use weak or predictable secrets

---

## Secrets by Cloud Provider

### AWS Secrets Manager

**Store Secrets:**
```bash
# Store individual secret
aws secretsmanager create-secret \
  --name neobank/production/database-password \
  --secret-string "your-secure-password"

# Store JSON secret (multiple values)
aws secretsmanager create-secret \
  --name neobank/production/app-secrets \
  --secret-string '{
    "JWT_SECRET": "your-jwt-secret",
    "API_KEY": "your-api-key"
  }'
```

**Retrieve Secrets:**
```bash
aws secretsmanager get-secret-value \
  --secret-id neobank/production/database-password \
  --query SecretString \
  --output text
```

**In Application (Node.js):**
```javascript
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

async function getSecret(secretName) {
  const data = await secretsManager.getSecretValue({
    SecretId: secretName
  }).promise();
  
  return JSON.parse(data.SecretString);
}
```

---

### Azure Key Vault

**Store Secrets:**
```bash
# Create Key Vault
az keyvault create \
  --name neobank-prod-kv \
  --resource-group neobank-prod \
  --location eastus

# Store secret
az keyvault secret set \
  --vault-name neobank-prod-kv \
  --name database-password \
  --value "your-secure-password"
```

**Retrieve Secrets:**
```bash
az keyvault secret show \
  --vault-name neobank-prod-kv \
  --name database-password \
  --query value \
  --output tsv
```

**In Application (Node.js):**
```javascript
const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

const credential = new DefaultAzureCredential();
const vaultUrl = 'https://neobank-prod-kv.vault.azure.net';
const client = new SecretClient(vaultUrl, credential);

async function getSecret(secretName) {
  const secret = await client.getSecret(secretName);
  return secret.value;
}
```

---

### GCP Secret Manager

**Store Secrets:**
```bash
# Create secret
echo -n "your-secure-password" | \
  gcloud secrets create database-password \
  --data-file=- \
  --replication-policy="automatic"

# Add version
echo -n "new-password" | \
  gcloud secrets versions add database-password \
  --data-file=-
```

**Retrieve Secrets:**
```bash
gcloud secrets versions access latest \
  --secret="database-password"
```

**In Application (Node.js):**
```javascript
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const client = new SecretManagerServiceClient();

async function getSecret(secretName) {
  const [version] = await client.accessSecretVersion({
    name: `projects/PROJECT_ID/secrets/${secretName}/versions/latest`,
  });
  
  return version.payload.data.toString();
}
```

---

### Kubernetes Secrets

**Create from Literal:**
```bash
kubectl create secret generic neobank-secrets \
  --from-literal=database-password=your-password \
  --from-literal=jwt-secret=your-jwt-secret \
  --namespace=neobank
```

**Create from File:**
```bash
kubectl create secret generic neobank-secrets \
  --from-env-file=.env.production \
  --namespace=neobank
```

**Create from YAML:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: neobank-secrets
  namespace: neobank
type: Opaque
data:
  database-password: <base64-encoded-password>
  jwt-secret: <base64-encoded-secret>
```

**Use in Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  template:
    spec:
      containers:
      - name: backend
        env:
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: neobank-secrets
              key: database-password
```

---

### Docker Secrets

**Create Secret:**
```bash
echo "your-password" | docker secret create db_password -
```

**Use in Docker Compose:**
```yaml
version: '3.8'

services:
  backend:
    image: neobank/backend
    secrets:
      - db_password
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    external: true
```

---

## Environment-Specific Configuration

### Production
- Use cloud provider secrets management (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager)
- Enable automatic rotation
- Set up monitoring and alerting
- Use IAM roles/service accounts (no hardcoded credentials)
- Enable audit logging

### Staging
- Use separate secrets from production
- Can use simpler secrets management (Kubernetes secrets)
- Still follow security best practices
- Use test API keys where available

### Development
- Use `.env.local` files (gitignored)
- Can use mock/test credentials
- Never use production secrets

---

## Required Secrets Checklist

### Critical Secrets (Must Have)
- [ ] `DATABASE_URL` or `POSTGRES_PASSWORD`
- [ ] `REDIS_PASSWORD`
- [ ] `JWT_SECRET`
- [ ] `JWT_REFRESH_SECRET`
- [ ] `SESSION_SECRET`

### Email & SMS
- [ ] `SMTP_PASSWORD` or email service API key
- [ ] `SMS_API_KEY` and `SMS_API_SECRET`

### Payment Processing
- [ ] `PAYMENT_GATEWAY_KEY` (Stripe/Paystack secret key)
- [ ] `PAYMENT_GATEWAY_WEBHOOK_SECRET`

### File Storage
- [ ] `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- [ ] Or managed identity/service account

### Third-Party APIs
- [ ] `KYC_API_KEY` (Onfido/Jumio)
- [ ] `CREDIT_SCORE_API_KEY`
- [ ] `CRYPTO_EXCHANGE_API_KEY`
- [ ] `STOCK_API_KEY`

### Monitoring & Analytics
- [ ] `SENTRY_DSN`
- [ ] `GRAFANA_PASSWORD`

---

## Secret Rotation

### Automated Rotation (Recommended)

**AWS Lambda Function:**
```javascript
exports.handler = async (event) => {
  const secretsManager = new AWS.SecretsManager();
  
  // Generate new password
  const newPassword = generateSecurePassword();
  
  // Update database password
  await updateDatabasePassword(newPassword);
  
  // Update secret in Secrets Manager
  await secretsManager.updateSecret({
    SecretId: event.SecretId,
    SecretString: newPassword
  }).promise();
  
  return { statusCode: 200 };
};
```

### Manual Rotation Process

1. **Generate new secret**
   ```bash
   openssl rand -base64 32
   ```

2. **Update in secrets manager**
   ```bash
   aws secretsmanager update-secret \
     --secret-id neobank/production/jwt-secret \
     --secret-string "new-secret-value"
   ```

3. **Rolling update applications**
   ```bash
   kubectl rollout restart deployment/backend -n neobank
   ```

4. **Verify functionality**
   ```bash
   curl https://api.neobank.com/health
   ```

5. **Remove old secret**

---

## CI/CD Integration

### GitHub Actions
```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v1
  with:
    role-to-assume: arn:aws:iam::ACCOUNT:role/github-actions
    aws-region: us-east-1

- name: Get secrets
  run: |
    aws secretsmanager get-secret-value \
      --secret-id neobank/production/app-secrets \
      --query SecretString \
      --output text > .env.production
```

### GitLab CI
```yaml
get-secrets:
  script:
    - gcloud secrets versions access latest --secret="app-secrets" > .env.production
  artifacts:
    paths:
      - .env.production
    expire_in: 1 hour
```

---

## Security Best Practices

### 1. Principle of Least Privilege
- Grant minimum required permissions
- Use separate service accounts per service
- Regularly audit permissions

### 2. Encryption
- Encrypt secrets at rest (AES-256)
- Use TLS for secrets in transit
- Enable encryption in secrets manager

### 3. Monitoring & Auditing
- Log all secret access
- Set up alerts for unusual access patterns
- Regular security audits

### 4. Secret Complexity
- Minimum 32 characters for passwords
- Use cryptographically secure random generation
- Avoid dictionary words

### 5. Backup & Recovery
- Backup secrets securely
- Document recovery procedures
- Test recovery process regularly

---

## Troubleshooting

### Secret Not Found
```bash
# List all secrets
aws secretsmanager list-secrets

# Check IAM permissions
aws sts get-caller-identity
```

### Permission Denied
```bash
# Check IAM policy
aws iam get-role-policy \
  --role-name neobank-backend \
  --policy-name secrets-access
```

### Application Can't Access Secret
1. Verify IAM role/service account attached
2. Check secret name matches exactly
3. Verify region matches
4. Check network connectivity

---

## Emergency Procedures

### Compromised Secret

1. **Immediately rotate the secret**
2. **Revoke old secret access**
3. **Audit recent access logs**
4. **Notify security team**
5. **Update incident response documentation**

### Lost Access to Secrets

1. **Use root account/admin access**
2. **Restore from backup if available**
3. **Regenerate secrets if necessary**
4. **Update all applications**

---

## Tools & Resources

### Secret Generation
```bash
# Generate strong password
openssl rand -base64 32

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate UUID
uuidgen
```

### Secret Scanning
- **git-secrets**: Prevent committing secrets
- **trufflehog**: Find secrets in Git history
- **detect-secrets**: Pre-commit hook

### Installation
```bash
# git-secrets
git secrets --install
git secrets --register-aws

# pre-commit hook
pip install detect-secrets
detect-secrets scan > .secrets.baseline
```

---

## Support

For questions or issues with secrets management:
- **Security Team**: security@neobank.com
- **DevOps Team**: devops@neobank.com
- **Emergency**: +1-XXX-XXX-XXXX

---

**Last Updated:** November 2, 2025  
**Version:** 1.0
