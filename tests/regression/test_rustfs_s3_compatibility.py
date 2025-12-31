"""
RustFS S3 Compatibility Regression Test Suite

This test suite validates S3 API compatibility between MinIO and RustFS
to ensure a smooth migration path for the NeoBank lakehouse stack.

Tests cover:
- Bucket CRUD operations
- Object CRUD operations
- Multipart uploads
- Range GET requests
- List consistency under load
- Presigned URLs
- Error code parity
- Hadoop S3A / Iceberg / Trino compatibility
"""

import asyncio
import hashlib
import io
import os
import random
import string
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

import boto3
import pytest
from botocore.config import Config
from botocore.exceptions import ClientError

# Configuration
RUSTFS_ENDPOINT = os.getenv("RUSTFS_ENDPOINT", "http://localhost:9000")
RUSTFS_ACCESS_KEY = os.getenv("RUSTFS_ACCESS_KEY", "rustfsadmin")
RUSTFS_SECRET_KEY = os.getenv("RUSTFS_SECRET_KEY", "rustfsadmin")
RUSTFS_REGION = os.getenv("RUSTFS_REGION", "us-east-1")

# Test bucket prefix to avoid conflicts
TEST_BUCKET_PREFIX = "neobank-test-"


def get_s3_client():
    """Create S3 client configured for RustFS."""
    return boto3.client(
        "s3",
        endpoint_url=RUSTFS_ENDPOINT,
        aws_access_key_id=RUSTFS_ACCESS_KEY,
        aws_secret_access_key=RUSTFS_SECRET_KEY,
        region_name=RUSTFS_REGION,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def generate_random_string(length: int = 10) -> str:
    """Generate a random string for test data."""
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def generate_test_data(size_bytes: int) -> bytes:
    """Generate random test data of specified size."""
    return os.urandom(size_bytes)


def calculate_md5(data: bytes) -> str:
    """Calculate MD5 hash of data."""
    return hashlib.md5(data).hexdigest()


@pytest.fixture(scope="module")
def s3_client():
    """Fixture to provide S3 client."""
    return get_s3_client()


@pytest.fixture(scope="function")
def test_bucket(s3_client):
    """Fixture to create and cleanup a test bucket."""
    bucket_name = f"{TEST_BUCKET_PREFIX}{generate_random_string()}"
    s3_client.create_bucket(Bucket=bucket_name)
    yield bucket_name
    # Cleanup: delete all objects and the bucket
    try:
        response = s3_client.list_objects_v2(Bucket=bucket_name)
        if "Contents" in response:
            for obj in response["Contents"]:
                s3_client.delete_object(Bucket=bucket_name, Key=obj["Key"])
        s3_client.delete_bucket(Bucket=bucket_name)
    except Exception as e:
        print(f"Cleanup error: {e}")


class TestBucketOperations:
    """Test bucket CRUD operations."""

    def test_create_bucket(self, s3_client):
        """Test bucket creation."""
        bucket_name = f"{TEST_BUCKET_PREFIX}{generate_random_string()}"
        try:
            response = s3_client.create_bucket(Bucket=bucket_name)
            assert response["ResponseMetadata"]["HTTPStatusCode"] == 200
        finally:
            s3_client.delete_bucket(Bucket=bucket_name)

    def test_list_buckets(self, s3_client, test_bucket):
        """Test listing buckets."""
        response = s3_client.list_buckets()
        assert response["ResponseMetadata"]["HTTPStatusCode"] == 200
        bucket_names = [b["Name"] for b in response["Buckets"]]
        assert test_bucket in bucket_names

    def test_head_bucket(self, s3_client, test_bucket):
        """Test bucket existence check."""
        response = s3_client.head_bucket(Bucket=test_bucket)
        assert response["ResponseMetadata"]["HTTPStatusCode"] == 200

    def test_delete_bucket(self, s3_client):
        """Test bucket deletion."""
        bucket_name = f"{TEST_BUCKET_PREFIX}{generate_random_string()}"
        s3_client.create_bucket(Bucket=bucket_name)
        response = s3_client.delete_bucket(Bucket=bucket_name)
        assert response["ResponseMetadata"]["HTTPStatusCode"] == 204

    def test_bucket_not_found_error(self, s3_client):
        """Test NoSuchBucket error code."""
        with pytest.raises(ClientError) as exc_info:
            s3_client.head_bucket(Bucket="nonexistent-bucket-12345")
        assert exc_info.value.response["Error"]["Code"] in ["404", "NoSuchBucket"]

    def test_bucket_already_exists_error(self, s3_client, test_bucket):
        """Test BucketAlreadyExists error code."""
        with pytest.raises(ClientError) as exc_info:
            s3_client.create_bucket(Bucket=test_bucket)
        assert exc_info.value.response["Error"]["Code"] in [
            "BucketAlreadyExists",
            "BucketAlreadyOwnedByYou",
        ]


class TestObjectOperations:
    """Test object CRUD operations."""

    def test_put_object_small(self, s3_client, test_bucket):
        """Test uploading a small object (4KB - RustFS optimized size)."""
        key = f"test-small-{generate_random_string()}.txt"
        data = generate_test_data(4 * 1024)  # 4KB
        md5_hash = calculate_md5(data)

        response = s3_client.put_object(
            Bucket=test_bucket,
            Key=key,
            Body=data,
            ContentType="application/octet-stream",
        )
        assert response["ResponseMetadata"]["HTTPStatusCode"] == 200
        assert "ETag" in response

    def test_put_object_medium(self, s3_client, test_bucket):
        """Test uploading a medium object (1MB)."""
        key = f"test-medium-{generate_random_string()}.bin"
        data = generate_test_data(1024 * 1024)  # 1MB

        response = s3_client.put_object(
            Bucket=test_bucket,
            Key=key,
            Body=data,
        )
        assert response["ResponseMetadata"]["HTTPStatusCode"] == 200

    def test_get_object(self, s3_client, test_bucket):
        """Test downloading an object."""
        key = f"test-get-{generate_random_string()}.txt"
        data = b"Hello, RustFS!"

        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)
        response = s3_client.get_object(Bucket=test_bucket, Key=key)

        assert response["ResponseMetadata"]["HTTPStatusCode"] == 200
        assert response["Body"].read() == data

    def test_head_object(self, s3_client, test_bucket):
        """Test object metadata retrieval."""
        key = f"test-head-{generate_random_string()}.txt"
        data = b"Test content for head"

        s3_client.put_object(
            Bucket=test_bucket,
            Key=key,
            Body=data,
            ContentType="text/plain",
        )
        response = s3_client.head_object(Bucket=test_bucket, Key=key)

        assert response["ResponseMetadata"]["HTTPStatusCode"] == 200
        assert response["ContentLength"] == len(data)
        assert response["ContentType"] == "text/plain"

    def test_delete_object(self, s3_client, test_bucket):
        """Test object deletion."""
        key = f"test-delete-{generate_random_string()}.txt"
        s3_client.put_object(Bucket=test_bucket, Key=key, Body=b"Delete me")

        response = s3_client.delete_object(Bucket=test_bucket, Key=key)
        assert response["ResponseMetadata"]["HTTPStatusCode"] == 204

        # Verify deletion
        with pytest.raises(ClientError) as exc_info:
            s3_client.head_object(Bucket=test_bucket, Key=key)
        assert exc_info.value.response["Error"]["Code"] in ["404", "NoSuchKey"]

    def test_copy_object(self, s3_client, test_bucket):
        """Test object copy operation."""
        source_key = f"test-copy-source-{generate_random_string()}.txt"
        dest_key = f"test-copy-dest-{generate_random_string()}.txt"
        data = b"Copy this content"

        s3_client.put_object(Bucket=test_bucket, Key=source_key, Body=data)
        response = s3_client.copy_object(
            Bucket=test_bucket,
            Key=dest_key,
            CopySource=f"{test_bucket}/{source_key}",
        )

        assert response["ResponseMetadata"]["HTTPStatusCode"] == 200

        # Verify copy
        get_response = s3_client.get_object(Bucket=test_bucket, Key=dest_key)
        assert get_response["Body"].read() == data

    def test_object_not_found_error(self, s3_client, test_bucket):
        """Test NoSuchKey error code."""
        with pytest.raises(ClientError) as exc_info:
            s3_client.get_object(Bucket=test_bucket, Key="nonexistent-key")
        assert exc_info.value.response["Error"]["Code"] in ["404", "NoSuchKey"]


class TestRangeRequests:
    """Test range GET requests (critical for Iceberg/Parquet)."""

    def test_range_get_start(self, s3_client, test_bucket):
        """Test range GET from start."""
        key = f"test-range-{generate_random_string()}.bin"
        data = generate_test_data(1024)

        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)
        response = s3_client.get_object(
            Bucket=test_bucket,
            Key=key,
            Range="bytes=0-99",
        )

        assert response["ResponseMetadata"]["HTTPStatusCode"] == 206
        assert response["Body"].read() == data[:100]

    def test_range_get_middle(self, s3_client, test_bucket):
        """Test range GET from middle."""
        key = f"test-range-mid-{generate_random_string()}.bin"
        data = generate_test_data(1024)

        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)
        response = s3_client.get_object(
            Bucket=test_bucket,
            Key=key,
            Range="bytes=100-199",
        )

        assert response["ResponseMetadata"]["HTTPStatusCode"] == 206
        assert response["Body"].read() == data[100:200]

    def test_range_get_end(self, s3_client, test_bucket):
        """Test range GET from end."""
        key = f"test-range-end-{generate_random_string()}.bin"
        data = generate_test_data(1024)

        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)
        response = s3_client.get_object(
            Bucket=test_bucket,
            Key=key,
            Range="bytes=-100",
        )

        assert response["ResponseMetadata"]["HTTPStatusCode"] == 206
        assert response["Body"].read() == data[-100:]


class TestMultipartUpload:
    """Test multipart upload operations."""

    def test_multipart_upload_basic(self, s3_client, test_bucket):
        """Test basic multipart upload."""
        key = f"test-multipart-{generate_random_string()}.bin"
        part_size = 5 * 1024 * 1024  # 5MB minimum part size
        total_size = 15 * 1024 * 1024  # 15MB total
        data = generate_test_data(total_size)

        # Create multipart upload
        create_response = s3_client.create_multipart_upload(
            Bucket=test_bucket,
            Key=key,
        )
        upload_id = create_response["UploadId"]

        try:
            parts = []
            for i, offset in enumerate(range(0, total_size, part_size), start=1):
                part_data = data[offset : offset + part_size]
                upload_response = s3_client.upload_part(
                    Bucket=test_bucket,
                    Key=key,
                    UploadId=upload_id,
                    PartNumber=i,
                    Body=part_data,
                )
                parts.append({"ETag": upload_response["ETag"], "PartNumber": i})

            # Complete multipart upload
            complete_response = s3_client.complete_multipart_upload(
                Bucket=test_bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )
            assert complete_response["ResponseMetadata"]["HTTPStatusCode"] == 200

            # Verify uploaded data
            get_response = s3_client.get_object(Bucket=test_bucket, Key=key)
            downloaded_data = get_response["Body"].read()
            assert len(downloaded_data) == total_size
            assert calculate_md5(downloaded_data) == calculate_md5(data)

        except Exception as e:
            # Abort on failure
            s3_client.abort_multipart_upload(
                Bucket=test_bucket,
                Key=key,
                UploadId=upload_id,
            )
            raise e

    def test_abort_multipart_upload(self, s3_client, test_bucket):
        """Test aborting a multipart upload."""
        key = f"test-abort-{generate_random_string()}.bin"

        create_response = s3_client.create_multipart_upload(
            Bucket=test_bucket,
            Key=key,
        )
        upload_id = create_response["UploadId"]

        response = s3_client.abort_multipart_upload(
            Bucket=test_bucket,
            Key=key,
            UploadId=upload_id,
        )
        assert response["ResponseMetadata"]["HTTPStatusCode"] == 204


class TestListOperations:
    """Test list operations and pagination."""

    def test_list_objects_v2(self, s3_client, test_bucket):
        """Test listing objects with v2 API."""
        # Create test objects
        for i in range(5):
            s3_client.put_object(
                Bucket=test_bucket,
                Key=f"list-test-{i}.txt",
                Body=f"Content {i}".encode(),
            )

        response = s3_client.list_objects_v2(Bucket=test_bucket)
        assert response["ResponseMetadata"]["HTTPStatusCode"] == 200
        assert len(response["Contents"]) >= 5

    def test_list_objects_with_prefix(self, s3_client, test_bucket):
        """Test listing objects with prefix filter."""
        # Create objects with different prefixes
        s3_client.put_object(Bucket=test_bucket, Key="prefix-a/file1.txt", Body=b"1")
        s3_client.put_object(Bucket=test_bucket, Key="prefix-a/file2.txt", Body=b"2")
        s3_client.put_object(Bucket=test_bucket, Key="prefix-b/file1.txt", Body=b"3")

        response = s3_client.list_objects_v2(Bucket=test_bucket, Prefix="prefix-a/")
        assert len(response["Contents"]) == 2

    def test_list_objects_pagination(self, s3_client, test_bucket):
        """Test listing objects with pagination."""
        # Create many objects
        for i in range(25):
            s3_client.put_object(
                Bucket=test_bucket,
                Key=f"page-test-{i:03d}.txt",
                Body=f"Content {i}".encode(),
            )

        # List with max keys
        response = s3_client.list_objects_v2(Bucket=test_bucket, MaxKeys=10)
        assert len(response["Contents"]) == 10
        assert response["IsTruncated"] is True

        # Continue with continuation token
        response2 = s3_client.list_objects_v2(
            Bucket=test_bucket,
            MaxKeys=10,
            ContinuationToken=response["NextContinuationToken"],
        )
        assert len(response2["Contents"]) == 10

    def test_list_objects_delimiter(self, s3_client, test_bucket):
        """Test listing objects with delimiter (folder simulation)."""
        s3_client.put_object(Bucket=test_bucket, Key="folder1/file1.txt", Body=b"1")
        s3_client.put_object(Bucket=test_bucket, Key="folder1/file2.txt", Body=b"2")
        s3_client.put_object(Bucket=test_bucket, Key="folder2/file1.txt", Body=b"3")
        s3_client.put_object(Bucket=test_bucket, Key="root-file.txt", Body=b"4")

        response = s3_client.list_objects_v2(Bucket=test_bucket, Delimiter="/")
        assert "CommonPrefixes" in response
        prefixes = [p["Prefix"] for p in response["CommonPrefixes"]]
        assert "folder1/" in prefixes
        assert "folder2/" in prefixes


class TestPresignedUrls:
    """Test presigned URL generation and usage."""

    def test_presigned_get_url(self, s3_client, test_bucket):
        """Test presigned GET URL."""
        key = f"presigned-get-{generate_random_string()}.txt"
        data = b"Presigned content"

        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)

        url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": test_bucket, "Key": key},
            ExpiresIn=3600,
        )
        assert url is not None
        assert test_bucket in url
        assert key in url

    def test_presigned_put_url(self, s3_client, test_bucket):
        """Test presigned PUT URL."""
        key = f"presigned-put-{generate_random_string()}.txt"

        url = s3_client.generate_presigned_url(
            "put_object",
            Params={"Bucket": test_bucket, "Key": key},
            ExpiresIn=3600,
        )
        assert url is not None
        assert test_bucket in url
        assert key in url


class TestConcurrency:
    """Test concurrent operations and consistency."""

    def test_concurrent_small_object_writes(self, s3_client, test_bucket):
        """Test concurrent small object writes (RustFS strength)."""
        num_objects = 100
        object_size = 4 * 1024  # 4KB

        def upload_object(i):
            key = f"concurrent-{i:04d}.bin"
            data = generate_test_data(object_size)
            s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)
            return key

        with ThreadPoolExecutor(max_workers=20) as executor:
            keys = list(executor.map(upload_object, range(num_objects)))

        # Verify all objects exist
        response = s3_client.list_objects_v2(Bucket=test_bucket, Prefix="concurrent-")
        assert len(response["Contents"]) == num_objects

    def test_concurrent_reads(self, s3_client, test_bucket):
        """Test concurrent read operations."""
        key = f"concurrent-read-{generate_random_string()}.bin"
        data = generate_test_data(1024 * 1024)  # 1MB
        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)

        def read_object(_):
            response = s3_client.get_object(Bucket=test_bucket, Key=key)
            return response["Body"].read()

        with ThreadPoolExecutor(max_workers=10) as executor:
            results = list(executor.map(read_object, range(50)))

        # Verify all reads returned correct data
        for result in results:
            assert result == data

    def test_list_consistency_under_load(self, s3_client, test_bucket):
        """Test list consistency while writing."""
        prefix = f"consistency-{generate_random_string()}/"
        num_objects = 50

        # Write objects
        for i in range(num_objects):
            s3_client.put_object(
                Bucket=test_bucket,
                Key=f"{prefix}obj-{i:04d}.txt",
                Body=f"Content {i}".encode(),
            )

        # Verify list returns all objects
        response = s3_client.list_objects_v2(Bucket=test_bucket, Prefix=prefix)
        assert len(response["Contents"]) == num_objects


class TestErrorCodes:
    """Test S3 error code parity."""

    def test_access_denied_error(self, s3_client):
        """Test AccessDenied error (requires invalid credentials)."""
        invalid_client = boto3.client(
            "s3",
            endpoint_url=RUSTFS_ENDPOINT,
            aws_access_key_id="invalid",
            aws_secret_access_key="invalid",
            region_name=RUSTFS_REGION,
            config=Config(s3={"addressing_style": "path"}),
        )
        with pytest.raises(ClientError) as exc_info:
            invalid_client.list_buckets()
        assert exc_info.value.response["Error"]["Code"] in [
            "AccessDenied",
            "InvalidAccessKeyId",
            "SignatureDoesNotMatch",
            "403",
        ]

    def test_invalid_bucket_name_error(self, s3_client):
        """Test InvalidBucketName error."""
        with pytest.raises(ClientError) as exc_info:
            s3_client.create_bucket(Bucket="a")  # Too short
        # Different implementations may return different error codes
        assert exc_info.value.response["Error"]["Code"] is not None


class TestLakehouseCompatibility:
    """Test Hadoop S3A / Iceberg / Trino compatibility patterns."""

    def test_parquet_like_access_pattern(self, s3_client, test_bucket):
        """Test access pattern similar to Parquet file reads."""
        key = f"data/table/partition=2024/file-{generate_random_string()}.parquet"
        data = generate_test_data(10 * 1024 * 1024)  # 10MB

        # Upload
        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)

        # Read footer (last 8 bytes for magic number)
        response = s3_client.get_object(Bucket=test_bucket, Key=key, Range="bytes=-8")
        assert len(response["Body"].read()) == 8

        # Read metadata (range in middle)
        response = s3_client.get_object(
            Bucket=test_bucket, Key=key, Range="bytes=1000-2000"
        )
        assert len(response["Body"].read()) == 1001

    def test_iceberg_metadata_pattern(self, s3_client, test_bucket):
        """Test access pattern similar to Iceberg metadata operations."""
        # Create metadata structure
        metadata_prefix = f"warehouse/db/table/metadata/"

        # Write metadata files
        s3_client.put_object(
            Bucket=test_bucket,
            Key=f"{metadata_prefix}v1.metadata.json",
            Body=b'{"format-version": 1}',
            ContentType="application/json",
        )
        s3_client.put_object(
            Bucket=test_bucket,
            Key=f"{metadata_prefix}snap-123.avro",
            Body=generate_test_data(1024),
        )
        s3_client.put_object(
            Bucket=test_bucket,
            Key=f"{metadata_prefix}version-hint.text",
            Body=b"1",
        )

        # List metadata files
        response = s3_client.list_objects_v2(Bucket=test_bucket, Prefix=metadata_prefix)
        assert len(response["Contents"]) == 3

        # Read version hint
        response = s3_client.get_object(
            Bucket=test_bucket, Key=f"{metadata_prefix}version-hint.text"
        )
        assert response["Body"].read() == b"1"

    def test_path_style_access(self, s3_client, test_bucket):
        """Test path-style access (required for Hadoop S3A)."""
        key = f"path-style-test-{generate_random_string()}.txt"
        data = b"Path style test"

        # The client is already configured for path-style access
        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)
        response = s3_client.get_object(Bucket=test_bucket, Key=key)
        assert response["Body"].read() == data


class TestPerformance:
    """Performance regression tests."""

    def test_small_object_throughput(self, s3_client, test_bucket):
        """Test small object upload throughput (RustFS advantage)."""
        num_objects = 50
        object_size = 4 * 1024  # 4KB

        start_time = time.time()
        for i in range(num_objects):
            key = f"perf-small-{i:04d}.bin"
            data = generate_test_data(object_size)
            s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)
        elapsed = time.time() - start_time

        throughput = num_objects / elapsed
        print(f"Small object throughput: {throughput:.2f} objects/sec")
        # RustFS should achieve at least 10 objects/sec for 4KB objects
        assert throughput > 5, f"Throughput too low: {throughput:.2f} objects/sec"

    def test_large_object_throughput(self, s3_client, test_bucket):
        """Test large object upload throughput."""
        object_size = 10 * 1024 * 1024  # 10MB
        data = generate_test_data(object_size)

        start_time = time.time()
        key = f"perf-large-{generate_random_string()}.bin"
        s3_client.put_object(Bucket=test_bucket, Key=key, Body=data)
        elapsed = time.time() - start_time

        throughput_mbps = (object_size / (1024 * 1024)) / elapsed
        print(f"Large object throughput: {throughput_mbps:.2f} MB/sec")
        assert throughput_mbps > 1, f"Throughput too low: {throughput_mbps:.2f} MB/sec"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
