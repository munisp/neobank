"""
Locust Load Testing Configuration for NeoBank Platform

Run with: locust -f locustfile.py --host=http://localhost:8000
Web UI: http://localhost:8089

For headless mode:
locust -f locustfile.py --headless -u 100 -r 10 --run-time 60s --host http://localhost:8000
"""

import random
import string
from datetime import datetime
from locust import HttpUser, task, between, events
from locust.runners import MasterRunner


class NeoBankUser(HttpUser):
    """Simulates a typical NeoBank mobile app user"""
    
    wait_time = between(1, 5)  # Wait 1-5 seconds between tasks
    
    def on_start(self):
        """Called when a user starts - performs login"""
        self.token = None
        self.user_id = None
        
        # Attempt login
        response = self.client.post(
            "/api/v1/auth/login",
            json={
                "phone": f"+234801{random.randint(1000000, 9999999)}",
                "password": "TestPassword123!"
            },
            name="/api/v1/auth/login"
        )
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            self.user_id = data.get("user_id")
    
    @property
    def headers(self):
        """Get authorization headers"""
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}
    
    # ==================== Core Banking Tasks ====================
    
    @task(20)
    def check_balance(self):
        """Check account balance - most common operation"""
        self.client.get(
            "/api/v1/accounts/balance",
            headers=self.headers,
            name="/api/v1/accounts/balance"
        )
    
    @task(15)
    def view_transactions(self):
        """View recent transactions"""
        self.client.get(
            "/api/v1/transactions?limit=20",
            headers=self.headers,
            name="/api/v1/transactions"
        )
    
    @task(10)
    def view_transaction_details(self):
        """View specific transaction details"""
        tx_id = f"TX{random.randint(100000, 999999)}"
        self.client.get(
            f"/api/v1/transactions/{tx_id}",
            headers=self.headers,
            name="/api/v1/transactions/[id]"
        )
    
    @task(5)
    def transfer_p2p(self):
        """Perform P2P transfer"""
        self.client.post(
            "/api/v1/transfers/p2p",
            json={
                "recipient_phone": f"+234809{random.randint(1000000, 9999999)}",
                "amount": random.randint(100, 10000),
                "narration": f"Load test transfer {datetime.now().isoformat()}",
                "pin": "1234"
            },
            headers=self.headers,
            name="/api/v1/transfers/p2p"
        )
    
    @task(3)
    def transfer_bank(self):
        """Perform bank transfer"""
        self.client.post(
            "/api/v1/transfers/bank",
            json={
                "bank_code": random.choice(["058", "044", "011", "033"]),
                "account_number": f"{random.randint(1000000000, 9999999999)}",
                "amount": random.randint(1000, 50000),
                "narration": "Load test bank transfer",
                "pin": "1234"
            },
            headers=self.headers,
            name="/api/v1/transfers/bank"
        )
    
    # ==================== Bills & Airtime Tasks ====================
    
    @task(8)
    def buy_airtime(self):
        """Buy airtime"""
        self.client.post(
            "/api/v1/bills/airtime",
            json={
                "phone": f"+234{random.choice(['803', '805', '806', '813'])}{random.randint(1000000, 9999999)}",
                "amount": random.choice([100, 200, 500, 1000, 2000]),
                "network": random.choice(["MTN", "AIRTEL", "GLO", "9MOBILE"]),
                "pin": "1234"
            },
            headers=self.headers,
            name="/api/v1/bills/airtime"
        )
    
    @task(4)
    def pay_electricity(self):
        """Pay electricity bill"""
        self.client.post(
            "/api/v1/bills/electricity",
            json={
                "meter_number": f"{random.randint(10000000000, 99999999999)}",
                "amount": random.randint(1000, 20000),
                "provider": random.choice(["EKEDC", "IKEDC", "AEDC", "PHED"]),
                "meter_type": random.choice(["prepaid", "postpaid"]),
                "pin": "1234"
            },
            headers=self.headers,
            name="/api/v1/bills/electricity"
        )
    
    # ==================== Savings Tasks ====================
    
    @task(6)
    def view_savings_vaults(self):
        """View savings vaults"""
        self.client.get(
            "/api/v1/savings/vaults",
            headers=self.headers,
            name="/api/v1/savings/vaults"
        )
    
    @task(2)
    def create_savings_vault(self):
        """Create a new savings vault"""
        self.client.post(
            "/api/v1/savings/vaults",
            json={
                "name": f"Load Test Vault {random.randint(1, 1000)}",
                "target_amount": random.randint(10000, 1000000),
                "target_date": "2025-12-31",
                "auto_debit": random.choice([True, False])
            },
            headers=self.headers,
            name="/api/v1/savings/vaults [POST]"
        )
    
    # ==================== Investment Tasks ====================
    
    @task(4)
    def view_portfolio(self):
        """View investment portfolio"""
        self.client.get(
            "/api/v1/investments/portfolio",
            headers=self.headers,
            name="/api/v1/investments/portfolio"
        )
    
    @task(3)
    def view_stocks(self):
        """View available stocks"""
        exchange = random.choice(["NGX", "JSE", "NSE", "GSE"])
        self.client.get(
            f"/api/v1/investments/stocks?exchange={exchange}",
            headers=self.headers,
            name="/api/v1/investments/stocks"
        )
    
    @task(2)
    def view_crypto_prices(self):
        """View crypto prices"""
        self.client.get(
            "/api/v1/investments/crypto/prices",
            headers=self.headers,
            name="/api/v1/investments/crypto/prices"
        )
    
    # ==================== Connectivity Tasks ====================
    
    @task(10)
    def update_power_state(self):
        """Update device power state"""
        self.client.post(
            "/api/v1/connectivity/power/state",
            json={
                "device_id": f"device_{random.randint(1, 10000)}",
                "battery_level": random.randint(0, 100),
                "is_charging": random.choice([True, False]),
                "power_save_mode": random.choice([True, False])
            },
            name="/api/v1/connectivity/power/state"
        )
    
    @task(8)
    def get_skeleton_data(self):
        """Get skeleton data for progressive loading"""
        screen = random.choice(["dashboard", "transactions", "accounts", "investments", "savings"])
        self.client.get(
            f"/api/v1/connectivity/loading/skeleton/{screen}",
            headers=self.headers,
            name="/api/v1/connectivity/loading/skeleton/[screen]"
        )
    
    @task(5)
    def update_network_quality(self):
        """Update network quality"""
        self.client.post(
            "/api/v1/connectivity/adaptive/network",
            json={
                "device_id": f"device_{random.randint(1, 10000)}",
                "connection_type": random.choice(["2g", "3g", "4g", "wifi"]),
                "download_speed": random.uniform(0.01, 50.0),
                "upload_speed": random.uniform(0.01, 20.0),
                "latency": random.randint(50, 2000)
            },
            name="/api/v1/connectivity/adaptive/network"
        )
    
    # ==================== Health Check ====================
    
    @task(5)
    def health_check(self):
        """Health check endpoint"""
        self.client.get("/api/v1/health", name="/api/v1/health")


class FeaturePhoneUser(HttpUser):
    """Simulates feature phone users using USSD/SMS"""
    
    wait_time = between(5, 15)  # Slower interaction for feature phones
    
    def on_start(self):
        """Initialize feature phone user"""
        self.phone = f"+234801{random.randint(1000000, 9999999)}"
        self.session_id = None
    
    @task(10)
    def ussd_balance_check(self):
        """Check balance via USSD"""
        self.session_id = f"ussd_{random.randint(100000, 999999)}"
        
        # Start session
        self.client.post(
            "/api/v1/ussd/callback",
            json={
                "sessionId": self.session_id,
                "phoneNumber": self.phone,
                "serviceCode": "*347*123#",
                "text": ""
            },
            name="/api/v1/ussd/callback [start]"
        )
        
        # Select balance option
        self.client.post(
            "/api/v1/ussd/callback",
            json={
                "sessionId": self.session_id,
                "phoneNumber": self.phone,
                "serviceCode": "*347*123#",
                "text": "1"
            },
            name="/api/v1/ussd/callback [balance]"
        )
    
    @task(5)
    def ussd_transfer(self):
        """Transfer via USSD"""
        self.session_id = f"ussd_{random.randint(100000, 999999)}"
        recipient = f"0809{random.randint(1000000, 9999999)}"
        amount = random.randint(100, 5000)
        
        self.client.post(
            "/api/v1/ussd/callback",
            json={
                "sessionId": self.session_id,
                "phoneNumber": self.phone,
                "serviceCode": "*347*123#",
                "text": f"2*{recipient}*{amount}*1234"
            },
            name="/api/v1/ussd/callback [transfer]"
        )
    
    @task(8)
    def sms_balance_check(self):
        """Check balance via SMS"""
        self.client.post(
            "/api/v1/sms/incoming",
            json={
                "from": self.phone,
                "to": "32123",
                "text": "BAL 1234"
            },
            name="/api/v1/sms/incoming [balance]"
        )
    
    @task(4)
    def sms_transfer(self):
        """Transfer via SMS"""
        recipient = f"0809{random.randint(1000000, 9999999)}"
        amount = random.randint(100, 5000)
        
        self.client.post(
            "/api/v1/sms/incoming",
            json={
                "from": self.phone,
                "to": "32123",
                "text": f"SEND {recipient} {amount} 1234"
            },
            name="/api/v1/sms/incoming [transfer]"
        )
    
    @task(6)
    def sms_airtime(self):
        """Buy airtime via SMS"""
        phone = f"0803{random.randint(1000000, 9999999)}"
        amount = random.choice([100, 200, 500, 1000])
        
        self.client.post(
            "/api/v1/sms/incoming",
            json={
                "from": self.phone,
                "to": "32123",
                "text": f"AIR {phone} {amount} 1234"
            },
            name="/api/v1/sms/incoming [airtime]"
        )


class OfflineUser(HttpUser):
    """Simulates users with intermittent connectivity"""
    
    wait_time = between(2, 10)
    
    def on_start(self):
        """Initialize offline user"""
        self.device_id = f"offline_device_{random.randint(1, 10000)}"
        self.user_id = f"offline_user_{random.randint(1, 10000)}"
        self.sequence = 0
    
    @task(10)
    def queue_offline_transaction(self):
        """Queue an offline transaction"""
        self.sequence += 1
        
        self.client.post(
            "/api/v1/connectivity/offline/queue",
            json={
                "transaction_id": f"OFF_{datetime.now().timestamp()}_{random.randint(1, 1000)}",
                "user_id": self.user_id,
                "device_id": self.device_id,
                "type": random.choice(["transfer", "airtime", "bill"]),
                "amount": random.randint(100, 10000),
                "recipient": f"+234809{random.randint(1000000, 9999999)}",
                "signature": f"sig_{random.randint(100000, 999999)}",
                "nonce": f"nonce_{datetime.now().timestamp()}_{random.randint(1, 1000)}",
                "sequence_number": self.sequence
            },
            name="/api/v1/connectivity/offline/queue"
        )
    
    @task(5)
    def sync_offline_transactions(self):
        """Sync offline transactions"""
        self.client.post(
            "/api/v1/connectivity/offline/sync",
            json={
                "device_id": self.device_id,
                "user_id": self.user_id
            },
            name="/api/v1/connectivity/offline/sync"
        )
    
    @task(8)
    def get_pending_transactions(self):
        """Get pending offline transactions"""
        self.client.get(
            f"/api/v1/connectivity/offline/pending/{self.user_id}",
            name="/api/v1/connectivity/offline/pending/[user_id]"
        )


# ==================== Event Handlers ====================

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when test starts"""
    print("=" * 60)
    print("NeoBank Load Test Starting")
    print(f"Target Host: {environment.host}")
    print("=" * 60)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when test stops"""
    print("=" * 60)
    print("NeoBank Load Test Complete")
    print("=" * 60)


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response, context, exception, **kwargs):
    """Called on each request - can be used for custom logging"""
    if exception:
        print(f"Request failed: {name} - {exception}")
    elif response.status_code >= 500:
        print(f"Server error: {name} - {response.status_code}")
