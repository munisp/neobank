# Comprehensive Deployment Troubleshooting Guide: Containerized Microservices

This guide provides a comprehensive set of instructions, best practices, and troubleshooting steps for deploying and maintaining a containerized microservices application, typically on an orchestration platform like Kubernetes.

## 1. Prerequisites

Before starting the deployment or troubleshooting process, ensure the following prerequisites are met:

| Component | Requirement | Verification Command/Tool |
| :--- | :--- | :--- |
| **Source Code** | Latest stable version is committed and tagged. | `git status`, `git tag` |
| **Container Image** | Docker images are built, tested, and pushed to a secure registry (e.g., Docker Hub, GCR, ECR). | `docker pull <image-name>:<tag>`, `docker scan <image-name>` |
| **Orchestrator** | A running Kubernetes cluster (or equivalent) with necessary access credentials configured. | `kubectl cluster-info` |
| **CI/CD Pipeline** | The deployment pipeline (e.g., Jenkins, GitLab CI, GitHub Actions) is configured and has necessary permissions. | Check pipeline status in the CI/CD dashboard. |
| **Configuration** | All environment variables, configuration maps, and secrets are correctly defined for the target environment. | `kubectl get configmaps`, `kubectl get secrets` |
| **Monitoring** | Observability tools (logging, metrics, tracing) are integrated and accessible. | Access the dashboard for Prometheus, Grafana, or a centralized logging solution (e.g., ELK stack). |

**Code Example: Verifying Kubernetes Connection**

```bash
# Check if kubectl is configured and connected to the cluster
kubectl cluster-info

# List all running pods in the target namespace
kubectl get pods -n <target-namespace>
```

## 2. Clear Step-by-Step Deployment Instructions

This section outlines the standard deployment process. Troubleshooting often begins by re-verifying these steps.

### Step 2.1: Build and Push Container Images

1.  **Build:** Execute the Docker build command from the root of your microservice project.
    ```bash
    docker build -t <registry>/<image-name>:<tag> .
    ```
2.  **Test Locally:** Run the container locally to ensure it starts correctly.
    ```bash
    docker run -d -p 8080:8080 <registry>/<image-name>:<tag>
    ```
3.  **Push:** Push the tagged image to your container registry.
    ```bash
    docker push <registry>/<image-name>:<tag>
    ```

### Step 2.2: Apply Kubernetes Manifests

1.  **Review Manifests:** Ensure the deployment, service, and ingress manifests reference the correct image tag and configuration.
2.  **Apply:** Use `kubectl apply` to deploy or update the resources.
    ```bash
    kubectl apply -f deployment.yaml -n <target-namespace>
    kubectl apply -f service.yaml -n <target-namespace>
    ```

### Step 2.3: Monitor Deployment Rollout

1.  **Check Status:** Monitor the deployment status until all replicas are ready.
    ```bash
    kubectl rollout status deployment/<deployment-name> -n <target-namespace>
    ```
2.  **Check Pods:** Verify that the new pods are running and healthy.
    ```bash
    kubectl get pods -n <target-namespace> -l app=<app-label>
    ```

## 3. Troubleshooting Guide: Common Issues and Solutions

When a deployment fails or a service is unavailable, follow this systematic approach.

### Issue 3.1: ImagePullBackOff or ErrImagePull

**Symptom:** Pods fail to start with `ImagePullBackOff` or `ErrImagePull` status.

**Debugging Steps:**
1.  **Verify Image Name/Tag:** Check the deployment manifest for typos in the image name or tag.
    ```bash
    kubectl describe pod <pod-name> -n <target-namespace> | grep "Image:"
    ```
2.  **Check Registry Access:** Ensure the Kubernetes cluster has the correct `imagePullSecrets` configured and that the secret is valid.
    ```bash
    kubectl get secret <image-pull-secret-name> -o yaml
    ```
3.  **Manual Pull Test:** Try to manually pull the image from a node (if possible) or a local machine to confirm the image exists and is accessible.

**Solution:** Correct the image tag in the deployment manifest or update the `imagePullSecrets`.

### Issue 3.2: CrashLoopBackOff

**Symptom:** Pods repeatedly start and crash, resulting in a `CrashLoopBackOff` status. This indicates an issue with the application starting up.

**Debugging Steps:**
1.  **Check Logs:** The most critical step is to view the container logs.
    ```bash
    kubectl logs <pod-name> -n <target-namespace> --previous
    # If the pod is still crashing, check the logs of the currently running instance
    kubectl logs <pod-name> -n <target-namespace>
    ```
2.  **Examine Events:** Check the pod events for clues like failed volume mounts or resource limits.
    ```bash
    kubectl describe pod <pod-name> -n <target-namespace>
    ```
3.  **Configuration Check:** Verify that all required environment variables and configuration files are correctly mounted.

**Solution:** Fix the application error (e.g., missing dependency, incorrect configuration, port conflict) identified in the logs.

### Issue 3.3: Service Unavailable (5xx Errors)

**Symptom:** The service is deployed, but external requests fail with server errors or timeouts.

**Debugging Steps:**
1.  **Check Service Endpoints:** Ensure the Kubernetes Service object has correctly mapped endpoints (the running pods).
    ```bash
    kubectl get endpoints <service-name> -n <target-namespace>
    ```
2.  **Check Readiness/Liveness Probes:** Verify that the application's readiness and liveness probes are correctly configured and passing. A failing readiness probe will remove the pod from the service's endpoints.
3.  **Test from within Cluster:** Exec into a different pod and try to reach the failing service internally.
    ```bash
    kubectl exec -it <another-pod-name> -- curl <service-name>.<namespace>.svc.cluster.local:<port>
    ```

**Solution:** Adjust the service selector to match pod labels, or fix the application logic causing probes to fail.

## 4. Verification Steps

After any deployment or troubleshooting fix, use these steps to verify the system's health.

1.  **Pod Health:** Confirm all pods are in the `Running` state.
    ```bash
    kubectl get pods -n <target-namespace>
    ```
2.  **Service Connectivity:** Test the external endpoint (e.g., Ingress or Load Balancer URL) with a simple `curl` command.
    ```bash
    curl -I https://<service-url>/health
    ```
3.  **Log Check:** Check the application logs for any new errors or warnings after the fix.
    ```bash
    kubectl logs -f deployment/<deployment-name> -n <target-namespace>
    ```
4.  **Functional Test:** Run a small suite of end-to-end tests to ensure core functionality is preserved.

## 5. Best Practices for Resilient Deployment

| Practice | Description | Diagram/Visual Aid (Description) |
| :--- | :--- | :--- |
| **Immutable Infrastructure** | Never modify running containers or VMs. All changes should be made by deploying a new image/configuration. | **Diagram:** A flow chart showing "Code Change -> New Image Build -> New Deployment Rollout" instead of "Code Change -> SSH into Server -> Manual Fix". |
| **Blue/Green or Canary Deployments** | Use advanced deployment strategies to minimize downtime and risk. Blue/Green deploys a new version alongside the old, while Canary rolls out to a small subset of users first. | **Diagram:** A simple block diagram illustrating two identical environments (Blue and Green) with a router switching traffic between them. |
| **Centralized Logging & Monitoring** | Implement a robust observability stack (e.g., Prometheus/Grafana, ELK/Loki) to quickly diagnose issues across distributed microservices. | **Diagram:** A stack diagram showing application logs/metrics flowing into a central collector, then to a storage/analysis layer, and finally to a dashboard. |
| **Resource Limits** | Set CPU and memory limits (`requests` and `limits`) in Kubernetes manifests to prevent resource contention and cascading failures. | **Code Example:** Kubernetes resource limits snippet. |

**Code Example: Kubernetes Resource Limits**

```yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "250m"
  limits:
    memory: "128Mi"
    cpu: "500m"
```

## 6. Security Considerations

Deployment is a critical security phase. Misconfigurations can expose sensitive data or create attack vectors.

1.  **Least Privilege Principle:**
    *   **Container Runtime:** Run containers as a non-root user. Use `securityContext` in Kubernetes.
    *   **Service Accounts:** Grant only the necessary permissions to the Kubernetes Service Account used by the deployment.
2.  **Secret Management:**
    *   **NEVER** store secrets (API keys, database passwords) in plain text in manifests or source code.
    *   Use a dedicated secret management solution (e.g., Kubernetes Secrets, HashiCorp Vault, cloud-native secret managers) and inject them as environment variables or mounted files.
3.  **Network Policies:** Implement Kubernetes Network Policies to restrict traffic flow between microservices, ensuring only necessary communication paths are open.
4.  **Image Scanning:** Integrate a container image scanner into your CI/CD pipeline to check for known vulnerabilities (CVEs) before deployment.

## 7. Cost Estimates (Where Applicable)

Deployment costs are primarily driven by the underlying infrastructure.

1.  **Infrastructure Cost:** The largest component is the cost of the orchestration platform (e.g., Kubernetes cluster nodes, managed services).
    *   **Estimate:** Use cloud provider **Pricing Calculators** (e.g., AWS Pricing Calculator, Google Cloud Pricing Calculator, Azure Pricing Calculator) to model the cost based on the number and size of virtual machines/nodes, storage, and network egress.
2.  **Data Transfer (Egress):** Moving data *out* of a cloud region is often expensive. Design your application to minimize cross-region or cross-cloud data transfers.
3.  **Observability Stack:** Centralized logging and monitoring can be costly due to the volume of data ingested and stored.
    *   **Mitigation:** Implement intelligent sampling and retention policies for logs and traces. Use tools like **Kubecost** for Kubernetes cost monitoring and optimization.

## 8. Next Steps

Once the deployment is stable and verified, consider these next steps for continuous improvement:

1.  **Automate Rollbacks:** Ensure your CI/CD pipeline can automatically trigger a rollback to the last known good configuration upon failure of health checks.
2.  **Performance Testing:** Conduct load and stress testing against the new deployment to ensure it meets performance and scalability requirements.
3.  **Documentation Update:** Update the service-specific deployment runbook with any new findings or changes made during the troubleshooting process.
4.  **Post-Mortem Review:** For significant failures, conduct a post-mortem to identify root causes and implement preventative measures.