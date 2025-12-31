use std::time::Duration;

use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::{
    config::{Builder as S3ConfigBuilder, Region},
    primitives::ByteStream,
    Client as S3Client,
};
use bytes::Bytes;
use tracing::{debug, error, info, instrument};

use crate::config::AppConfig;
use crate::error::{Result, RustFSError};

#[derive(Debug, Clone)]
pub struct BucketInfo {
    pub name: String,
    pub creation_date: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ObjectInfo {
    pub key: String,
    pub size: i64,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
}

#[derive(Debug)]
pub struct ListObjectsResult {
    pub objects: Vec<ObjectInfo>,
    pub is_truncated: bool,
    pub next_continuation_token: Option<String>,
}

pub struct RustFSClient {
    client: S3Client,
    config: AppConfig,
}

impl RustFSClient {
    pub async fn new(config: &AppConfig) -> Result<Self> {
        info!("Initializing RustFS client with endpoint: {}", config.rustfs_endpoint);

        let credentials = Credentials::new(
            &config.rustfs_access_key,
            &config.rustfs_secret_key,
            None,
            None,
            "neobank-rustfs-client",
        );

        let s3_config = S3ConfigBuilder::new()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(config.rustfs_region.clone()))
            .endpoint_url(&config.rustfs_endpoint)
            .credentials_provider(credentials)
            .force_path_style(config.use_path_style)
            .build();

        let client = S3Client::from_conf(s3_config);

        Ok(Self {
            client,
            config: config.clone(),
        })
    }

    #[instrument(skip(self))]
    pub async fn check_health(&self) -> Result<bool> {
        match self.client.list_buckets().send().await {
            Ok(_) => Ok(true),
            Err(e) => {
                error!("Health check failed: {}", e);
                Ok(false)
            }
        }
    }

    #[instrument(skip(self))]
    pub async fn list_buckets(&self) -> Result<Vec<BucketInfo>> {
        debug!("Listing buckets");

        let response = self.client.list_buckets().send().await.map_err(|e| {
            error!("Failed to list buckets: {}", e);
            RustFSError::SdkError(e.to_string())
        })?;

        let buckets = response
            .buckets()
            .iter()
            .map(|b| BucketInfo {
                name: b.name().unwrap_or_default().to_string(),
                creation_date: b.creation_date().map(|d| d.to_string()),
            })
            .collect();

        Ok(buckets)
    }

    #[instrument(skip(self))]
    pub async fn create_bucket(&self, bucket_name: &str) -> Result<()> {
        info!("Creating bucket: {}", bucket_name);

        self.client
            .create_bucket()
            .bucket(bucket_name)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to create bucket: {}", e);
                RustFSError::SdkError(e.to_string())
            })?;

        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn delete_bucket(&self, bucket_name: &str) -> Result<()> {
        info!("Deleting bucket: {}", bucket_name);

        self.client
            .delete_bucket()
            .bucket(bucket_name)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to delete bucket: {}", e);
                RustFSError::SdkError(e.to_string())
            })?;

        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn bucket_exists(&self, bucket_name: &str) -> Result<bool> {
        match self.client.head_bucket().bucket(bucket_name).send().await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    #[instrument(skip(self))]
    pub async fn list_objects(
        &self,
        bucket: &str,
        prefix: Option<&str>,
        max_keys: Option<i32>,
    ) -> Result<ListObjectsResult> {
        debug!("Listing objects in bucket: {}, prefix: {:?}", bucket, prefix);

        let mut request = self.client.list_objects_v2().bucket(bucket);

        if let Some(p) = prefix {
            request = request.prefix(p);
        }

        if let Some(max) = max_keys {
            request = request.max_keys(max);
        }

        let response = request.send().await.map_err(|e| {
            error!("Failed to list objects: {}", e);
            RustFSError::SdkError(e.to_string())
        })?;

        let objects = response
            .contents()
            .iter()
            .map(|o| ObjectInfo {
                key: o.key().unwrap_or_default().to_string(),
                size: o.size().unwrap_or(0),
                last_modified: o.last_modified().map(|d| d.to_string()),
                etag: o.e_tag().map(|s| s.to_string()),
            })
            .collect();

        Ok(ListObjectsResult {
            objects,
            is_truncated: response.is_truncated().unwrap_or(false),
            next_continuation_token: response.next_continuation_token().map(|s| s.to_string()),
        })
    }

    #[instrument(skip(self, data))]
    pub async fn put_object(
        &self,
        bucket: &str,
        key: &str,
        data: Bytes,
        content_type: Option<&str>,
    ) -> Result<String> {
        info!("Uploading object: {}/{}, size: {} bytes", bucket, key, data.len());

        let mut request = self
            .client
            .put_object()
            .bucket(bucket)
            .key(key)
            .body(ByteStream::from(data));

        if let Some(ct) = content_type {
            request = request.content_type(ct);
        }

        let response = request.send().await.map_err(|e| {
            error!("Failed to put object: {}", e);
            RustFSError::SdkError(e.to_string())
        })?;

        Ok(response.e_tag().unwrap_or_default().to_string())
    }

    #[instrument(skip(self))]
    pub async fn get_object(&self, bucket: &str, key: &str) -> Result<Bytes> {
        debug!("Getting object: {}/{}", bucket, key);

        let response = self
            .client
            .get_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to get object: {}", e);
                RustFSError::SdkError(e.to_string())
            })?;

        let data = response.body.collect().await.map_err(|e| {
            error!("Failed to read object body: {}", e);
            RustFSError::SdkError(e.to_string())
        })?;

        Ok(data.into_bytes())
    }

    #[instrument(skip(self))]
    pub async fn get_object_range(
        &self,
        bucket: &str,
        key: &str,
        start: u64,
        end: u64,
    ) -> Result<Bytes> {
        debug!("Getting object range: {}/{}, bytes={}-{}", bucket, key, start, end);

        let range = format!("bytes={}-{}", start, end);
        let response = self
            .client
            .get_object()
            .bucket(bucket)
            .key(key)
            .range(range)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to get object range: {}", e);
                RustFSError::SdkError(e.to_string())
            })?;

        let data = response.body.collect().await.map_err(|e| {
            error!("Failed to read object body: {}", e);
            RustFSError::SdkError(e.to_string())
        })?;

        Ok(data.into_bytes())
    }

    #[instrument(skip(self))]
    pub async fn delete_object(&self, bucket: &str, key: &str) -> Result<()> {
        info!("Deleting object: {}/{}", bucket, key);

        self.client
            .delete_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to delete object: {}", e);
                RustFSError::SdkError(e.to_string())
            })?;

        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn head_object(&self, bucket: &str, key: &str) -> Result<ObjectInfo> {
        debug!("Head object: {}/{}", bucket, key);

        let response = self
            .client
            .head_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to head object: {}", e);
                RustFSError::SdkError(e.to_string())
            })?;

        Ok(ObjectInfo {
            key: key.to_string(),
            size: response.content_length().unwrap_or(0),
            last_modified: response.last_modified().map(|d| d.to_string()),
            etag: response.e_tag().map(|s| s.to_string()),
        })
    }

    #[instrument(skip(self))]
    pub async fn copy_object(
        &self,
        source_bucket: &str,
        source_key: &str,
        dest_bucket: &str,
        dest_key: &str,
    ) -> Result<()> {
        info!(
            "Copying object: {}/{} -> {}/{}",
            source_bucket, source_key, dest_bucket, dest_key
        );

        let copy_source = format!("{}/{}", source_bucket, source_key);

        self.client
            .copy_object()
            .copy_source(copy_source)
            .bucket(dest_bucket)
            .key(dest_key)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to copy object: {}", e);
                RustFSError::SdkError(e.to_string())
            })?;

        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn generate_presigned_url(
        &self,
        bucket: &str,
        key: &str,
        operation: &str,
        expires_in_secs: u64,
    ) -> Result<String> {
        debug!(
            "Generating presigned URL for: {}/{}, operation: {}, expires: {}s",
            bucket, key, operation, expires_in_secs
        );

        let presigning_config = aws_sdk_s3::presigning::PresigningConfig::builder()
            .expires_in(Duration::from_secs(expires_in_secs))
            .build()
            .map_err(|e| RustFSError::PresignedUrlError(e.to_string()))?;

        let url = match operation.to_lowercase().as_str() {
            "get" => {
                self.client
                    .get_object()
                    .bucket(bucket)
                    .key(key)
                    .presigned(presigning_config)
                    .await
                    .map_err(|e| RustFSError::PresignedUrlError(e.to_string()))?
                    .uri()
                    .to_string()
            }
            "put" => {
                self.client
                    .put_object()
                    .bucket(bucket)
                    .key(key)
                    .presigned(presigning_config)
                    .await
                    .map_err(|e| RustFSError::PresignedUrlError(e.to_string()))?
                    .uri()
                    .to_string()
            }
            _ => return Err(RustFSError::PresignedUrlError(format!("Unsupported operation: {}", operation))),
        };

        Ok(url)
    }

    #[instrument(skip(self, data))]
    pub async fn multipart_upload(
        &self,
        bucket: &str,
        key: &str,
        data: Bytes,
        part_size: usize,
        content_type: Option<&str>,
    ) -> Result<String> {
        info!(
            "Starting multipart upload: {}/{}, total size: {} bytes, part size: {} bytes",
            bucket,
            key,
            data.len(),
            part_size
        );

        let mut create_request = self.client.create_multipart_upload().bucket(bucket).key(key);

        if let Some(ct) = content_type {
            create_request = create_request.content_type(ct);
        }

        let create_response = create_request.send().await.map_err(|e| {
            error!("Failed to create multipart upload: {}", e);
            RustFSError::MultipartUploadError(e.to_string())
        })?;

        let upload_id = create_response
            .upload_id()
            .ok_or_else(|| RustFSError::MultipartUploadError("No upload ID returned".to_string()))?;

        let mut completed_parts = Vec::new();
        let mut part_number = 1;
        let mut offset = 0;

        while offset < data.len() {
            let end = std::cmp::min(offset + part_size, data.len());
            let part_data = data.slice(offset..end);

            debug!("Uploading part {}, size: {} bytes", part_number, part_data.len());

            let upload_response = self
                .client
                .upload_part()
                .bucket(bucket)
                .key(key)
                .upload_id(upload_id)
                .part_number(part_number)
                .body(ByteStream::from(part_data))
                .send()
                .await
                .map_err(|e| {
                    error!("Failed to upload part {}: {}", part_number, e);
                    RustFSError::MultipartUploadError(e.to_string())
                })?;

            completed_parts.push(
                aws_sdk_s3::types::CompletedPart::builder()
                    .e_tag(upload_response.e_tag().unwrap_or_default())
                    .part_number(part_number)
                    .build(),
            );

            offset = end;
            part_number += 1;
        }

        let completed_upload = aws_sdk_s3::types::CompletedMultipartUpload::builder()
            .set_parts(Some(completed_parts))
            .build();

        let complete_response = self
            .client
            .complete_multipart_upload()
            .bucket(bucket)
            .key(key)
            .upload_id(upload_id)
            .multipart_upload(completed_upload)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to complete multipart upload: {}", e);
                RustFSError::MultipartUploadError(e.to_string())
            })?;

        info!("Multipart upload completed: {}/{}", bucket, key);

        Ok(complete_response.e_tag().unwrap_or_default().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_client_creation() {
        let config = AppConfig::from_env().unwrap();
        let client = RustFSClient::new(&config).await;
        assert!(client.is_ok());
    }
}
