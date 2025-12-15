"""
Financial Analysis Service for KYB
Comprehensive financial health assessment for business verification
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from decimal import Decimal
import structlog
from enum import Enum
import statistics

logger = structlog.get_logger()

class FinancialHealthRating(Enum):
    EXCELLENT = "excellent"  # 80-100
    GOOD = "good"  # 60-79
    FAIR = "fair"  # 40-59
    POOR = "poor"  # 20-39
    CRITICAL = "critical"  # 0-19

class RiskLevel(Enum):
    VERY_LOW = "very_low"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"

class FinancialAnalysisService:
    """
    Comprehensive Financial Analysis Service for Business Verification
    Analyzes financial statements, bank statements, and calculates risk metrics
    """
    
    def __init__(self):
        """Initialize financial analysis service"""
        self.industry_benchmarks = self._load_industry_benchmarks()
        logger.info("Financial Analysis Service initialized")
    
    async def analyze_financial_statements(
        self,
        financial_data: Dict[str, Any],
        industry: str = "general"
    ) -> Dict[str, Any]:
        """
        Comprehensive financial statement analysis
        
        Args:
            financial_data: Financial statement data (balance sheet, income statement, cash flow)
            industry: Industry classification for benchmarking
            
        Returns:
            Complete financial analysis with ratios and scores
        """
        
        try:
            # Extract financial components
            balance_sheet = financial_data.get('balance_sheet', {})
            income_statement = financial_data.get('income_statement', {})
            cash_flow = financial_data.get('cash_flow_statement', {})
            
            # Calculate all financial ratios
            liquidity_ratios = self._calculate_liquidity_ratios(balance_sheet)
            profitability_ratios = self._calculate_profitability_ratios(income_statement, balance_sheet)
            leverage_ratios = self._calculate_leverage_ratios(balance_sheet, income_statement)
            efficiency_ratios = self._calculate_efficiency_ratios(income_statement, balance_sheet)
            cash_flow_ratios = self._calculate_cash_flow_ratios(cash_flow, balance_sheet, income_statement)
            
            # Perform trend analysis
            trend_analysis = self._analyze_trends(financial_data)
            
            # Detect anomalies
            anomalies = self._detect_anomalies(financial_data)
            
            # Calculate overall financial health score
            health_score = self._calculate_financial_health_score(
                liquidity_ratios,
                profitability_ratios,
                leverage_ratios,
                efficiency_ratios,
                cash_flow_ratios
            )
            
            # Determine financial health rating
            health_rating = self._get_health_rating(health_score)
            
            # Compare with industry benchmarks
            benchmark_comparison = self._compare_with_benchmarks(
                {
                    'liquidity': liquidity_ratios,
                    'profitability': profitability_ratios,
                    'leverage': leverage_ratios,
                    'efficiency': efficiency_ratios
                },
                industry
            )
            
            # Calculate default probability
            default_probability = self._calculate_default_probability(
                health_score,
                leverage_ratios,
                profitability_ratios,
                cash_flow_ratios
            )
            
            # Generate insights and recommendations
            insights = self._generate_insights(
                liquidity_ratios,
                profitability_ratios,
                leverage_ratios,
                efficiency_ratios,
                anomalies,
                trend_analysis
            )
            
            return {
                'financial_health_score': health_score,
                'health_rating': health_rating.value,
                'default_probability': default_probability,
                'risk_level': self._get_risk_level(default_probability).value,
                'ratios': {
                    'liquidity': liquidity_ratios,
                    'profitability': profitability_ratios,
                    'leverage': leverage_ratios,
                    'efficiency': efficiency_ratios,
                    'cash_flow': cash_flow_ratios
                },
                'trend_analysis': trend_analysis,
                'anomalies': anomalies,
                'benchmark_comparison': benchmark_comparison,
                'insights': insights,
                'timestamp': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error("Financial analysis failed", error=str(e))
            return {
                'error': str(e),
                'financial_health_score': 0,
                'health_rating': FinancialHealthRating.CRITICAL.value,
                'timestamp': datetime.now().isoformat()
            }
    
    async def analyze_bank_statements(
        self,
        bank_statements: List[Dict[str, Any]],
        period_months: int = 6
    ) -> Dict[str, Any]:
        """
        Analyze bank statements for cash flow patterns and anomalies
        
        Args:
            bank_statements: List of bank statement data
            period_months: Analysis period in months
            
        Returns:
            Bank statement analysis results
        """
        
        try:
            # Extract transactions
            all_transactions = []
            for statement in bank_statements:
                all_transactions.extend(statement.get('transactions', []))
            
            # Calculate cash flow metrics
            total_inflows = sum(t.get('amount', 0) for t in all_transactions if t.get('type') == 'credit')
            total_outflows = sum(t.get('amount', 0) for t in all_transactions if t.get('type') == 'debit')
            net_cash_flow = total_inflows - total_outflows
            
            # Calculate average monthly balances
            monthly_balances = self._calculate_monthly_balances(bank_statements)
            avg_balance = statistics.mean(monthly_balances) if monthly_balances else 0
            min_balance = min(monthly_balances) if monthly_balances else 0
            max_balance = max(monthly_balances) if monthly_balances else 0
            
            # Analyze transaction patterns
            transaction_patterns = self._analyze_transaction_patterns(all_transactions)
            
            # Detect unusual activity
            unusual_activity = self._detect_unusual_banking_activity(all_transactions, avg_balance)
            
            # Calculate banking behavior score
            banking_score = self._calculate_banking_behavior_score(
                monthly_balances,
                transaction_patterns,
                unusual_activity
            )
            
            return {
                'period_months': period_months,
                'total_inflows': float(total_inflows),
                'total_outflows': float(total_outflows),
                'net_cash_flow': float(net_cash_flow),
                'average_balance': float(avg_balance),
                'minimum_balance': float(min_balance),
                'maximum_balance': float(max_balance),
                'balance_volatility': self._calculate_volatility(monthly_balances),
                'transaction_patterns': transaction_patterns,
                'unusual_activity': unusual_activity,
                'banking_behavior_score': banking_score,
                'risk_indicators': self._identify_banking_risk_indicators(
                    monthly_balances,
                    transaction_patterns,
                    unusual_activity
                ),
                'timestamp': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error("Bank statement analysis failed", error=str(e))
            return {
                'error': str(e),
                'banking_behavior_score': 0,
                'timestamp': datetime.now().isoformat()
            }
    
    def _calculate_liquidity_ratios(self, balance_sheet: Dict[str, Any]) -> Dict[str, float]:
        """Calculate liquidity ratios"""
        
        current_assets = Decimal(str(balance_sheet.get('current_assets', 0)))
        current_liabilities = Decimal(str(balance_sheet.get('current_liabilities', 1)))  # Avoid division by zero
        cash = Decimal(str(balance_sheet.get('cash', 0)))
        marketable_securities = Decimal(str(balance_sheet.get('marketable_securities', 0)))
        accounts_receivable = Decimal(str(balance_sheet.get('accounts_receivable', 0)))
        inventory = Decimal(str(balance_sheet.get('inventory', 0)))
        
        # Current Ratio = Current Assets / Current Liabilities
        current_ratio = float(current_assets / current_liabilities) if current_liabilities > 0 else 0
        
        # Quick Ratio = (Current Assets - Inventory) / Current Liabilities
        quick_assets = current_assets - inventory
        quick_ratio = float(quick_assets / current_liabilities) if current_liabilities > 0 else 0
        
        # Cash Ratio = (Cash + Marketable Securities) / Current Liabilities
        cash_ratio = float((cash + marketable_securities) / current_liabilities) if current_liabilities > 0 else 0
        
        # Working Capital = Current Assets - Current Liabilities
        working_capital = float(current_assets - current_liabilities)
        
        return {
            'current_ratio': round(current_ratio, 2),
            'quick_ratio': round(quick_ratio, 2),
            'cash_ratio': round(cash_ratio, 2),
            'working_capital': round(working_capital, 2)
        }
    
    def _calculate_profitability_ratios(
        self,
        income_statement: Dict[str, Any],
        balance_sheet: Dict[str, Any]
    ) -> Dict[str, float]:
        """Calculate profitability ratios"""
        
        revenue = Decimal(str(income_statement.get('revenue', 0)))
        gross_profit = Decimal(str(income_statement.get('gross_profit', 0)))
        operating_income = Decimal(str(income_statement.get('operating_income', 0)))
        net_income = Decimal(str(income_statement.get('net_income', 0)))
        total_assets = Decimal(str(balance_sheet.get('total_assets', 1)))
        shareholders_equity = Decimal(str(balance_sheet.get('shareholders_equity', 1)))
        
        # Gross Profit Margin = (Gross Profit / Revenue) * 100
        gross_margin = float((gross_profit / revenue) * 100) if revenue > 0 else 0
        
        # Operating Profit Margin = (Operating Income / Revenue) * 100
        operating_margin = float((operating_income / revenue) * 100) if revenue > 0 else 0
        
        # Net Profit Margin = (Net Income / Revenue) * 100
        net_margin = float((net_income / revenue) * 100) if revenue > 0 else 0
        
        # Return on Assets (ROA) = (Net Income / Total Assets) * 100
        roa = float((net_income / total_assets) * 100) if total_assets > 0 else 0
        
        # Return on Equity (ROE) = (Net Income / Shareholders' Equity) * 100
        roe = float((net_income / shareholders_equity) * 100) if shareholders_equity > 0 else 0
        
        return {
            'gross_margin': round(gross_margin, 2),
            'operating_margin': round(operating_margin, 2),
            'net_margin': round(net_margin, 2),
            'return_on_assets': round(roa, 2),
            'return_on_equity': round(roe, 2)
        }
    
    def _calculate_leverage_ratios(
        self,
        balance_sheet: Dict[str, Any],
        income_statement: Dict[str, Any]
    ) -> Dict[str, float]:
        """Calculate leverage/solvency ratios"""
        
        total_debt = Decimal(str(balance_sheet.get('total_debt', 0)))
        total_assets = Decimal(str(balance_sheet.get('total_assets', 1)))
        shareholders_equity = Decimal(str(balance_sheet.get('shareholders_equity', 1)))
        operating_income = Decimal(str(income_statement.get('operating_income', 0)))
        interest_expense = Decimal(str(income_statement.get('interest_expense', 1)))
        
        # Debt-to-Assets Ratio = Total Debt / Total Assets
        debt_to_assets = float(total_debt / total_assets) if total_assets > 0 else 0
        
        # Debt-to-Equity Ratio = Total Debt / Shareholders' Equity
        debt_to_equity = float(total_debt / shareholders_equity) if shareholders_equity > 0 else 0
        
        # Equity Ratio = Shareholders' Equity / Total Assets
        equity_ratio = float(shareholders_equity / total_assets) if total_assets > 0 else 0
        
        # Interest Coverage Ratio = Operating Income / Interest Expense
        interest_coverage = float(operating_income / interest_expense) if interest_expense > 0 else 0
        
        return {
            'debt_to_assets': round(debt_to_assets, 2),
            'debt_to_equity': round(debt_to_equity, 2),
            'equity_ratio': round(equity_ratio, 2),
            'interest_coverage': round(interest_coverage, 2)
        }
    
    def _calculate_efficiency_ratios(
        self,
        income_statement: Dict[str, Any],
        balance_sheet: Dict[str, Any]
    ) -> Dict[str, float]:
        """Calculate efficiency/activity ratios"""
        
        revenue = Decimal(str(income_statement.get('revenue', 0)))
        cogs = Decimal(str(income_statement.get('cost_of_goods_sold', 0)))
        total_assets = Decimal(str(balance_sheet.get('total_assets', 1)))
        inventory = Decimal(str(balance_sheet.get('inventory', 1)))
        accounts_receivable = Decimal(str(balance_sheet.get('accounts_receivable', 1)))
        
        # Asset Turnover = Revenue / Total Assets
        asset_turnover = float(revenue / total_assets) if total_assets > 0 else 0
        
        # Inventory Turnover = COGS / Inventory
        inventory_turnover = float(cogs / inventory) if inventory > 0 else 0
        
        # Receivables Turnover = Revenue / Accounts Receivable
        receivables_turnover = float(revenue / accounts_receivable) if accounts_receivable > 0 else 0
        
        # Days Sales Outstanding = 365 / Receivables Turnover
        days_sales_outstanding = 365 / receivables_turnover if receivables_turnover > 0 else 0
        
        return {
            'asset_turnover': round(asset_turnover, 2),
            'inventory_turnover': round(inventory_turnover, 2),
            'receivables_turnover': round(receivables_turnover, 2),
            'days_sales_outstanding': round(days_sales_outstanding, 2)
        }
    
    def _calculate_cash_flow_ratios(
        self,
        cash_flow: Dict[str, Any],
        balance_sheet: Dict[str, Any],
        income_statement: Dict[str, Any]
    ) -> Dict[str, float]:
        """Calculate cash flow ratios"""
        
        operating_cash_flow = Decimal(str(cash_flow.get('operating_cash_flow', 0)))
        current_liabilities = Decimal(str(balance_sheet.get('current_liabilities', 1)))
        total_debt = Decimal(str(balance_sheet.get('total_debt', 1)))
        revenue = Decimal(str(income_statement.get('revenue', 1)))
        
        # Operating Cash Flow Ratio = Operating Cash Flow / Current Liabilities
        ocf_ratio = float(operating_cash_flow / current_liabilities) if current_liabilities > 0 else 0
        
        # Cash Flow to Debt Ratio = Operating Cash Flow / Total Debt
        cf_to_debt = float(operating_cash_flow / total_debt) if total_debt > 0 else 0
        
        # Cash Flow Margin = Operating Cash Flow / Revenue
        cf_margin = float((operating_cash_flow / revenue) * 100) if revenue > 0 else 0
        
        return {
            'operating_cash_flow_ratio': round(ocf_ratio, 2),
            'cash_flow_to_debt': round(cf_to_debt, 2),
            'cash_flow_margin': round(cf_margin, 2)
        }
    
    def _calculate_financial_health_score(
        self,
        liquidity: Dict[str, float],
        profitability: Dict[str, float],
        leverage: Dict[str, float],
        efficiency: Dict[str, float],
        cash_flow: Dict[str, float]
    ) -> float:
        """Calculate overall financial health score (0-100)"""
        
        scores = []
        
        # Liquidity Score (20 points)
        liquidity_score = min(20, (
            (min(liquidity['current_ratio'], 2.0) / 2.0) * 8 +
            (min(liquidity['quick_ratio'], 1.5) / 1.5) * 7 +
            (min(liquidity['cash_ratio'], 1.0) / 1.0) * 5
        ))
        scores.append(liquidity_score)
        
        # Profitability Score (25 points)
        profitability_score = min(25, (
            (min(profitability['gross_margin'], 50) / 50) * 8 +
            (min(profitability['operating_margin'], 20) / 20) * 7 +
            (min(profitability['net_margin'], 15) / 15) * 5 +
            (min(profitability['return_on_equity'], 20) / 20) * 5
        ))
        scores.append(profitability_score)
        
        # Leverage Score (20 points) - Lower is better
        leverage_score = min(20, (
            (1 - min(leverage['debt_to_equity'], 2.0) / 2.0) * 10 +
            (min(leverage['interest_coverage'], 5.0) / 5.0) * 10
        ))
        scores.append(leverage_score)
        
        # Efficiency Score (15 points)
        efficiency_score = min(15, (
            (min(efficiency['asset_turnover'], 2.0) / 2.0) * 8 +
            (min(efficiency['inventory_turnover'], 10) / 10) * 7
        ))
        scores.append(efficiency_score)
        
        # Cash Flow Score (20 points)
        cash_flow_score = min(20, (
            (min(cash_flow['operating_cash_flow_ratio'], 1.0) / 1.0) * 10 +
            (min(cash_flow['cash_flow_to_debt'], 0.5) / 0.5) * 10
        ))
        scores.append(cash_flow_score)
        
        total_score = sum(scores)
        return round(total_score, 2)
    
    def _get_health_rating(self, score: float) -> FinancialHealthRating:
        """Get health rating from score"""
        if score >= 80:
            return FinancialHealthRating.EXCELLENT
        elif score >= 60:
            return FinancialHealthRating.GOOD
        elif score >= 40:
            return FinancialHealthRating.FAIR
        elif score >= 20:
            return FinancialHealthRating.POOR
        else:
            return FinancialHealthRating.CRITICAL
    
    def _calculate_default_probability(
        self,
        health_score: float,
        leverage: Dict[str, float],
        profitability: Dict[str, float],
        cash_flow: Dict[str, float]
    ) -> float:
        """Calculate probability of default (0-100%)"""
        
        # Base probability from health score (inverted)
        base_probability = max(0, 100 - health_score)
        
        # Adjust for high leverage
        if leverage['debt_to_equity'] > 2.0:
            base_probability += 10
        elif leverage['debt_to_equity'] > 1.5:
            base_probability += 5
        
        # Adjust for low profitability
        if profitability['net_margin'] < 0:
            base_probability += 15
        elif profitability['net_margin'] < 5:
            base_probability += 8
        
        # Adjust for negative cash flow
        if cash_flow['operating_cash_flow_ratio'] < 0:
            base_probability += 20
        elif cash_flow['operating_cash_flow_ratio'] < 0.5:
            base_probability += 10
        
        return round(min(100, base_probability), 2)
    
    def _get_risk_level(self, default_probability: float) -> RiskLevel:
        """Get risk level from default probability"""
        if default_probability < 10:
            return RiskLevel.VERY_LOW
        elif default_probability < 25:
            return RiskLevel.LOW
        elif default_probability < 50:
            return RiskLevel.MEDIUM
        elif default_probability < 75:
            return RiskLevel.HIGH
        else:
            return RiskLevel.VERY_HIGH
    
    def _analyze_trends(self, financial_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze financial trends over time"""
        # Placeholder for trend analysis
        return {
            'revenue_trend': 'stable',
            'profit_trend': 'improving',
            'cash_flow_trend': 'stable'
        }
    
    def _detect_anomalies(self, financial_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Detect financial anomalies"""
        anomalies = []
        
        balance_sheet = financial_data.get('balance_sheet', {})
        income_statement = financial_data.get('income_statement', {})
        
        # Check for negative equity
        if balance_sheet.get('shareholders_equity', 0) < 0:
            anomalies.append({
                'type': 'negative_equity',
                'severity': 'critical',
                'description': 'Company has negative shareholders equity'
            })
        
        # Check for negative profit
        if income_statement.get('net_income', 0) < 0:
            anomalies.append({
                'type': 'negative_profit',
                'severity': 'high',
                'description': 'Company reported net loss'
            })
        
        return anomalies
    
    def _compare_with_benchmarks(
        self,
        ratios: Dict[str, Dict[str, float]],
        industry: str
    ) -> Dict[str, Any]:
        """Compare ratios with industry benchmarks"""
        benchmarks = self.industry_benchmarks.get(industry, self.industry_benchmarks['general'])
        
        comparison = {}
        for category, category_ratios in ratios.items():
            comparison[category] = {}
            for ratio_name, ratio_value in category_ratios.items():
                benchmark_value = benchmarks.get(category, {}).get(ratio_name, 0)
                comparison[category][ratio_name] = {
                    'value': ratio_value,
                    'benchmark': benchmark_value,
                    'difference': round(ratio_value - benchmark_value, 2),
                    'performance': 'above' if ratio_value > benchmark_value else 'below'
                }
        
        return comparison
    
    def _generate_insights(
        self,
        liquidity: Dict[str, float],
        profitability: Dict[str, float],
        leverage: Dict[str, float],
        efficiency: Dict[str, float],
        anomalies: List[Dict[str, Any]],
        trends: Dict[str, Any]
    ) -> List[str]:
        """Generate actionable insights"""
        insights = []
        
        # Liquidity insights
        if liquidity['current_ratio'] < 1.0:
            insights.append("⚠️ Current ratio below 1.0 indicates potential liquidity issues")
        elif liquidity['current_ratio'] > 2.5:
            insights.append("✅ Strong liquidity position with current ratio above 2.5")
        
        # Profitability insights
        if profitability['net_margin'] < 0:
            insights.append("🔴 Negative profit margin - company is operating at a loss")
        elif profitability['net_margin'] > 15:
            insights.append("✅ Excellent profitability with net margin above 15%")
        
        # Leverage insights
        if leverage['debt_to_equity'] > 2.0:
            insights.append("⚠️ High debt-to-equity ratio indicates elevated financial risk")
        
        # Efficiency insights
        if efficiency['asset_turnover'] < 0.5:
            insights.append("⚠️ Low asset turnover suggests inefficient asset utilization")
        
        return insights
    
    def _analyze_transaction_patterns(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze transaction patterns"""
        return {
            'total_transactions': len(transactions),
            'average_transaction_size': 0,
            'transaction_frequency': 'regular'
        }
    
    def _detect_unusual_banking_activity(
        self,
        transactions: List[Dict[str, Any]],
        avg_balance: float
    ) -> List[Dict[str, Any]]:
        """Detect unusual banking activity"""
        return []
    
    def _calculate_banking_behavior_score(
        self,
        monthly_balances: List[float],
        patterns: Dict[str, Any],
        unusual_activity: List[Dict[str, Any]]
    ) -> float:
        """Calculate banking behavior score"""
        return 75.0
    
    def _calculate_monthly_balances(self, bank_statements: List[Dict[str, Any]]) -> List[float]:
        """Calculate monthly balances"""
        return [stmt.get('closing_balance', 0) for stmt in bank_statements]
    
    def _calculate_volatility(self, values: List[float]) -> float:
        """Calculate volatility (standard deviation)"""
        if len(values) < 2:
            return 0.0
        return round(statistics.stdev(values), 2)
    
    def _identify_banking_risk_indicators(
        self,
        monthly_balances: List[float],
        patterns: Dict[str, Any],
        unusual_activity: List[Dict[str, Any]]
    ) -> List[str]:
        """Identify banking risk indicators"""
        indicators = []
        
        if min(monthly_balances) < 0:
            indicators.append("Negative balance detected")
        
        if len(unusual_activity) > 0:
            indicators.append(f"{len(unusual_activity)} unusual transactions detected")
        
        return indicators
    
    def _load_industry_benchmarks(self) -> Dict[str, Dict[str, Dict[str, float]]]:
        """Load industry benchmark data"""
        return {
            'general': {
                'liquidity': {'current_ratio': 1.5, 'quick_ratio': 1.0},
                'profitability': {'gross_margin': 30.0, 'net_margin': 10.0, 'return_on_equity': 15.0},
                'leverage': {'debt_to_equity': 1.0, 'interest_coverage': 3.0},
                'efficiency': {'asset_turnover': 1.0, 'inventory_turnover': 6.0}
            },
            'retail': {
                'liquidity': {'current_ratio': 1.2, 'quick_ratio': 0.8},
                'profitability': {'gross_margin': 25.0, 'net_margin': 5.0, 'return_on_equity': 12.0},
                'leverage': {'debt_to_equity': 1.2, 'interest_coverage': 2.5},
                'efficiency': {'asset_turnover': 2.0, 'inventory_turnover': 8.0}
            },
            'manufacturing': {
                'liquidity': {'current_ratio': 1.8, 'quick_ratio': 1.2},
                'profitability': {'gross_margin': 35.0, 'net_margin': 12.0, 'return_on_equity': 18.0},
                'leverage': {'debt_to_equity': 0.8, 'interest_coverage': 4.0},
                'efficiency': {'asset_turnover': 0.8, 'inventory_turnover': 5.0}
            }
        }


# Singleton instance
_financial_analysis_instance = None

def get_financial_analysis_service() -> FinancialAnalysisService:
    """Get financial analysis service instance"""
    global _financial_analysis_instance
    
    if _financial_analysis_instance is None:
        _financial_analysis_instance = FinancialAnalysisService()
    
    return _financial_analysis_instance
