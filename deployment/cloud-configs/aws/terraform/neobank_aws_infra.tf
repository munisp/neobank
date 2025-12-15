# This file is a concatenation of main.tf, variables.tf, and providers.tf for submission.

# ------------------------------------------------------------------------------
# main.tf
# ------------------------------------------------------------------------------

# Configure the AWS Provider
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0.0"
}

provider "aws" {
  region = var.aws_region
}

# ------------------------------------------------------------------------------
# MODULES
# ------------------------------------------------------------------------------

# 1. VPC and Networking (High Availability: 3 AZs, multiple NAT Gateways)
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = var.project_name
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets
  database_subnets = var.database_subnets

  enable_nat_gateway     = true
  single_nat_gateway     = false # High Availability
  enable_dns_hostnames   = true
  enable_dns_support     = true

  tags = var.common_tags
}

# 2. EKS Cluster (Auto-Scaling, Private Endpoint, Security)
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "${var.project_name}-eks"
  cluster_version = "1.29"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # EKS Managed Node Group (Auto-Scaling)
  eks_managed_node_groups = {
    general = {
      min_size     = 3
      max_size     = 10
      desired_size = 3

      instance_types = ["m5.large"]
      capacity_type  = "ON_DEMAND"
      
      # Security Best Practice: Disable public access to the API server endpoint
      cluster_endpoint_public_access = false
      cluster_endpoint_private_access = true
    }
  }

  tags = var.common_tags
}

# 3. RDS PostgreSQL (High Availability, Backup, Auto-Scaling Storage)
module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "${var.project_name}-db"

  engine               = "postgres"
  engine_version       = "15.5"
  family               = "postgres15"
  major_engine_version = "15"
  instance_class       = "db.t3.medium"

  allocated_storage = 100
  storage_type      = "gp3"
  max_allocated_storage = 200 # Auto-scaling storage

  # High Availability
  multi_az             = true
  availability_zone    = null # Let module choose
  db_subnet_group_name = module.vpc.database_subnet_group_name

  vpc_security_group_ids = [aws_security_group.rds.id]

  # Backup and Recovery
  backup_retention_period = 7
  skip_final_snapshot     = false

  # Secrets Management (Master password will be stored in AWS Secrets Manager)
  manage_master_user_password = true
  master_username             = "neobankadmin"

  tags = var.common_tags
}

# 4. ElastiCache Redis (High Availability: 3 nodes)
module "elasticache" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "~> 4.0"

  cluster_id = "${var.project_name}-redis"
  engine     = "redis"
  engine_version = "7.0"
  node_type  = "cache.t3.micro"
  num_cache_nodes = 3 # High Availability

  # Subnet Group
  subnet_ids = module.vpc.database_subnets
  
  # Security
  security_group_ids = [aws_security_group.redis.id]

  tags = var.common_tags
}

# 5. S3 Buckets (Data Storage, Logging, Backup/Versioning)
module "s3_buckets" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 3.0"

  buckets = {
    app_data = {
      bucket = "${var.project_name}-app-data-${var.aws_region}"
      acl    = "private"
      versioning = {
        enabled = true # Backup/Recovery
      }
      # Security Best Practice: Block all public access
      block_public_acls       = true
      block_public_policy     = true
      ignore_public_acls      = true
      restrict_public_buckets = true
    }
    logs = {
      bucket = "${var.project_name}-logs-${var.aws_region}"
      acl    = "log-delivery-write"
      lifecycle_rule = [{
        enabled = true
        expiration = {
          days = 90
        }
      }]
    }
  }

  tags = var.common_tags
}

# 6. ACM Certificate (for ALB)
module "acm" {
  source  = "terraform-aws-modules/acm/aws"
  version = "~> 4.0"

  domain_name = var.domain_name
  zone_id     = module.route53.route53_zone_id
  
  subject_alternative_names = ["*.${var.domain_name}"]
  
  validation_method = "DNS"
  
  tags = var.common_tags
}

# 7. Route53 Hosted Zone
module "route53" {
  source  = "terraform-aws-modules/route53/aws"
  version = "~> 2.0"

  zones = {
    main = {
      name = var.domain_name
    }
  }
}

# 8. Application Load Balancer (ALB)
resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  enable_deletion_protection = true

  tags = var.common_tags
}

# 9. CloudWatch Monitoring (Basic setup)
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-dashboard"
  dashboard_body = jsonencode({
    "widgets": [
      {
        "type": "text",
        "x": 0,
        "y": 0,
        "width": 24,
        "height": 3,
        "properties": {
          "markdown": "## NeoBank Platform Monitoring Dashboard\n\nKey metrics for EKS, RDS, and ALB."
        }
      }
      # EKS Cluster CPU Utilization (Example Widget)
      {
        "type": "metric",
        "x": 0,
        "y": 3,
        "width": 12,
        "height": 6,
        "properties": {
          "metrics": [
            [ "AWS/EKS", "ClusterCPUUtilization", "ClusterName", "${module.eks.cluster_id}" ]
          ],
          "period": 300,
          "stat": "Average",
          "region": "${var.aws_region}",
          "title": "EKS Cluster CPU Utilization"
        }
      }
    ]
  })
}

# 10. Security Groups (Refinement for Security Best Practices)

# Security Group for the Application Load Balancer (ALB)
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Allow all inbound HTTP/HTTPS traffic"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTPS from Internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from Internet (for redirect)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.common_tags
}

# Security Group for RDS PostgreSQL
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow inbound PostgreSQL traffic from EKS nodes"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "PostgreSQL from EKS Nodes"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    # Source is the EKS worker node security group
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.common_tags
}

# Security Group for ElastiCache Redis
resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-sg"
  description = "Allow inbound Redis traffic from EKS nodes"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "Redis from EKS Nodes"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    # Source is the EKS worker node security group
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.common_tags
}

# 11. IAM Roles for EKS (Security Best Practice)
# The EKS module handles the main cluster roles. We'll define a role for the EKS service account
# to access S3 (e.g., for application data).
resource "aws_iam_policy" "s3_read_write" {
  name        = "${var.project_name}-s3-read-write-policy"
  description = "Allows EKS service accounts to read/write to the application data S3 bucket"
  policy      = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ],
        Effect   = "Allow",
        Resource = [
          module.s3_buckets.s3_bucket_app_data_arn,
          "${module.s3_buckets.s3_bucket_app_data_arn}/*"
        ]
      }
    ]
  })
}

# Output the EKS OIDC provider ARN for IAM Roles for Service Accounts (IRSA)
output "eks_oidc_provider_arn" {
  description = "The ARN of the OIDC provider for the EKS cluster"
  value       = module.eks.oidc_provider_arn
}

# Output the S3 bucket name for application data
output "app_data_s3_bucket_name" {
  description = "The name of the S3 bucket for application data"
  value       = module.s3_buckets.s3_bucket_app_data_id
}

# Output the RDS endpoint
output "rds_endpoint" {
  description = "The connection endpoint for the RDS instance"
  value       = module.rds.db_instance_address
  sensitive   = true
}

# Output the Redis endpoint
output "redis_endpoint" {
  description = "The connection endpoint for the ElastiCache Redis cluster"
  value       = module.elasticache.cluster_address
  sensitive   = true
}

# Output the ALB DNS name
output "alb_dns_name" {
  description = "The DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

# ------------------------------------------------------------------------------
# variables.tf
# ------------------------------------------------------------------------------

variable "project_name" {
  description = "A unique name for the project, used as a prefix for resources"
  type        = string
  default     = "neobank-prod"
}

variable "aws_region" {
  description = "The AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "List of availability zones to use for high availability"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "vpc_cidr" {
  description = "The CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnets" {
  description = "List of CIDR blocks for private subnets (for EKS nodes, RDS, ElastiCache)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnets" {
  description = "List of CIDR blocks for public subnets (for ALB, NAT Gateways)"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "database_subnets" {
  description = "List of CIDR blocks for database subnets (for RDS, ElastiCache)"
  type        = list(string)
  default     = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

variable "domain_name" {
  description = "The domain name for the application (e.g., neobank.com)"
  type        = string
  # NOTE: Replace with your actual domain
  default     = "example-neobank.com" 
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "NeoBank"
    Environment = "Production"
    ManagedBy   = "Terraform"
  }
}

# ------------------------------------------------------------------------------
# providers.tf (Backend Configuration)
# ------------------------------------------------------------------------------

# This file is often used to define provider configurations, but for simplicity,
# the provider block is included in main.tf.
# We will use this file to define the backend configuration for state management.

terraform {
  backend "s3" {
    bucket         = "neobank-terraform-state-bucket-unique" # CHANGE THIS TO A UNIQUE BUCKET NAME
    key            = "neobank/prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "neobank-terraform-lock" # Requires a DynamoDB table for state locking
  }
}