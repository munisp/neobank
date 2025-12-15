# AWS Deployment Guide: NeoBank Microservices with EKS, RDS, ElastiCache, and Terraform

## I. Introduction

This document provides a comprehensive, step-by-step guide for deploying the NeoBank microservices application onto Amazon Web Services (AWS) using **Terraform** for infrastructure provisioning. The target audience includes DevOps engineers, cloud architects, and developers seeking to establish a production-ready, scalable, and secure environment for the NeoBank platform.

### 1.1 NeoBank Architecture Overview

The NeoBank application is designed as a set of microservices, leveraging a modern, cloud-native architecture on AWS. The core components provisioned by this guide are:

| Component | AWS Service | Purpose |
| :--- | :--- | :--- |
| **Microservices** | Amazon Elastic Kubernetes Service (EKS) | Container orchestration for running the application's stateless and stateful microservices. |
| **Primary Database** | Amazon Relational Database Service (RDS) | Managed relational database (e.g., PostgreSQL or MySQL) for core transactional data. |
| **Caching Layer** | Amazon ElastiCache for Redis | High-speed, in-memory data store for session management, caching, and leaderboards. |
| **Networking** | Amazon Virtual Private Cloud (VPC) | Isolated virtual network environment to host all resources securely. |

### 1.2 Tools and Technologies

This deployment relies on the principle of **Infrastructure as Code (IaC)**, managed entirely through Terraform.

| Tool | Version | Purpose |
| :--- | :--- | :--- |
| **Terraform** | v1.x.x or later | Provisioning and managing the entire AWS infrastructure stack. |
| **AWS CLI** | v2 or later | Configuring AWS credentials and interacting with AWS services. |
| **Kubectl** | Latest stable | Interacting with the EKS cluster for application deployment. |
| **Helm** | Latest stable | Managing and deploying Kubernetes applications and add-ons. |

## II. Prerequisites

Before beginning the deployment, ensure the following prerequisites are met.

### 2.1 AWS Account Setup

You must have an active AWS account with sufficient permissions to create the required resources (VPC, EKS cluster, RDS instance, ElastiCache cluster, IAM roles, etc.). It is highly recommended to use a dedicated IAM user with **Programmatic Access** and an appropriate permissions policy (e.g., `AdministratorAccess` for initial setup, or a more restrictive policy following the principle of least privilege).

### 2.2 Local Tooling Installation

Ensure the following command-line tools are installed and configured on your local machine:

1.  **Terraform**: Download and install the appropriate version from the [official HashiCorp website](https://www.terraform.io/downloads).
    ```bash
    # Verify installation
    terraform version
    ```
2.  **AWS CLI**: Install the AWS Command Line Interface (CLI) v2.
    ```bash
    # Verify installation
    aws --version
    ```
3.  **Kubectl**: Install the Kubernetes command-line tool.
    ```bash
    # Verify installation
    kubectl version --client
    ```
4.  **Helm**: Install the Kubernetes package manager.
    ```bash
    # Verify installation
    helm version
    ```

### 2.3 Source Code and Configuration

The deployment assumes you have cloned the NeoBank repository, which contains the Terraform configuration files.

```bash
# Clone the repository (replace with actual repository URL)
git clone https://github.com/neobank/neobank-microservices.git
cd neobank-microservices/terraform/aws
```

## III. AWS Setup and Configuration with Terraform

This section details the process of provisioning the core AWS infrastructure using the provided Terraform configuration.

### 3.1 Initial Setup: AWS Credentials and Backend

#### 3.1.1 Configure AWS CLI

Configure your AWS credentials using the AWS CLI. This will create the necessary configuration files that Terraform will use.

```bash
aws configure
# AWS Access Key ID [None]: YOUR_ACCESS_KEY_ID
# AWS Secret Access Key [None]: YOUR_SECRET_ACCESS_KEY
# Default region name [None]: us-east-1
# Default output format [None]: json
```

#### 3.1.2 Terraform S3 Backend Configuration

To manage the Terraform state securely and enable collaboration, an S3 bucket is used as a remote backend. **Before running `terraform init`**, ensure you have manually created an S3 bucket (e.g., `neobank-tf-state-12345`) and a DynamoDB table (e.g., `neobank-tf-locks`) for state locking.

The `backend.tf` file should be configured as follows:

```terraform
# backend.tf
terraform {
  backend "s3" {
    bucket         = "neobank-tf-state-12345"
    key            = "neobank/eks/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "neobank-tf-locks"
    encrypt        = true
  }
}
```

### 3.2 Core Infrastructure Provisioning (VPC, Subnets, Security Groups)

The foundational network infrastructure is defined in `vpc.tf`. This module creates a highly available VPC with public and private subnets across multiple Availability Zones (AZs). All critical services (RDS, ElastiCache, EKS worker nodes) will reside in the private subnets for enhanced security.

**Diagram Description:** *A conceptual architecture diagram showing the VPC boundary, with public subnets containing NAT Gateways and a Load Balancer, and private subnets hosting the EKS worker nodes, RDS, and ElastiCache. Arrows should illustrate traffic flow from the internet through the load balancer to EKS, and from EKS to the private RDS and ElastiCache instances.*

### 3.3 Relational Database Service (RDS) Provisioning

The `rds.tf` file provisions a managed relational database instance, typically PostgreSQL or MySQL, configured for high availability (Multi-AZ deployment).

**Code Example: `rds.tf` (Conceptual)**

```terraform
resource "aws_db_instance" "neobank_db" {
  allocated_storage    = 100
  engine               = "postgres"
  engine_version       = "14.7"
  instance_class       = "db.t3.medium"
  name                 = "neobankdb"
  username             = "neouser"
  password             = var.db_password
  db_subnet_group_name = aws_db_subnet_group.neobank_db_subnets.name
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  multi_az             = true
  skip_final_snapshot  = true
}
```

**Security Consideration**: The RDS instance is placed in a private subnet and is only accessible via a dedicated Security Group (`rds_sg`) that allows inbound traffic *only* from the EKS worker node security group. This prevents direct internet access to the database.

### 3.4 ElastiCache (Redis) Provisioning

The `elasticache.tf` file provisions an ElastiCache Redis cluster, also placed in private subnets for low-latency access from the EKS cluster.

**Code Example: `elasticache.tf` (Conceptual)**

```terraform
resource "aws_elasticache_cluster" "neobank_cache" {
  cluster_id           = "neobank-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis6.x"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.neobank_cache_subnets.name
  security_group_ids   = [aws_security_group.elasticache_sg.id]
}
```

**Security Consideration**: Similar to RDS, the ElastiCache cluster is secured by a Security Group (`elasticache_sg`) that restricts access to the EKS worker nodes. **Encryption in Transit** (TLS) and **Encryption at Rest** (KMS) should be enabled for production environments.

### 3.5 Elastic Kubernetes Service (EKS) Provisioning

The `eks.tf` file provisions the EKS control plane and associated worker node groups.

**Code Example: `eks.tf` (Conceptual)**

```terraform
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "neobank-eks-cluster"
  cluster_version = "1.28"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  eks_managed_node_groups = {
    general = {
      min_size     = 2
      max_size     = 5
      desired_size = 3
      instance_types = ["t3.medium"]
    }
  }
  # Enable IAM Roles for Service Accounts (IRSA)
  enable_irsa = true
}
```

**Security Consideration**: **IAM Roles for Service Accounts (IRSA)** is enabled to allow Kubernetes service accounts to assume IAM roles, providing fine-grained AWS access to individual microservices without sharing long-lived AWS credentials.

### 3.6 Execution: Deploying the Infrastructure

Once all Terraform files are configured, execute the following commands in the `neobank-microservices/terraform/aws` directory:

1.  **Initialize Terraform**: Downloads necessary providers and modules, and configures the S3 backend.
    ```bash
    terraform init
    ```
2.  **Review the Plan**: Generates an execution plan, showing exactly what resources will be created, modified, or destroyed. **Review this output carefully.**
    ```bash
    terraform plan -out=neobank.tfplan
    ```
3.  **Apply the Configuration**: Executes the plan to provision the infrastructure on AWS.
    ```bash
    terraform apply "neobank.tfplan"
    ```
    Type `yes` when prompted to confirm the deployment. The process may take 20-40 minutes, primarily due to EKS and RDS provisioning time.

## IV. Application Deployment (Kubernetes)

After the infrastructure is provisioned, the NeoBank microservices can be deployed to the EKS cluster.

### 4.1 Configure Kubectl Access

The AWS CLI can automatically configure `kubectl` to connect to the newly created EKS cluster. Use the cluster name from the Terraform output.

```bash
# Replace 'neobank-eks-cluster' and 'us-east-1' with your values
aws eks update-kubeconfig --name neobank-eks-cluster --region us-east-1
# Verify connection
kubectl get svc
```

### 4.2 Deploy NeoBank Microservices

The application deployment is typically managed through Kubernetes manifests (YAML files) or Helm charts located in the application repository (e.g., `neobank-microservices/k8s`).

#### 4.2.1 Database Migration

A critical first step is running database migrations to set up the schema on the RDS instance. This is often done using a Kubernetes Job.

```bash
# Assuming the migration job is defined in 'db-migration-job.yaml'
kubectl apply -f ../k8s/db-migration-job.yaml
# Monitor the job status
kubectl logs -f job/neobank-migration
```

#### 4.2.2 Deploying Services

Deploy the core microservices (e.g., user-service, transaction-service) and the necessary ingress controller (e.g., AWS Load Balancer Controller) to expose the application.

```bash
# Deploy all services and deployments
kubectl apply -f ../k8s/services/
# Deploy the Ingress resource to expose the application via an AWS ALB
kubectl apply -f ../k8s/ingress.yaml
# Check the status of the deployments
kubectl get deployments
```

**Command Examples**:
*   To check the external URL of the application:
    ```bash
    kubectl get ingress neobank-ingress
    # Look for the ADDRESS field, which will be the ALB DNS name.
    ```
*   To check the logs of a specific service:
    ```bash
    kubectl logs -f deployment/user-service
    ```

## V. Verification

After the infrastructure and application deployment are complete, follow these steps to verify the successful operation of the NeoBank platform.

### 5.1 Infrastructure Verification

1.  **Terraform Outputs**: Check the final output of the `terraform apply` command. It should contain key information like the EKS cluster name, RDS endpoint, and ElastiCache endpoint.
    ```bash
    terraform output
    ```
2.  **AWS Console Check**:
    *   Verify the EKS cluster status is `Active`.
    *   Verify the RDS instance status is `Available`.
    *   Verify the ElastiCache cluster status is `Available`.
    *   Confirm that the EC2 instances for the EKS worker nodes are running.

### 5.2 Application Health Checks

1.  **Kubernetes Pod Status**: Ensure all application Pods are in the `Running` state.
    ```bash
    kubectl get pods --all-namespaces
    ```
2.  **Service Connectivity**: Check the logs of a core microservice (e.g., `user-service`) to ensure it successfully connected to the RDS and ElastiCache endpoints.
    ```bash
    kubectl logs -f deployment/user-service
    # Look for connection success messages.
    ```
3.  **External Access**: Retrieve the external URL of the application from the Ingress resource and access it via a web browser or `curl`.
    ```bash
    EXTERNAL_URL=$(kubectl get ingress neobank-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    curl -I "http://${EXTERNAL_URL}/health"
    # Expect an HTTP 200 OK response.
    ```

### 5.3 Core Functionality Testing

Perform end-to-end tests to ensure the application logic is working correctly:

1.  **User Registration**: Attempt to register a new user via the application's API or frontend. This verifies connectivity to the EKS service, the database, and the cache (for session/rate limiting).
2.  **Transaction Processing**: Initiate a sample transaction (e.g., transfer funds). This verifies the microservices communication and database write operations.
3.  **Cache Interaction**: If possible, check the Redis cache to confirm that session data or frequently accessed data is being stored and retrieved correctly.

## VI. Troubleshooting

This section addresses common issues that may arise during the deployment and application phases.

### 6.1 Common Terraform Errors

| Error Message | Possible Cause | Solution |
| :--- | :--- | :--- |
| `Error acquiring state lock` | Another user or process is currently running `terraform apply`. | Run `terraform force-unlock <LOCK_ID>` (use with caution) or wait for the other process to complete. |
| `Provider configuration not found` | AWS credentials are not correctly configured or the region is wrong. | Run `aws configure` again, or check the `provider.tf` file for the correct region. |
| `Resource not found` | A dependency failed to provision, or a resource name is misspelled. | Check the output of `terraform plan` and the AWS console for failed resources. Ensure all dependencies are met. |

### 6.2 EKS/Kubernetes Issues

| Issue | Diagnosis Command | Solution |
| :--- | :--- | :--- |
| Pods stuck in `Pending` | `kubectl describe pod <pod-name>` | Check for insufficient resources (CPU/Memory) or node selector/taint mismatches. Scale up the EKS node group or adjust resource requests. |
| Pods in `CrashLoopBackOff` | `kubectl logs <pod-name>` | The application container is crashing. Review the application logs for startup errors, configuration issues, or missing environment variables (e.g., database connection string). |
| Service not reachable | `kubectl get svc` and `kubectl get ingress` | Check if the Service is correctly pointing to the Pods. If using Ingress, ensure the AWS Load Balancer Controller is running and the ALB is provisioned and healthy. |

### 6.3 Connectivity Issues

If the EKS Pods cannot connect to RDS or ElastiCache:

1.  **Security Groups**: Verify that the Security Group attached to the EKS worker nodes explicitly allows outbound traffic to the RDS/ElastiCache Security Groups on the correct ports (e.g., 5432 for PostgreSQL, 6379 for Redis).
2.  **Subnets**: Ensure RDS and ElastiCache are in private subnets, and the EKS worker nodes are in subnets that can route to them (which should be the case if they are in the same VPC).
3.  **Network ACLs**: Check Network Access Control Lists (NACLs) if Security Groups are confirmed to be correct, as NACLs acts as a stateless firewall at the subnet level.

## VII. Best Practices and Optimization

Adopting best practices ensures the NeoBank platform is scalable, maintainable, and cost-efficient.

### 7.1 Infrastructure as Code (IaC) Practices

*   **Modularity**: Use Terraform modules for reusable components (e.g., VPC, EKS, RDS). This reduces code duplication and improves maintainability.
*   **State Management**: Always use a remote backend (like S3 with DynamoDB locking) for state management. Never commit the `terraform.tfstate` file to Git.
*   **Code Review**: Treat Terraform code like application code; enforce peer review before merging and applying changes to production environments.

### 7.2 EKS Optimization

*   **Cluster Autoscaler**: Implement the Kubernetes Cluster Autoscaler to automatically adjust the number of worker nodes based on the pending Pods, optimizing cost and performance.
*   **Spot Instances**: Utilize AWS Spot Instances for non-critical or fault-tolerant workloads to significantly reduce compute costs.
*   **Resource Requests and Limits**: Define accurate CPU and memory requests and limits for all microservices to enable efficient scheduling and prevent resource contention.

### 7.3 RDS/ElastiCache Performance

*   **Sizing**: Choose the appropriate RDS instance class and ElastiCache node type based on expected load. Start with a moderate size and scale up based on monitoring data.
*   **Monitoring**: Use Amazon CloudWatch and Performance Insights to monitor database and cache metrics (CPU utilization, connections, cache hit ratio) and proactively address bottlenecks.
*   **Read Replicas**: For read-heavy workloads (common in NeoBank applications), use RDS Read Replicas to offload read traffic from the primary instance.

## VIII. Security Considerations

Security is paramount for a financial application like NeoBank. The following considerations should be implemented.

### 8.1 Network Security

*   **VPC and Subnets**: All core infrastructure (EKS nodes, RDS, ElastiCache) must reside in **private subnets** with no direct internet access.
*   **Security Groups**: Apply the principle of least privilege. Security Groups should only allow necessary traffic between components (e.g., EKS to RDS on port 5432).
*   **Kubernetes Network Policies**: Implement Kubernetes Network Policies to control Pod-to-Pod communication within the EKS cluster, creating micro-segmentation.

### 8.2 Identity and Access Management (IAM)

*   **IAM Roles for Service Accounts (IRSA)**: As provisioned in the EKS setup, IRSA allows fine-grained, temporary AWS access credentials to be assigned to specific Kubernetes service accounts, eliminating the need to store AWS keys in containers.
*   **Least Privilege**: Ensure all IAM roles (for EKS nodes, CI/CD, and human users) are granted only the minimum permissions required to perform their function.
*   **Open Policy Agent (OPA)**: Use OPA to enforce security and compliance policies across the EKS cluster, such as ensuring all deployments have resource limits defined.

### 8.3 Data Protection

*   **Encryption at Rest**: Ensure RDS and ElastiCache are configured with **KMS encryption** for data at rest.
*   **Encryption in Transit**: Configure RDS and ElastiCache to enforce SSL/TLS for all connections. All external traffic to the EKS cluster should be secured with HTTPS via the Ingress controller.
*   **Secrets Management**: Use a dedicated secrets manager (e.g., AWS Secrets Manager or HashiCorp Vault) to store sensitive information like database passwords, and integrate it with Kubernetes using a tool like the AWS Secrets and Configuration Provider (ASCP) for Kubernetes Secrets Store CSI Driver.

## IX. Cost Estimates

The primary cost drivers for this architecture are the compute resources (EKS worker nodes) and the managed services (RDS and EKS Control Plane).

### 9.1 Key Cost Drivers

| Component | Cost Driver | Optimization Strategy |
| :--- | :--- | :--- |
| **EKS Control Plane** | Fixed monthly fee per cluster. | N/A (Fixed cost for managed service). |
| **EKS Worker Nodes** | EC2 Instance Type and Quantity. | Use Cluster Autoscaler, Spot Instances, and right-size the instance type (e.g., `t3.medium` for dev/test, `m5.large` for production). |
| **RDS Instance** | Instance Class (e.g., `db.t3.medium`), Storage, Multi-AZ. | Choose the smallest class that meets performance needs. Use Reserved Instances for long-term commitment. |
| **ElastiCache** | Node Type (e.g., `cache.t3.micro`), Number of Replicas. | Start small and scale up. Use Reserved Nodes for predictable usage. |
| **Data Transfer** | Data transferred out of AWS region. | Minimize cross-region data transfer. |

### 9.2 Cost Optimization Strategies

1.  **Reserved Instances/Savings Plans**: Commit to 1-year or 3-year Reserved Instances for predictable workloads (RDS, EC2 worker nodes) to achieve significant discounts (up to 72%).
2.  **Right-Sizing**: Continuously monitor resource utilization and adjust the size of EC2 and RDS instances to avoid over-provisioning.
3.  **Kubecost**: Integrate a tool like Kubecost into the EKS cluster to monitor and allocate Kubernetes spend by namespace, deployment, or service, providing visibility into cost drivers.

## X. Next Steps

A successful deployment is the first step. The following steps are recommended to transition the platform to a production-ready state.

### 10.1 CI/CD Pipeline Integration

Integrate the Terraform and Kubernetes deployment steps into a robust Continuous Integration/Continuous Deployment (CI/CD) pipeline (e.g., using AWS CodePipeline, GitHub Actions, or GitLab CI). This automates changes and ensures a consistent, repeatable deployment process.

### 10.2 Monitoring and Logging Setup

Implement comprehensive observability tools:

*   **Logging**: Configure all EKS Pods to send logs to a centralized logging solution (e.g., Amazon CloudWatch Logs, OpenSearch, or a third-party tool).
*   **Monitoring**: Deploy Prometheus and Grafana within the EKS cluster to collect and visualize metrics on cluster health, resource utilization, and application performance.
*   **Alerting**: Set up alerts based on key performance indicators (KPIs) and error rates to ensure proactive incident response.

### 10.3 Disaster Recovery Planning

Develop a disaster recovery (DR) strategy, including:

*   **Backup and Restore**: Implement automated backups for RDS and define a clear restore process.
*   **Multi-Region Strategy**: For maximum resilience, plan for a multi-region deployment or a hot/warm standby in a secondary AWS region.
*   **Regular Testing**: Periodically test the DR plan to ensure it meets the required Recovery Time Objective (RTO) and Recovery Point Objective (RPO).

## XI. Appendix

### 11.1 Diagram Description

The conceptual architecture diagram (mentioned in Section 3.2) should visually represent the flow of traffic and the isolation of components:

1.  **VPC**: The outer boundary, defining the network space.
2.  **Public Subnets**: Contain the Application Load Balancer (ALB) and NAT Gateways.
3.  **Private Subnets**: Contain the EKS Worker Nodes, the RDS instance, and the ElastiCache cluster.
4.  **Traffic Flow**: Arrows show external traffic entering the ALB in the public subnet, then being routed to the EKS Pods in the private subnet. EKS Pods then communicate internally with the private RDS and ElastiCache endpoints.

### 11.2 References

[1] AWS Documentation: Amazon EKS Best Practices Guide
[2] HashiCorp Terraform Documentation
[3] AWS Documentation: RDS Security Best Practices
[4] AWS Documentation: ElastiCache Security
[5] AWS Documentation: Cost Optimization for EKS
