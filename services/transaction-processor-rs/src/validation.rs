use rust_decimal::Decimal;
use tracing::debug;
use uuid::Uuid;

use crate::error::{Result, TransactionError};
use crate::models::{TransactionRequest, TransactionType};

pub struct TransactionValidator {
    max_transaction_amount: Decimal,
    min_transaction_amount: Decimal,
    supported_currencies: Vec<String>,
}

impl TransactionValidator {
    pub fn new() -> Self {
        Self {
            max_transaction_amount: Decimal::new(100_000_000_00, 2),
            min_transaction_amount: Decimal::new(1, 2),
            supported_currencies: vec![
                "NGN".to_string(),
                "USD".to_string(),
                "EUR".to_string(),
                "GBP".to_string(),
                "KES".to_string(),
                "ZAR".to_string(),
                "GHS".to_string(),
                "UGX".to_string(),
                "TZS".to_string(),
            ],
        }
    }

    pub fn validate(&self, req: &TransactionRequest) -> Result<()> {
        debug!("Validating transaction request");

        self.validate_idempotency_key(&req.idempotency_key)?;
        self.validate_amount(req.amount)?;
        self.validate_currency(&req.currency)?;
        self.validate_accounts(req)?;

        Ok(())
    }

    fn validate_idempotency_key(&self, key: &str) -> Result<()> {
        if key.is_empty() {
            return Err(TransactionError::ValidationError(
                "Idempotency key is required".to_string(),
            ));
        }

        if key.len() > 255 {
            return Err(TransactionError::ValidationError(
                "Idempotency key too long (max 255 characters)".to_string(),
            ));
        }

        Ok(())
    }

    fn validate_amount(&self, amount: Decimal) -> Result<()> {
        if amount <= Decimal::ZERO {
            return Err(TransactionError::InvalidAmount(
                "Amount must be positive".to_string(),
            ));
        }

        if amount < self.min_transaction_amount {
            return Err(TransactionError::InvalidAmount(format!(
                "Amount below minimum: {} (min: {})",
                amount, self.min_transaction_amount
            )));
        }

        if amount > self.max_transaction_amount {
            return Err(TransactionError::InvalidAmount(format!(
                "Amount exceeds maximum: {} (max: {})",
                amount, self.max_transaction_amount
            )));
        }

        Ok(())
    }

    fn validate_currency(&self, currency: &str) -> Result<()> {
        if currency.len() != 3 {
            return Err(TransactionError::InvalidCurrency(format!(
                "Currency code must be 3 characters: {}",
                currency
            )));
        }

        if !self.supported_currencies.contains(&currency.to_uppercase()) {
            return Err(TransactionError::InvalidCurrency(format!(
                "Unsupported currency: {}. Supported: {:?}",
                currency, self.supported_currencies
            )));
        }

        Ok(())
    }

    fn validate_accounts(&self, req: &TransactionRequest) -> Result<()> {
        match req.transaction_type {
            TransactionType::Transfer => {
                if req.source_account_id.is_none() {
                    return Err(TransactionError::ValidationError(
                        "Source account required for transfer".to_string(),
                    ));
                }
                if req.destination_account_id.is_none() {
                    return Err(TransactionError::ValidationError(
                        "Destination account required for transfer".to_string(),
                    ));
                }
                if req.source_account_id == req.destination_account_id {
                    return Err(TransactionError::ValidationError(
                        "Source and destination accounts must be different".to_string(),
                    ));
                }
            }
            TransactionType::Deposit => {
                if req.destination_account_id.is_none() {
                    return Err(TransactionError::ValidationError(
                        "Destination account required for deposit".to_string(),
                    ));
                }
            }
            TransactionType::Withdrawal | TransactionType::Payment => {
                if req.source_account_id.is_none() {
                    return Err(TransactionError::ValidationError(
                        "Source account required for withdrawal/payment".to_string(),
                    ));
                }
            }
            _ => {}
        }

        Ok(())
    }
}

impl Default for TransactionValidator {
    fn default() -> Self {
        Self::new()
    }
}

pub fn validate_uuid(id: &str) -> Result<Uuid> {
    Uuid::parse_str(id).map_err(|_| TransactionError::ValidationError(format!("Invalid UUID: {}", id)))
}

pub fn validate_reference(reference: &str) -> Result<()> {
    if reference.is_empty() {
        return Err(TransactionError::ValidationError(
            "Reference cannot be empty".to_string(),
        ));
    }

    if reference.len() > 100 {
        return Err(TransactionError::ValidationError(
            "Reference too long (max 100 characters)".to_string(),
        ));
    }

    if !reference.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(TransactionError::ValidationError(
            "Reference contains invalid characters".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validator_creation() {
        let validator = TransactionValidator::new();
        assert!(!validator.supported_currencies.is_empty());
    }

    #[test]
    fn test_validate_amount_positive() {
        let validator = TransactionValidator::new();
        assert!(validator.validate_amount(Decimal::new(100, 2)).is_ok());
    }

    #[test]
    fn test_validate_amount_zero() {
        let validator = TransactionValidator::new();
        assert!(validator.validate_amount(Decimal::ZERO).is_err());
    }

    #[test]
    fn test_validate_amount_negative() {
        let validator = TransactionValidator::new();
        assert!(validator.validate_amount(Decimal::new(-100, 2)).is_err());
    }

    #[test]
    fn test_validate_currency_valid() {
        let validator = TransactionValidator::new();
        assert!(validator.validate_currency("NGN").is_ok());
        assert!(validator.validate_currency("USD").is_ok());
        assert!(validator.validate_currency("KES").is_ok());
    }

    #[test]
    fn test_validate_currency_invalid() {
        let validator = TransactionValidator::new();
        assert!(validator.validate_currency("XXX").is_err());
        assert!(validator.validate_currency("INVALID").is_err());
    }

    #[test]
    fn test_validate_uuid_valid() {
        let result = validate_uuid("550e8400-e29b-41d4-a716-446655440000");
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_uuid_invalid() {
        let result = validate_uuid("invalid-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_reference_valid() {
        assert!(validate_reference("TXN-12345").is_ok());
        assert!(validate_reference("ref_abc_123").is_ok());
    }

    #[test]
    fn test_validate_reference_invalid() {
        assert!(validate_reference("").is_err());
        assert!(validate_reference("ref with spaces").is_err());
    }
}
