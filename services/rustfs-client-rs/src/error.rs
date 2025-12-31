use thiserror::Error;

#[derive(Debug, Error)]
pub enum RustFSError {
    #[error("S3 SDK error: {0}")]
    SdkError(String),

    #[error("Bucket not found: {0}")]
    BucketNotFound(String),

    #[error("Object not found: {bucket}/{key}")]
    ObjectNotFound { bucket: String, key: String },

    #[error("Access denied: {0}")]
    AccessDenied(String),

    #[error("Bucket already exists: {0}")]
    BucketAlreadyExists(String),

    #[error("Invalid bucket name: {0}")]
    InvalidBucketName(String),

    #[error("Invalid object key: {0}")]
    InvalidObjectKey(String),

    #[error("Connection error: {0}")]
    ConnectionError(String),

    #[error("Timeout error: {0}")]
    TimeoutError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Multipart upload error: {0}")]
    MultipartUploadError(String),

    #[error("Presigned URL error: {0}")]
    PresignedUrlError(String),

    #[error("Internal error: {0}")]
    InternalError(String),
}

impl From<aws_sdk_s3::Error> for RustFSError {
    fn from(err: aws_sdk_s3::Error) -> Self {
        RustFSError::SdkError(err.to_string())
    }
}

impl From<serde_json::Error> for RustFSError {
    fn from(err: serde_json::Error) -> Self {
        RustFSError::SerializationError(err.to_string())
    }
}

impl From<reqwest::Error> for RustFSError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            RustFSError::TimeoutError(err.to_string())
        } else if err.is_connect() {
            RustFSError::ConnectionError(err.to_string())
        } else {
            RustFSError::InternalError(err.to_string())
        }
    }
}

pub type Result<T> = std::result::Result<T, RustFSError>;
