# main.tf

# ------------------------------------------------------------------------------
# PROVIDER CONFIGURATION
# ------------------------------------------------------------------------------
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.0.0"
}

provider "azurerm" {
  features {}
}

# ------------------------------------------------------------------------------
# RESOURCE GROUP
# ------------------------------------------------------------------------------
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

# ------------------------------------------------------------------------------
# VIRTUAL NETWORK AND SUBNETS
# ------------------------------------------------------------------------------
resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  address_space       = ["10.0.0.0/16"]
}

# Subnet for AKS Node Pools (requires service endpoints for Azure services)
resource "azurerm_subnet" "aks_subnet" {
  name                 = "aks-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]
  # Required for AKS to communicate with Azure services securely
  service_endpoints = [
    "Microsoft.KeyVault",
    "Microsoft.Storage",
    "Microsoft.ContainerRegistry",
  ]
}

# Subnet for Application Gateway (requires a dedicated subnet)
resource "azurerm_subnet" "appgw_subnet" {
  name                 = "appgw-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.2.0/24"]
}

# Subnet for Private Endpoints (for PostgreSQL, Redis, Key Vault)
resource "azurerm_subnet" "private_endpoint_subnet" {
  name                 = "private-endpoint-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.3.0/24"]
  # Private endpoint subnets must have network policies disabled
  enforce_private_link_endpoint_network_policies = true
  enforce_private_link_service_network_policies  = true
}

# Subnet for Azure Bastion (optional, but good for secure access)
resource "azurerm_subnet" "bastion_subnet" {
  name                 = "AzureBastionSubnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.4.0/26"]
}

# ------------------------------------------------------------------------------
# AZURE MONITOR LOG ANALYTICS WORKSPACE
# ------------------------------------------------------------------------------
resource "azurerm_log_analytics_workspace" "law" {
  name                = "law-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018" # Cost-optimized SKU
  retention_in_days   = 30          # Cost-optimized retention
}

# ------------------------------------------------------------------------------
# AZURE MONITOR ACTION GROUP (for alerts)
# ------------------------------------------------------------------------------
resource "azurerm_monitor_action_group" "ag" {
  name                = "ag-${var.project_name}-${var.environment}"
  resource_group_name = azurerm_resource_group.rg.name
  short_name          = "neobankag"
}

# ------------------------------------------------------------------------------
# AZURE KEY VAULT
# ------------------------------------------------------------------------------
resource "azurerm_key_vault" "kv" {
  name                        = "kv-${var.project_name}-${var.environment}"
  location                    = azurerm_resource_group.rg.location
  resource_group_name         = azurerm_resource_group.rg.name
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  sku_name                    = "standard" # Premium for HSM, Standard for general use
  enabled_for_disk_encryption = true
  purge_protection_enabled    = true
  soft_delete_retention_days  = 90 # BCDR requirement

  # Access policy for the current user/service principal for deployment
  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    key_permissions = [
      "Get", "List", "Create", "Delete", "Recover", "Backup", "Restore", "Import",
    ]

    secret_permissions = [
      "Get", "List", "Set", "Delete", "Recover", "Backup", "Restore",
    ]

    certificate_permissions = [
      "Get", "List", "Create", "Import", "Delete", "Recover", "Backup", "Restore", "Update",
    ]
  }
}

# Data source for current client configuration
data "azurerm_client_config" "current" {}

# ------------------------------------------------------------------------------
# AZURE DNS ZONE
# ------------------------------------------------------------------------------
resource "azurerm_dns_zone" "dns_zone" {
  name                = var.domain_name
  resource_group_name = azurerm_resource_group.rg.name
}

# ------------------------------------------------------------------------------
# AZURE DATABASE FOR POSTGRESQL - FLEXIBLE SERVER (HA and BCDR)
# ------------------------------------------------------------------------------
resource "azurerm_postgresql_flexible_server" "psql" {
  name                   = "psql-${var.project_name}-${var.environment}"
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  version                = "14"
  delegated_subnet_id    = azurerm_subnet.private_endpoint_subnet.id
  private_dns_zone_id    = azurerm_private_dns_zone.psql.id
  administrator_login    = "psqladmin"
  administrator_password = azurerm_key_vault_secret.psql_admin_password.value
  storage_mb             = 32768 # 32GB
  sku_name               = "Standard_D4ads_v5" # General Purpose, supports HA
  zone                   = "1"

  high_availability {
    mode                    = "ZoneRedundant" # High Availability
    standby_availability_zone = "3"
  }

  backup_retention_days = 35 # BCDR requirement
  geo_redundant_backup_enabled = true # BCDR requirement

  maintenance_window {
    day_of_week = 0 # Sunday
    start_hour  = 23
    start_minute = 0
  }
}

# Private DNS Zone for PostgreSQL
resource "azurerm_private_dns_zone" "psql" {
  name                = "privatelink.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.rg.name
}

# Link Private DNS Zone to VNet
resource "azurerm_private_dns_zone_virtual_network_link" "psql_link" {
  name                  = "psql-dns-link"
  resource_group_name   = azurerm_resource_group.rg.name
  private_dns_zone_name = azurerm_private_dns_zone.psql.name
  virtual_network_id    = azurerm_virtual_network.vnet.id
}

# Store PostgreSQL admin password in Key Vault
resource "azurerm_key_vault_secret" "psql_admin_password" {
  name         = "psql-admin-password"
  value        = var.psql_admin_password
  key_vault_id = azurerm_key_vault.kv.id
}

# ------------------------------------------------------------------------------
# AZURE CACHE FOR REDIS (HA and BCDR)
# ------------------------------------------------------------------------------
resource "azurerm_redis_cache" "redis" {
  name                = "redis-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  capacity            = 2 # C2 size
  family              = "C"
  sku_name            = "Standard" # Standard or Premium for HA/clustering
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"
  subnet_id           = azurerm_subnet.private_endpoint_subnet.id # VNet integration for security

  # HA/Clustering (Premium tier is required for clustering/zone redundancy)
  # Let's use Premium for true production-ready HA (Zone Redundancy)
  sku_name            = "Premium"
  capacity            = 2 # P2 size
  shard_count         = 2 # Clustering for better performance and HA
  minimum_tls_version = "1.2"
  zones               = ["1", "3"] # Zone Redundancy (HA)

  redis_configuration {
    maxmemory_policy = "allkeys-lru"
  }
}

# ------------------------------------------------------------------------------
# AZURE KUBERNETES SERVICE (AKS)
# ------------------------------------------------------------------------------
resource "azurerm_kubernetes_cluster" "aks" {
  name                = "aks-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = "aks-${var.project_name}"
  kubernetes_version  = "1.28" # Use a recent, stable version
  node_resource_group = "aks-nodes-${var.project_name}-${var.environment}"

  # Production-ready HA and Security
  private_cluster_enabled = true # Security best practice
  sku_tier                = "Standard" # Required for multiple node pools and availability zones

  default_node_pool {
    name                = "systempool"
    node_count          = 3 # Minimum 3 nodes for system pool HA
    vm_size             = "Standard_DS2_v2"
    vnet_subnet_id      = azurerm_subnet.aks_subnet.id
    os_disk_size_gb     = 128
    type                = "System"
    zones               = ["1", "2", "3"] # HA/Zone Redundancy
    enable_auto_scaling = true
    min_count           = 3
    max_count           = 5
  }

  identity {
    type = "SystemAssigned"
  }

  # AKS Network Configuration
  network_profile {
    network_plugin     = "azure"
    network_policy     = "calico" # Security best practice
    load_balancer_sku  = "standard"
    outbound_type      = "loadBalancer"
  }

  # AKS Monitoring (Azure Monitor)
  addon_profile {
    oms_agent {
      enabled                    = true
      log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id
    }
  }

  # AKS Security (Microsoft Entra ID integration)
  azure_active_directory_role_based_access_control {
    managed                = true
    azure_rbac_enabled     = true
    admin_group_object_ids = [var.aks_admin_group_id] # IAM roles
  }

  # User Node Pool (for application workloads)
  # This is where the NeoBank application will run
  dynamic "node_pool" {
    for_each = {
      app = {
        name       = "apppool"
        vm_size    = "Standard_DS3_v2"
        min_count  = 2
        max_count  = 10
        node_count = 2
        zones      = ["1", "2", "3"]
        type       = "User"
      }
    }
    content {
      name                = node_pool.value.name
      node_count          = node_pool.value.node_count
      vm_size             = node_pool.value.vm_size
      vnet_subnet_id      = azurerm_subnet.aks_subnet.id
      os_disk_size_gb     = 128
      type                = node_pool.value.type
      zones               = node_pool.value.zones
      enable_auto_scaling = true # Auto-scaling capabilities
      min_count           = node_pool.value.min_count
      max_count           = node_pool.value.max_count
    }
  }
}

# ------------------------------------------------------------------------------
# APPLICATION GATEWAY (WAF and Key Vault Integration)
# ------------------------------------------------------------------------------
resource "azurerm_public_ip" "appgw_pip" {
  name                = "pip-appgw-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_application_gateway" "appgw" {
  name                = "appgw-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  sku {
    name     = "WAF_v2" # WAF for security best practice
    tier     = "WAF_v2"
    capacity = 2 # HA/Auto-scaling
  }

  autoscale_configuration {
    min_capacity = 2
    max_capacity = 10
  }

  gateway_ip_configuration {
    name      = "ip-config"
    subnet_id = azurerm_subnet.appgw_subnet.id
  }

  frontend_port {
    name = "port-80"
    port = 80
  }

  frontend_port {
    name = "port-443"
    port = 443
  }

  frontend_ip_configuration {
    name                 = "frontend-ip-config"
    public_ip_address_id = azurerm_public_ip.appgw_pip.id
  }

  # HTTP Listener for redirecting HTTP to HTTPS
  http_listener {
    name                           = "http-listener"
    frontend_ip_configuration_name = "frontend-ip-config"
    frontend_port_name             = "port-80"
    protocol                       = "Http"
  }

  # HTTPS Listener with Key Vault Certificate
  http_listener {
    name                           = "https-listener"
    frontend_ip_configuration_name = "frontend-ip-config"
    frontend_port_name             = "port-443"
    protocol                       = "Https"
    ssl_certificate_name           = "kv-cert" # Name of the certificate in App Gateway
    host_name                      = var.domain_name
  }

  # Managed Identity for Key Vault access
  identity {
    type = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.appgw_identity.id]
  }

  # SSL Certificate from Key Vault
  ssl_certificate {
    name             = "kv-cert"
    key_vault_secret_id = var.appgw_kv_secret_id # Secret ID of the certificate in Key Vault
  }

  # Backend Pool (pointing to AKS Ingress Controller)
  backend_address_pool {
    name = "aks-backend-pool"
  }

  # Backend HTTP Setting (for communication with AKS)
  backend_http_settings {
    name                  = "aks-http-setting"
    cookie_based_affinity = "Disabled"
    port                  = 80
    protocol              = "Http"
    request_timeout       = 20
  }

  # Request Routing Rule (HTTP to HTTPS redirect)
  request_routing_rule {
    name                       = "http-to-https-redirect"
    rule_type                  = "Basic"
    http_listener_name         = "http-listener"
    redirect_configuration_name = "http-to-https-redirect-config"
  }

  # Request Routing Rule (HTTPS to AKS)
  request_routing_rule {
    name                       = "https-to-aks"
    rule_type                  = "Basic"
    http_listener_name         = "https-listener"
    backend_address_pool_name  = "aks-backend-pool"
    backend_http_settings_name = "aks-http-setting"
  }

  # Redirect Configuration
  redirect_configuration {
    name                 = "http-to-https-redirect-config"
    redirect_type        = "Permanent"
    target_listener_name = "https-listener"
    include_path         = true
    include_query_string = true
  }

  # WAF Configuration
  waf_configuration {
    enabled          = true
    firewall_mode    = "Prevention"
    rule_set_type    = "OWASP"
    rule_set_version = "3.2"
  }
}

# User Assigned Identity for Application Gateway to access Key Vault
resource "azurerm_user_assigned_identity" "appgw_identity" {
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  name                = "uai-appgw-${var.project_name}-${var.environment}"
}

# Key Vault Access Policy for Application Gateway Identity
resource "azurerm_key_vault_access_policy" "appgw_kv_access" {
  key_vault_id = azurerm_key_vault.kv.id
  tenant_id    = azurerm_user_assigned_identity.appgw_identity.tenant_id
  object_id    = azurerm_user_assigned_identity.appgw_identity.principal_id

  secret_permissions = [
    "Get",
  ]

  certificate_permissions = [
    "Get",
  ]
}

# ------------------------------------------------------------------------------
# AZURE DNS A RECORD (for Application Gateway)
# ------------------------------------------------------------------------------
resource "azurerm_dns_a_record" "appgw_a_record" {
  name                = "@" # Root domain
  zone_name           = azurerm_dns_zone.dns_zone.name
  resource_group_name = azurerm_resource_group.rg.name
  ttl                 = 300
  target_resource_id  = azurerm_public_ip.appgw_pip.id
}

# ------------------------------------------------------------------------------
# AZURE MONITOR DIAGNOSTIC SETTINGS (for all resources)
# ------------------------------------------------------------------------------
resource "azurerm_monitor_diagnostic_setting" "aks_diag" {
  name                           = "diag-aks"
  target_resource_id             = azurerm_kubernetes_cluster.aks.id
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.law.id

  log {
    category_group = "allLogs"
    enabled        = true
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

resource "azurerm_monitor_diagnostic_setting" "appgw_diag" {
  name                           = "diag-appgw"
  target_resource_id             = azurerm_application_gateway.appgw.id
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.law.id

  log {
    category = "ApplicationGatewayAccessLog"
    enabled  = true
  }

  log {
    category = "ApplicationGatewayFirewallLog"
    enabled  = true
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

resource "azurerm_monitor_diagnostic_setting" "psql_diag" {
  name                           = "diag-psql"
  target_resource_id             = azurerm_postgresql_flexible_server.psql.id
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.law.id

  log {
    category = "PostgreSQLLogs"
    enabled  = true
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

resource "azurerm_monitor_diagnostic_setting" "redis_diag" {
  name                           = "diag-redis"
  target_resource_id             = azurerm_redis_cache.redis.id
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.law.id

  log {
    category = "RedisCacheLogs"
    enabled  = true
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

# ------------------------------------------------------------------------------
# OUTPUTS
# ------------------------------------------------------------------------------
output "aks_cluster_name" {
  value = azurerm_kubernetes_cluster.aks.name
}

output "aks_kube_config" {
  value     = azurerm_kubernetes_cluster.aks.kube_config_raw
  sensitive = true
}

output "application_gateway_public_ip" {
  value = azurerm_public_ip.appgw_pip.ip_address
}

output "postgresql_server_name" {
  value = azurerm_postgresql_flexible_server.psql.name
}

output "key_vault_uri" {
  value = azurerm_key_vault.kv.vault_uri
}
# variables.tf

variable "resource_group_name" {
  description = "The name of the resource group to create."
  type        = string
  default     = "rg-neobank-prod"
}

variable "location" {
  description = "The Azure region where resources will be deployed."
  type        = string
  default     = "East US 2"
}

variable "project_name" {
  description = "A short name for the project, used for naming conventions."
  type        = string
  default     = "neobank"
}

variable "environment" {
  description = "The environment name (e.g., prod, staging, dev)."
  type        = string
  default     = "prod"
}

variable "domain_name" {
  description = "The domain name for the Application Gateway and Azure DNS Zone."
  type        = string
  default     = "neobank.com"
}

variable "psql_admin_password" {
  description = "The administrator password for the PostgreSQL Flexible Server. Should be set via a secure method like Terraform Cloud or Azure Key Vault."
  type        = string
  sensitive   = true
}

variable "aks_admin_group_id" {
  description = "The Azure AD Group Object ID for AKS administrators (for RBAC integration)."
  type        = string
}

variable "appgw_kv_secret_id" {
  description = "The Key Vault Secret ID for the Application Gateway SSL certificate (e.g., https://<vault_name>.vault.azure.net/secrets/<secret_name>/<version>)."
  type        = string
}
# outputs.tf

output "aks_cluster_name" {
  description = "The name of the Azure Kubernetes Service cluster."
  value       = azurerm_kubernetes_cluster.aks.name
}

output "aks_kube_config" {
  description = "The raw Kubernetes configuration file content."
  value       = azurerm_kubernetes_cluster.aks.kube_config_raw
  sensitive   = true
}

output "application_gateway_public_ip" {
  description = "The public IP address of the Application Gateway."
  value       = azurerm_public_ip.appgw_pip.ip_address
}

output "postgresql_server_fqdn" {
  description = "The Fully Qualified Domain Name (FQDN) of the PostgreSQL Flexible Server."
  value       = azurerm_postgresql_flexible_server.psql.fqdn
}

output "key_vault_uri" {
  description = "The URI of the Azure Key Vault."
  value       = azurerm_key_vault.kv.vault_uri
}

output "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics Workspace for monitoring."
  value       = azurerm_log_analytics_workspace.law.id
}