# DigitalOcean Deployment Guide: DOKS, Managed PostgreSQL, and Managed Redis

This guide provides a comprehensive, step-by-step walkthrough for deploying a modern application stack on DigitalOcean, leveraging the **DigitalOcean Kubernetes Service (DOKS)** for container orchestration, **Managed PostgreSQL** for persistent data storage, and **Managed Redis** for caching and session management.

## 1. Prerequisites

Before beginning the deployment process, ensure you have the following prerequisites in place.

### 1.1 DigitalOcean Account and API Token
You must have an active DigitalOcean account. You will need a Personal Access Token (PAT) with read and write permissions to interact with the API via the command-line interface.

### 1.2 Command-Line Tools
The following command-line tools are required for this deployment:

| Tool | Description | Installation Command (Example for Linux/macOS) |
| :--- | :--- | :--- |
| **`doctl`** | The official DigitalOcean command-line client. | `brew install doctl` or follow the [official documentation](https://docs.digitalocean.com/reference/doctl/how-to/install/) |
| **`kubectl`** | The Kubernetes command-line tool. | `brew install kubernetes-cli` or follow the [official documentation](https://kubernetes.io/docs/tasks/tools/install-kubectl/) |
| **`helm`** | The Kubernetes package manager (recommended for deploying applications). | `brew install helm` or follow the [official documentation](https://helm.sh/docs/intro/install/) |

### 1.3 Configure `doctl`
Authenticate the `doctl` CLI with your DigitalOcean API token.

```bash
doctl auth init
# Follow the prompts to enter your Personal Access Token (PAT)
```

## 2. Step-by-Step Deployment Instructions

The deployment will follow a logical sequence: first, create a Virtual Private Cloud (VPC) for secure networking, then provision the managed databases, and finally, create the DOKS cluster within the same VPC.

### Step 2.1: Create a Virtual Private Cloud (VPC)

A VPC is crucial for isolating your resources and enabling secure, private-network communication between your DOKS cluster and your managed databases.

```bash
# 1. Define a name and region for your VPC
VPC_NAME="my-app-vpc"
REGION="nyc3" # Choose a region close to your users

# 2. Create the VPC
doctl compute vpc create $VPC_NAME --region $REGION --ip-range 10.10.0.0/16

# Output the VPC ID for later use
doctl compute vpc list
```

### Step 2.2: Provision Managed Databases (PostgreSQL and Redis)

Create the managed database clusters within the newly created VPC. This ensures they are only accessible from within the VPC network by default.

#### 2.2.1: Create Managed PostgreSQL

We will use the smallest available plan for a single-node cluster as a starting point.

```bash
# 1. Define database cluster details
POSTGRES_NAME="app-postgres-db"
POSTGRES_VERSION="16"
POSTGRES_SIZE="db-s-1vcpu-1gb" # Smallest size: 1 vCPU, 1GB RAM
POSTGRES_NODE_COUNT="1" # Single node for development/staging

# 2. Create the PostgreSQL cluster in the VPC
doctl databases create $POSTGRES_NAME \
  --engine postgresql \
  --version $POSTGRES_VERSION \
  --size $POSTGRES_SIZE \
  --region $REGION \
  --num-nodes $POSTGRES_NODE_COUNT \
  --vpc-uuid $(doctl compute vpc list --format ID,Name --no-header | grep $VPC_NAME | awk '{print $1}')

# Wait for the cluster to be provisioned (may take several minutes)
echo "Waiting for PostgreSQL cluster to be ready..."
doctl databases list
```

#### 2.2.2: Create Managed Redis

Redis is now referred to as Managed Caching on DigitalOcean, but the `doctl` command still uses `redis`.

```bash
# 1. Define caching cluster details
REDIS_NAME="app-redis-cache"
REDIS_SIZE="db-s-1vcpu-1gb" # Smallest size: 1 vCPU, 1GB RAM
REDIS_NODE_COUNT="1"

# 2. Create the Redis cluster in the VPC
doctl databases create $REDIS_NAME \
  --engine redis \
  --size $REDIS_SIZE \
  --region $REGION \
  --num-nodes $REDIS_NODE_COUNT \
  --vpc-uuid $(doctl compute vpc list --format ID,Name --no-header | grep $VPC_NAME | awk '{print $1}')

# Wait for the cluster to be provisioned
echo "Waiting for Redis cluster to be ready..."
doctl databases list
```

### Step 2.3: Create the DOKS Cluster

Create the Kubernetes cluster, ensuring it is also placed within the same VPC for internal network access to the databases.

```bash
# 1. Define Kubernetes cluster details
CLUSTER_NAME="app-doks-cluster"
K8S_VERSION="1.29" # Use a supported, stable version
NODE_SIZE="s-2vcpu-4gb" # Recommended minimum node size
NODE_COUNT="3" # Recommended minimum for production/HA

# 2. Create the DOKS cluster
doctl kubernetes cluster create $CLUSTER_NAME \
  --region $REGION \
  --version $K8S_VERSION \
  --node-pool "name=worker-pool;size=$NODE_SIZE;count=$NODE_COUNT" \
  --vpc-uuid $(doctl compute vpc list --format ID,Name --no-header | grep $VPC_NAME | awk '{print $1}')

# Wait for the cluster to be provisioned
echo "Waiting for DOKS cluster to be ready..."
doctl kubernetes cluster list
```

### Step 2.4: Configure `kubectl`

Once the DOKS cluster is active, retrieve the configuration file to allow `kubectl` to manage it.

```bash
doctl kubernetes cluster kubeconfig save $CLUSTER_NAME
# The command will output a message confirming the configuration has been saved.
```

### Step 2.5: Retrieve Database Connection Details

The most secure way to provide database credentials to your Kubernetes application is via Kubernetes Secrets.

```bash
# 1. Retrieve PostgreSQL connection details
POSTGRES_URI=$(doctl databases connection $POSTGRES_NAME --insecure --uri)

# 2. Retrieve Redis connection details
REDIS_URI=$(doctl databases connection $REDIS_NAME --insecure --uri)

# 3. Create Kubernetes Secrets (Example for PostgreSQL)
# Note: The actual secret creation should use the full connection string, 
# which includes the password. This is a simplified example.
kubectl create secret generic postgres-credentials \
  --from-literal=uri="$POSTGRES_URI" \
  --from-literal=host="<POSTGRES_HOST>" \
  --from-literal=port="<POSTGRES_PORT>" \
  --from-literal=user="<POSTGRES_USER>" \
  --from-literal=password="<POSTGRES_PASSWORD>"

# Repeat for Redis
kubectl create secret generic redis-credentials \
  --from-literal=uri="$REDIS_URI"
```

> **Screenshot/Diagram Description:** A network diagram showing the VPC boundary. Inside the VPC, three components are shown: the DOKS cluster (with multiple worker nodes), the Managed PostgreSQL cluster, and the Managed Redis cluster. Arrows indicate private network traffic between DOKS and the databases.

## 3. Verification Steps

After deployment, verify that all components are running and communicating correctly.

1. **Verify DOKS Cluster Status:**
   ```bash
   kubectl cluster-info
   kubectl get nodes
   # All nodes should be in the 'Ready' state.
   ```

2. **Verify Database Connectivity (from within the cluster):**
   Deploy a temporary pod to the DOKS cluster that has the necessary tools (e.g., `psql` and `redis-cli`) and attempt to connect to the databases using the internal VPC hostnames and the secrets created in Step 2.5.

   ```bash
   # Example: Deploy a temporary PostgreSQL client pod
   kubectl run -it --rm psql-client --image=postgres:latest --restart=Never -- psql $POSTGRES_URI
   # A successful connection will open the psql prompt.
   ```

## 4. Security Considerations

Security is paramount when deploying a production application.

| Area | Consideration | Implementation |
| :--- | :--- | :--- |
| **Network Isolation** | Prevent public access to databases. | **VPC-Native Deployment:** Deploy all components within a single VPC. Managed Databases are only accessible from within the VPC by default [1]. |
| **Credentials** | Securely manage database credentials. | **Kubernetes Secrets:** Store connection strings and passwords as Kubernetes Secrets, and inject them into application pods as environment variables. |
| **Access Control** | Limit who can access the cluster and databases. | **Trusted Sources:** For external access (e.g., for local development or CI/CD), explicitly add trusted source IP addresses to the database firewall rules. **RBAC:** Implement Kubernetes Role-Based Access Control (RBAC) to restrict user and service account permissions within the DOKS cluster. |
| **Shared Responsibility** | Understand what DigitalOcean manages and what you manage. | DigitalOcean manages the underlying infrastructure, OS, and database patching. **You are responsible** for application security, data encryption in transit (which is enabled by default), and access control [2]. |

## 5. Best Practices

Adhering to these best practices will ensure a stable, scalable, and cost-effective deployment.

*   **Use VPC for All Resources:** Always deploy DOKS and Managed Databases into the same VPC for low-latency, secure, and private network communication.
*   **High Availability (HA):** For production environments, consider:
    *   **DOKS:** Use a minimum of three worker nodes across different availability zones. Enable the **High Availability Control Plane** ($40/month) for maximum uptime.
    *   **Managed Databases:** Choose the **High Availability** option for PostgreSQL and Redis (starts at $30/month), which provides a standby node for automatic failover.
*   **Resource Sizing:** Start with the smallest node sizes (`s-2vcpu-4gb` for DOKS nodes, `db-s-1vcpu-1gb` for databases) and scale up based on monitoring and load testing. **Do not over-provision initially.**
*   **Database Connection Pooling:** Implement connection pooling in your application (e.g., using PgBouncer) to efficiently manage connections to PostgreSQL and prevent resource exhaustion.

## 6. Cost Estimates

The cost for this stack is highly dependent on the size and number of nodes chosen. Below is an estimate for a minimal, non-HA setup in the `nyc3` region (prices are approximate and subject to change).

| Component | Configuration (Minimal) | Monthly Cost (Approx.) | Notes |
| :--- | :--- | :--- | :--- |
| **DOKS Control Plane** | Standard | $0.00 | The control plane is free. |
| **DOKS Worker Nodes** | 3 x `s-2vcpu-4gb` Droplets | $63.00 | $21/node/month. This is the main cost driver. |
| **Managed PostgreSQL** | 1 x `db-s-1vcpu-1gb` (Single Node) | $15.00 | Includes 1GB RAM, 1 vCPU, 10GB storage. |
| **Managed Redis** | 1 x `db-s-1vcpu-1gb` (Single Node) | $15.00 | Includes 1GB RAM, 1 vCPU, 10GB storage. |
| **Total Estimated Monthly Cost** | | **~$93.00** | This estimate does not include Load Balancers, Block Storage, or bandwidth overages. |

> **Cost Note:** Enabling High Availability for the DOKS Control Plane adds $40/month. Enabling HA for both databases would add $30/month each, increasing the total to approximately **$193.00** for a minimal HA setup.

## 7. Troubleshooting

| Issue | Potential Cause | Solution |
| :--- | :--- | :--- |
| **DOKS cannot connect to Database** | Network isolation issue; databases are not in the same VPC or DOKS is not VPC-native. | **Verify VPC:** Ensure the DOKS cluster and both managed databases were created using the same `--vpc-uuid`. If the DOKS cluster was created before VPC-native support, you may need to recreate it. |
| **`kubectl` commands fail** | Incorrect `kubeconfig` file or expired token. | Run `doctl kubernetes cluster kubeconfig save <CLUSTER_NAME>` again to refresh the configuration. Check your DigitalOcean API token status. |
| **Database connection is slow** | Application is connecting over the public internet instead of the VPC. | **Check Connection String:** Ensure your application is using the internal VPC hostname provided by DigitalOcean, not the public internet hostname. |
| **Application Pods crash (OOMKilled)** | Insufficient memory allocated to the Kubernetes Pods. | Increase the `requests` and `limits` for memory in your Kubernetes Deployment manifest. Consider scaling up the DOKS worker node size. |

## 8. Next Steps

With your infrastructure successfully deployed, the next steps involve deploying your application and setting up continuous integration/continuous deployment (CI/CD).

1.  **Deploy Your Application:** Use `kubectl apply -f deployment.yaml` or a Helm chart to deploy your containerized application to the DOKS cluster. Ensure your application's deployment manifest references the Kubernetes Secrets created in Step 2.5.
2.  **Setup Ingress:** Deploy a DigitalOcean Load Balancer (via a Kubernetes Service of type `LoadBalancer`) and an Ingress Controller (like NGINX Ingress) to expose your application to the public internet.
3.  **CI/CD Pipeline:** Integrate a CI/CD tool (e.g., GitHub Actions, GitLab CI, or DigitalOcean App Platform) to automate the build, test, and deployment process to your DOKS cluster.

## References

[1] DigitalOcean Documentation. *VPC How-Tos*. [https://docs.digitalocean.com/products/networking/vpc/how-to/](https://docs.digitalocean.com/products/networking/vpc/how-to/)
[2] DigitalOcean Security. *Shared Responsibility Model for Managed Databases*. [https://www.digitalocean.com/security/shared-responsibility-model-managed-databases](https://www.digitalocean.com/security/shared-responsibility-model-managed-databases)
[3] DigitalOcean Documentation. *PostgreSQL Pricing*. [https://docs.digitalocean.com/products/databases/postgresql/details/pricing/](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/)
[4] DigitalOcean Documentation. *Caching Pricing*. [https://docs.digitalocean.com/products/databases/redis/details/pricing/](https://docs.digitalocean.com/products/databases/redis/details/pricing/)
[5] DigitalOcean Documentation. *Kubernetes Pricing*. [https://docs.digitalocean.com/products/kubernetes/details/pricing/](https://docs.digitalocean.com/products/kubernetes/details/pricing/)