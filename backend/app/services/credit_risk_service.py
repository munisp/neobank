"""
Enhanced Credit Risk Scoring Engine
Advanced credit risk assessment integrating Nigerian banking context
Implements MCMC-based risk modeling with ML/AI components
"""

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Tuple, Any, Optional, Union
import asyncio
import json
import logging
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
import pickle
import os
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import accuracy_score, roc_auc_score
import xgboost as xgb
import lightgbm as lgb
from sqlalchemy.ext.asyncio import AsyncSession
from database.models import User, Account, Transaction
from config.settings import settings

logger = logging.getLogger(__name__)

class RiskCategory(Enum):
    VERY_LOW = "very_low"
    LOW = "low" 
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"

class CreditDecision(Enum):
    APPROVE = "approve"
    CONDITIONAL_APPROVE = "conditional_approve"
    DECLINE = "decline"
    MANUAL_REVIEW = "manual_review"

@dataclass
class CreditRiskProfile:
    """Comprehensive credit risk profile"""
    user_id: str
    credit_score: float
    risk_category: RiskCategory
    credit_decision: CreditDecision
    risk_factors: Dict[str, float]
    behavioral_score: float
    financial_stability_score: float
    transaction_pattern_score: float
    external_data_score: Optional[float]
    mcmc_probability: float
    confidence_interval: Tuple[float, float]
    recommendation: str
    explanation: str
    credit_limit_suggestion: float
    interest_rate_suggestion: float
    monitoring_requirements: List[str]
    processing_time: float
    model_version: str = "2.0"

@dataclass
class FinancialFeatures:
    """Financial features for credit assessment"""
    monthly_income: Optional[float] = None
    account_balance: float = 0.0
    average_balance: float = 0.0
    transaction_volume: float = 0.0
    savings_rate: float = 0.0
    debt_to_income_ratio: float = 0.0
    payment_history_score: float = 0.0
    account_age_days: int = 0
    transaction_frequency: float = 0.0
    largest_transaction: float = 0.0
    spending_volatility: float = 0.0

class CreditRiskNeuralNetwork(nn.Module):
    """Neural network for credit risk assessment"""
    
    def __init__(self, input_dim: int = 20, hidden_dims: List[int] = [128, 64, 32]):
        super(CreditRiskNeuralNetwork, self).__init__()
        
        layers = []
        prev_dim = input_dim
        
        for hidden_dim in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, hidden_dim),
                nn.ReLU(),
                nn.BatchNorm1d(hidden_dim),
                nn.Dropout(0.3)
            ])
            prev_dim = hidden_dim
        
        # Output layer for probability
        layers.append(nn.Linear(prev_dim, 1))
        layers.append(nn.Sigmoid())
        
        self.network = nn.Sequential(*layers)
    
    def forward(self, x):
        return self.network(x)

class MCMCCreditRiskEngine:
    """
    MCMC-based Credit Risk Assessment Engine
    Implements Markov Chain Monte Carlo methods for risk modeling
    """
    
    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.encoders = {}
        self.feature_importance = {}
        self.model_loaded = False
        self.mcmc_chains = {}
        
        # Nigerian banking context parameters
        self.nigerian_factors = {
            'minimum_wage': 30000,  # NGN
            'inflation_rate': 0.15,
            'bank_rate': 0.135,
            'risk_free_rate': 0.12,
            'currency_volatility': 0.25
        }
        
        # Risk thresholds
        self.risk_thresholds = {
            RiskCategory.VERY_LOW: (0.0, 0.2),
            RiskCategory.LOW: (0.2, 0.4),
            RiskCategory.MEDIUM: (0.4, 0.6),
            RiskCategory.HIGH: (0.6, 0.8),
            RiskCategory.VERY_HIGH: (0.8, 1.0)
        }
    
    async def initialize(self):
        """Initialize the credit risk engine"""
        try:
            await self._load_models()
            await self._initialize_mcmc_chains()
            logger.info("Credit Risk Engine initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize credit risk engine: {e}")
            raise
    
    async def _load_models(self):
        """Load pre-trained models"""
        try:
            # Initialize models
            self.models['neural_network'] = CreditRiskNeuralNetwork()
            self.models['random_forest'] = RandomForestClassifier(n_estimators=100, random_state=42)
            self.models['xgboost'] = xgb.XGBClassifier(random_state=42)
            self.models['lightgbm'] = lgb.LGBMClassifier(random_state=42)
            
            # Initialize scalers
            self.scalers['standard'] = StandardScaler()
            
            # Try to load pre-trained weights
            model_path = "/app/models/credit_risk_models.pkl"
            if os.path.exists(model_path):
                with open(model_path, 'rb') as f:
                    saved_models = pickle.load(f)
                    self.models.update(saved_models)
                logger.info("Pre-trained models loaded successfully")
            
            self.model_loaded = True
            
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            # Continue with default models
    
    async def _initialize_mcmc_chains(self):
        """Initialize MCMC chains for risk modeling"""
        try:
            # Initialize MCMC parameters
            self.mcmc_chains = {
                'default_probability': {
                    'chain': [],
                    'current_state': 0.05,  # 5% default rate
                    'proposal_std': 0.01
                },
                'recovery_rate': {
                    'chain': [],
                    'current_state': 0.4,   # 40% recovery rate
                    'proposal_std': 0.05
                },
                'economic_factor': {
                    'chain': [],
                    'current_state': 1.0,   # Neutral economic conditions
                    'proposal_std': 0.1
                }
            }
            
            # Run initial burn-in
            await self._mcmc_burn_in()
            
        except Exception as e:
            logger.error(f"Error initializing MCMC chains: {e}")
    
    async def _mcmc_burn_in(self, n_samples: int = 1000):
        """Run MCMC burn-in phase"""
        for _ in range(n_samples):
            await self._mcmc_step()
    
    async def _mcmc_step(self):
        """Single MCMC step for all chains"""
        for chain_name, chain_data in self.mcmc_chains.items():
            current_state = chain_data['current_state']
            proposal_std = chain_data['proposal_std']
            
            # Propose new state
            proposal = np.random.normal(current_state, proposal_std)
            
            # Apply bounds
            if chain_name == 'default_probability':
                proposal = np.clip(proposal, 0.001, 0.5)
            elif chain_name == 'recovery_rate':
                proposal = np.clip(proposal, 0.1, 0.9)
            elif chain_name == 'economic_factor':
                proposal = np.clip(proposal, 0.5, 2.0)
            
            # Calculate acceptance probability (simplified)
            log_ratio = self._log_posterior(proposal, chain_name) - self._log_posterior(current_state, chain_name)
            acceptance_prob = min(1.0, np.exp(log_ratio))
            
            # Accept or reject
            if np.random.random() < acceptance_prob:
                chain_data['current_state'] = proposal
            
            # Store sample
            chain_data['chain'].append(chain_data['current_state'])
            
            # Keep only recent samples
            if len(chain_data['chain']) > 10000:
                chain_data['chain'] = chain_data['chain'][-5000:]
    
    def _log_posterior(self, value: float, chain_name: str) -> float:
        """Calculate log posterior probability (simplified)"""
        # Prior distributions (simplified)
        if chain_name == 'default_probability':
            # Beta prior
            alpha, beta = 2, 20  # Prior belief: low default rate
            return (alpha - 1) * np.log(value) + (beta - 1) * np.log(1 - value)
        elif chain_name == 'recovery_rate':
            # Beta prior
            alpha, beta = 4, 6  # Prior belief: moderate recovery
            return (alpha - 1) * np.log(value) + (beta - 1) * np.log(1 - value)
        elif chain_name == 'economic_factor':
            # Normal prior
            return -0.5 * (value - 1.0) ** 2 / 0.25
        
        return 0.0
    
    async def assess_credit_risk(self, user_data: Dict[str, Any], 
                               account_data: Dict[str, Any],
                               transaction_history: List[Dict[str, Any]]) -> CreditRiskProfile:
        """
        Main credit risk assessment method
        """
        start_time = datetime.now()
        
        try:
            # Extract and engineer features
            features = await self._extract_features(user_data, account_data, transaction_history)
            
            # Get MCMC-based risk parameters
            mcmc_params = await self._get_mcmc_parameters()
            
            # Run ensemble prediction
            risk_scores = await self._ensemble_prediction(features)
            
            # Calculate final credit score
            credit_score = await self._calculate_credit_score(risk_scores, mcmc_params, features)
            
            # Determine risk category and decision
            risk_category = self._determine_risk_category(credit_score)
            credit_decision = self._make_credit_decision(credit_score, risk_category, features)
            
            # Calculate confidence interval using MCMC
            confidence_interval = self._calculate_confidence_interval(credit_score, mcmc_params)
            
            # Generate recommendations
            recommendation, explanation = self._generate_recommendation(
                credit_score, risk_category, credit_decision, features
            )
            
            # Calculate suggested credit limit and interest rate
            credit_limit = self._suggest_credit_limit(credit_score, features)
            interest_rate = self._suggest_interest_rate(credit_score, risk_category)
            
            # Determine monitoring requirements
            monitoring_requirements = self._determine_monitoring(risk_category, features)
            
            processing_time = (datetime.now() - start_time).total_seconds()
            
            # Update MCMC chains with new data
            asyncio.create_task(self._update_mcmc_with_assessment(features, credit_score))
            
            return CreditRiskProfile(
                user_id=user_data.get('id', 'unknown'),
                credit_score=credit_score,
                risk_category=risk_category,
                credit_decision=credit_decision,
                risk_factors=risk_scores,
                behavioral_score=risk_scores.get('behavioral', 0.5),
                financial_stability_score=risk_scores.get('financial_stability', 0.5),
                transaction_pattern_score=risk_scores.get('transaction_pattern', 0.5),
                external_data_score=risk_scores.get('external_data'),
                mcmc_probability=mcmc_params['default_probability'],
                confidence_interval=confidence_interval,
                recommendation=recommendation,
                explanation=explanation,
                credit_limit_suggestion=credit_limit,
                interest_rate_suggestion=interest_rate,
                monitoring_requirements=monitoring_requirements,
                processing_time=processing_time
            )
            
        except Exception as e:
            logger.error(f"Error in credit risk assessment: {e}")
            # Return conservative default
            return await self._default_risk_profile(user_data.get('id', 'unknown'))
    
    async def _extract_features(self, user_data: Dict, account_data: Dict, 
                              transaction_history: List[Dict]) -> FinancialFeatures:
        """Extract and engineer features for credit assessment"""
        
        # Basic account information
        account_balance = float(account_data.get('balance', 0))
        account_created = datetime.fromisoformat(account_data.get('created_at', datetime.now().isoformat()))
        account_age_days = (datetime.now() - account_created).days
        
        # Transaction analysis
        if transaction_history:
            amounts = [float(t.get('amount', 0)) for t in transaction_history]
            transaction_volume = sum(amounts)
            transaction_frequency = len(transaction_history) / max(account_age_days, 1) * 30  # per month
            largest_transaction = max(amounts) if amounts else 0
            spending_volatility = np.std(amounts) if len(amounts) > 1 else 0
            
            # Calculate average balance (simplified)
            average_balance = account_balance  # In production, use historical data
            
            # Savings rate estimation
            deposits = [float(t.get('amount', 0)) for t in transaction_history 
                       if t.get('transaction_type') == 'deposit']
            withdrawals = [float(t.get('amount', 0)) for t in transaction_history 
                          if t.get('transaction_type') in ['withdrawal', 'transfer']]
            
            total_deposits = sum(deposits)
            total_withdrawals = sum(withdrawals)
            savings_rate = (total_deposits - total_withdrawals) / max(total_deposits, 1)
            
        else:
            transaction_volume = 0
            transaction_frequency = 0
            largest_transaction = 0
            spending_volatility = 0
            average_balance = account_balance
            savings_rate = 0
        
        # Estimate monthly income (simplified heuristic)
        monthly_income = None
        if transaction_frequency > 0:
            # Estimate based on deposit patterns
            monthly_deposits = transaction_volume / max(account_age_days / 30, 1)
            if monthly_deposits > self.nigerian_factors['minimum_wage']:
                monthly_income = monthly_deposits
        
        return FinancialFeatures(
            monthly_income=monthly_income,
            account_balance=account_balance,
            average_balance=average_balance,
            transaction_volume=transaction_volume,
            savings_rate=max(-1, min(1, savings_rate)),  # Bound between -1 and 1
            debt_to_income_ratio=0.0,  # Would need external data
            payment_history_score=0.8,  # Default good score, would need historical data
            account_age_days=account_age_days,
            transaction_frequency=transaction_frequency,
            largest_transaction=largest_transaction,
            spending_volatility=spending_volatility
        )
    
    async def _get_mcmc_parameters(self) -> Dict[str, float]:
        """Get current MCMC parameter estimates"""
        # Run a few MCMC steps to update chains
        for _ in range(10):
            await self._mcmc_step()
        
        return {
            'default_probability': self.mcmc_chains['default_probability']['current_state'],
            'recovery_rate': self.mcmc_chains['recovery_rate']['current_state'],
            'economic_factor': self.mcmc_chains['economic_factor']['current_state']
        }
    
    async def _ensemble_prediction(self, features: FinancialFeatures) -> Dict[str, float]:
        """Ensemble prediction using multiple models"""
        
        # Convert features to numerical array
        feature_array = self._features_to_array(features)
        
        scores = {}
        
        try:
            # Behavioral score based on transaction patterns
            behavioral_score = self._calculate_behavioral_score(features)
            scores['behavioral'] = behavioral_score
            
            # Financial stability score
            financial_stability_score = self._calculate_financial_stability_score(features)
            scores['financial_stability'] = financial_stability_score
            
            # Transaction pattern score
            transaction_pattern_score = self._calculate_transaction_pattern_score(features)
            scores['transaction_pattern'] = transaction_pattern_score
            
            # If models are trained, use them
            if self.model_loaded:
                # Neural network prediction (simplified)
                nn_input = torch.tensor(feature_array, dtype=torch.float32).unsqueeze(0)
                with torch.no_grad():
                    nn_score = self.models['neural_network'](nn_input).item()
                scores['neural_network'] = nn_score
            
        except Exception as e:
            logger.error(f"Error in ensemble prediction: {e}")
            # Use default scores
            scores = {
                'behavioral': 0.5,
                'financial_stability': 0.5,
                'transaction_pattern': 0.5
            }
        
        return scores
    
    def _features_to_array(self, features: FinancialFeatures) -> np.ndarray:
        """Convert features to numerical array"""
        return np.array([
            features.account_balance / 1000000,  # Normalize
            features.average_balance / 1000000,
            features.transaction_volume / 1000000,
            features.savings_rate,
            features.debt_to_income_ratio,
            features.payment_history_score,
            features.account_age_days / 365,  # Normalize to years
            features.transaction_frequency / 30,  # Normalize to daily
            features.largest_transaction / 1000000,
            features.spending_volatility / 100000,
            features.monthly_income / 1000000 if features.monthly_income else 0
        ])
    
    def _calculate_behavioral_score(self, features: FinancialFeatures) -> float:
        """Calculate behavioral risk score"""
        score = 0.5  # Neutral starting point
        
        # Account age factor
        if features.account_age_days > 365:
            score -= 0.1  # Lower risk for older accounts
        elif features.account_age_days < 90:
            score += 0.2  # Higher risk for new accounts
        
        # Transaction frequency
        if features.transaction_frequency > 10:  # Very active
            score -= 0.1
        elif features.transaction_frequency < 1:  # Inactive
            score += 0.2
        
        # Savings behavior
        if features.savings_rate > 0.2:
            score -= 0.2  # Good saver
        elif features.savings_rate < -0.1:
            score += 0.3  # Spending more than earning
        
        return max(0, min(1, score))
    
    def _calculate_financial_stability_score(self, features: FinancialFeatures) -> float:
        """Calculate financial stability score"""
        score = 0.5
        
        # Balance stability
        if features.average_balance > 100000:  # ₦100k
            score -= 0.2
        elif features.average_balance < 10000:  # ₦10k
            score += 0.3
        
        # Income estimation
        if features.monthly_income:
            if features.monthly_income > 200000:  # ₦200k
                score -= 0.2
            elif features.monthly_income < 50000:  # ₦50k
                score += 0.2
        
        # Spending volatility
        if features.spending_volatility > 50000:  # High volatility
            score += 0.2
        elif features.spending_volatility < 10000:  # Stable spending
            score -= 0.1
        
        return max(0, min(1, score))
    
    def _calculate_transaction_pattern_score(self, features: FinancialFeatures) -> float:
        """Calculate transaction pattern risk score"""
        score = 0.5
        
        # Large transaction risk
        if features.largest_transaction > features.average_balance * 2:
            score += 0.3
        
        # Transaction volume vs balance
        if features.transaction_volume > features.average_balance * 10:
            score += 0.2  # High turnover might indicate risk
        
        return max(0, min(1, score))
    
    async def _calculate_credit_score(self, risk_scores: Dict[str, float], 
                                    mcmc_params: Dict[str, float], 
                                    features: FinancialFeatures) -> float:
        """Calculate final credit score using ensemble and MCMC"""
        
        # Weighted ensemble of risk scores
        weights = {
            'behavioral': 0.3,
            'financial_stability': 0.4,
            'transaction_pattern': 0.2,
            'neural_network': 0.1
        }
        
        ensemble_score = 0
        total_weight = 0
        
        for component, score in risk_scores.items():
            if component in weights:
                ensemble_score += weights[component] * score
                total_weight += weights[component]
        
        if total_weight > 0:
            ensemble_score /= total_weight
        
        # Adjust with MCMC parameters
        mcmc_adjustment = (
            mcmc_params['default_probability'] * 0.5 +
            (1 - mcmc_params['recovery_rate']) * 0.3 +
            (mcmc_params['economic_factor'] - 1) * 0.2
        )
        
        # Final credit score (0 = high risk, 1 = low risk)
        credit_score = 1 - ensemble_score - mcmc_adjustment
        
        # Apply Nigerian banking context adjustments
        if features.monthly_income and features.monthly_income < self.nigerian_factors['minimum_wage'] * 2:
            credit_score -= 0.1  # Higher risk for low income
        
        return max(0, min(1, credit_score))
    
    def _determine_risk_category(self, credit_score: float) -> RiskCategory:
        """Determine risk category based on credit score"""
        for category, (min_score, max_score) in self.risk_thresholds.items():
            if min_score <= (1 - credit_score) < max_score:  # Invert score for risk
                return category
        return RiskCategory.MEDIUM
    
    def _make_credit_decision(self, credit_score: float, risk_category: RiskCategory, 
                            features: FinancialFeatures) -> CreditDecision:
        """Make credit decision based on score and risk category"""
        
        if credit_score >= 0.8:
            return CreditDecision.APPROVE
        elif credit_score >= 0.6:
            # Additional checks for conditional approval
            if features.account_age_days >= 180 and features.savings_rate > 0:
                return CreditDecision.CONDITIONAL_APPROVE
            else:
                return CreditDecision.MANUAL_REVIEW
        elif credit_score >= 0.4:
            return CreditDecision.MANUAL_REVIEW
        else:
            return CreditDecision.DECLINE
    
    def _calculate_confidence_interval(self, credit_score: float, 
                                     mcmc_params: Dict[str, float]) -> Tuple[float, float]:
        """Calculate confidence interval using MCMC samples"""
        
        # Use MCMC chain samples to estimate uncertainty
        default_prob_samples = self.mcmc_chains['default_probability']['chain'][-100:]  # Last 100 samples
        
        if len(default_prob_samples) > 10:
            std_dev = np.std(default_prob_samples)
            margin = 1.96 * std_dev  # 95% confidence interval
            
            lower_bound = max(0, credit_score - margin)
            upper_bound = min(1, credit_score + margin)
        else:
            # Default uncertainty
            margin = 0.1
            lower_bound = max(0, credit_score - margin)
            upper_bound = min(1, credit_score + margin)
        
        return (lower_bound, upper_bound)
    
    def _generate_recommendation(self, credit_score: float, risk_category: RiskCategory,
                               credit_decision: CreditDecision, features: FinancialFeatures) -> Tuple[str, str]:
        """Generate recommendation and explanation"""
        
        recommendations = []
        explanations = []
        
        if credit_decision == CreditDecision.APPROVE:
            recommendations.append("Approve credit application")
            explanations.append(f"Strong credit profile with score {credit_score:.2f}")
        
        elif credit_decision == CreditDecision.CONDITIONAL_APPROVE:
            recommendations.append("Conditional approval with monitoring")
            explanations.append("Good credit profile but requires ongoing monitoring")
            
            if features.account_age_days < 365:
                explanations.append("Account is relatively new")
            
        elif credit_decision == CreditDecision.MANUAL_REVIEW:
            recommendations.append("Requires manual review")
            explanations.append("Mixed risk indicators require human assessment")
            
        else:  # DECLINE
            recommendations.append("Decline credit application")
            explanations.append("High risk profile indicates potential default")
        
        # Add specific risk factors
        if features.savings_rate < 0:
            explanations.append("Negative savings rate indicates spending exceeds income")
        
        if features.account_age_days < 90:
            explanations.append("New account with limited transaction history")
        
        return "; ".join(recommendations), "; ".join(explanations)
    
    def _suggest_credit_limit(self, credit_score: float, features: FinancialFeatures) -> float:
        """Suggest appropriate credit limit"""
        
        base_limit = 50000  # ₦50k base
        
        # Adjust based on credit score
        score_multiplier = credit_score * 10  # 0-10x multiplier
        
        # Adjust based on income
        income_multiplier = 1
        if features.monthly_income:
            income_multiplier = min(5, features.monthly_income / 100000)  # Max 5x
        
        # Adjust based on account balance
        balance_multiplier = min(3, features.average_balance / 100000)  # Max 3x
        
        suggested_limit = base_limit * score_multiplier * income_multiplier * balance_multiplier
        
        # Cap at reasonable limits
        return min(5000000, max(10000, suggested_limit))  # ₦10k - ₦5M
    
    def _suggest_interest_rate(self, credit_score: float, risk_category: RiskCategory) -> float:
        """Suggest appropriate interest rate"""
        
        base_rate = self.nigerian_factors['bank_rate']  # 13.5%
        risk_premium = {
            RiskCategory.VERY_LOW: 0.02,   # 2%
            RiskCategory.LOW: 0.05,        # 5%
            RiskCategory.MEDIUM: 0.08,     # 8%
            RiskCategory.HIGH: 0.12,       # 12%
            RiskCategory.VERY_HIGH: 0.18   # 18%
        }
        
        suggested_rate = base_rate + risk_premium.get(risk_category, 0.08)
        
        # Adjust for credit score
        score_adjustment = (1 - credit_score) * 0.05  # Up to 5% adjustment
        
        return min(0.35, suggested_rate + score_adjustment)  # Cap at 35%
    
    def _determine_monitoring(self, risk_category: RiskCategory, 
                            features: FinancialFeatures) -> List[str]:
        """Determine monitoring requirements"""
        
        monitoring = []
        
        if risk_category in [RiskCategory.HIGH, RiskCategory.VERY_HIGH]:
            monitoring.extend([
                "monthly_balance_review",
                "transaction_pattern_monitoring",
                "payment_behavior_tracking"
            ])
        
        if risk_category == RiskCategory.MEDIUM:
            monitoring.extend([
                "quarterly_review",
                "balance_threshold_alerts"
            ])
        
        if features.account_age_days < 180:
            monitoring.append("new_account_monitoring")
        
        if features.savings_rate < 0:
            monitoring.append("spending_pattern_review")
        
        return monitoring
    
    async def _update_mcmc_with_assessment(self, features: FinancialFeatures, credit_score: float):
        """Update MCMC chains with new assessment data"""
        try:
            # This would update the MCMC chains based on new data
            # For now, just run a few steps
            for _ in range(5):
                await self._mcmc_step()
        except Exception as e:
            logger.error(f"Error updating MCMC chains: {e}")
    
    async def _default_risk_profile(self, user_id: str) -> CreditRiskProfile:
        """Return conservative default risk profile"""
        return CreditRiskProfile(
            user_id=user_id,
            credit_score=0.3,
            risk_category=RiskCategory.HIGH,
            credit_decision=CreditDecision.DECLINE,
            risk_factors={'default': 0.7},
            behavioral_score=0.5,
            financial_stability_score=0.3,
            transaction_pattern_score=0.5,
            external_data_score=None,
            mcmc_probability=0.1,
            confidence_interval=(0.2, 0.4),
            recommendation="Decline due to insufficient data",
            explanation="Unable to assess risk due to system error",
            credit_limit_suggestion=0,
            interest_rate_suggestion=0.35,
            monitoring_requirements=["manual_review_required"],
            processing_time=0.1
        )

# Global instance
credit_risk_engine = MCMCCreditRiskEngine()

async def initialize_credit_risk_engine():
    """Initialize the credit risk assessment engine"""
    await credit_risk_engine.initialize()

async def assess_user_credit_risk(user_data: Dict[str, Any],
                                account_data: Dict[str, Any],
                                transaction_history: List[Dict[str, Any]]) -> CreditRiskProfile:
    """
    Main entry point for credit risk assessment
    """
    return await credit_risk_engine.assess_credit_risk(user_data, account_data, transaction_history)
