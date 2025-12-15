# Azure Deployment Guide: AKS, PostgreSQL, and Redis with Terraform

This guide provides a comprehensive, step-by-step process for deploying a modern application infrastructure on Microsoft Azure. The architecture leverages **Azure Kubernetes Service (AKS)** for container orchestration, **Azure Database for PostgreSQL Flexible Server** for persistent data storage, and **Azure Cache for Redis** for high-speed caching, all provisioned and managed using **Terraform**.

## 1. Prerequisites

Before starting the deployment, ensure you have the following tools and accounts set up:

| Prerequisite | Description | Verification Command |
| :--- | :--- | :--- |
| **Azure Account** | An active Azure subscription with permissions to create resources. | `az login` |
| **Azure CLI** | Command-line interface for interacting with Azure. | `az --version` |
| **Terraform CLI** | Infrastructure as Code tool for provisioning resources. | `terraform --version` |
| **Git** | Version control system for cloning the Terraform code repository. | `git --version` |
| **Kubectl** | Kubernetes command-line tool for interacting with the AKS cluster. | `kubectl version --client` |

**Terraform Setup:**

1.  **Create a working directory:**
    ```bash
    mkdir azure-aks-deployment
    cd azure-aks-deployment
    ```
2.  **Create a `main.tf` file** (or a set of files) for your configuration.

## 2. Clear Step-by-Step Instructions

The deployment process is divided into three main stages: setting up the Terraform backend, defining the infrastructure, and deploying the resources.

### Stage 2.1: Terraform Backend Configuration

It is a best practice to store your Terraform state remotely and securely, typically in an Azure Storage Account.

**`backend.tf`**
```terraform
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
  backend "azurerm" {
    resource_group_name  = "tfstate-rg"
    storage_account_name = "tfstatestorageacct"
    container_name       = "tfstate"
    key                  = "aks-app.terraform.tfstate"
  }
}
```
*Note: You must manually create the Resource Group, Storage Account, and Container before running `terraform init`.*

### Stage 2.2: Infrastructure Definition (`main.tf`)

This section defines the core Azure resources.

#### 2.2.1: Resource Group and Networking

```terraform
resource "azurerm_resource_group" "rg" {
  name     = "rg-aks-app-prod"
  location = "East US" # Choose your preferred region
}

resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-aks-app-prod"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_subnet" "aks_subnet" {
  name                 = "snet-aks"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]
  # Required for AKS to delegate control
  enforce_private_link_endpoint_network_policies = true
}

resource "azurerm_subnet" "db_subnet" {
  name                 = "snet-db"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.2.0/24"]
  # Required for PostgreSQL Flexible Server
  delegation {
    name = "delegation"
    service_a_s_name = "Microsoft.DBforPostgreSQL/flexibleServers"
  }
}

resource "azurerm_subnet" "redis_subnet" {
  name                 = "snet-redis"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.3.0/24"]
}
```

#### 2.2.2: Azure Database for PostgreSQL Flexible Server

We deploy PostgreSQL in a private VNet for enhanced security.

```terraform
resource "azurerm_postgresql_flexible_server" "postgres" {
  name                   = "psql-aks-app-prod"
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  version                = "14"
  administrator_login    = "psqladmin"
  administrator_password = var.db_password # Use a variable for secrets
  sku_name               = "GP_Standard_D2s_v3"
  storage_mb             = 32768
  zone                   = "1"
  
  # Private VNet integration
  delegated_subnet_id    = azurerm_subnet.db_subnet.id
  private_dns_zone_id    = azurerm_private_dns_zone.postgres_dns.id
  
  # High Availability (Best Practice)
  high_availability {
    mode = "SameZone"
  }
}

resource "azurerm_private_dns_zone" "postgres_dns" {
  name                = "privatelink.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres_link" {
  name                  = "postgres-dns-link"
  resource_group_name   = azurerm_resource_group.rg.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres_dns.name
  virtual_network_id    = azurerm_virtual_network.vnet.id
}
```

#### 2.2.3: Azure Cache for Redis

We deploy a Premium tier Redis cache with VNet integration, which is a security best practice.

```terraform
resource "azurerm_redis_cache" "redis" {
  name                = "redis-aks-app-prod"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  capacity            = 1 # C1 Standard
  family              = "C"
  sku_name            = "Premium"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"
  
  # VNet Integration (requires Premium SKU)
  subnet_id           = azurerm_subnet.redis_subnet.id
}
```

#### 2.2.4: Azure Kubernetes Service (AKS)

```terraform
resource "azurerm_kubernetes_cluster" "aks" {
  name                = "aks-app-prod"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = "aks-app-prod"
  kubernetes_version  = "1.28" # Check for latest supported version

  default_node_pool {
    name       = "systempool"
    node_count = 2
    vm_size    = "Standard_DS2_v2"
    vnet_subnet_id = azurerm_subnet.aks_subnet.id
  }

  identity {
    type = "SystemAssigned"
  }
  
  # Best Practice: Enable Azure AD RBAC
  azure_active_directory_role_based_access_control {
    managed = true
    azure_rbac_enabled = true
  }
  
  # Network Profile for CNI (Best Practice)
  network_profile {
    network_plugin = "azure"
    dns_service_ip = "10.2.0.10"
    service_cidr   = "10.2.0.0/24"
    docker_bridge_cidr = "172.17.0.1/16"
  }
}
```

### Stage 2.3: Deployment Commands

1.  **Initialize Terraform:**
    ```bash
    terraform init -backend-config="resource_group_name=tfstate-rg" -backend-config="storage_account_name=tfstatestorageacct" -backend-config="container_name=tfstate"
    ```
2.  **Review the plan:**
    ```bash
    terraform plan -out main.tfplan
    ```
3.  **Apply the configuration:**
    ```bash
    terraform apply main.tfplan
    ```

## 3. Verification Steps

After the `terraform apply` completes successfully, verify the deployment:

1.  **Verify Resource Creation:** Check the Azure portal or use the Azure CLI to confirm all resources are in the `rg-aks-app-prod` resource group.
    ```bash
    az resource list --resource-group rg-aks-app-prod --output table
    ```
2.  **Verify AKS Connectivity:** Get the cluster credentials and check the nodes.
    ```bash
    az aks get-credentials --resource-group rg-aks-app-prod --name aks-app-prod
    kubectl get nodes
    # Expected output: 2 Ready nodes
    ```
3.  **Verify Database Connectivity (from AKS):** You will need to deploy a test pod into AKS to confirm it can connect to the private PostgreSQL and Redis endpoints.

## 4. Security Considerations

| Area | Consideration | Best Practice |
| :--- | :--- | :--- |
| **Networking** | Exposure of data services (PostgreSQL, Redis) to the public internet. | **Private Link/VNet Integration:** Deploy both PostgreSQL Flexible Server and Redis Cache into a private Virtual Network (VNet) and use Private Endpoints. The AKS cluster should be deployed into a dedicated subnet within the same VNet. |
| **Authentication** | Access control to the AKS cluster. | **Azure AD RBAC:** Enable Azure AD integration for AKS to manage cluster access using corporate identities. Disable local accounts. |
| **Secrets Management** | Storing database and application secrets. | **Azure Key Vault:** Use Azure Key Vault to store secrets and integrate it with AKS using the Azure Key Vault Provider for Secrets Store CSI Driver. **NEVER** hardcode secrets in Terraform or application code. |
| **PostgreSQL** | Data encryption and network access. | **SSL/TLS Enforcement:** Enforce SSL/TLS for all connections. Use the VNet integration shown in the example. |
| **Redis** | Data encryption and network access. | **TLS Enforcement:** Disable the non-SSL port (`enable_non_ssl_port = false`). Use the Premium tier for VNet integration and Private Link. |

## 5. Best Practices

1.  **Use Managed Identities:** Configure AKS to use Managed Identities for interacting with other Azure services (like ACR, Key Vault) instead of Service Principals.
2.  **Separate State:** Use a remote backend (Azure Storage) for Terraform state management.
3.  **Module Usage:** For production, use community or custom Terraform modules (e.g., `Azure-Verified-Modules`) to abstract complexity and enforce standards.
4.  **Node Pools:** Use separate node pools for system components and user workloads (e.g., `systempool` and `userpool`).
5.  **Monitoring:** Integrate Azure Monitor and Container Insights into your AKS deployment for comprehensive logging and metrics.

## 6. Troubleshooting

| Issue | Possible Cause | Resolution |
| :--- | :--- | :--- |
| **`Error: Subnet is not delegated`** | The subnet for PostgreSQL was not correctly delegated to the `Microsoft.DBforPostgreSQL/flexibleServers` service. | Ensure the `delegation` block is correctly defined in the `azurerm_subnet` resource for the database subnet. |
| **`AKS nodes are in NotReady state`** | Network configuration issues, or the Service Principal/Managed Identity lacks permissions. | Check the AKS service principal permissions on the VNet and Subnet. Ensure the network security group (NSG) rules allow necessary traffic. |
| **`PostgreSQL connection timeout`** | AKS cannot reach the private PostgreSQL endpoint. | Verify the Private DNS Zone link to the VNet is correct. Ensure the AKS subnet has a route to the PostgreSQL Private Endpoint (if used). |
| **`Terraform state lock failed`** | Another user or process is currently running a Terraform operation. | Run `terraform force-unlock <LOCK_ID>` only if you are certain no other operation is running. Get the lock ID from the error message. |

## 7. Cost Estimates (Conceptual)

The cost is highly dependent on the SKU and scale chosen. The following table provides a conceptual breakdown for the resources defined in this guide (SKUs are examples):

| Resource | Example SKU | Cost Driver | Notes |
| :--- | :--- | :--- | :--- |
| **AKS Cluster** | 2x Standard_DS2_v2 nodes | Number of nodes, VM size, uptime. | Control plane is free, but you pay for the underlying VMs, storage, and networking. |
| **PostgreSQL** | General Purpose, D2s_v3, 32GB Storage | Compute tier, storage size, backup retention, HA mode. | Flexible Server is generally more cost-effective than Single Server. High Availability adds cost. |
| **Redis Cache** | Premium C1 | Cache size (capacity), tier (Standard/Premium). | Premium tier is required for VNet integration, which is a security best practice. |
| **Networking** | VNet, Subnets, Private DNS Zones | Data transfer (egress), Private Link endpoints. | Networking costs are usually minor compared to compute and database costs. |

**Recommendation:** Use the [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/) with the specific SKUs and regions to get an accurate estimate.

## 8. Next Steps

1.  **Application Deployment:** Use the Kubernetes provider in Terraform or a Helm chart to deploy your application containers to the newly created AKS cluster.
2.  **Key Vault Integration:** Implement the Azure Key Vault Provider for Secrets Store CSI Driver in AKS to securely retrieve database connection strings and other secrets.
3.  **CI/CD Pipeline:** Integrate your Terraform code into an Azure DevOps, GitHub Actions, or GitLab CI pipeline for automated infrastructure deployment.
4.  **Monitoring and Alerting:** Configure Azure Monitor alerts for key metrics on AKS, PostgreSQL, and Redis (e.g., CPU utilization, memory usage, connection count).

## 9. Screenshots or Diagrams (Descriptions)

1.  **Diagram 1: High-Level Architecture**
    *   **Description:** A network diagram showing the Virtual Network (VNet) in the center. Inside the VNet, three subnets are shown: `snet-aks`, `snet-db`, and `snet-redis`.
    *   **Components:**
        *   **AKS Cluster** (in `snet-aks`) connected to the VNet.
        *   **Azure Database for PostgreSQL Flexible Server** (in `snet-db`) with a Private Endpoint.
        *   **Azure Cache for Redis** (in `snet-redis`) with VNet integration.
        *   An arrow from the AKS cluster to both PostgreSQL and Redis, labeled "Private Network Access."
        *   An arrow from the internet to the AKS Load Balancer/Ingress Controller.

2.  **Screenshot 1: Terraform Apply Output**
    *   **Description:** A screenshot of the terminal after a successful `terraform apply`.
    *   **Content:** Shows the final output summary: `Apply complete! Resources: X added, Y changed, Z destroyed.`

3.  **Screenshot 2: Azure Portal Resource Group View**
    *   **Description:** A screenshot of the Azure Portal showing the `rg-aks-app-prod` resource group.
    *   **Content:** A list of the deployed resources: `Kubernetes Service`, `PostgreSQL Flexible Server`, `Redis Cache`, `Virtual Network`, `Resource Group`, etc., all showing a "Succeeded" status.
