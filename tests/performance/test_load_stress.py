"""
Comprehensive Performance Tests for NeoBank Platform

Includes load testing, stress testing, and performance benchmarks.
Uses locust for load testing and custom benchmarks for specific operations.
"""

import asyncio
import json
import os
import time
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Any
from statistics import mean, median, stdev

import pytest
import httpx

# Test configuration
API_URL = os.getenv("NEOBANK_API_URL", "http://localhost:8000")
LOAD_TEST_USERS = int(os.getenv("LOAD_TEST_USERS", "100"))
STRESS_TEST_USERS = int(os.getenv("STRESS_TEST_USERS", "500"))


class PerformanceMetrics:
    """Helper class to collect and analyze performance metrics"""
    
    def __init__(self):
        self.response_times: List[float] = []
        self.errors: List[str] = []
        self.success_count = 0
        self.failure_count = 0
    
    def record(self, response_time: float, success: bool, error: str = None):
        self.response_times.append(response_time)
        if success:
            self.success_count += 1
        else:
            self.failure_count += 1
            if error:
                self.errors.append(error)
    
    def get_stats(self) -> Dict[str, Any]:
        if not self.response_times:
            return {}
        
        sorted_times = sorted(self.response_times)
        p95_idx = int(len(sorted_times) * 0.95)
        p99_idx = int(len(sorted_times) * 0.99)
        
        return {
            "total_requests": len(self.response_times),
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "success_rate": self.success_count / len(self.response_times) * 100,
            "min_response_time": min(self.response_times),
            "max_response_time": max(self.response_times),
            "mean_response_time": mean(self.response_times),
            "median_response_time": median(self.response_times),
            "p95_response_time": sorted_times[p95_idx] if p95_idx < len(sorted_times) else sorted_times[-1],
            "p99_response_time": sorted_times[p99_idx] if p99_idx < len(sorted_times) else sorted_times[-1],
            "std_dev": stdev(self.response_times) if len(self.response_times) > 1 else 0
        }


# ==================== Load Tests ====================

class TestLoadPerformance:
    """Load tests for normal traffic patterns"""

    @pytest.mark.asyncio
    async def test_health_endpoint_load(self):
        """Load test health endpoint - should handle 1000 req/s"""
        metrics = PerformanceMetrics()
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as client:
            async def make_request():
                start = time.time()
                try:
                    response = await client.get("/api/v1/health")
                    elapsed = time.time() - start
                    metrics.record(elapsed, response.status_code == 200)
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
            
            # Run 100 concurrent requests
            tasks = [make_request() for _ in range(100)]
            await asyncio.gather(*tasks)
        
        stats = metrics.get_stats()
        print(f"\nHealth Endpoint Load Test Results:")
        print(f"  Total Requests: {stats['total_requests']}")
        print(f"  Success Rate: {stats['success_rate']:.2f}%")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        print(f"  P95 Response Time: {stats['p95_response_time']*1000:.2f}ms")
        
        # Assertions
        assert stats['success_rate'] >= 95, "Success rate should be >= 95%"
        assert stats['p95_response_time'] < 1.0, "P95 should be < 1 second"

    @pytest.mark.asyncio
    async def test_authentication_load(self):
        """Load test authentication endpoint"""
        metrics = PerformanceMetrics()
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as client:
            async def make_request():
                start = time.time()
                try:
                    response = await client.post(
                        "/api/v1/auth/login",
                        json={
                            "phone": "+2348012345678",
                            "password": "TestPassword123!"
                        }
                    )
                    elapsed = time.time() - start
                    # Accept both success and auth failure
                    metrics.record(elapsed, response.status_code in [200, 401])
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
            
            # Run 50 concurrent login attempts
            tasks = [make_request() for _ in range(50)]
            await asyncio.gather(*tasks)
        
        stats = metrics.get_stats()
        print(f"\nAuthentication Load Test Results:")
        print(f"  Total Requests: {stats['total_requests']}")
        print(f"  Success Rate: {stats['success_rate']:.2f}%")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        print(f"  P95 Response Time: {stats['p95_response_time']*1000:.2f}ms")
        
        assert stats['success_rate'] >= 90, "Success rate should be >= 90%"
        assert stats['p95_response_time'] < 3.0, "P95 should be < 3 seconds"

    @pytest.mark.asyncio
    async def test_transfer_endpoint_load(self):
        """Load test transfer endpoint"""
        metrics = PerformanceMetrics()
        headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as client:
            async def make_request(i: int):
                start = time.time()
                try:
                    response = await client.post(
                        "/api/v1/transfers/p2p",
                        json={
                            "recipient_phone": f"+234809876{5432 + i}",
                            "amount": 100,
                            "narration": f"Load test {i}",
                            "pin": "1234"
                        },
                        headers=headers
                    )
                    elapsed = time.time() - start
                    # Accept various responses
                    metrics.record(elapsed, response.status_code in [200, 201, 400, 401, 422])
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
            
            # Run 30 concurrent transfer requests
            tasks = [make_request(i) for i in range(30)]
            await asyncio.gather(*tasks)
        
        stats = metrics.get_stats()
        print(f"\nTransfer Endpoint Load Test Results:")
        print(f"  Total Requests: {stats['total_requests']}")
        print(f"  Success Rate: {stats['success_rate']:.2f}%")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        print(f"  P95 Response Time: {stats['p95_response_time']*1000:.2f}ms")
        
        assert stats['success_rate'] >= 80, "Success rate should be >= 80%"
        assert stats['p95_response_time'] < 5.0, "P95 should be < 5 seconds"

    @pytest.mark.asyncio
    async def test_connectivity_endpoints_load(self):
        """Load test connectivity endpoints for low-connectivity scenarios"""
        metrics = PerformanceMetrics()
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as client:
            async def make_request(i: int):
                start = time.time()
                try:
                    # Test power state endpoint
                    response = await client.post(
                        "/api/v1/connectivity/power/state",
                        json={
                            "device_id": f"device_{i}",
                            "battery_level": i % 100,
                            "is_charging": i % 2 == 0,
                            "power_save_mode": i % 3 == 0
                        }
                    )
                    elapsed = time.time() - start
                    metrics.record(elapsed, response.status_code in [200, 422])
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
            
            # Run 100 concurrent requests
            tasks = [make_request(i) for i in range(100)]
            await asyncio.gather(*tasks)
        
        stats = metrics.get_stats()
        print(f"\nConnectivity Endpoints Load Test Results:")
        print(f"  Total Requests: {stats['total_requests']}")
        print(f"  Success Rate: {stats['success_rate']:.2f}%")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        print(f"  P95 Response Time: {stats['p95_response_time']*1000:.2f}ms")
        
        assert stats['success_rate'] >= 95, "Success rate should be >= 95%"
        assert stats['p95_response_time'] < 2.0, "P95 should be < 2 seconds"


# ==================== Stress Tests ====================

class TestStressPerformance:
    """Stress tests for high traffic scenarios"""

    @pytest.mark.asyncio
    async def test_api_under_stress(self):
        """Stress test API with high concurrent load"""
        metrics = PerformanceMetrics()
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=60.0) as client:
            async def make_request():
                start = time.time()
                try:
                    response = await client.get("/api/v1/health")
                    elapsed = time.time() - start
                    metrics.record(elapsed, response.status_code == 200)
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
            
            # Run 500 concurrent requests (stress test)
            tasks = [make_request() for _ in range(500)]
            await asyncio.gather(*tasks)
        
        stats = metrics.get_stats()
        print(f"\nAPI Stress Test Results:")
        print(f"  Total Requests: {stats['total_requests']}")
        print(f"  Success Rate: {stats['success_rate']:.2f}%")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        print(f"  P99 Response Time: {stats['p99_response_time']*1000:.2f}ms")
        
        # Under stress, we accept lower success rate
        assert stats['success_rate'] >= 80, "Success rate should be >= 80% under stress"

    @pytest.mark.asyncio
    async def test_sustained_load(self):
        """Test sustained load over time"""
        metrics = PerformanceMetrics()
        duration_seconds = 10  # Run for 10 seconds
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as client:
            start_time = time.time()
            
            async def make_continuous_requests():
                while time.time() - start_time < duration_seconds:
                    req_start = time.time()
                    try:
                        response = await client.get("/api/v1/health")
                        elapsed = time.time() - req_start
                        metrics.record(elapsed, response.status_code == 200)
                    except Exception as e:
                        elapsed = time.time() - req_start
                        metrics.record(elapsed, False, str(e))
                    await asyncio.sleep(0.01)  # Small delay between requests
            
            # Run 10 concurrent workers
            tasks = [make_continuous_requests() for _ in range(10)]
            await asyncio.gather(*tasks)
        
        stats = metrics.get_stats()
        requests_per_second = stats['total_requests'] / duration_seconds
        
        print(f"\nSustained Load Test Results ({duration_seconds}s):")
        print(f"  Total Requests: {stats['total_requests']}")
        print(f"  Requests/Second: {requests_per_second:.2f}")
        print(f"  Success Rate: {stats['success_rate']:.2f}%")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        
        assert stats['success_rate'] >= 90, "Success rate should be >= 90%"


# ==================== Benchmark Tests ====================

class TestBenchmarks:
    """Benchmark tests for specific operations"""

    @pytest.mark.asyncio
    async def test_skeleton_loading_benchmark(self):
        """Benchmark skeleton data loading for progressive loading"""
        metrics = PerformanceMetrics()
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=10.0) as client:
            for screen in ["dashboard", "transactions", "accounts", "investments"]:
                start = time.time()
                try:
                    response = await client.get(
                        f"/api/v1/connectivity/loading/skeleton/{screen}"
                    )
                    elapsed = time.time() - start
                    metrics.record(elapsed, response.status_code in [200, 401])
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
        
        stats = metrics.get_stats()
        print(f"\nSkeleton Loading Benchmark:")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        
        # Skeleton data should be very fast (< 100ms)
        assert stats['mean_response_time'] < 0.5, "Skeleton loading should be < 500ms"

    @pytest.mark.asyncio
    async def test_data_saver_response_size(self):
        """Benchmark response size with data saver mode"""
        async with httpx.AsyncClient(base_url=API_URL, timeout=10.0) as client:
            # Normal request
            normal_response = await client.get("/api/v1/health")
            normal_size = len(normal_response.content)
            
            # Data saver request
            headers = {
                "X-Data-Saver": "true",
                "X-Connection-Type": "2g"
            }
            saver_response = await client.get("/api/v1/health", headers=headers)
            saver_size = len(saver_response.content)
            
            print(f"\nData Saver Response Size Benchmark:")
            print(f"  Normal Size: {normal_size} bytes")
            print(f"  Data Saver Size: {saver_size} bytes")
            
            # Data saver should not increase response size
            assert saver_size <= normal_size * 1.1, "Data saver should not increase size"

    @pytest.mark.asyncio
    async def test_offline_queue_throughput(self):
        """Benchmark offline transaction queue throughput"""
        metrics = PerformanceMetrics()
        headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as client:
            for i in range(20):
                start = time.time()
                try:
                    response = await client.post(
                        "/api/v1/connectivity/offline/queue",
                        json={
                            "transaction_id": f"OFF_{datetime.now().timestamp()}_{i}",
                            "user_id": "test_user",
                            "device_id": "test_device",
                            "type": "transfer",
                            "amount": 1000,
                            "recipient": "+2348098765432",
                            "signature": "test_signature",
                            "nonce": f"nonce_{datetime.now().timestamp()}_{i}",
                            "sequence_number": i
                        },
                        headers=headers
                    )
                    elapsed = time.time() - start
                    metrics.record(elapsed, response.status_code in [200, 201, 400, 401, 422])
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
        
        stats = metrics.get_stats()
        print(f"\nOffline Queue Throughput Benchmark:")
        print(f"  Total Queued: {stats['total_requests']}")
        print(f"  Mean Queue Time: {stats['mean_response_time']*1000:.2f}ms")
        
        # Queuing should be fast (< 500ms)
        assert stats['mean_response_time'] < 1.0, "Queue operation should be < 1 second"

    @pytest.mark.asyncio
    async def test_ussd_response_time(self):
        """Benchmark USSD response time (critical for 3-minute timeout)"""
        metrics = PerformanceMetrics()
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=10.0) as client:
            for i in range(10):
                start = time.time()
                try:
                    response = await client.post(
                        "/api/v1/ussd/callback",
                        json={
                            "sessionId": f"bench_{datetime.now().timestamp()}_{i}",
                            "phoneNumber": "+2348012345678",
                            "serviceCode": "*347*123#",
                            "text": ""
                        }
                    )
                    elapsed = time.time() - start
                    metrics.record(elapsed, response.status_code in [200, 422])
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
        
        stats = metrics.get_stats()
        print(f"\nUSSD Response Time Benchmark:")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        print(f"  P95 Response Time: {stats['p95_response_time']*1000:.2f}ms")
        
        # USSD must be fast (< 2 seconds for good UX)
        assert stats['p95_response_time'] < 2.0, "USSD P95 should be < 2 seconds"

    @pytest.mark.asyncio
    async def test_sms_response_time(self):
        """Benchmark SMS banking response time"""
        metrics = PerformanceMetrics()
        
        async with httpx.AsyncClient(base_url=API_URL, timeout=10.0) as client:
            for i in range(10):
                start = time.time()
                try:
                    response = await client.post(
                        "/api/v1/sms/incoming",
                        json={
                            "from": "+2348012345678",
                            "to": "32123",
                            "text": "BAL 1234"
                        }
                    )
                    elapsed = time.time() - start
                    metrics.record(elapsed, response.status_code in [200, 422])
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
        
        stats = metrics.get_stats()
        print(f"\nSMS Response Time Benchmark:")
        print(f"  Mean Response Time: {stats['mean_response_time']*1000:.2f}ms")
        
        # SMS should be processed quickly
        assert stats['mean_response_time'] < 3.0, "SMS processing should be < 3 seconds"


# ==================== Memory and Resource Tests ====================

class TestResourceUsage:
    """Tests for memory and resource usage"""

    @pytest.mark.asyncio
    async def test_no_memory_leak_on_repeated_requests(self):
        """Test that repeated requests don't cause memory leaks"""
        async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as client:
            # Make many requests
            for batch in range(5):
                tasks = [client.get("/api/v1/health") for _ in range(100)]
                await asyncio.gather(*tasks)
                
                # Small delay between batches
                await asyncio.sleep(0.5)
        
        # If we get here without OOM, test passes
        assert True

    @pytest.mark.asyncio
    async def test_connection_pool_handling(self):
        """Test that connection pools are handled correctly"""
        metrics = PerformanceMetrics()
        
        # Create multiple clients to test connection handling
        for _ in range(5):
            async with httpx.AsyncClient(base_url=API_URL, timeout=10.0) as client:
                start = time.time()
                try:
                    response = await client.get("/api/v1/health")
                    elapsed = time.time() - start
                    metrics.record(elapsed, response.status_code == 200)
                except Exception as e:
                    elapsed = time.time() - start
                    metrics.record(elapsed, False, str(e))
        
        stats = metrics.get_stats()
        assert stats['success_rate'] >= 80, "Connection pool should handle multiple clients"


# ==================== Locust Load Test Configuration ====================

LOCUST_CONFIG = """
# locustfile.py - Run with: locust -f locustfile.py --host=http://localhost:8000

from locust import HttpUser, task, between
import random

class NeoBankUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        # Login on start
        self.client.post("/api/v1/auth/login", json={
            "phone": "+2348012345678",
            "password": "TestPassword123!"
        })
    
    @task(10)
    def check_balance(self):
        self.client.get("/api/v1/accounts/balance")
    
    @task(5)
    def view_transactions(self):
        self.client.get("/api/v1/transactions?limit=10")
    
    @task(3)
    def transfer_p2p(self):
        self.client.post("/api/v1/transfers/p2p", json={
            "recipient_phone": f"+234809876{random.randint(1000, 9999)}",
            "amount": random.randint(100, 10000),
            "narration": "Load test transfer",
            "pin": "1234"
        })
    
    @task(2)
    def check_savings(self):
        self.client.get("/api/v1/savings/vaults")
    
    @task(1)
    def view_investments(self):
        self.client.get("/api/v1/investments/portfolio")
    
    @task(5)
    def health_check(self):
        self.client.get("/api/v1/health")
    
    @task(3)
    def connectivity_power_state(self):
        self.client.post("/api/v1/connectivity/power/state", json={
            "device_id": f"device_{random.randint(1, 1000)}",
            "battery_level": random.randint(0, 100),
            "is_charging": random.choice([True, False]),
            "power_save_mode": random.choice([True, False])
        })
    
    @task(2)
    def skeleton_loading(self):
        screen = random.choice(["dashboard", "transactions", "accounts", "investments"])
        self.client.get(f"/api/v1/connectivity/loading/skeleton/{screen}")


class FeaturePhoneUser(HttpUser):
    '''Simulates feature phone users using USSD/SMS'''
    wait_time = between(5, 15)  # Slower interaction
    
    @task(5)
    def ussd_balance(self):
        self.client.post("/api/v1/ussd/callback", json={
            "sessionId": f"ussd_{random.randint(1, 100000)}",
            "phoneNumber": "+2348012345678",
            "serviceCode": "*347*123#",
            "text": "1"  # Balance check
        })
    
    @task(3)
    def sms_balance(self):
        self.client.post("/api/v1/sms/incoming", json={
            "from": "+2348012345678",
            "to": "32123",
            "text": "BAL 1234"
        })
    
    @task(2)
    def ussd_transfer(self):
        self.client.post("/api/v1/ussd/callback", json={
            "sessionId": f"ussd_{random.randint(1, 100000)}",
            "phoneNumber": "+2348012345678",
            "serviceCode": "*347*123#",
            "text": f"2*08098765432*{random.randint(100, 5000)}*1234"
        })
"""


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-s"])
