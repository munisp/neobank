# GCP Deployment Guide: GKE, Cloud SQL, and Memorystore with Terraform

## Introduction

This comprehensive guide provides a step-by-step process for deploying a robust, production-ready application infrastructure on Google Cloud Platform (GCP) using **Terraform** for Infrastructure as Code (IaC). The architecture leverages three core GCP services:

1.  **Google Kubernetes Engine (GKE)**: For container orchestration and application deployment.
2.  **Cloud SQL (PostgreSQL/MySQL)**: For a managed relational database service.
3.  **Memorystore for Redis**: For a high-performance, managed in-memory data store/cache.

A key focus of this guide is establishing **private connectivity** between GKE and the managed services (Cloud SQL and Memorystore) using a Virtual Private Cloud (VPC) and Private Service Access, ensuring a secure and low-latency environment.

## 1. Prerequisites

Before starting the deployment, ensure you have the following accounts, permissions, and tools installed.

### 1.1. GCP Account and Permissions

*   **GCP Account**: An active Google Cloud Platform account.
*   **Billing**: A billing account linked to your GCP project.
*   **Project**: A dedicated GCP project for this deployment.
*   **APIs**: The following APIs must be enabled in your project:
    *   `compute.googleapis.com` (Compute Engine API)
    *   `container.googleapis.com` (Kubernetes Engine API)
    *   `sqladmin.googleapis.com` (Cloud SQL Admin API)
    *   `redis.googleapis.com` (Cloud Memorystore for Redis API)
    *   `servicenetworking.googleapis.com` (Service Networking API)
*   **IAM Permissions**: A service account or user with the following roles (or a custom role with equivalent permissions):
    *   `roles/owner` (for simplicity in a guide, but `roles/editor` and specific service roles are recommended for production)
    *   `roles/container.admin`
    *   `roles/cloudsql.admin`
    *   `roles/redis.admin`
    *   `roles/compute.networkAdmin`

### 1.2. Local Tools

*   **Google Cloud CLI (gcloud)**: Installed and configured.
*   **Terraform**: Installed (version 1.0+ recommended).
*   **kubectl**: Installed for interacting with the GKE cluster.

### 1.3. Initial Setup

1.  **Authenticate gcloud**:
    ```bash
    gcloud auth login
    gcloud config set project [YOUR_PROJECT_ID]
    ```

2.  **Enable Required APIs**:
    ```bash
    gcloud services enable \
        compute.googleapis.com \
        container.googleapis.com \
        sqladmin.googleapis.com \
        redis.googleapis.com \
        servicenetworking.googleapis.com
    ```

3.  **Create a Working Directory**:
    ```bash
    mkdir gcp-terraform-deployment
    cd gcp-terraform-deployment
    ```

## 2. Terraform Infrastructure Foundation

The first step in our IaC process is to define the foundational network infrastructure, which is critical for the private connectivity required by Cloud SQL and Memorystore.

### 2.1. Provider and Variables (`main.tf` and `variables.tf`)

Create a `variables.tf` file to define the project-specific settings.

**`variables.tf`**
```terraform
variable "project_id" {
  description = "The ID of the GCP project"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy resources"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The GCP zone for single-zone resources"
  type        = string
  default     = "us-central1-a"
}

variable "network_name" {
  description = "Name for the VPC network"
  type        = string
  default     = "app-vpc-network"
}

variable "subnet_cidr" {
  description = "CIDR range for the primary subnet"
  type        = string
  default     = "10.10.0.0/20"
}

variable "gke_cluster_name" {
  description = "Name for the GKE cluster"
  type        = string
  default     = "app-gke-cluster"
}
```

Next, create the main configuration file, `main.tf`, to define the GCP provider and backend.

**`main.tf`**
```terraform
# Configure the Google Cloud Provider
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  # Recommended: Configure a remote backend for state management (e.g., GCS)
  # backend "gcs" {
  #   bucket = "tf-state-bucket-[YOUR_PROJECT_ID]"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 2.2. VPC Network and Subnet
resource "google_compute_network" "vpc_network" {
  name                    = var.network_name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "primary_subnet" {
  name          = "${var.network_name}-subnet"
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc_network.self_link
}

# 2.3. Private Service Access (PSA) for Managed Services
# This is required for Cloud SQL and Memorystore to be accessible privately.
resource "google_compute_global_address" "private_service_access_range" {
  name          = "private-service-access-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc_network.self_link
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc_network.self_link
  service                 = "servicenetworking.googleapis.com"
  reserved_ip_range       = google_compute_global_address.private_service_access_range.name
}
```

### 2.4. Verification Steps (Infrastructure)

After applying the configuration, you can verify the network setup.

1.  **Initialize Terraform**:
    ```bash
    terraform init
    ```

2.  **Plan and Apply**:
    ```bash
    # Create a terraform.tfvars file with your project ID
    echo 'project_id = "[YOUR_PROJECT_ID]"' > terraform.tfvars
    
    terraform plan
    terraform apply
    ```

3.  **Verify VPC and PSA**:
    *   Check the VPC network: `gcloud compute networks describe ${var.network_name}`
    *   Check the Private Service Connection: `gcloud services vpc-peerings list --network=${var.network_name}`

***

## 3. Deploying Managed Services (Cloud SQL and Memorystore)

With the VPC and Private Service Access (PSA) connection established, we can now deploy the managed services, ensuring they are only accessible via the private network.

### 3.1. Cloud SQL Instance (`cloudsql.tf`)

Create a new file `cloudsql.tf` to define the Cloud SQL instance. We will use a PostgreSQL instance as an example.

**`cloudsql.tf`**
```terraform
# Cloud SQL Instance (PostgreSQL)
resource "google_sql_database_instance" "sql_instance" {
  database_version = "POSTGRES_14"
  project          = var.project_id
  region           = var.region
  name             = "app-sql-instance"
  settings {
    tier = "db-g1-small" # Choose an appropriate tier
    disk_size = 10
    disk_type = "PD_SSD"
    # High Availability configuration (optional but recommended for production)
    # availability_type = "REGIONAL" 

    ip_configuration {
      ipv4_enabled    = false # Disable public IP
      private_network = google_compute_network.vpc_network.self_link
    }
  }
  # Prevents accidental deletion of the production database
  deletion_protection  = true
}

# Cloud SQL Database
resource "google_sql_database" "database" {
  instance = google_sql_database_instance.sql_instance.name
  name     = "app_db"
}

# Cloud SQL User
resource "google_sql_user" "user" {
  instance = google_sql_database_instance.sql_instance.name
  name     = "app_user"
  password = "A_Strong_Password_Here" # Use a secret manager in production
}

# Output the private IP address for reference
output "cloud_sql_private_ip" {
  value = google_sql_database_instance.sql_instance.private_ip_address
}
```

### 3.2. Memorystore for Redis Instance (`memorystore.tf`)

Create a new file `memorystore.tf` to define the Memorystore (Redis) instance.

**`memorystore.tf`**
```terraform
# Memorystore for Redis Instance
resource "google_redis_instance" "redis_instance" {
  name           = "app-redis-instance"
  project        = var.project_id
  region         = var.region
  tier           = "STANDARD_HA" # Recommended for production
  memory_size_gb = 1
  authorized_network = google_compute_network.vpc_network.self_link
  # The reserved_ip_range is automatically handled by the PSA connection
  # created in the main.tf file.
}

# Output the Redis host for application configuration
output "redis_host" {
  value = google_redis_instance.redis_instance.host
}
```

## 4. Deploying Google Kubernetes Engine (GKE)

The GKE cluster must be deployed into the same VPC network to ensure it can communicate with the private Cloud SQL and Memorystore instances.

### 4.1. GKE Cluster (`gke.tf`)

Create a new file `gke.tf` to define the GKE cluster.

**`gke.tf`**
```terraform
# GKE Cluster
resource "google_container_cluster" "primary" {
  name                     = var.gke_cluster_name
  location                 = var.region
  initial_node_count       = 1
  network                  = google_compute_network.vpc_network.self_link
  subnetwork               = google_compute_subnetwork.primary_subnet.self_link
  
  # Private Cluster Configuration (Recommended for Security)
  # master_authorized_networks_config {
  #   cidr_blocks {
  #     cidr_block   = "0.0.0.0/0" # Restrict to your management network
  #     display_name = "Management Network"
  #   }
  # }
  # private_cluster_config {
  #   enable_private_endpoint = true
  #   enable_private_nodes    = true
  #   master_ipv4_cidr_block  = "172.16.0.0/28"
  # }

  # Workload Identity (Recommended for secure access to GCP services)
  workload_identity_config {
    identity_namespace = "${var.project_id}.svc.id.goog"
  }

  # Node Pool
  node_config {
    machine_type = "e2-medium"
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
    # Set up a service account for the nodes
    service_account = "your-gke-node-sa@${var.project_id}.iam.gserviceaccount.com"
  }
}

# Output the GKE cluster name
output "gke_cluster_name" {
  value = google_container_cluster.primary.name
}
```

### 4.2. GKE Integration with Cloud SQL

Since Cloud SQL is private, GKE pods cannot connect directly using the private IP. The recommended and most secure method is to use the **Cloud SQL Auth Proxy** as a sidecar container in your application's Kubernetes Pod.

1.  **Enable Workload Identity**: Ensure your GKE cluster is configured with Workload Identity (as shown in `gke.tf`).
2.  **Create a Kubernetes Service Account (KSA)**:
    ```yaml
    # ksa.yaml
    apiVersion: v1
    kind: ServiceAccount
    metadata:
      name: app-ksa
      annotations:
        iam.gke.io/gcp-service-account: "sql-proxy-sa@${PROJECT_ID}.iam.gserviceaccount.com"
    ```
3.  **Create a GCP Service Account (GSA)** and grant it the `roles/cloudsql.client` role.
4.  **Bind the KSA and GSA**:
    ```bash
    gcloud iam service-accounts add-iam-policy-binding \
        --role roles/iam.workloadIdentityUser \
        --member "serviceAccount:${PROJECT_ID}.svc.id.goog[default/app-ksa]" \
        sql-proxy-sa@${PROJECT_ID}.iam.gserviceaccount.com
    ```
5.  **Configure the Deployment**: Add the `cloud-sql-proxy` as a sidecar container to your application deployment.

    ```yaml
    # deployment.yaml snippet
    containers:
    - name: app-container
      # ... your application config
    - name: cloud-sql-proxy
      image: gcr.io/cloudsql-docker/gce-proxy:latest
      command:
        - "/cloud_sql_proxy"
        - "-instances=${PROJECT_ID}:${REGION}:app-sql-instance=tcp:5432"
        - "-credential_file=/var/run/secrets/tokens/gcp-ksa/token"
      securityContext:
        runAsNonRoot: true
      volumeMounts:
      - name: gcp-ksa
        mountPath: /var/run/secrets/tokens/gcp-ksa
        readOnly: true
    serviceAccountName: app-ksa
    volumes:
    - name: gcp-ksa
      projected:
        defaultMode: 420
        sources:
        - serviceAccountToken:
            path: gcp-ksa
            audience: "https://iam.googleapis.com/oauth2/v6/token"
            expirationSeconds: 86400
    ```

### 4.3. GKE Integration with Memorystore

Since Memorystore is deployed on the same VPC network, GKE pods can connect directly using the private IP address (or the host name provided in the Terraform output).

1.  **Retrieve Redis Host**: Use the Terraform output `redis_host`.
2.  **Configure Application**: Pass the Redis host and port (6379) to your application via a Kubernetes Secret or ConfigMap, which is then mounted as environment variables.

    ```yaml
    # configmap.yaml
    apiVersion: v1
    kind: ConfigMap
    metadata:
      name: app-config
    data:
      REDIS_HOST: "${REDIS_HOST_FROM_TERRAFORM_OUTPUT}"
      REDIS_PORT: "6379"
    ```

### 4.4. Verification Steps (Services)

1.  **Apply Terraform**:
    ```bash
    terraform apply
    ```
2.  **Connect to GKE**:
    ```bash
    gcloud container clusters get-credentials ${var.gke_cluster_name} --region ${var.region} --project ${var.project_id}
    ```
3.  **Deploy Application**: Apply your Kubernetes manifests (`ksa.yaml`, `deployment.yaml`, etc.).
    ```bash
    kubectl apply -f .
    ```
4.  **Verify Connectivity**:
    *   **Cloud SQL**: Check the logs of the `cloud-sql-proxy` sidecar container in your pod. Successful connection will show the proxy starting up.
    *   **Memorystore**: Exec into your application pod and use a Redis client (like `redis-cli`) to ping the host:
        ```bash
        kubectl exec -it <your-app-pod> -- /bin/sh
        # Inside the pod
        redis-cli -h ${REDIS_HOST} ping
        # Expected output: PONG
        ```
***

## 5. Security Considerations and Best Practices

Security is paramount for any production deployment. The architecture described, leveraging private networking, is a strong foundation. Here are further considerations and best practices.

### 5.1. Security Considerations

| Component | Security Best Practice | Description |
| :--- | :--- | :--- |
| **VPC Network** | **Private Service Access (PSA)** | Ensures Cloud SQL and Memorystore are not exposed to the public internet, accessible only from the VPC network. |
| **GKE** | **Private Cluster** | Recommended to disable public endpoint access to the Kubernetes control plane, restricting access to the VPC network. |
| **GKE** | **Workload Identity** | The preferred way for GKE workloads to access GCP services. It securely binds a Kubernetes Service Account (KSA) to a Google Service Account (GSA), eliminating the need for service account keys. |
| **Cloud SQL** | **Cloud SQL Auth Proxy** | Use the proxy for secure, encrypted connections to the database, even over a private network. It handles IAM-based authentication and encryption automatically. |
| **Cloud SQL** | **Deletion Protection** | Enabled in the Terraform configuration (`deletion_protection = true`) to prevent accidental deletion of the database instance. |
| **Memorystore** | **In-Transit Encryption** | Ensure Memorystore is configured to use in-transit encryption for all connections. |
| **Terraform** | **State Management** | Use a remote backend (like GCS) with encryption and access controls to securely store the Terraform state file, which may contain sensitive information. |

### 5.2. Best Practices

*   **Use Modules**: For production environments, break down the Terraform configuration into reusable modules (e.g., `vpc`, `gke`, `cloudsql`) to improve maintainability and enforce consistency.
*   **Immutable Infrastructure**: Treat your infrastructure as immutable. Any change should be made by updating the Terraform configuration and applying it, rather than manual changes.
*   **Resource Naming**: Adopt a clear and consistent naming convention for all GCP resources (e.g., `[project]-[environment]-[service]-[type]`).
*   **Monitoring and Logging**: Enable and configure Cloud Monitoring and Cloud Logging for all components (GKE, Cloud SQL, Memorystore) to ensure visibility into performance and errors.

## 6. Cost Estimates

The cost of this deployment is highly dependent on the chosen resource tiers, regions, and usage patterns. Use the **Google Cloud Pricing Calculator** [1] for a precise estimate.

### 6.1. Key Cost Drivers

| Component | Primary Cost Drivers | Cost Optimization Tips |
| :--- | :--- | :--- |
| **GKE** | Node machine type, number of nodes, control plane fee (for Autopilot or Standard), network egress. | Use **Autoscaling** to match node count to demand. Choose cost-optimized machine types (e.g., E2 series). |
| **Cloud SQL** | Instance tier (vCPUs/RAM), storage type (SSD/HDD) and size, backup storage, network egress, High Availability (HA) configuration. | Use **Private IP** to avoid network egress costs for internal traffic. Choose the smallest tier that meets performance needs. |
| **Memorystore** | Instance tier (Standard/Basic), memory size (GB), network egress. | Use **Basic Tier** for non-critical environments. Monitor memory usage and scale down if over-provisioned. |
| **Networking** | Network egress (data leaving GCP), Load Balancer usage. | Keep traffic internal (GKE to Cloud SQL/Memorystore) to minimize egress costs. |

## 7. Troubleshooting

### 7.1. Common Connectivity Issues

| Issue | Potential Cause | Resolution |
| :--- | :--- | :--- |
| **GKE cannot connect to Cloud SQL** | **Missing Cloud SQL Auth Proxy** or **Incorrect IAM/Workload Identity setup**. | 1. Verify the `cloud-sql-proxy` sidecar is running and its logs show a successful connection. 2. Ensure the GSA has the `roles/cloudsql.client` role and the KSA is correctly bound to the GSA. |
| **GKE cannot connect to Memorystore** | **Incorrect VPC Peering** or **Firewall Rule**. | 1. Verify the Private Service Access (PSA) connection is active and the IP range is correctly allocated. 2. Ensure no firewall rules are blocking internal traffic within the VPC. |
| **Terraform `Error 403: Permission denied`** | **Missing IAM permissions** for the user or service account running Terraform. | Grant the necessary roles (e.g., `roles/container.admin`, `roles/cloudsql.admin`) to the Terraform execution identity. |
| **GKE Cluster stuck in provisioning** | **Insufficient quota** for the region (e.g., for IP addresses or machine types). | Check the GCP Quotas page and request an increase if necessary. |

### 7.2. Verification Commands

*   **Check GKE Pod Logs**: `kubectl logs <pod-name> -c <container-name>`
*   **Check VPC Peering Status**: `gcloud services vpc-peerings list --network=[NETWORK_NAME]`
*   **Check Cloud SQL Status**: `gcloud sql instances describe [INSTANCE_NAME]`
*   **Check Memorystore Status**: `gcloud redis instances describe [INSTANCE_NAME]`

## 8. Next Steps

Once your core infrastructure is deployed, consider the following steps to complete your production environment:

1.  **CI/CD Pipeline**: Integrate your Terraform and Kubernetes manifests into a Continuous Integration/Continuous Deployment (CI/CD) pipeline (e.g., Cloud Build, GitLab CI, GitHub Actions) to automate changes.
2.  **External Access**: Deploy a GKE Ingress or Load Balancer to expose your application to the public internet.
3.  **Secret Management**: Replace hardcoded passwords (like the Cloud SQL user password) with a dedicated secret manager (e.g., Google Secret Manager or HashiCorp Vault).
4.  **Monitoring and Alerting**: Set up custom dashboards and alerts in Cloud Monitoring to track key metrics (CPU, memory, latency, error rates) for all services.

## 9. Verification Summary

The successful deployment is verified by the following:

1.  **Terraform Apply Success**: All resources are created without error.
2.  **GKE Connectivity**: You can connect to the GKE cluster using `kubectl`.
3.  **Service Connectivity**: Application pods in GKE can successfully connect to the private Cloud SQL and Memorystore instances.
4.  **Application Health**: The deployed application is running and healthy, serving traffic (if an Ingress is configured).

## References

[1] Google Cloud Pricing Calculator: [https://cloud.google.com/products/calculator](https://cloud.google.com/products/calculator)