"""
Reconciliation Scheduler with Full Alerting Implementation
Periodic reconciliation execution with email, Slack, and PagerDuty alerts
"""

import asyncio
import aiohttp
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, time, timedelta
from typing import Optional, List, Dict, Any
import structlog
import os
import json

from app.services.reconciliation_service import get_reconciliation_service

logger = structlog.get_logger()


class AlertConfig:
    """Alert configuration from environment variables"""
    
    # Email configuration
    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    ALERT_EMAIL_FROM = os.getenv("ALERT_EMAIL_FROM", "alerts@neobank.com")
    ALERT_EMAIL_TO = os.getenv("ALERT_EMAIL_TO", "ops@neobank.com").split(",")
    
    # Slack configuration
    SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
    SLACK_CHANNEL = os.getenv("SLACK_CHANNEL", "#alerts")
    
    # PagerDuty configuration
    PAGERDUTY_ROUTING_KEY = os.getenv("PAGERDUTY_ROUTING_KEY", "")
    PAGERDUTY_API_URL = "https://events.pagerduty.com/v2/enqueue"


class AlertService:
    """
    Multi-channel alerting service
    Supports email, Slack, and PagerDuty
    """
    
    def __init__(self):
        self.config = AlertConfig()
        self.logger = logger.bind(service="alert_service")
    
    async def send_alert(
        self,
        title: str,
        message: str,
        severity: str = "warning",
        details: Optional[Dict[str, Any]] = None,
        channels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Send alert through configured channels
        
        Args:
            title: Alert title
            message: Alert message
            severity: Alert severity (info, warning, error, critical)
            details: Additional details
            channels: List of channels to use (email, slack, pagerduty)
                     If None, uses all configured channels
        
        Returns:
            Results from each channel
        """
        if channels is None:
            channels = ["email", "slack", "pagerduty"]
        
        results = {}
        
        # Send to each channel
        if "email" in channels and self.config.SMTP_USER:
            results["email"] = await self._send_email_alert(title, message, severity, details)
        
        if "slack" in channels and self.config.SLACK_WEBHOOK_URL:
            results["slack"] = await self._send_slack_alert(title, message, severity, details)
        
        if "pagerduty" in channels and self.config.PAGERDUTY_ROUTING_KEY:
            # Only send to PagerDuty for critical/error severity
            if severity in ["critical", "error"]:
                results["pagerduty"] = await self._send_pagerduty_alert(title, message, severity, details)
        
        self.logger.info(
            "Alert sent",
            title=title,
            severity=severity,
            channels=list(results.keys())
        )
        
        return results
    
    async def _send_email_alert(
        self,
        title: str,
        message: str,
        severity: str,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Send alert via email"""
        try:
            # Create email message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[{severity.upper()}] NeoBank Alert: {title}"
            msg["From"] = self.config.ALERT_EMAIL_FROM
            msg["To"] = ", ".join(self.config.ALERT_EMAIL_TO)
            
            # Create HTML body
            html_body = f"""
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; }}
                    .alert-box {{ padding: 20px; border-radius: 5px; margin: 10px 0; }}
                    .critical {{ background-color: #f8d7da; border: 1px solid #f5c6cb; }}
                    .error {{ background-color: #f8d7da; border: 1px solid #f5c6cb; }}
                    .warning {{ background-color: #fff3cd; border: 1px solid #ffeeba; }}
                    .info {{ background-color: #d1ecf1; border: 1px solid #bee5eb; }}
                    .details {{ background-color: #f8f9fa; padding: 10px; border-radius: 3px; margin-top: 10px; }}
                    pre {{ white-space: pre-wrap; word-wrap: break-word; }}
                </style>
            </head>
            <body>
                <h2>NeoBank Reconciliation Alert</h2>
                <div class="alert-box {severity}">
                    <h3>{title}</h3>
                    <p>{message}</p>
                    <p><strong>Severity:</strong> {severity.upper()}</p>
                    <p><strong>Time:</strong> {datetime.utcnow().isoformat()}Z</p>
                </div>
                {f'<div class="details"><h4>Details:</h4><pre>{json.dumps(details, indent=2)}</pre></div>' if details else ''}
                <hr>
                <p><small>This is an automated alert from NeoBank Reconciliation System.</small></p>
            </body>
            </html>
            """
            
            # Create plain text body
            text_body = f"""
            NeoBank Reconciliation Alert
            
            Title: {title}
            Severity: {severity.upper()}
            Time: {datetime.utcnow().isoformat()}Z
            
            Message:
            {message}
            
            {f'Details: {json.dumps(details, indent=2)}' if details else ''}
            
            ---
            This is an automated alert from NeoBank Reconciliation System.
            """
            
            msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))
            
            # Send email
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._send_smtp_email, msg)
            
            self.logger.info("Email alert sent", recipients=self.config.ALERT_EMAIL_TO)
            return {"success": True, "recipients": self.config.ALERT_EMAIL_TO}
            
        except Exception as e:
            self.logger.error("Failed to send email alert", error=str(e))
            return {"success": False, "error": str(e)}
    
    def _send_smtp_email(self, msg: MIMEMultipart):
        """Send email via SMTP (synchronous)"""
        with smtplib.SMTP(self.config.SMTP_HOST, self.config.SMTP_PORT) as server:
            server.starttls()
            if self.config.SMTP_USER and self.config.SMTP_PASSWORD:
                server.login(self.config.SMTP_USER, self.config.SMTP_PASSWORD)
            server.send_message(msg)
    
    async def _send_slack_alert(
        self,
        title: str,
        message: str,
        severity: str,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Send alert via Slack webhook"""
        try:
            # Map severity to Slack color
            color_map = {
                "critical": "#dc3545",  # Red
                "error": "#dc3545",      # Red
                "warning": "#ffc107",    # Yellow
                "info": "#17a2b8"        # Blue
            }
            color = color_map.get(severity, "#6c757d")
            
            # Create Slack message payload
            payload = {
                "channel": self.config.SLACK_CHANNEL,
                "username": "NeoBank Reconciliation Bot",
                "icon_emoji": ":bank:",
                "attachments": [
                    {
                        "color": color,
                        "title": f":rotating_light: {title}",
                        "text": message,
                        "fields": [
                            {
                                "title": "Severity",
                                "value": severity.upper(),
                                "short": True
                            },
                            {
                                "title": "Time",
                                "value": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                                "short": True
                            }
                        ],
                        "footer": "NeoBank Reconciliation System",
                        "ts": int(datetime.utcnow().timestamp())
                    }
                ]
            }
            
            # Add details as additional fields
            if details:
                if "reconciliation_id" in details:
                    payload["attachments"][0]["fields"].append({
                        "title": "Reconciliation ID",
                        "value": details["reconciliation_id"],
                        "short": True
                    })
                if "discrepancies_remaining" in details:
                    payload["attachments"][0]["fields"].append({
                        "title": "Unresolved Discrepancies",
                        "value": str(details["discrepancies_remaining"]),
                        "short": True
                    })
                if "accounts_checked" in details:
                    payload["attachments"][0]["fields"].append({
                        "title": "Accounts Checked",
                        "value": str(details["accounts_checked"]),
                        "short": True
                    })
            
            # Send to Slack
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.config.SLACK_WEBHOOK_URL,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status == 200:
                        self.logger.info("Slack alert sent", channel=self.config.SLACK_CHANNEL)
                        return {"success": True, "channel": self.config.SLACK_CHANNEL}
                    else:
                        error_text = await response.text()
                        self.logger.error("Slack alert failed", status=response.status, error=error_text)
                        return {"success": False, "error": error_text}
            
        except Exception as e:
            self.logger.error("Failed to send Slack alert", error=str(e))
            return {"success": False, "error": str(e)}
    
    async def _send_pagerduty_alert(
        self,
        title: str,
        message: str,
        severity: str,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Send alert via PagerDuty Events API v2"""
        try:
            # Map severity to PagerDuty severity
            pd_severity_map = {
                "critical": "critical",
                "error": "error",
                "warning": "warning",
                "info": "info"
            }
            pd_severity = pd_severity_map.get(severity, "warning")
            
            # Create PagerDuty event payload
            payload = {
                "routing_key": self.config.PAGERDUTY_ROUTING_KEY,
                "event_action": "trigger",
                "dedup_key": f"neobank-reconciliation-{details.get('reconciliation_id', datetime.utcnow().strftime('%Y%m%d%H%M%S'))}",
                "payload": {
                    "summary": f"[NeoBank] {title}",
                    "source": "neobank-reconciliation-service",
                    "severity": pd_severity,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "component": "reconciliation",
                    "group": "financial-operations",
                    "class": "reconciliation-alert",
                    "custom_details": {
                        "message": message,
                        **(details or {})
                    }
                },
                "links": [
                    {
                        "href": f"https://dashboard.neobank.com/reconciliation/{details.get('reconciliation_id', '')}",
                        "text": "View Reconciliation Details"
                    }
                ],
                "images": []
            }
            
            # Send to PagerDuty
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.config.PAGERDUTY_API_URL,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    response_data = await response.json()
                    
                    if response.status == 202:
                        self.logger.info(
                            "PagerDuty alert sent",
                            dedup_key=payload["dedup_key"],
                            status=response_data.get("status")
                        )
                        return {
                            "success": True,
                            "dedup_key": payload["dedup_key"],
                            "status": response_data.get("status")
                        }
                    else:
                        self.logger.error(
                            "PagerDuty alert failed",
                            status=response.status,
                            error=response_data
                        )
                        return {"success": False, "error": response_data}
            
        except Exception as e:
            self.logger.error("Failed to send PagerDuty alert", error=str(e))
            return {"success": False, "error": str(e)}


class ReconciliationScheduler:
    """
    Scheduler for periodic reconciliation runs
    
    Features:
    - Daily reconciliation at specified time
    - Hourly quick checks
    - On-demand reconciliation
    - Automatic retry on failure
    - Multi-channel alerting (email, Slack, PagerDuty)
    """
    
    def __init__(self):
        self.running = False
        self.task: Optional[asyncio.Task] = None
        self.daily_time = time(hour=2, minute=0)  # 2:00 AM UTC
        self.hourly_enabled = True
        self.alert_service = AlertService()
        self.logger = logger.bind(service="reconciliation_scheduler")
    
    async def start(self):
        """Start the scheduler"""
        if self.running:
            self.logger.warning("Scheduler already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._run_scheduler())
        
        self.logger.info(
            "Reconciliation scheduler started",
            daily_time=self.daily_time.isoformat(),
            hourly_enabled=self.hourly_enabled
        )
    
    async def stop(self):
        """Stop the scheduler"""
        if not self.running:
            return
        
        self.running = False
        
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        
        self.logger.info("Reconciliation scheduler stopped")
    
    async def _run_scheduler(self):
        """Main scheduler loop"""
        try:
            while self.running:
                now = datetime.utcnow()
                
                # Check if it's time for daily reconciliation
                if now.time().hour == self.daily_time.hour and now.time().minute == self.daily_time.minute:
                    await self._run_daily_reconciliation()
                    # Sleep for 60 seconds to avoid running multiple times in the same minute
                    await asyncio.sleep(60)
                
                # Check if it's time for hourly quick check
                elif self.hourly_enabled and now.minute == 0:
                    await self._run_hourly_check()
                    await asyncio.sleep(60)
                
                else:
                    # Sleep for 30 seconds before next check
                    await asyncio.sleep(30)
                    
        except asyncio.CancelledError:
            self.logger.info("Scheduler cancelled")
            raise
            
        except Exception as e:
            self.logger.error("Scheduler error", error=str(e))
            # Restart scheduler after error
            if self.running:
                await asyncio.sleep(60)
                await self._run_scheduler()
    
    async def _run_daily_reconciliation(self):
        """Run full daily reconciliation"""
        self.logger.info("Starting daily reconciliation")
        
        try:
            reconciliation_service = await get_reconciliation_service()
            
            results = await reconciliation_service.run_full_reconciliation(
                account_ids=None,  # All accounts
                auto_resolve=True
            )
            
            self.logger.info(
                "Daily reconciliation completed",
                reconciliation_id=results["reconciliation_id"],
                accounts_checked=results["accounts_checked"],
                discrepancies_found=results["discrepancies_found"],
                discrepancies_resolved=results["discrepancies_resolved"]
            )
            
            # Send alert if critical discrepancies found
            if results["discrepancies_remaining"] > 0:
                await self._send_alert(results)
                
        except Exception as e:
            self.logger.error("Daily reconciliation failed", error=str(e))
            
            # Send failure alert
            await self.alert_service.send_alert(
                title="Daily Reconciliation Failed",
                message=f"The daily reconciliation job failed with error: {str(e)}",
                severity="error",
                details={
                    "error": str(e),
                    "job_type": "daily_reconciliation",
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
    
    async def _run_hourly_check(self):
        """Run hourly quick check"""
        self.logger.info("Starting hourly quick check")
        
        try:
            reconciliation_service = await get_reconciliation_service()
            
            # Get accounts with recent activity (last hour)
            active_accounts = await reconciliation_service.get_recently_active_accounts(
                hours=1
            )
            
            if not active_accounts:
                self.logger.info("No active accounts in the last hour, skipping check")
                return
            
            # Run quick reconciliation on active accounts
            results = await reconciliation_service.run_quick_reconciliation(
                account_ids=active_accounts
            )
            
            self.logger.info(
                "Hourly check completed",
                accounts_checked=len(active_accounts),
                discrepancies_found=results.get("discrepancies_found", 0)
            )
            
            # Send alert if discrepancies found
            if results.get("discrepancies_found", 0) > 0:
                await self.alert_service.send_alert(
                    title="Hourly Check: Discrepancies Detected",
                    message=f"Found {results['discrepancies_found']} discrepancies during hourly check",
                    severity="warning",
                    details=results,
                    channels=["slack"]  # Only Slack for hourly checks
                )
            
        except Exception as e:
            self.logger.error("Hourly check failed", error=str(e))
    
    async def _send_alert(self, results: dict):
        """Send alert for unresolved discrepancies"""
        self.logger.warning(
            "Unresolved discrepancies detected",
            reconciliation_id=results["reconciliation_id"],
            unresolved_count=results["discrepancies_remaining"]
        )
        
        # Determine severity based on discrepancy count and type
        critical_discrepancies = [
            d for d in results.get("discrepancies", [])
            if d.get("severity") == "critical" and not d.get("resolved")
        ]
        
        high_discrepancies = [
            d for d in results.get("discrepancies", [])
            if d.get("severity") == "high" and not d.get("resolved")
        ]
        
        # Determine overall severity
        if critical_discrepancies:
            severity = "critical"
            title = "CRITICAL: Unresolved Reconciliation Discrepancies"
        elif high_discrepancies:
            severity = "error"
            title = "HIGH: Unresolved Reconciliation Discrepancies"
        else:
            severity = "warning"
            title = "Unresolved Reconciliation Discrepancies"
        
        # Build message
        message = f"""
Reconciliation completed with {results['discrepancies_remaining']} unresolved discrepancies.

Summary:
- Accounts Checked: {results['accounts_checked']}
- Discrepancies Found: {results['discrepancies_found']}
- Auto-Resolved: {results['discrepancies_resolved']}
- Remaining: {results['discrepancies_remaining']}

Critical Issues: {len(critical_discrepancies)}
High Priority Issues: {len(high_discrepancies)}

Please review and resolve these discrepancies immediately.
        """.strip()
        
        # Prepare details
        alert_details = {
            "reconciliation_id": results["reconciliation_id"],
            "accounts_checked": results["accounts_checked"],
            "discrepancies_found": results["discrepancies_found"],
            "discrepancies_resolved": results["discrepancies_resolved"],
            "discrepancies_remaining": results["discrepancies_remaining"],
            "critical_count": len(critical_discrepancies),
            "high_count": len(high_discrepancies),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Add sample discrepancies (first 5)
        if critical_discrepancies:
            alert_details["sample_critical"] = critical_discrepancies[:5]
        
        # Send alert through all channels
        alert_results = await self.alert_service.send_alert(
            title=title,
            message=message,
            severity=severity,
            details=alert_details
        )
        
        self.logger.info(
            "Alert sent for unresolved discrepancies",
            alert_results=alert_results
        )
        
        # Log critical discrepancies
        if critical_discrepancies:
            self.logger.critical(
                "CRITICAL discrepancies require immediate attention",
                count=len(critical_discrepancies),
                discrepancies=critical_discrepancies
            )


# Global scheduler instance
_scheduler: Optional[ReconciliationScheduler] = None


async def get_scheduler() -> ReconciliationScheduler:
    """Get or create scheduler instance"""
    global _scheduler
    
    if _scheduler is None:
        _scheduler = ReconciliationScheduler()
    
    return _scheduler


async def start_scheduler():
    """Start the reconciliation scheduler"""
    scheduler = await get_scheduler()
    await scheduler.start()


async def stop_scheduler():
    """Stop the reconciliation scheduler"""
    scheduler = await get_scheduler()
    await scheduler.stop()


# Alert service singleton
_alert_service: Optional[AlertService] = None


async def get_alert_service() -> AlertService:
    """Get or create alert service instance"""
    global _alert_service
    
    if _alert_service is None:
        _alert_service = AlertService()
    
    return _alert_service


async def send_manual_alert(
    title: str,
    message: str,
    severity: str = "warning",
    details: Optional[Dict[str, Any]] = None,
    channels: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Send a manual alert through the alert service
    
    This can be used by other services to send alerts
    """
    alert_service = await get_alert_service()
    return await alert_service.send_alert(
        title=title,
        message=message,
        severity=severity,
        details=details,
        channels=channels
    )
