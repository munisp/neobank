"""
Lakehouse Service - Apache Iceberg Integration
Provides data lake capabilities with ACID transactions, schema evolution, and time-travel queries
"""

import logging
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from decimal import Decimal
import pandas as pd
from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import (
    NestedField, StringType, TimestampType, DecimalType,
    IntegerType, BooleanType, DoubleType, StructType
)
from pyiceberg.partitioning import PartitionSpec, PartitionField
from pyiceberg.transforms import DayTransform
import structlog

logger = structlog.get_logger(__name__)


class LakehouseService:
    """
    Lakehouse service for managing Apache Iceberg tables and data operations
    """
    
    def __init__(self, catalog_uri: str = "http://localhost:8181", warehouse: str = "s3://neobank-lakehouse"):
        """
        Initialize Lakehouse service with Iceberg catalog
        
        Args:
            catalog_uri: REST catalog endpoint
            warehouse: S3 warehouse location
        """
        self.catalog_uri = catalog_uri
        self.warehouse = warehouse
        self.namespace = "neobank"
        
        # Initialize catalog
        try:
            self.catalog = load_catalog(
                "neobank_catalog",
                **{
                    "uri": catalog_uri,
                    "warehouse": warehouse,
                    "type": "rest"
                }
            )
            logger.info("lakehouse_initialized", catalog_uri=catalog_uri)
        except Exception as e:
            logger.error("lakehouse_init_failed", error=str(e))
            # Fallback to in-memory catalog for development
            self.catalog = None
    
    async def create_namespace(self) -> bool:
        """Create namespace if it doesn't exist"""
        try:
            if self.catalog:
                self.catalog.create_namespace(self.namespace)
                logger.info("namespace_created", namespace=self.namespace)
            return True
        except Exception as e:
            logger.warning("namespace_exists_or_error", namespace=self.namespace, error=str(e))
            return False
    
    async def create_transactions_table(self) -> bool:
        """
        Create transactions fact table
        
        Schema:
            - transaction_id: string
            - account_id: string
            - transaction_type: string
            - amount: decimal(18,2)
            - currency: string
            - timestamp: timestamp
            - status: string
            - metadata: struct
        """
        try:
            schema = Schema(
                NestedField(1, "transaction_id", StringType(), required=True),
                NestedField(2, "account_id", StringType(), required=True),
                NestedField(3, "transaction_type", StringType(), required=True),
                NestedField(4, "amount", DecimalType(18, 2), required=True),
                NestedField(5, "currency", StringType(), required=True),
                NestedField(6, "timestamp", TimestampType(), required=True),
                NestedField(7, "status", StringType(), required=True),
                NestedField(8, "metadata", StructType(
                    NestedField(9, "source", StringType()),
                    NestedField(10, "description", StringType()),
                    NestedField(11, "tags", StringType())
                ))
            )
            
            # Partition by day
            partition_spec = PartitionSpec(
                PartitionField(
                    source_id=6,  # timestamp field
                    field_id=1000,
                    transform=DayTransform(),
                    name="day"
                )
            )
            
            if self.catalog:
                table = self.catalog.create_table(
                    f"{self.namespace}.transactions_fact",
                    schema=schema,
                    partition_spec=partition_spec
                )
                logger.info("table_created", table="transactions_fact")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="transactions_fact", error=str(e))
            return False
    
    async def create_accounts_table(self) -> bool:
        """Create accounts dimension table"""
        try:
            schema = Schema(
                NestedField(1, "account_id", StringType(), required=True),
                NestedField(2, "customer_id", StringType(), required=True),
                NestedField(3, "account_type", StringType(), required=True),
                NestedField(4, "balance", DecimalType(18, 2), required=True),
                NestedField(5, "currency", StringType(), required=True),
                NestedField(6, "created_at", TimestampType(), required=True),
                NestedField(7, "updated_at", TimestampType(), required=True),
                NestedField(8, "status", StringType(), required=True)
            )
            
            if self.catalog:
                table = self.catalog.create_table(
                    f"{self.namespace}.accounts_dimension",
                    schema=schema
                )
                logger.info("table_created", table="accounts_dimension")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="accounts_dimension", error=str(e))
            return False
    
    async def create_fraud_events_table(self) -> bool:
        """Create fraud events table"""
        try:
            schema = Schema(
                NestedField(1, "event_id", StringType(), required=True),
                NestedField(2, "transaction_id", StringType(), required=True),
                NestedField(3, "fraud_score", DoubleType(), required=True),
                NestedField(4, "fraud_type", StringType(), required=True),
                NestedField(5, "detected_at", TimestampType(), required=True),
                NestedField(6, "resolved", BooleanType(), required=True),
                NestedField(7, "resolution_notes", StringType())
            )
            
            # Partition by day
            partition_spec = PartitionSpec(
                PartitionField(
                    source_id=5,  # detected_at field
                    field_id=1000,
                    transform=DayTransform(),
                    name="day"
                )
            )
            
            if self.catalog:
                table = self.catalog.create_table(
                    f"{self.namespace}.fraud_events",
                    schema=schema,
                    partition_spec=partition_spec
                )
                logger.info("table_created", table="fraud_events")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="fraud_events", error=str(e))
            return False
    
    async def append_data(self, table_name: str, data: List[Dict[str, Any]]) -> bool:
        """
        Append data to a table
        
        Args:
            table_name: Name of the table
            data: List of dictionaries containing row data
            
        Returns:
            Success status
        """
        try:
            if not self.catalog:
                logger.warning("catalog_not_initialized")
                return False
            
            table = self.catalog.load_table(f"{self.namespace}.{table_name}")
            
            # Convert to pandas DataFrame
            df = pd.DataFrame(data)
            
            # Append to table
            table.append(df)
            
            logger.info("data_appended", table=table_name, rows=len(data))
            return True
        except Exception as e:
            logger.error("data_append_failed", table=table_name, error=str(e))
            return False
    
    async def query_data(
        self,
        table_name: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 1000,
        snapshot_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Query data from a table
        
        Args:
            table_name: Name of the table
            filters: Optional filters to apply
            limit: Maximum number of rows to return
            snapshot_id: Optional snapshot ID for time-travel query
            
        Returns:
            List of dictionaries containing row data
        """
        try:
            if not self.catalog:
                logger.warning("catalog_not_initialized")
                return []
            
            table = self.catalog.load_table(f"{self.namespace}.{table_name}")
            
            # Time-travel query if snapshot_id provided
            if snapshot_id:
                table = table.snapshot(snapshot_id)
            
            # Scan table
            scan = table.scan(limit=limit)
            
            # Apply filters if provided
            if filters:
                for field, value in filters.items():
                    scan = scan.filter(field == value)
            
            # Convert to pandas and then to dict
            df = scan.to_pandas()
            result = df.to_dict('records')
            
            logger.info("data_queried", table=table_name, rows=len(result))
            return result
        except Exception as e:
            logger.error("data_query_failed", table=table_name, error=str(e))
            return []
    
    async def get_table_snapshots(self, table_name: str) -> List[Dict[str, Any]]:
        """
        Get all snapshots for a table (time-travel capability)
        
        Args:
            table_name: Name of the table
            
        Returns:
            List of snapshot metadata
        """
        try:
            if not self.catalog:
                return []
            
            table = self.catalog.load_table(f"{self.namespace}.{table_name}")
            snapshots = []
            
            for snapshot in table.snapshots():
                snapshots.append({
                    "snapshot_id": snapshot.snapshot_id,
                    "timestamp_ms": snapshot.timestamp_ms,
                    "summary": snapshot.summary,
                    "manifest_list": snapshot.manifest_list
                })
            
            logger.info("snapshots_retrieved", table=table_name, count=len(snapshots))
            return snapshots
        except Exception as e:
            logger.error("snapshots_retrieval_failed", table=table_name, error=str(e))
            return []
    
    async def aggregate_metrics(
        self,
        table_name: str,
        metric_field: str,
        aggregation: str = "sum",
        group_by: Optional[List[str]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Run aggregation queries on a table
        
        Args:
            table_name: Name of the table
            metric_field: Field to aggregate
            aggregation: Type of aggregation (sum, avg, count, min, max)
            group_by: Optional list of fields to group by
            start_date: Optional start date filter
            end_date: Optional end date filter
            
        Returns:
            Aggregated results
        """
        try:
            if not self.catalog:
                return []
            
            table = self.catalog.load_table(f"{self.namespace}.{table_name}")
            scan = table.scan()
            
            # Apply date filters
            if start_date:
                scan = scan.filter("timestamp" >= start_date)
            if end_date:
                scan = scan.filter("timestamp" <= end_date)
            
            # Convert to pandas for aggregation
            df = scan.to_pandas()
            
            # Perform aggregation
            if group_by:
                if aggregation == "sum":
                    result = df.groupby(group_by)[metric_field].sum().reset_index()
                elif aggregation == "avg":
                    result = df.groupby(group_by)[metric_field].mean().reset_index()
                elif aggregation == "count":
                    result = df.groupby(group_by)[metric_field].count().reset_index()
                elif aggregation == "min":
                    result = df.groupby(group_by)[metric_field].min().reset_index()
                elif aggregation == "max":
                    result = df.groupby(group_by)[metric_field].max().reset_index()
                else:
                    result = df.groupby(group_by)[metric_field].sum().reset_index()
            else:
                if aggregation == "sum":
                    result = pd.DataFrame([{metric_field: df[metric_field].sum()}])
                elif aggregation == "avg":
                    result = pd.DataFrame([{metric_field: df[metric_field].mean()}])
                elif aggregation == "count":
                    result = pd.DataFrame([{metric_field: df[metric_field].count()}])
                else:
                    result = pd.DataFrame([{metric_field: df[metric_field].sum()}])
            
            logger.info("aggregation_completed", table=table_name, aggregation=aggregation)
            return result.to_dict('records')
        except Exception as e:
            logger.error("aggregation_failed", table=table_name, error=str(e))
            return []
    
    async def create_investments_table(self) -> bool:
        """Create investments/trades fact table"""
        try:
            schema = Schema(
                NestedField(1, "trade_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "symbol", StringType(), required=True),
                NestedField(4, "exchange", StringType(), required=True),
                NestedField(5, "trade_type", StringType(), required=True),
                NestedField(6, "quantity", DecimalType(18, 8), required=True),
                NestedField(7, "price", DecimalType(18, 4), required=True),
                NestedField(8, "total_amount", DecimalType(18, 2), required=True),
                NestedField(9, "currency", StringType(), required=True),
                NestedField(10, "commission", DecimalType(18, 4)),
                NestedField(11, "timestamp", TimestampType(), required=True),
                NestedField(12, "status", StringType(), required=True)
            )
            
            partition_spec = PartitionSpec(
                PartitionField(source_id=11, field_id=1000, transform=DayTransform(), name="day")
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.investments_fact", schema=schema, partition_spec=partition_spec)
                logger.info("table_created", table="investments_fact")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="investments_fact", error=str(e))
            return False

    async def create_loans_table(self) -> bool:
        """Create loans fact table"""
        try:
            schema = Schema(
                NestedField(1, "loan_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "loan_type", StringType(), required=True),
                NestedField(4, "principal_amount", DecimalType(18, 2), required=True),
                NestedField(5, "interest_rate", DoubleType(), required=True),
                NestedField(6, "term_months", IntegerType(), required=True),
                NestedField(7, "monthly_payment", DecimalType(18, 2), required=True),
                NestedField(8, "outstanding_balance", DecimalType(18, 2), required=True),
                NestedField(9, "currency", StringType(), required=True),
                NestedField(10, "status", StringType(), required=True),
                NestedField(11, "disbursed_at", TimestampType()),
                NestedField(12, "created_at", TimestampType(), required=True)
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.loans_fact", schema=schema)
                logger.info("table_created", table="loans_fact")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="loans_fact", error=str(e))
            return False

    async def create_kyc_table(self) -> bool:
        """Create KYC/KYB events table"""
        try:
            schema = Schema(
                NestedField(1, "application_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "kyc_type", StringType(), required=True),
                NestedField(4, "country", StringType(), required=True),
                NestedField(5, "tier", StringType(), required=True),
                NestedField(6, "risk_score", DoubleType()),
                NestedField(7, "aml_status", StringType()),
                NestedField(8, "pep_status", StringType()),
                NestedField(9, "sanctions_status", StringType()),
                NestedField(10, "verification_status", StringType(), required=True),
                NestedField(11, "documents_submitted", IntegerType()),
                NestedField(12, "created_at", TimestampType(), required=True),
                NestedField(13, "completed_at", TimestampType())
            )
            
            partition_spec = PartitionSpec(
                PartitionField(source_id=12, field_id=1000, transform=DayTransform(), name="day")
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.kyc_events", schema=schema, partition_spec=partition_spec)
                logger.info("table_created", table="kyc_events")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="kyc_events", error=str(e))
            return False

    async def create_insurance_table(self) -> bool:
        """Create insurance policies table"""
        try:
            schema = Schema(
                NestedField(1, "policy_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "policy_type", StringType(), required=True),
                NestedField(4, "provider", StringType(), required=True),
                NestedField(5, "premium_amount", DecimalType(18, 2), required=True),
                NestedField(6, "coverage_amount", DecimalType(18, 2), required=True),
                NestedField(7, "currency", StringType(), required=True),
                NestedField(8, "status", StringType(), required=True),
                NestedField(9, "start_date", TimestampType(), required=True),
                NestedField(10, "end_date", TimestampType()),
                NestedField(11, "claims_count", IntegerType()),
                NestedField(12, "created_at", TimestampType(), required=True)
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.insurance_policies", schema=schema)
                logger.info("table_created", table="insurance_policies")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="insurance_policies", error=str(e))
            return False

    async def create_savings_table(self) -> bool:
        """Create savings/vaults table"""
        try:
            schema = Schema(
                NestedField(1, "vault_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "vault_type", StringType(), required=True),
                NestedField(4, "vault_name", StringType(), required=True),
                NestedField(5, "target_amount", DecimalType(18, 2)),
                NestedField(6, "current_amount", DecimalType(18, 2), required=True),
                NestedField(7, "currency", StringType(), required=True),
                NestedField(8, "interest_rate", DoubleType()),
                NestedField(9, "status", StringType(), required=True),
                NestedField(10, "target_date", TimestampType()),
                NestedField(11, "created_at", TimestampType(), required=True),
                NestedField(12, "updated_at", TimestampType(), required=True)
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.savings_vaults", schema=schema)
                logger.info("table_created", table="savings_vaults")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="savings_vaults", error=str(e))
            return False

    async def create_bills_table(self) -> bool:
        """Create bill payments table"""
        try:
            schema = Schema(
                NestedField(1, "payment_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "bill_type", StringType(), required=True),
                NestedField(4, "provider", StringType(), required=True),
                NestedField(5, "account_number", StringType(), required=True),
                NestedField(6, "amount", DecimalType(18, 2), required=True),
                NestedField(7, "currency", StringType(), required=True),
                NestedField(8, "status", StringType(), required=True),
                NestedField(9, "reference", StringType()),
                NestedField(10, "token", StringType()),
                NestedField(11, "timestamp", TimestampType(), required=True)
            )
            
            partition_spec = PartitionSpec(
                PartitionField(source_id=11, field_id=1000, transform=DayTransform(), name="day")
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.bill_payments", schema=schema, partition_spec=partition_spec)
                logger.info("table_created", table="bill_payments")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="bill_payments", error=str(e))
            return False

    async def create_bnpl_table(self) -> bool:
        """Create BNPL (Buy Now Pay Later) table"""
        try:
            schema = Schema(
                NestedField(1, "bnpl_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "merchant", StringType(), required=True),
                NestedField(4, "total_amount", DecimalType(18, 2), required=True),
                NestedField(5, "installments", IntegerType(), required=True),
                NestedField(6, "installment_amount", DecimalType(18, 2), required=True),
                NestedField(7, "paid_installments", IntegerType(), required=True),
                NestedField(8, "currency", StringType(), required=True),
                NestedField(9, "status", StringType(), required=True),
                NestedField(10, "next_payment_date", TimestampType()),
                NestedField(11, "created_at", TimestampType(), required=True)
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.bnpl_orders", schema=schema)
                logger.info("table_created", table="bnpl_orders")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="bnpl_orders", error=str(e))
            return False

    async def create_rewards_table(self) -> bool:
        """Create rewards/points table"""
        try:
            schema = Schema(
                NestedField(1, "reward_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "reward_type", StringType(), required=True),
                NestedField(4, "points", IntegerType(), required=True),
                NestedField(5, "cashback_amount", DecimalType(18, 2)),
                NestedField(6, "currency", StringType()),
                NestedField(7, "source", StringType(), required=True),
                NestedField(8, "reference_id", StringType()),
                NestedField(9, "status", StringType(), required=True),
                NestedField(10, "timestamp", TimestampType(), required=True)
            )
            
            partition_spec = PartitionSpec(
                PartitionField(source_id=10, field_id=1000, transform=DayTransform(), name="day")
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.rewards_events", schema=schema, partition_spec=partition_spec)
                logger.info("table_created", table="rewards_events")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="rewards_events", error=str(e))
            return False

    async def create_telecom_table(self) -> bool:
        """Create telecom/airtime purchases table"""
        try:
            schema = Schema(
                NestedField(1, "purchase_id", StringType(), required=True),
                NestedField(2, "user_id", StringType(), required=True),
                NestedField(3, "purchase_type", StringType(), required=True),
                NestedField(4, "network", StringType(), required=True),
                NestedField(5, "phone_number", StringType(), required=True),
                NestedField(6, "amount", DecimalType(18, 2), required=True),
                NestedField(7, "currency", StringType(), required=True),
                NestedField(8, "data_amount_mb", IntegerType()),
                NestedField(9, "status", StringType(), required=True),
                NestedField(10, "timestamp", TimestampType(), required=True)
            )
            
            partition_spec = PartitionSpec(
                PartitionField(source_id=10, field_id=1000, transform=DayTransform(), name="day")
            )
            
            if self.catalog:
                self.catalog.create_table(f"{self.namespace}.telecom_purchases", schema=schema, partition_spec=partition_spec)
                logger.info("table_created", table="telecom_purchases")
                return True
            return False
        except Exception as e:
            logger.error("table_creation_failed", table="telecom_purchases", error=str(e))
            return False

    async def initialize_all_tables(self) -> Dict[str, bool]:
        """Initialize all Lakehouse tables"""
        results = {}
        
        await self.create_namespace()
        
        results["transactions_fact"] = await self.create_transactions_table()
        results["accounts_dimension"] = await self.create_accounts_table()
        results["fraud_events"] = await self.create_fraud_events_table()
        results["investments_fact"] = await self.create_investments_table()
        results["loans_fact"] = await self.create_loans_table()
        results["kyc_events"] = await self.create_kyc_table()
        results["insurance_policies"] = await self.create_insurance_table()
        results["savings_vaults"] = await self.create_savings_table()
        results["bill_payments"] = await self.create_bills_table()
        results["bnpl_orders"] = await self.create_bnpl_table()
        results["rewards_events"] = await self.create_rewards_table()
        results["telecom_purchases"] = await self.create_telecom_table()
        
        logger.info("tables_initialized", results=results)
        return results
    
    async def ingest_transaction_data(self, transactions: List[Dict[str, Any]]) -> bool:
        """
        Ingest transaction data into Lakehouse
        
        Args:
            transactions: List of transaction dictionaries
            
        Returns:
            Success status
        """
        try:
            # Transform data to match schema
            transformed = []
            for txn in transactions:
                transformed.append({
                    "transaction_id": txn.get("id"),
                    "account_id": txn.get("account_id"),
                    "transaction_type": txn.get("type"),
                    "amount": Decimal(str(txn.get("amount", 0))),
                    "currency": txn.get("currency", "USD"),
                    "timestamp": txn.get("timestamp", datetime.utcnow()),
                    "status": txn.get("status", "completed"),
                    "metadata": {
                        "source": txn.get("source", "api"),
                        "description": txn.get("description", ""),
                        "tags": json.dumps(txn.get("tags", []))
                    }
                })
            
            return await self.append_data("transactions_fact", transformed)
        except Exception as e:
            logger.error("transaction_ingestion_failed", error=str(e))
            return False
    
    async def ingest_fraud_event(self, event: Dict[str, Any]) -> bool:
        """
        Ingest fraud detection event into Lakehouse
        
        Args:
            event: Fraud event dictionary
            
        Returns:
            Success status
        """
        try:
            transformed = [{
                "event_id": event.get("id"),
                "transaction_id": event.get("transaction_id"),
                "fraud_score": float(event.get("fraud_score", 0.0)),
                "fraud_type": event.get("fraud_type", "unknown"),
                "detected_at": event.get("detected_at", datetime.utcnow()),
                "resolved": event.get("resolved", False),
                "resolution_notes": event.get("resolution_notes", "")
            }]
            
            return await self.append_data("fraud_events", transformed)
        except Exception as e:
            logger.error("fraud_event_ingestion_failed", error=str(e))
            return False
    
    async def ingest_investment_trade(self, trade: Dict[str, Any]) -> bool:
        """Ingest investment trade into Lakehouse"""
        try:
            transformed = [{
                "trade_id": trade.get("id"),
                "user_id": trade.get("user_id"),
                "symbol": trade.get("symbol"),
                "exchange": trade.get("exchange"),
                "trade_type": trade.get("type"),
                "quantity": Decimal(str(trade.get("quantity", 0))),
                "price": Decimal(str(trade.get("price", 0))),
                "total_amount": Decimal(str(trade.get("total_amount", 0))),
                "currency": trade.get("currency", "USD"),
                "commission": Decimal(str(trade.get("commission", 0))),
                "timestamp": trade.get("timestamp", datetime.utcnow()),
                "status": trade.get("status", "completed")
            }]
            return await self.append_data("investments_fact", transformed)
        except Exception as e:
            logger.error("investment_ingestion_failed", error=str(e))
            return False

    async def ingest_loan(self, loan: Dict[str, Any]) -> bool:
        """Ingest loan data into Lakehouse"""
        try:
            transformed = [{
                "loan_id": loan.get("id"),
                "user_id": loan.get("user_id"),
                "loan_type": loan.get("type"),
                "principal_amount": Decimal(str(loan.get("principal_amount", 0))),
                "interest_rate": float(loan.get("interest_rate", 0)),
                "term_months": int(loan.get("term_months", 0)),
                "monthly_payment": Decimal(str(loan.get("monthly_payment", 0))),
                "outstanding_balance": Decimal(str(loan.get("outstanding_balance", 0))),
                "currency": loan.get("currency", "NGN"),
                "status": loan.get("status", "pending"),
                "disbursed_at": loan.get("disbursed_at"),
                "created_at": loan.get("created_at", datetime.utcnow())
            }]
            return await self.append_data("loans_fact", transformed)
        except Exception as e:
            logger.error("loan_ingestion_failed", error=str(e))
            return False

    async def ingest_kyc_event(self, kyc: Dict[str, Any]) -> bool:
        """Ingest KYC/KYB event into Lakehouse"""
        try:
            transformed = [{
                "application_id": kyc.get("id"),
                "user_id": kyc.get("user_id"),
                "kyc_type": kyc.get("type", "individual"),
                "country": kyc.get("country", "NG"),
                "tier": kyc.get("tier", "basic"),
                "risk_score": float(kyc.get("risk_score", 0)),
                "aml_status": kyc.get("aml_status"),
                "pep_status": kyc.get("pep_status"),
                "sanctions_status": kyc.get("sanctions_status"),
                "verification_status": kyc.get("status", "pending"),
                "documents_submitted": int(kyc.get("documents_submitted", 0)),
                "created_at": kyc.get("created_at", datetime.utcnow()),
                "completed_at": kyc.get("completed_at")
            }]
            return await self.append_data("kyc_events", transformed)
        except Exception as e:
            logger.error("kyc_ingestion_failed", error=str(e))
            return False

    async def ingest_insurance_policy(self, policy: Dict[str, Any]) -> bool:
        """Ingest insurance policy into Lakehouse"""
        try:
            transformed = [{
                "policy_id": policy.get("id"),
                "user_id": policy.get("user_id"),
                "policy_type": policy.get("type"),
                "provider": policy.get("provider"),
                "premium_amount": Decimal(str(policy.get("premium_amount", 0))),
                "coverage_amount": Decimal(str(policy.get("coverage_amount", 0))),
                "currency": policy.get("currency", "NGN"),
                "status": policy.get("status", "active"),
                "start_date": policy.get("start_date", datetime.utcnow()),
                "end_date": policy.get("end_date"),
                "claims_count": int(policy.get("claims_count", 0)),
                "created_at": policy.get("created_at", datetime.utcnow())
            }]
            return await self.append_data("insurance_policies", transformed)
        except Exception as e:
            logger.error("insurance_ingestion_failed", error=str(e))
            return False

    async def ingest_savings_vault(self, vault: Dict[str, Any]) -> bool:
        """Ingest savings vault into Lakehouse"""
        try:
            transformed = [{
                "vault_id": vault.get("id"),
                "user_id": vault.get("user_id"),
                "vault_type": vault.get("type"),
                "vault_name": vault.get("name"),
                "target_amount": Decimal(str(vault.get("target_amount", 0))) if vault.get("target_amount") else None,
                "current_amount": Decimal(str(vault.get("current_amount", 0))),
                "currency": vault.get("currency", "NGN"),
                "interest_rate": float(vault.get("interest_rate", 0)) if vault.get("interest_rate") else None,
                "status": vault.get("status", "active"),
                "target_date": vault.get("target_date"),
                "created_at": vault.get("created_at", datetime.utcnow()),
                "updated_at": vault.get("updated_at", datetime.utcnow())
            }]
            return await self.append_data("savings_vaults", transformed)
        except Exception as e:
            logger.error("savings_ingestion_failed", error=str(e))
            return False

    async def ingest_bill_payment(self, payment: Dict[str, Any]) -> bool:
        """Ingest bill payment into Lakehouse"""
        try:
            transformed = [{
                "payment_id": payment.get("id"),
                "user_id": payment.get("user_id"),
                "bill_type": payment.get("type"),
                "provider": payment.get("provider"),
                "account_number": payment.get("account_number"),
                "amount": Decimal(str(payment.get("amount", 0))),
                "currency": payment.get("currency", "NGN"),
                "status": payment.get("status", "completed"),
                "reference": payment.get("reference"),
                "token": payment.get("token"),
                "timestamp": payment.get("timestamp", datetime.utcnow())
            }]
            return await self.append_data("bill_payments", transformed)
        except Exception as e:
            logger.error("bill_payment_ingestion_failed", error=str(e))
            return False

    async def ingest_bnpl_order(self, order: Dict[str, Any]) -> bool:
        """Ingest BNPL order into Lakehouse"""
        try:
            transformed = [{
                "bnpl_id": order.get("id"),
                "user_id": order.get("user_id"),
                "merchant": order.get("merchant"),
                "total_amount": Decimal(str(order.get("total_amount", 0))),
                "installments": int(order.get("installments", 0)),
                "installment_amount": Decimal(str(order.get("installment_amount", 0))),
                "paid_installments": int(order.get("paid_installments", 0)),
                "currency": order.get("currency", "NGN"),
                "status": order.get("status", "active"),
                "next_payment_date": order.get("next_payment_date"),
                "created_at": order.get("created_at", datetime.utcnow())
            }]
            return await self.append_data("bnpl_orders", transformed)
        except Exception as e:
            logger.error("bnpl_ingestion_failed", error=str(e))
            return False

    async def ingest_reward_event(self, reward: Dict[str, Any]) -> bool:
        """Ingest reward event into Lakehouse"""
        try:
            transformed = [{
                "reward_id": reward.get("id"),
                "user_id": reward.get("user_id"),
                "reward_type": reward.get("type"),
                "points": int(reward.get("points", 0)),
                "cashback_amount": Decimal(str(reward.get("cashback_amount", 0))) if reward.get("cashback_amount") else None,
                "currency": reward.get("currency"),
                "source": reward.get("source"),
                "reference_id": reward.get("reference_id"),
                "status": reward.get("status", "credited"),
                "timestamp": reward.get("timestamp", datetime.utcnow())
            }]
            return await self.append_data("rewards_events", transformed)
        except Exception as e:
            logger.error("reward_ingestion_failed", error=str(e))
            return False

    async def ingest_telecom_purchase(self, purchase: Dict[str, Any]) -> bool:
        """Ingest telecom purchase into Lakehouse"""
        try:
            transformed = [{
                "purchase_id": purchase.get("id"),
                "user_id": purchase.get("user_id"),
                "purchase_type": purchase.get("type"),
                "network": purchase.get("network"),
                "phone_number": purchase.get("phone_number"),
                "amount": Decimal(str(purchase.get("amount", 0))),
                "currency": purchase.get("currency", "NGN"),
                "data_amount_mb": int(purchase.get("data_amount_mb", 0)) if purchase.get("data_amount_mb") else None,
                "status": purchase.get("status", "completed"),
                "timestamp": purchase.get("timestamp", datetime.utcnow())
            }]
            return await self.append_data("telecom_purchases", transformed)
        except Exception as e:
            logger.error("telecom_ingestion_failed", error=str(e))
            return False

    async def get_comprehensive_analytics(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get comprehensive analytics across all platform features"""
        try:
            if not start_date:
                start_date = datetime.utcnow() - timedelta(days=30)
            if not end_date:
                end_date = datetime.utcnow()
            
            analytics = {
                "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
                "transactions": await self.aggregate_metrics("transactions_fact", "amount", "sum", start_date=start_date, end_date=end_date),
                "investments": await self.aggregate_metrics("investments_fact", "total_amount", "sum", start_date=start_date, end_date=end_date),
                "loans_disbursed": await self.aggregate_metrics("loans_fact", "principal_amount", "sum"),
                "insurance_premiums": await self.aggregate_metrics("insurance_policies", "premium_amount", "sum"),
                "savings_total": await self.aggregate_metrics("savings_vaults", "current_amount", "sum"),
                "bills_paid": await self.aggregate_metrics("bill_payments", "amount", "sum", start_date=start_date, end_date=end_date),
                "bnpl_volume": await self.aggregate_metrics("bnpl_orders", "total_amount", "sum"),
                "rewards_points": await self.aggregate_metrics("rewards_events", "points", "sum", start_date=start_date, end_date=end_date),
                "telecom_purchases": await self.aggregate_metrics("telecom_purchases", "amount", "sum", start_date=start_date, end_date=end_date),
                "kyc_completed": await self.aggregate_metrics("kyc_events", "application_id", "count"),
                "fraud_events": await self.aggregate_metrics("fraud_events", "event_id", "count", start_date=start_date, end_date=end_date),
                "generated_at": datetime.utcnow().isoformat()
            }
            
            logger.info("comprehensive_analytics_generated")
            return analytics
        except Exception as e:
            logger.error("comprehensive_analytics_failed", error=str(e))
            return {}

    async def get_analytics_dashboard_data(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get aggregated data for analytics dashboard
        
        Args:
            start_date: Optional start date
            end_date: Optional end date
            
        Returns:
            Dashboard data dictionary
        """
        try:
            # Default to last 30 days
            if not start_date:
                start_date = datetime.utcnow() - timedelta(days=30)
            if not end_date:
                end_date = datetime.utcnow()
            
            # Get transaction volume
            total_volume = await self.aggregate_metrics(
                "transactions_fact",
                "amount",
                aggregation="sum",
                start_date=start_date,
                end_date=end_date
            )
            
            # Get transaction count by type
            txn_by_type = await self.aggregate_metrics(
                "transactions_fact",
                "amount",
                aggregation="count",
                group_by=["transaction_type"],
                start_date=start_date,
                end_date=end_date
            )
            
            # Get fraud events count
            fraud_count = await self.aggregate_metrics(
                "fraud_events",
                "event_id",
                aggregation="count",
                start_date=start_date,
                end_date=end_date
            )
            
            dashboard_data = {
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                },
                "total_transaction_volume": total_volume[0] if total_volume else {},
                "transactions_by_type": txn_by_type,
                "fraud_events_count": fraud_count[0] if fraud_count else {},
                "generated_at": datetime.utcnow().isoformat()
            }
            
            logger.info("dashboard_data_generated")
            return dashboard_data
        except Exception as e:
            logger.error("dashboard_data_generation_failed", error=str(e))
            return {}


# Singleton instance
_lakehouse_service = None

def get_lakehouse_service() -> LakehouseService:
    """Get singleton Lakehouse service instance"""
    global _lakehouse_service
    if _lakehouse_service is None:
        _lakehouse_service = LakehouseService()
    return _lakehouse_service
