"""
Fraud detection service with hybrid rule-based and ML/GNN approach
"""
import json
import numpy as np
from decimal import Decimal
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone, timedelta
import structlog

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
import httpx
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest

from config.settings import settings
from database.models import Transaction, Account, User, FraudAlert, TransactionType
from app.schemas.fraud import (
    FraudCheckRequest,
    FraudCheckResponse,
    FraudAlertResponse,
    FraudRuleResult
)

logger = structlog.get_logger()


class RuleBasedDetector:
    """Rule-based fraud detection engine"""
    
    def __init__(self):
        self.rules = {
            "high_amount": {"threshold": 1000000, "weight": 0.3},  # ₦1M
            "unusual_time": {"start_hour": 23, "end_hour": 6, "weight": 0.2},
            "velocity_check": {"max_transactions": 10, "time_window": 3600, "weight": 0.4},  # 10 tx/hour
            "round_amount": {"weight": 0.1},
            "duplicate_transaction": {"time_window": 300, "weight": 0.5},  # 5 minutes
            "geographic_anomaly": {"weight": 0.3},
            "account_age": {"min_days": 30, "weight": 0.2}
        }
    
    async def check_transaction(self, db: AsyncSession, transaction_data: Dict[str, Any], account: Account) -> FraudRuleResult:
        """Run rule-based fraud checks"""
        
        fraud_score = 0.0
        triggered_rules = []
        rule_details = {}
        
        amount = Decimal(str(transaction_data.get("amount", 0)))
        transaction_time = datetime.fromisoformat(transaction_data.get("timestamp", datetime.now(timezone.utc).isoformat()))
        
        # Rule 1: High amount transaction
        if amount > self.rules["high_amount"]["threshold"]:
            rule_score = self.rules["high_amount"]["weight"]
            fraud_score += rule_score
            triggered_rules.append("high_amount")
            rule_details["high_amount"] = {
                "amount": float(amount),
                "threshold": self.rules["high_amount"]["threshold"],
                "score": rule_score
            }
        
        # Rule 2: Unusual time transaction
        hour = transaction_time.hour
        if self.rules["unusual_time"]["start_hour"] <= hour or hour <= self.rules["unusual_time"]["end_hour"]:
            rule_score = self.rules["unusual_time"]["weight"]
            fraud_score += rule_score
            triggered_rules.append("unusual_time")
            rule_details["unusual_time"] = {
                "hour": hour,
                "score": rule_score
            }
        
        # Rule 3: Transaction velocity check
        velocity_score = await self._check_transaction_velocity(db, account.id, transaction_time)
        if velocity_score > 0:
            fraud_score += velocity_score
            triggered_rules.append("high_velocity")
            rule_details["high_velocity"] = {
                "score": velocity_score
            }
        
        # Rule 4: Round amount (potential money laundering indicator)
        if amount % 1000 == 0 and amount >= 10000:  # Round thousands above ₦10k
            rule_score = self.rules["round_amount"]["weight"]
            fraud_score += rule_score
            triggered_rules.append("round_amount")
            rule_details["round_amount"] = {
                "amount": float(amount),
                "score": rule_score
            }
        
        # Rule 5: Duplicate transaction check
        duplicate_score = await self._check_duplicate_transaction(db, account.id, amount, transaction_time)
        if duplicate_score > 0:
            fraud_score += duplicate_score
            triggered_rules.append("duplicate_transaction")
            rule_details["duplicate_transaction"] = {
                "score": duplicate_score
            }
        
        # Rule 6: Account age check
        account_age_days = (datetime.now(timezone.utc) - account.created_at).days
        if account_age_days < self.rules["account_age"]["min_days"]:
            rule_score = self.rules["account_age"]["weight"]
            fraud_score += rule_score
            triggered_rules.append("new_account")
            rule_details["new_account"] = {
                "account_age_days": account_age_days,
                "min_days": self.rules["account_age"]["min_days"],
                "score": rule_score
            }
        
        # Normalize score to 0-1 range
        fraud_score = min(fraud_score, 1.0)
        
        return FraudRuleResult(
            fraud_score=fraud_score,
            triggered_rules=triggered_rules,
            rule_details=rule_details,
            risk_level=self._get_risk_level(fraud_score)
        )
    
    async def _check_transaction_velocity(self, db: AsyncSession, account_id: str, transaction_time: datetime) -> float:
        """Check transaction velocity"""
        time_window_start = transaction_time - timedelta(seconds=self.rules["velocity_check"]["time_window"])
        
        result = await db.execute(
            select(func.count(Transaction.id))
            .where(
                and_(
                    Transaction.account_id == account_id,
                    Transaction.created_at >= time_window_start,
                    Transaction.created_at <= transaction_time
                )
            )
        )
        
        transaction_count = result.scalar() or 0
        max_transactions = self.rules["velocity_check"]["max_transactions"]
        
        if transaction_count >= max_transactions:
            # Scale score based on how much the limit is exceeded
            excess_ratio = transaction_count / max_transactions
            return min(self.rules["velocity_check"]["weight"] * excess_ratio, 1.0)
        
        return 0.0
    
    async def _check_duplicate_transaction(self, db: AsyncSession, account_id: str, amount: Decimal, transaction_time: datetime) -> float:
        """Check for duplicate transactions"""
        time_window_start = transaction_time - timedelta(seconds=self.rules["duplicate_transaction"]["time_window"])
        
        result = await db.execute(
            select(func.count(Transaction.id))
            .where(
                and_(
                    Transaction.account_id == account_id,
                    Transaction.amount == amount,
                    Transaction.created_at >= time_window_start,
                    Transaction.created_at <= transaction_time
                )
            )
        )
        
        duplicate_count = result.scalar() or 0
        
        if duplicate_count > 0:
            return self.rules["duplicate_transaction"]["weight"]
        
        return 0.0
    
    def _get_risk_level(self, fraud_score: float) -> str:
        """Determine risk level based on fraud score"""
        if fraud_score >= 0.8:
            return "critical"
        elif fraud_score >= 0.6:
            return "high"
        elif fraud_score >= 0.4:
            return "medium"
        elif fraud_score >= 0.2:
            return "low"
        else:
            return "minimal"


class MLFraudDetector:
    """Machine Learning fraud detection using Isolation Forest"""
    
    def __init__(self):
        self.model = IsolationForest(
            contamination=0.1,  # Assume 10% fraud rate
            random_state=42,
            n_estimators=100
        )
        self.scaler = StandardScaler()
        self.is_trained = False
    
    async def train_model(self, db: AsyncSession):
        """Train the ML model with historical transaction data"""
        try:
            # Get historical transactions for training
            result = await db.execute(
                select(Transaction, Account, User)
                .join(Account, Transaction.account_id == Account.id)
                .join(User, Account.user_id == User.id)
                .where(Transaction.created_at >= datetime.now(timezone.utc) - timedelta(days=90))
                .limit(10000)
            )
            
            transactions = result.all()
            
            if len(transactions) < 100:
                logger.warning("Insufficient training data for ML model")
                return False
            
            # Extract features
            features = []
            for transaction, account, user in transactions:
                feature_vector = self._extract_features(transaction, account, user)
                features.append(feature_vector)
            
            features_array = np.array(features)
            
            # Scale features
            features_scaled = self.scaler.fit_transform(features_array)
            
            # Train model
            self.model.fit(features_scaled)
            self.is_trained = True
            
            logger.info("ML fraud detection model trained successfully", 
                       training_samples=len(features))
            return True
            
        except Exception as e:
            logger.error("Failed to train ML model", error=str(e))
            return False
    
    async def predict_fraud(self, db: AsyncSession, transaction_data: Dict[str, Any], account: Account, user: User) -> float:
        """Predict fraud probability using ML model"""
        
        if not self.is_trained:
            # Attempt to train model
            await self.train_model(db)
            if not self.is_trained:
                return 0.0  # Return neutral score if model can't be trained
        
        try:
            # Create mock transaction object for feature extraction
            mock_transaction = type('Transaction', (), {
                'amount': Decimal(str(transaction_data.get('amount', 0))),
                'transaction_type': transaction_data.get('transaction_type', 'transfer'),
                'created_at': datetime.fromisoformat(transaction_data.get('timestamp', datetime.now(timezone.utc).isoformat())),
                'description': transaction_data.get('description', ''),
                'destination_account_number': transaction_data.get('destination_account_number')
            })()
            
            # Extract features
            feature_vector = self._extract_features(mock_transaction, account, user)
            feature_array = np.array([feature_vector])
            
            # Scale features
            feature_scaled = self.scaler.transform(feature_array)
            
            # Get anomaly score
            anomaly_score = self.model.decision_function(feature_scaled)[0]
            
            # Convert to fraud probability (0-1)
            # Isolation Forest returns negative scores for anomalies
            fraud_probability = max(0, min(1, (0.5 - anomaly_score) / 1.0))
            
            return fraud_probability
            
        except Exception as e:
            logger.error("ML fraud prediction failed", error=str(e))
            return 0.0
    
    def _extract_features(self, transaction, account, user) -> List[float]:
        """Extract features for ML model"""
        features = []
        
        # Transaction features
        features.append(float(transaction.amount))
        features.append(transaction.created_at.hour)
        features.append(transaction.created_at.weekday())
        features.append(len(transaction.description or ""))
        
        # Transaction type encoding
        tx_type_encoding = {
            'credit': 0, 'debit': 1, 'transfer': 2, 
            'deposit': 3, 'withdrawal': 4
        }
        features.append(tx_type_encoding.get(transaction.transaction_type, 0))
        
        # Account features
        features.append(float(account.balance))
        features.append((datetime.now(timezone.utc) - account.created_at).days)
        features.append(float(account.daily_limit))
        
        # Account type encoding
        acc_type_encoding = {
            'savings': 0, 'current': 1, 'fixed_deposit': 2, 'business': 3
        }
        features.append(acc_type_encoding.get(account.account_type, 0))
        
        # User features
        features.append((datetime.now(timezone.utc) - user.created_at).days)
        features.append(1 if user.is_verified else 0)
        features.append(1 if user.kyc_status == 'completed' else 0)
        
        # Destination features (for transfers)
        if hasattr(transaction, 'destination_account_number') and transaction.destination_account_number:
            features.append(1)  # Has destination
            features.append(len(transaction.destination_account_number))
        else:
            features.append(0)  # No destination
            features.append(0)
        
        return features


class GNNFraudDetector:
    """Graph Neural Network fraud detection (placeholder for future implementation)"""
    
    def __init__(self):
        self.gnn_service_url = settings.FRAUD_DETECTION_URL
    
    async def predict_fraud_gnn(self, transaction_data: Dict[str, Any]) -> float:
        """Predict fraud using GNN model"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{self.gnn_service_url}/predict",
                    json=transaction_data
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("fraud_score", 0.0)
                else:
                    logger.warning("GNN service unavailable", status_code=response.status_code)
                    return 0.0
                    
        except Exception as e:
            logger.error("GNN fraud prediction failed", error=str(e))
            return 0.0


class FraudService:
    """Comprehensive fraud detection service"""
    
    def __init__(self):
        self.rule_detector = RuleBasedDetector()
        self.ml_detector = MLFraudDetector()
        self.gnn_detector = GNNFraudDetector()
        self.fraud_threshold = settings.FRAUD_DETECTION_THRESHOLD
    
    async def check_transaction(self, db: AsyncSession, transaction_data: FraudCheckRequest) -> FraudCheckResponse:
        """Comprehensive fraud check using hybrid approach"""
        
        # Get account and user
        account_result = await db.execute(
            select(Account, User)
            .join(User, Account.user_id == User.id)
            .where(Account.id == transaction_data.account_id)
        )
        
        account_user = account_result.first()
        if not account_user:
            raise ValueError("Account not found")
        
        account, user = account_user
        
        # Convert request to dict for processing
        tx_data = {
            "amount": float(transaction_data.amount),
            "transaction_type": transaction_data.transaction_type,
            "description": transaction_data.description,
            "destination_account_number": transaction_data.destination_account_number,
            "timestamp": transaction_data.timestamp.isoformat() if transaction_data.timestamp else datetime.now(timezone.utc).isoformat()
        }
        
        # Run parallel fraud checks
        rule_result = await self.rule_detector.check_transaction(db, tx_data, account)
        ml_score = await self.ml_detector.predict_fraud(db, tx_data, account, user)
        gnn_score = await self.gnn_detector.predict_fraud_gnn(tx_data)
        
        # Combine scores using weighted ensemble
        weights = {
            "rules": 0.4,
            "ml": 0.35,
            "gnn": 0.25
        }
        
        combined_score = (
            rule_result.fraud_score * weights["rules"] +
            ml_score * weights["ml"] +
            gnn_score * weights["gnn"]
        )
        
        # Determine final decision
        is_fraud = combined_score >= self.fraud_threshold
        risk_level = self._get_combined_risk_level(combined_score)
        
        # Create fraud alert if high risk
        if combined_score >= 0.6:  # Alert threshold
            await self._create_fraud_alert(
                db, 
                transaction_data.account_id, 
                user.id, 
                combined_score,
                {
                    "rule_result": rule_result.dict(),
                    "ml_score": ml_score,
                    "gnn_score": gnn_score,
                    "combined_score": combined_score
                }
            )
        
        logger.info("Fraud check completed",
                   account_id=transaction_data.account_id,
                   fraud_score=combined_score,
                   is_fraud=is_fraud,
                   risk_level=risk_level)
        
        return FraudCheckResponse(
            transaction_id=transaction_data.transaction_id,
            fraud_score=combined_score,
            is_fraud=is_fraud,
            risk_level=risk_level,
            rule_results=rule_result,
            ml_score=ml_score,
            gnn_score=gnn_score,
            recommendation="block" if is_fraud else "allow",
            details={
                "weights_used": weights,
                "threshold": self.fraud_threshold,
                "processing_time": datetime.now(timezone.utc).isoformat()
            }
        )
    
    async def get_fraud_alerts(self, db: AsyncSession, user_id: Optional[str] = None, limit: int = 50) -> List[FraudAlertResponse]:
        """Get fraud alerts"""
        
        query = select(FraudAlert, Transaction, User).join(
            Transaction, FraudAlert.transaction_id == Transaction.id
        ).join(
            User, FraudAlert.user_id == User.id
        ).order_by(FraudAlert.created_at.desc()).limit(limit)
        
        if user_id:
            query = query.where(FraudAlert.user_id == user_id)
        
        result = await db.execute(query)
        alerts = result.all()
        
        return [
            FraudAlertResponse(
                id=alert.id,
                transaction_id=alert.transaction_id,
                user_id=alert.user_id,
                alert_type=alert.alert_type,
                severity=alert.severity,
                fraud_score=alert.fraud_score,
                status=alert.status,
                created_at=alert.created_at,
                transaction_amount=transaction.amount,
                transaction_description=transaction.description,
                user_email=user.email
            )
            for alert, transaction, user in alerts
        ]
    
    async def _create_fraud_alert(self, db: AsyncSession, account_id: str, user_id: str, fraud_score: float, detection_details: Dict[str, Any]):
        """Create fraud alert"""
        
        # Determine severity based on score
        if fraud_score >= 0.9:
            severity = "critical"
        elif fraud_score >= 0.7:
            severity = "high"
        elif fraud_score >= 0.5:
            severity = "medium"
        else:
            severity = "low"
        
        fraud_alert = FraudAlert(
            transaction_id=None,  # Will be set when transaction is created
            user_id=user_id,
            alert_type="transaction_fraud",
            severity=severity,
            fraud_score=fraud_score,
            detection_rules=detection_details,
            status="open"
        )
        
        db.add(fraud_alert)
        await db.commit()
        
        logger.info("Fraud alert created",
                   user_id=user_id,
                   severity=severity,
                   fraud_score=fraud_score)
    
    def _get_combined_risk_level(self, combined_score: float) -> str:
        """Get risk level for combined score"""
        if combined_score >= 0.8:
            return "critical"
        elif combined_score >= 0.6:
            return "high"
        elif combined_score >= 0.4:
            return "medium"
        elif combined_score >= 0.2:
            return "low"
        else:
            return "minimal"


# Global fraud service instance
fraud_service = FraudService()
