All the files available on this lab are available on the following repo:

https://github.com/professordiogodev/cool-eks-lab

```
 ██████╗██╗      ██████╗ ██╗   ██╗██████╗ ██████╗ ██╗██╗      ██████╗ ████████╗
██╔════╝██║     ██╔═══██╗██║   ██║██╔══██╗██╔══██╗██║██║     ██╔═══██╗╚══██╔══╝
██║     ██║     ██║   ██║██║   ██║██║  ██║██████╔╝██║██║     ██║   ██║   ██║
██║     ██║     ██║   ██║██║   ██║██║  ██║██╔═══╝ ██║██║     ██║   ██║   ██║
╚██████╗███████╗╚██████╔╝╚██████╔╝██████╔╝██║     ██║███████╗╚██████╔╝   ██║
 ╚═════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝ ╚═════╝   ╚═╝

                  ☁️  E K S   L A U N C H   C O N T R O L  ☁️
              containers · eks · ecr · load balancer · duckdns
```

---

# ☁️ EKS Lab — Deploy to the Internet

> **Mission:** Deploy two microservices (frontend + backend) to an **AWS EKS cluster**,
> expose them publicly via an **Elastic Load Balancer**, and optionally wire up a
> free domain with **DuckDNS**. If your app is reachable from the public internet
> → **confetti rains from the sky** 🎉. If not → **#sad** 😭.
>

---

## 🗺️ Table of Contents

| Phase | Task | Est. Time |
| --- | --- | --- |
| 0. Setup | Install tools, configure AWS | 15 min |
| 1. Create EKS Cluster | eksctl create cluster | 20 min |
| 2. Understand the code | Read backend + frontend | 15 min |
| 3. Containerize | Write Dockerfiles | 20 min |
| 4. Publish Images | Push to ECR or DockerHub | 15 min |
| 5. Manifests | Update image references | 10 min |
| 6. Deploy | kubectl apply + watch | 10 min |
| 7. Go Online! | Get ELB URL, open in browser | 10 min |
| 8. DuckDNS | Free custom subdomain | 15 min |
| 9. Teardown | Delete cluster, avoid AWS bills | 5 min |
| Bonus | Scale, HPA, Ingress, HTTPS | optional |

---

## 🏗️ Architecture

```
                    THE INTERNET
                        │
                        │  http://YOUR_ELB_HOSTNAME
                        ▼
              ┌─────────────────────┐
              │  AWS Elastic Load   │
              │  Balancer (ELB)     │
              └──────────┬──────────┘
                         │ :80
                         ▼
┌────────────────────────────────────────────────────────────┐
│                  EKS CLUSTER (us-east-1)                   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               default namespace                      │  │
│  │                                                      │  │
│  │   ┌──────────────────┐      ┌───────────────────┐   │  │
│  │   │  frontend-service│      │  backend-service  │   │  │
│  │   │  (LoadBalancer)  │      │  (ClusterIP :3000)│   │  │
│  │   └────────┬─────────┘      └────────┬──────────┘   │  │
│  │            │                         │              │  │
│  │            ▼                         ▼              │  │
│  │   ┌──────────────────┐   ┌──────────────────────┐  │  │
│  │   │  frontend Pod    │──▶│     backend Pod      │  │  │
│  │   │  nginx:alpine    │   │     node:20-alpine   │  │  │
│  │   │                  │   │                      │  │  │
│  │   │  index.html      │   │  GET /api/status     │  │  │
│  │   │  nginx.conf      │   │  GET /api/facts      │  │  │
│  │   └──────────────────┘   │  GET /api/vibe       │  │  │
│  │        /api/ proxy       │  GET /api/health     │  │  │
│  │   ──────────────────────▶│                      │  │  │
│  │                          └──────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │  │
│                                                         │  │
│   EC2 Node (t3.small)    EC2 Node (t3.small)           │  │
└─────────────────────────────────────────────────────────┘  │
                                                              │
                         DuckDNS (bonus)                      │
              yourname.duckdns.org ──▶ ELB IP                 │
```

### How requests flow

```
Browser  ──GET /──────────────▶  ELB  ──▶  frontend nginx  ──▶  index.html
Browser  ──GET /api/status──────▶  ELB  ──▶  frontend nginx  ──proxy──▶  backend:3000/api/status
```

The frontend nginx proxies every `/api/*` request to `backend-service:3000`.
This is Kubernetes DNS magic: services are reachable by **name** inside the cluster.
The backend **never needs to be publicly exposed** — only the frontend ELB is public.

---

## 🛠️ Phase 0: Setup & Prerequisites

### What you need installed

| Tool | Version | Install / check |
| --- | --- | --- |
| AWS CLI | ≥ 2.x | `brew install awscli` · `aws --version` |
| eksctl | ≥ 0.170 | `brew tap weaveworks/tap && brew install eksctl` · `eksctl version` |
| kubectl | ≥ 1.28 | `brew install kubectl` · `kubectl version --client` |
| Docker | ≥ 24 | `brew install --cask docker` · `docker --version` |
| Node.js | ≥ 20 (local testing only) | `node --version` |

### Configure AWS credentials

You need an IAM user or role with permissions to create EKS clusters, VPCs, EC2 instances, IAM roles, and ECR repos. For a lab, `AdministratorAccess` is simplest.

```bash
aws configure
# AWS Access Key ID:     YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region name:   us-east-1
# Default output format: json

# Verify it works:
aws sts get-caller-identity
```

You should see your account ID and user ARN. If this fails, check your credentials.

> [!WARNING]
> **Never commit AWS credentials to git.** Use `aws configure` which stores them in
> `~/.aws/credentials`, not in your project files. Always rotate short-lived keys.
>

---

## 🌐 Phase 1: Create Your EKS Cluster

> [!WARNING]
> **EKS costs money.** The control plane is ~$0.10/hr. Two t3.small nodes add ~$0.046/hr.
> Total: ~$0.15/hr (~$3.50/day). **Run Phase 9 (Teardown) when done!**
>

### 1.1 Create the cluster with eksctl

The config file is ready at `eksctl/cluster.yaml`. It provisions:
- A managed EKS control plane in `us-east-1`
- A managed node group with 2 × `t3.small` EC2 workers
- All necessary VPC, subnets, security groups, and IAM roles

```bash
eksctl create cluster -f eksctl/cluster.yaml
```

This takes **15–20 minutes**. Go grab a coffee. ☕

When it finishes, eksctl automatically updates your `~/.kube/config`:

```bash
kubectl get nodes
# NAME                                          STATUS   ROLES    AGE
# ip-192-168-xx-xx.us-east-1.compute.internal   Ready    <none>   2m
# ip-192-168-xx-xx.us-east-1.compute.internal   Ready    <none>   2m
```

Both nodes should be `Ready` before continuing.

### 1.2 Verify cluster access

```bash
kubectl cluster-info
kubectl get pods -A   # system pods in kube-system namespace
```

> [!NOTE]
> Notice `coredns`, `aws-node`, and `kube-proxy` pods running in `kube-system`.
> These are the EKS cluster add-ons that were automatically installed.
>

---

## 📖 Phase 2: Understand the Codebase

```
cool-eks-lab/
├── lab.md                   ← you are here
├── eksctl/
│   └── cluster.yaml         ← EKS cluster definition
├── backend/
│   ├── index.js             ← Express API (read this!)
│   ├── package.json
│   └── Dockerfile           ← you'll fill this in
├── frontend/
│   ├── index.html           ← the CloudPilot dashboard UI
│   ├── nginx.conf           ← proxies /api/ → backend-service:3000
│   └── Dockerfile           ← you'll fill this in
└── k8s/
    ├── backend-deployment.yaml
    ├── backend-service.yaml
    ├── frontend-deployment.yaml
    ├── frontend-service.yaml    ← LoadBalancer type — this creates the ELB!
    └── duckdns-cronjob.yaml     ← bonus: auto-update DuckDNS
```

### 2.1 Backend (`backend/index.js`)

A tiny **Node.js + Express** API with four routes:

| Route | What it returns |
| --- | --- |
| `GET /api/health` | `{ status: "ok" }` — used by K8s liveness/readiness probes |
| `GET /api/status` | Pod name, namespace, node name, **AWS region** (from env vars!) |
| `GET /api/facts` | Rotating EKS/AWS facts |
| `GET /api/vibe` | The current cluster vibe level 🌟 |

> Notice how `index.js` reads `process.env.AWS_REGION` in addition to the standard
> K8s Downward API vars. We inject `AWS_REGION` from the deployment manifest so the
> frontend can display which region your cluster is in.
>

### 2.2 Frontend (`frontend/index.html`)

A self-contained single-page app that:

1. **Detects the hostname** — if it's an ELB or DuckDNS address, shows a `🌐 YOU ARE LIVE ON THE INTERNET` banner
2. Polls `/api/status`, `/api/facts`, and `/api/vibe` every 12 seconds
3. **If connected** → confetti and rectangle rain, animated AWS-orange dashboard
4. **If not connected** → grayscale filter, sad shaking emoji, EKS debug commands

### 2.3 nginx config (`frontend/nginx.conf`)

```nginx
location /api/ {
    proxy_pass http://backend-service:3000/api/;
}
```

Same pattern as the local K8s lab. `backend-service` resolves inside EKS via Kubernetes DNS.

---

## 🐳 Phase 3: Containerize

### 3.1 Backend Dockerfile

Open `backend/Dockerfile`. Your goals:
- Use `node:20-alpine` as the base
- Set `/app` as working directory
- Install **only production** dependencies (`npm ci --omit=dev`)
- Expose port **3000**
- Start with `node index.js`

### 3.2 Frontend Dockerfile

Open `frontend/Dockerfile`. Your goals:
- Use `nginx:alpine` as the base
- Copy `index.html` → `/usr/share/nginx/html/`
- Copy `nginx.conf` → `/etc/nginx/conf.d/default.conf`
- Expose port **80**

### 3.3 Verify locally before pushing

```bash
# ── Backend ──────────────────────────────────────────────────────────────────
cd backend
docker build -t cloudpilot-backend:local .
docker run --rm -p 3000:3000 cloudpilot-backend:local &

curl http://localhost:3000/api/health
curl http://localhost:3000/api/facts

docker stop $(docker ps -q --filter ancestor=cloudpilot-backend:local)
cd ..

# ── Frontend ─────────────────────────────────────────────────────────────────
cd frontend
docker build -t cloudpilot-frontend:local .
docker run --rm -p 8080:80 cloudpilot-frontend:local &

# Open http://localhost:8080 — you'll see the dashboard in #sad mode (expected!)

docker stop $(docker ps -q --filter ancestor=cloudpilot-frontend:local)
cd ..
```

> [!WARNING]
> The frontend will be in **#sad mode** locally — that's expected!
> nginx proxies `/api/` to `backend-service:3000`, which only exists inside Kubernetes.
>

---

## ☁️ Phase 4: Publish Your Images

You have two options. **ECR is the AWS-native choice** (no rate limits, works seamlessly with EKS); DockerHub also works fine for labs.

### Option A — ECR (recommended)

#### 4A.1 Create ECR repositories

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

aws ecr create-repository --repository-name cloudpilot-backend  --region $AWS_REGION
aws ecr create-repository --repository-name cloudpilot-frontend --region $AWS_REGION
```

#### 4A.2 Authenticate Docker to ECR

```bash
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin \
    ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

#### 4A.3 Build, tag & push

```bash
ECR_BASE="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Backend
docker build -t ${ECR_BASE}/cloudpilot-backend:v1  ./backend
docker push     ${ECR_BASE}/cloudpilot-backend:v1

# Frontend
docker build -t ${ECR_BASE}/cloudpilot-frontend:v1 ./frontend
docker push     ${ECR_BASE}/cloudpilot-frontend:v1
```

#### 4A.4 Confirm images in ECR

```bash
aws ecr list-images --repository-name cloudpilot-backend  --region $AWS_REGION
aws ecr list-images --repository-name cloudpilot-frontend --region $AWS_REGION
```

---

### Option B — DockerHub

```bash
docker login

docker build -t YOUR_USERNAME/cloudpilot-backend:v1  ./backend
docker push     YOUR_USERNAME/cloudpilot-backend:v1

docker build -t YOUR_USERNAME/cloudpilot-frontend:v1 ./frontend
docker push     YOUR_USERNAME/cloudpilot-frontend:v1
```

---

## ⎈ Phase 5: Update Kubernetes Manifests

Open `k8s/backend-deployment.yaml` and `k8s/frontend-deployment.yaml`.
Find the `image:` line and replace `YOUR_REGISTRY`:

```yaml
# ECR:
image: 123456789.dkr.ecr.us-east-1.amazonaws.com/cloudpilot-backend:v1

# DockerHub:
image: YOUR_USERNAME/cloudpilot-backend:v1
```

> [!NOTE]
> Also update the `AWS_REGION` env var in `backend-deployment.yaml` if you used
> a different region. This is what the frontend displays in the dashboard.
>

### Study the manifests (quiz yourself!)

- [ ]  Why is `backend-service` type `ClusterIP` and `frontend-service` type `LoadBalancer`?
- [ ]  What happens in AWS when you apply a Service of type `LoadBalancer`?
- [ ]  Why doesn't the backend Pod need a public IP?
- [ ]  What does `imagePullPolicy: Always` do, and why is it important after pushing a new version?
- [ ]  What Kubernetes feature injects `POD_NAME` into the container at runtime?

---

## 🚀 Phase 6: Deploy to EKS

### 6.1 Apply all manifests

```bash
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/backend-service.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
```

Or all at once (skipping the DuckDNS CronJob for now):

```bash
kubectl apply -f k8s/backend-deployment.yaml \
              -f k8s/backend-service.yaml \
              -f k8s/frontend-deployment.yaml \
              -f k8s/frontend-service.yaml
```

### 6.2 Watch pods come up

```bash
kubectl get pods -w
```

Wait until both pods show `Running`:

```
NAME                        READY   STATUS    RESTARTS
backend-xxxxx-yyyyy         1/1     Running   0
frontend-xxxxx-yyyyy        1/1     Running   0
```

> [!WARNING]
> If a pod is stuck in `ImagePullBackOff`, the image URI in your deployment YAML
> is wrong, or you haven't pushed the image yet. Check with:
> `kubectl describe pod <pod-name>`
>

---

## 🌍 Phase 7: Go Online!

### 7.1 Get your public ELB hostname

```bash
kubectl get svc frontend-service
```

```
NAME               TYPE           CLUSTER-IP     EXTERNAL-IP
frontend-service   LoadBalancer   10.100.xx.xx   a1b2c3d4.us-east-1.elb.amazonaws.com
```

The `EXTERNAL-IP` column shows your ELB hostname. It may say `<pending>` for 1–3 minutes while AWS provisions the load balancer — that's normal.

### 7.2 Save the ELB hostname as a variable

```bash
ELB=$(kubectl get svc frontend-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Your app is live at: http://$ELB"
```

### 7.3 Test it from your terminal

```bash
curl -s http://$ELB/api/health | python3 -m json.tool
curl -s http://$ELB/api/status | python3 -m json.tool
```

### 7.4 Open it in your browser

```
http://YOUR_ELB_HOSTNAME
```

If you see the orange CloudPilot dashboard with **confetti raining down** and the
`🌐 YOU ARE LIVE ON THE INTERNET` banner → **YOU WIN** 🎊

> [!NOTE]
> DNS propagation for the ELB hostname can take a few minutes. If you get
> "could not connect", wait 2–3 minutes and refresh. You can also verify with:
> `nslookup $ELB`
>

---

## 🦆 Phase 8: DuckDNS — Get a Free Custom Domain

Right now your app is at a long, ugly ELB hostname. Let's give it a friendly name
like `yourname.duckdns.org` — for free.

### 8.1 Register a DuckDNS subdomain

1. Go to **https://www.duckdns.org**
2. Log in with Google, GitHub, or Reddit
3. Choose a subdomain (e.g., `cloudpilot-demo`)
4. Copy your **token** from the dashboard (it's a UUID)

### 8.2 Find the current IP of your ELB

ELBs have a hostname, not a static IP. We need to resolve it:

```bash
ELB=$(kubectl get svc frontend-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Resolve to IP (pick the first one):
ELB_IP=$(dig +short $ELB | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
echo "ELB IP: $ELB_IP"
```

> [!NOTE]
> ELB IPs can change. That's why we set up a CronJob to update DuckDNS automatically.
>

### 8.3 Update DuckDNS manually (first time)

```bash
DUCKDNS_DOMAIN="YOUR_SUBDOMAIN"   # e.g. cloudpilot-demo
DUCKDNS_TOKEN="YOUR_TOKEN"

curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=${ELB_IP}"
# should respond: OK
```

If you get `OK`, your domain is live. Open `http://YOUR_SUBDOMAIN.duckdns.org` in a browser.

### 8.4 Deploy the auto-updater CronJob

Since ELB IPs can change, let's deploy a CronJob that refreshes DuckDNS every 5 minutes:

```bash
# Edit the file first — fill in ELB_HOSTNAME, DUCKDNS_DOMAIN, and token
nano k8s/duckdns-cronjob.yaml

kubectl apply -f k8s/duckdns-cronjob.yaml
```

Verify it runs:

```bash
# Wait up to 5 minutes for the first run, or trigger manually:
kubectl create job --from=cronjob/duckdns-updater duckdns-manual-test

# Watch the job:
kubectl get pods -w

# Check the logs:
kubectl logs job/duckdns-manual-test
# Expected: "DuckDNS update → yourname.duckdns.org = 1.2.3.4 (response: OK)"
```

---

## 🎉 Phase 7/8 Results

### ✅ Confetti means:

- Your Dockerfiles are correct (images actually run)
- Your images are in ECR or DockerHub (EKS pulled them)
- Your `frontend-service.yaml` is type `LoadBalancer` (ELB was provisioned)
- Your `backend-service.yaml` is named exactly `backend-service` (nginx proxy reaches it)
- The nginx proxy correctly routes `/api/` to `backend-service:3000`
- **YOU ARE LIVE ON THE INTERNET** 🎊🎊🎊

### 😭 #Sad means... let's debug

```bash
# Step 1: Are pods running?
kubectl get pods

# Step 2: Is the ELB ready?
kubectl get svc frontend-service

# Step 3: What's in the logs?
kubectl logs -l app=backend  --tail=50
kubectl logs -l app=frontend --tail=50

# Step 4: Can the frontend reach the backend inside the cluster?
kubectl exec -it deploy/frontend -- wget -qO- http://backend-service:3000/api/health

# Step 5: Check the nginx proxy config inside the container
kubectl exec -it deploy/frontend -- cat /etc/nginx/conf.d/default.conf

# Step 6: Describe the service to see if it has endpoints
kubectl describe service backend-service
kubectl describe service frontend-service
```

### Common failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `ImagePullBackOff` | Wrong ECR URI or image not pushed | Fix image name in deployment YAML |
| `ELB EXTERNAL-IP stuck at <pending>` | IAM permissions or VPC issue | Check `kubectl describe svc frontend-service` for events |
| `CrashLoopBackOff` | App crashes on start | `kubectl logs <pod>` to see the error |
| Sad UI, pods Running | `backend-service` name mismatch | `kubectl get svc` — must be exactly `backend-service` |
| Sad UI, backend Running | nginx.conf not baked into image | Rebuild and push frontend image |
| `ERR_CONNECTION_REFUSED` on ELB URL | ELB not ready yet | Wait 2–3 min, run `nslookup $ELB` to verify DNS |
| DuckDNS shows old site | DNS cache | Try `curl` instead of browser; wait TTL (5 min) |

---

## 🗑️ Phase 9: Teardown — Don't Let AWS Bill You!

When you're done with the lab, delete everything to stop charges.

```bash
# Delete K8s resources first (removes ELB before cluster deletion)
kubectl delete -f k8s/

# Delete the EKS cluster and all associated AWS resources
eksctl delete cluster --name cloudpilot-cluster --region us-east-1
```

This takes 10–15 minutes. Verify in the AWS Console:
- EC2 → Load Balancers: should be empty
- CloudFormation: EKS stacks should be deleting/deleted
- ECR: repositories remain (no cost unless you have stored images > 500MB free tier)

```bash
# Optional: delete ECR repos too
aws ecr delete-repository --repository-name cloudpilot-backend  --force --region us-east-1
aws ecr delete-repository --repository-name cloudpilot-frontend --force --region us-east-1
```

> [!WARNING]
> If the cluster deletion gets stuck, it's usually because the ELB still exists.
> Go to AWS Console → EC2 → Load Balancers and manually delete the ELB first,
> then retry `eksctl delete cluster`.
>

---

## 💡 What You Just Built

```
✅ AWS EKS cluster provisioned with eksctl (VPC, subnets, IAM — all automated)
✅ Two containerized microservices published to ECR (or DockerHub)
✅ Running as Kubernetes Pods with liveness and readiness health checks
✅ Connected via Kubernetes DNS (no IPs, just service names!)
✅ Frontend served by nginx with reverse proxy to backend
✅ Publicly exposed via AWS Elastic Load Balancer — live on the internet!
✅ Pod metadata injected at runtime via the Kubernetes Downward API
✅ AWS region reported via environment variable
✅ (Bonus) Free custom domain via DuckDNS, auto-refreshed by a CronJob
```

---

## 💪 Bonus Challenges

### ⭐ Level 1 — Scale the backend

```bash
kubectl scale deployment backend --replicas=3
kubectl get pods -w
```

Reload the browser a few times. The **Pod Name** in the dashboard will change —
that's the ELB load-balancing across replicas!

### ⭐⭐ Level 2 — Kill a pod, watch it self-heal

```bash
kubectl delete pod -l app=backend
kubectl get pods -w   # watch it come back automatically
```

Why does it come back? The `Deployment` controller always reconciles to the desired replica count.

### ⭐⭐ Level 3 — Add a Horizontal Pod Autoscaler

```bash
# Install the metrics server first (required for CPU-based HPA)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

kubectl autoscale deployment backend --cpu-percent=50 --min=1 --max=5
kubectl get hpa -w
```

Generate load to trigger scaling:

```bash
# In a separate terminal — blast the backend with requests
kubectl run -it --rm load --image=busybox --restart=Never -- \
  sh -c 'while true; do wget -q -O- http://backend-service:3000/api/health; done'
```

Watch the HPA scale up!

### ⭐⭐⭐ Level 4 — Ingress instead of LoadBalancer

Install the AWS Load Balancer Controller and use an `Ingress` resource instead of a
`LoadBalancer` Service. This gives you path-based routing, SSL termination, and a
single ALB for multiple services.

```bash
# Install AWS Load Balancer Controller (requires IAM OIDC and policy)
# See: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html
```

Create an Ingress that routes `cloudpilot.example.com` → `frontend-service:80`.

### ⭐⭐⭐ Level 5 — HTTPS with cert-manager

Install `cert-manager` and request a free TLS certificate from Let's Encrypt:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

You'll need a real domain (DuckDNS works!) and a DNS-01 or HTTP-01 ACME challenge.
Once done, your app will be accessible at `https://yourname.duckdns.org`.

### ⭐⭐⭐⭐ Level 6 — Fargate profile

Add a Fargate profile to your eksctl config and move the backend to run on Fargate
(no EC2 nodes — fully serverless pods):

```yaml
fargateProfiles:
  - name: backend-fargate
    selectors:
      - namespace: default
        labels:
          workload: fargate
```

Label the backend pods `workload: fargate` and watch them schedule on Fargate nodes.

---

## 📚 Quick Reference Cheatsheet

### AWS CLI

```bash
aws sts get-caller-identity                              # who am I?
aws eks list-clusters --region us-east-1                 # list EKS clusters
aws ecr get-login-password | docker login --username AWS \
  --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com # ECR auth
aws ecr create-repository --repository-name NAME         # create ECR repo
aws ecr list-images --repository-name NAME               # list pushed images
```

### eksctl

```bash
eksctl create cluster -f eksctl/cluster.yaml             # create cluster from config
eksctl delete cluster --name NAME --region REGION        # delete cluster (and all resources!)
eksctl get cluster --region REGION                       # list clusters
eksctl get nodegroup --cluster NAME --region REGION      # list node groups
eksctl scale nodegroup --cluster NAME --name workers \
  --nodes 3 --region REGION                              # scale node group
```

### kubectl

```bash
kubectl apply -f FILE_OR_DIR                             # create/update resources
kubectl get pods                                         # list pods
kubectl get svc                                          # list services
kubectl get pods -w                                      # watch pods in real time
kubectl describe pod POD_NAME                            # detailed pod info
kubectl logs POD_NAME                                    # pod logs
kubectl logs -l app=backend                              # logs by label
kubectl exec -it POD_NAME -- sh                          # shell into pod
kubectl delete pod POD_NAME                              # delete pod (Deployment recreates it)
kubectl scale deployment NAME --replicas=N               # scale up/down
kubectl get events --sort-by=.lastTimestamp              # cluster events (great for debugging)
kubectl get svc frontend-service -o \
  jsonpath='{.status.loadBalancer.ingress[0].hostname}'  # get ELB hostname
```

---

## 🧠 Key Concepts Recap

| Concept | One-liner |
| --- | --- |
| **EKS** | AWS's managed Kubernetes — you own the nodes, AWS runs the control plane |
| **eksctl** | CLI that provisions a full EKS cluster in one command |
| **ECR** | AWS's managed container registry — no rate limits, native EKS auth |
| **LoadBalancer Service** | Tells EKS to provision an AWS ELB and route traffic to your pods |
| **ClusterIP Service** | Internal-only service — reachable by name inside the cluster, not from internet |
| **ELB** | AWS Elastic Load Balancer — the public entry point for your cluster traffic |
| **IAM Role** | AWS permission system — nodes need IAM roles to pull from ECR, manage ELBs |
| **VPC** | The private network your EKS cluster lives in — eksctl creates it automatically |
| **Downward API** | Mechanism to inject Pod/Node metadata as env vars at runtime |
| **DuckDNS** | Free dynamic DNS — maps a friendly subdomain to your ELB's IP |
| **CronJob** | Kubernetes resource that runs a Pod on a schedule (like cron but in the cluster) |

---

```
                ★ ·  .        . ★   .          .      ★     .      .   .           ★
       `           .  *  .    Your app is live on the internet.    .  `     ★  .
    .      .          ★          .     .   ★   .      .   ★
              .       `     .     .  ★   Now go scale something in the cloud.  .  ★
                           ★    .        .       ★       .        .    ★
              *             .           ★            .        .     ★
```
