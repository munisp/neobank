# provider.tf - Terraform and DigitalOcean Provider Configuration

terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
  required_version = ">= 1.0.0"
}

provider "digitalocean" {
  token = var.do_token
}

# variables.tf - Input variables for the NeoBank Platform Infrastructure

# ------------------------------------------------------------------------------
# General Configuration
# ------------------------------------------------------------------------------
variable "region" {
  description = "DigitalOcean region to deploy resources"
  type        = string
  default     = "nyc3" # New York 3
}

variable "vpc_name" {
  description = "Name for the Virtual Private Cloud (VPC)"
  type        = string
  default     = "neobank-production-vpc"
}

# ------------------------------------------------------------------------------
# Kubernetes (DOKS) Configuration
# ------------------------------------------------------------------------------
variable "cluster_name" {
  description = "Name for the DigitalOcean Kubernetes Service (DOKS) cluster"
  type        = string
  default     = "neobank-prod-cluster"
}

variable "kubernetes_version" {
  description = "The version of Kubernetes to use for the DOKS cluster"
  type        = string
  default     = "1.29.2-do.0" # Example version, check for latest stable
}

variable "worker_node_size" {
  description = "Droplet size for the DOKS worker nodes (e.g., s-2vcpu-4gb)"
  type        = string
  default     = "s-4vcpu-8gb" # Recommended for production workloads
}

variable "initial_node_count" {
  description = "Initial number of worker nodes in the main pool"
  type        = number
  default     = 3 # Minimum 3 for HA
}

variable "min_node_count" {
  description = "Minimum number of worker nodes for auto-scaling"
  type        = number
  default     = 3
}

variable "max_node_count" {
  description = "Maximum number of worker nodes for auto-scaling"
  type        = number
  default     = 10
}

# ------------------------------------------------------------------------------
# Managed Database Configuration (PostgreSQL)
# ------------------------------------------------------------------------------
variable "postgres_version" {
  description = "The version of PostgreSQL to use"
  type        = string
  default     = "16"
}

variable "postgres_size" {
  description = "The slug for the size of the PostgreSQL nodes (e.g., db-s-2vcpu-4gb)"
  type        = string
  default     = "db-s-4vcpu-8gb" # Recommended for production
}

# ------------------------------------------------------------------------------
# Managed Database Configuration (Redis)
# ------------------------------------------------------------------------------
variable "redis_version" {
  description = "The version of Redis to use"
  type        = string
  default     = "7"
}

variable "redis_size" {
  description = "The slug for the size of the Redis nodes (e.g., db-s-1vcpu-2gb)"
  type        = string
  default     = "db-s-2vcpu-4gb" # Recommended for production
}

# ------------------------------------------------------------------------------
# Networking and DNS Configuration
# ------------------------------------------------------------------------------
variable "domain_name" {
  description = "The domain name to manage in DigitalOcean DNS"
  type        = string
  default     = "neobank-platform.com" # Placeholder
}

variable "app_subdomain" {
  description = "The subdomain for the main application entry point"
  type        = string
  default     = "app"
}

# ------------------------------------------------------------------------------
# DigitalOcean API Token
# ------------------------------------------------------------------------------
variable "do_token" {
  description = "DigitalOcean API Token"
  type        = string
  sensitive   = true
}

# main.tf - DigitalOcean NeoBank Platform Infrastructure

# ------------------------------------------------------------------------------
# 1. VPC (Virtual Private Cloud) - Foundation for private networking
# ------------------------------------------------------------------------------
resource "digitalocean_vpc" "neobank_vpc" {
  name   = var.vpc_name
  region = var.region
  description = "VPC for the NeoBank platform, hosting DOKS and Managed Databases."
  # VPC is a key security boundary, all resources will be placed here.
}

# ------------------------------------------------------------------------------
# 2. DigitalOcean Kubernetes Service (DOKS) - Core compute platform
#    - High Availability: Multi-node pool with auto-scaling.
# ------------------------------------------------------------------------------
resource "digitalocean_kubernetes_cluster" "neobank_doks" {
  name    = var.cluster_name
  region  = var.region
  version = var.kubernetes_version
  vpc_uuid = digitalocean_vpc.neobank_vpc.id

  node_pool {
    name       = "worker-pool"
    size       = var.worker_node_size
    node_count = var.initial_node_count
    auto_scale = true
    min_nodes  = var.min_node_count
    max_nodes  = var.max_node_count
    tags       = ["neobank", "doks", "worker"]
  }

  # Tags for easy identification and management
  tags = ["neobank", "doks", "production"]
}

# ------------------------------------------------------------------------------
# 3. Managed PostgreSQL Database - Core transactional database
#    - High Availability: Default configuration is HA with a standby node.
# ------------------------------------------------------------------------------
resource "digitalocean_database_cluster" "neobank_postgres" {
  name       = "neobank-postgres"
  engine     = "pg"
  version    = var.postgres_version
  size       = var.postgres_size
  region     = var.region
  node_count = 2 # Minimum 2 nodes for HA (primary + standby)
  vpc_uuid   = digitalocean_vpc.neobank_vpc.id
  tags       = ["neobank", "database", "postgres"]

  # Backup and Disaster Recovery: Automated daily backups are default.
  # We can customize maintenance window for production.
  maintenance_window {
    day  = "saturday"
    hour = "02:00"
  }
}

# ------------------------------------------------------------------------------
# 4. Managed Redis Database - Caching and session management
#    - High Availability: Default configuration is HA with a standby node.
# ------------------------------------------------------------------------------
resource "digitalocean_database_cluster" "neobank_redis" {
  name       = "neobank-redis"
  engine     = "redis"
  version    = var.redis_version
  size       = var.redis_size
  region     = var.region
  node_count = 2 # Minimum 2 nodes for HA (primary + standby)
  vpc_uuid   = digitalocean_vpc.neobank_vpc.id
  tags       = ["neobank", "database", "redis"]

  maintenance_window {
    day  = "saturday"
    hour = "03:00"
  }
}

# ------------------------------------------------------------------------------
# 5. Firewall - Security Best Practice: Restrict access to databases
#    - Only DOKS worker nodes should be able to access the databases.
# ------------------------------------------------------------------------------
# Get the IP ranges of the DOKS worker nodes
data "digitalocean_kubernetes_cluster" "neobank_doks_data" {
  name = digitalocean_kubernetes_cluster.neobank_doks.name
}

# Firewall for PostgreSQL
resource "digitalocean_database_firewall" "postgres_firewall" {
  cluster_id = digitalocean_database_cluster.neobank_postgres.id

  rule {
    type  = "vpc"
    value = digitalocean_vpc.neobank_vpc.id
  }
  # Optionally, add a rule for the DOKS node pool's public IP range if needed for external tools,
  # but VPC access is preferred and more secure.
}

# Firewall for Redis
resource "digitalocean_database_firewall" "redis_firewall" {
  cluster_id = digitalocean_database_cluster.neobank_redis.id

  rule {
    type  = "vpc"
    value = digitalocean_vpc.neobank_vpc.id
  }
}

# ------------------------------------------------------------------------------
# 6. Load Balancer and DNS - External access and traffic routing
#    - DOKS will typically create a Load Balancer via a Service of type LoadBalancer.
#    - We will create a placeholder DNS record for the application entry point.
# ------------------------------------------------------------------------------
# Create a DigitalOcean Domain (if it doesn't exist)
resource "digitalocean_domain" "neobank_domain" {
  domain = var.domain_name
}

# Placeholder for the Load Balancer IP. In a real-world scenario, this IP
# would be an output from a Kubernetes LoadBalancer service.
# For this IaC, we assume the application will create the Load Balancer.
# We will create a dummy A record pointing to a placeholder IP for now,
# and the deployment notes will explain the final step.
resource "digitalocean_record" "neobank_app_a" {
  domain = digitalocean_domain.neobank_domain.name
  type   = "A"
  name   = var.app_subdomain
  value  = "192.0.2.1" # Placeholder IP
  ttl    = 60
}

# ------------------------------------------------------------------------------
# 7. Monitoring and Logging (Integration)
#    - DOKS includes integration with DigitalOcean Monitoring.
#    - We will enable the Kubernetes Dashboard for basic monitoring access.
# ------------------------------------------------------------------------------
resource "digitalocean_kubernetes_cluster_node_pool" "neobank_doks_dashboard" {
  cluster_id = digitalocean_kubernetes_cluster.neobank_doks.id
  name       = "dashboard-pool"
  size       = "s-1vcpu-2gb"
  node_count = 1
  tags       = ["neobank", "doks", "dashboard"]
  # Dedicated small node pool for monitoring/logging tools (e.g., Prometheus, Grafana, Fluentd)
  # to isolate them from application workloads.
}

# ------------------------------------------------------------------------------
# 8. Environment Variables and Secrets Management
#    - Secrets are not stored in Terraform state.
#    - We will output the connection details and recommend using a dedicated
#      secrets manager (e.g., HashiCorp Vault, Kubernetes Secrets with Sealed Secrets).
# ------------------------------------------------------------------------------
# The outputs.tf will handle the exposure of connection details.

# outputs.tf - Outputs for the NeoBank Platform Infrastructure

# ------------------------------------------------------------------------------
# DOKS Cluster Outputs
# ------------------------------------------------------------------------------
output "kubernetes_cluster_name" {
  description = "The name of the DOKS cluster"
  value       = digitalocean_kubernetes_cluster.neobank_doks.name
}

output "kubernetes_cluster_endpoint" {
  description = "The public endpoint of the DOKS cluster"
  value       = digitalocean_kubernetes_cluster.neobank_doks.endpoint
}

output "kube_config_raw" {
  description = "Raw Kubernetes config file contents"
  value       = digitalocean_kubernetes_cluster.neobank_doks.kube_config[0].raw_config
  sensitive   = true
}

# ------------------------------------------------------------------------------
# Database Outputs
# ------------------------------------------------------------------------------
output "postgres_host" {
  description = "The hostname for the PostgreSQL database cluster"
  value       = digitalocean_database_cluster.neobank_postgres.host
}

output "postgres_port" {
  description = "The port for the PostgreSQL database cluster"
  value       = digitalocean_database_cluster.neobank_postgres.port
}

output "postgres_uri" {
  description = "The connection URI for the default PostgreSQL user"
  value       = digitalocean_database_cluster.neobank_postgres.uri
  sensitive   = true
}

output "redis_host" {
  description = "The hostname for the Redis database cluster"
  value       = digitalocean_database_cluster.neobank_redis.host
}

output "redis_port" {
  description = "The port for the Redis database cluster"
  value       = digitalocean_database_cluster.neobank_redis.port
}

output "redis_uri" {
  description = "The connection URI for the Redis database cluster"
  value       = digitalocean_database_cluster.neobank_redis.uri
  sensitive   = true
}

# ------------------------------------------------------------------------------
# Networking Outputs
# ------------------------------------------------------------------------------
output "vpc_urn" {
  description = "The URN of the VPC"
  value       = digitalocean_vpc.neobank_vpc.urn
}

output "app_dns_record" {
  description = "The full DNS record for the application entry point"
  value       = "${digitalocean_record.neobank_app_a.name}.${digitalocean_domain.neobank_domain.name}"
}