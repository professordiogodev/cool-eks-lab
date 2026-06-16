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

> **Mission:** Deploy two microservices (frontend + backend) to your **AWS EKS cluster**,
> expose them publicly via an **Elastic Load Balancer**, and optionally wire up a
> free domain with **DuckDNS**. If your app is reachable from the public internet
> → **confetti rains from the sky** 🎉. If not → **#sad** 😭.
>

> [!NOTE]
> **This lab assumes you already have a running EKS cluster** with your `kubectl`
> context pointed at it. If you still need to create one, ask your instructor.
>

---

## 🗺️ Table of Contents

| Phase | Task | Est. Time |
| --- | --- | --- |
| 0. Verify | Confirm kubectl → EKS connection | 5 min |
| 1. Understand the code | Read backend + frontend | 15 min |
| 2. Containerize | Write Dockerfiles | 20 min |
| 3. Publish Images | Push to ECR or DockerHub | 15 min |
| 4. Manifests | Update image references | 10 min |
| 5. Deploy | kubectl apply + watch | 10 min |
| 6. Go Online! | Get ELB URL, open in browser | 10 min |
| 7. DuckDNS | Free custom subdomain | 15 min |
| 8. Teardown | Delete workloads, avoid leftover costs | 5 min |
| Bonus | Scale, HPA, Ingress, HTTPS | optional |

---

## 🏗️ Architecture

```
                        THE INTERNET
                             │
                   http://your-elb.amazonaws.com
                             │
                             ▼
                  ┌──────────────────────┐
                  │  AWS Elastic Load    │
                  │  Balancer  (ELB)     │
                  └──────────┬───────────┘
                             │ :80
                             ▼
┌───────────────────────────────────────────────────────────────┐
│                  EKS CLUSTER  ·  us-east-1                    │
│                                                               │
│  ┌──────────────────────┐          ┌──────────────────────┐   │
│  │  frontend-service    │          │  backend-service     │   │
│  │  type: LoadBalancer  │          │  type: ClusterIP     │   │
│  └──────────┬───────────┘          └──────────┬───────────┘   │
│             │                                 │               │
│             ▼                                 ▼               │
│  ┌──────────────────────┐          ┌──────────────────────┐   │
│  │   frontend Pod       │──/api/*─▶│   backend Pod        │   │
│  │   nginx:alpine       │          │   node:20-alpine     │   │
│  │                      │          │                      │   │
│  │   serves index.html  │          │   GET /api/status    │   │
│  │   proxies /api/ ─────┼─────────▶│   GET /api/facts     │   │
│  └──────────────────────┘          │   GET /api/vibe      │   │
│                                    │   GET /api/health    │   │
│                                    └──────────────────────┘   │
│                                                               │
│  ▪ EC2 worker-1 (t3.small)       ▪ EC2 worker-2 (t3.small)    │
└───────────────────────────────────────────────────────────────┘

  🦆 DuckDNS (bonus): yourname.duckdns.org ──resolves──▶ ELB IP
```

### How requests flow

```
Browser  GET /           ──▶  ELB  ──▶  nginx (frontend)  ──▶  index.html
Browser  GET /api/status ──▶  ELB  ──▶  nginx (frontend)  ──▶  backend:3000/api/status
```

The frontend nginx proxies every `/api/*` request to `backend-service:3000`.
This is Kubernetes DNS magic: services are reachable by **name** inside the cluster.
The backend **never needs to be publicly exposed** — only the frontend ELB is public.

---

## ✅ Phase 0: Verify Your Cluster

### What you need installed

| Tool | Version | Check |
| --- | --- | --- |
| AWS CLI | ≥ 2.x | `aws --version` |
| kubectl | ≥ 1.28 | `kubectl version --client` |
| Docker | ≥ 24 | `docker --version` |
| Node.js | ≥ 20 (local testing only) | `node --version` |

### Confirm kubectl is pointing at your EKS cluster

```bash
kubectl config current-context
# Should show something like: arn:aws:eks:us-east-1:123456789:cluster/cloudpilot-cluster
```

```bash
kubectl get nodes
# NAME                                          STATUS   ROLES    AGE
# ip-192-168-xx-xx.us-east-1.compute.internal   Ready    <none>   5m
# ip-192-168-xx-xx.us-east-1.compute.internal   Ready    <none>   5m
```

Both nodes must be `Ready` before continuing. If they're not, ask your instructor.

### Grab your AWS account and region

```bash
export AWS_REGION=$(aws configure get region)
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

echo "Account : $AWS_ACCOUNT"
echo "Region  : $AWS_REGION"
```

Keep these in your terminal — you'll use them in Phase 3.

> [!WARNING]
> **Never commit AWS credentials to git.** Your credentials live in `~/.aws/credentials`
> and should never appear in project files.
>

---

## 📖 Phase 1: Understand the Codebase

```
cool-eks-lab/
├── lab.md                   ← you are here
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

### 1.1 Backend (`backend/index.js`)

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

### 1.2 Frontend (`frontend/index.html`)

A self-contained single-page app that:

1. **Detects the hostname** — if it's an ELB or DuckDNS address, shows a `🌐 YOU ARE LIVE ON THE INTERNET` banner
2. Polls `/api/status`, `/api/facts`, and `/api/vibe` every 12 seconds
3. **If connected** → confetti and rectangle rain, animated AWS-orange dashboard
4. **If not connected** → grayscale filter, sad shaking emoji, EKS debug commands

### 1.3 nginx config (`frontend/nginx.conf`)

```nginx
location /api/ {
    proxy_pass http://backend-service:3000/api/;
}
```

`backend-service` resolves inside EKS via Kubernetes DNS — same pattern as local K8s, but now it's on the internet.

---

## 🐳 Phase 2: Containerize

### 2.1 Backend Dockerfile

Open `backend/Dockerfile`. Your goals:
- Use `node:20-slim` as the base
- Set `/app` as working directory
- Install **only production** dependencies (`npm ci --omit=dev`)
- Expose port **3000**
- Start with `node index.js`

### 2.2 Frontend Dockerfile

Open `frontend/Dockerfile`. Your goals:
- Use `nginx:alpine` as the base
- Copy `index.html` → `/usr/share/nginx/html/`
- Copy `nginx.conf` → `/etc/nginx/conf.d/default.conf`
- Expose port **80**

### 2.3 Verify locally before pushing

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

## ☁️ Phase 3: Publish Your Images

You have two options. **ECR is the AWS-native choice** (no rate limits, works seamlessly with EKS); DockerHub also works fine for labs.

### Option A — ECR (recommended)

#### 3A.1 Create ECR repositories

```bash
aws ecr create-repository --repository-name cloudpilot-backend  --region $AWS_REGION
aws ecr create-repository --repository-name cloudpilot-frontend --region $AWS_REGION
```

#### 3A.2 Authenticate Docker to ECR

```bash
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin \
    ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

#### 3A.3 Build, tag & push

```bash
ECR_BASE="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Backend
docker build -t ${ECR_BASE}/cloudpilot-backend:v1  ./backend
docker push     ${ECR_BASE}/cloudpilot-backend:v1

# Frontend
docker build -t ${ECR_BASE}/cloudpilot-frontend:v1 ./frontend
docker push     ${ECR_BASE}/cloudpilot-frontend:v1
```

#### 3A.4 Confirm images in ECR

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

## ⎈ Phase 4: Update Kubernetes Manifests

Open `k8s/backend-deployment.yaml` and `k8s/frontend-deployment.yaml`.
Find the `image:` line and replace `YOUR_REGISTRY`:

```yaml
# ECR:
image: 123456789.dkr.ecr.us-east-1.amazonaws.com/cloudpilot-backend:v1

# DockerHub:
image: YOUR_USERNAME/cloudpilot-backend:v1
```

> [!NOTE]
> Also update the `AWS_REGION` env var in `backend-deployment.yaml` to match your
> actual cluster region. This is what the frontend displays in the dashboard.
>

### Study the manifests (quiz yourself!)

- [ ]  Why is `backend-service` type `ClusterIP` and `frontend-service` type `LoadBalancer`?
- [ ]  What happens in AWS when you apply a Service of type `LoadBalancer`?
- [ ]  Why doesn't the backend Pod need a public IP?
- [ ]  What does `imagePullPolicy: Always` do, and why is it important after pushing a new version?
- [ ]  What Kubernetes feature injects `POD_NAME` into the container at runtime?

---

## 🚀 Phase 5: Deploy to EKS

### 5.1 Apply all manifests

```bash
kubectl apply -f k8s/backend-deployment.yaml \
              -f k8s/backend-service.yaml \
              -f k8s/frontend-deployment.yaml \
              -f k8s/frontend-service.yaml
```

### 5.2 Watch pods come up

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

## 🌍 Phase 6: Go Online!

### 6.1 Get your public ELB hostname

```bash
kubectl get svc frontend-service
```

```
NAME               TYPE           CLUSTER-IP     EXTERNAL-IP
frontend-service   LoadBalancer   10.100.xx.xx   a1b2c3d4.us-east-1.elb.amazonaws.com
```

The `EXTERNAL-IP` column shows your ELB hostname. It may say `<pending>` for 1–3 minutes while AWS provisions the load balancer — that's normal.

### 6.2 Save the ELB hostname as a variable

```bash
ELB=$(kubectl get svc frontend-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Your app is live at: http://$ELB"
```

### 6.3 Test it from your terminal

```bash
curl -s http://$ELB/api/health | python3 -m json.tool
curl -s http://$ELB/api/status | python3 -m json.tool
```

### 6.4 Open it in your browser

```
http://YOUR_ELB_HOSTNAME
```

If you see the orange CloudPilot dashboard with **confetti raining down** and the
`🌐 YOU ARE LIVE ON THE INTERNET` banner → **YOU WIN** 🎊

> [!NOTE]
> DNS propagation for the ELB hostname can take a few minutes. If you get
> "could not connect", wait 2–3 minutes and refresh. You can verify with:
> `nslookup $ELB`
>

---

## 🦆 Phase 7: DuckDNS — Get a Free Custom Domain

Right now your app is at a long, ugly ELB hostname. Let's give it a friendly name
like `yourname.duckdns.org` — for free.

### 7.1 Register a DuckDNS subdomain

1. Go to **https://www.duckdns.org**
2. Log in with Google, GitHub, or Reddit
3. Choose a subdomain (e.g., `cloudpilot-demo`)
4. Copy your **token** from the dashboard (it's a UUID)

### 7.2 Find the current IP of your ELB

ELBs have a hostname, not a static IP. We need to resolve it:

```bash
ELB=$(kubectl get svc frontend-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Resolve to IP (pick the first one):
ELB_IP=$(dig +short $ELB | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
echo "ELB IP: $ELB_IP"
```

> [!NOTE]
> ELB IPs can change over time. That's why we set up a CronJob to keep DuckDNS in sync.
>

### 7.3 Update DuckDNS manually (first time)

```bash
DUCKDNS_DOMAIN="YOUR_SUBDOMAIN"   # e.g. cloudpilot-demo
DUCKDNS_TOKEN="YOUR_TOKEN"

curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=${ELB_IP}"
# should respond: OK
```

If you get `OK`, your domain is live. Open `http://YOUR_SUBDOMAIN.duckdns.org` in a browser.

### 7.4 Deploy the auto-updater CronJob

Since ELB IPs can change, deploy a CronJob that refreshes DuckDNS every 5 minutes:

```bash
# Edit the file — fill in ELB_HOSTNAME, DUCKDNS_DOMAIN, and token
nano k8s/duckdns-cronjob.yaml

kubectl apply -f k8s/duckdns-cronjob.yaml
```

Verify it runs:

```bash
# Trigger the first run manually instead of waiting 5 minutes:
kubectl create job --from=cronjob/duckdns-updater duckdns-test

# Watch it complete:
kubectl get pods -w

# Check the output:
kubectl logs job/duckdns-test
# Expected: "DuckDNS update → yourname.duckdns.org = 1.2.3.4 (response: OK)"
```

---

## 🎉 Did You Get Confetti or Sad?

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

# Step 6: Check service endpoints
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

## 🗑️ Phase 8: Teardown

Clean up your workloads when done so you don't leave resources running.

```bash
# Delete all lab workloads (also removes the ELB!)
kubectl delete -f k8s/

# Verify pods and services are gone:
kubectl get pods
kubectl get svc
```

```bash
# Optional: delete ECR repos
aws ecr delete-repository --repository-name cloudpilot-backend  --force --region $AWS_REGION
aws ecr delete-repository --repository-name cloudpilot-frontend --force --region $AWS_REGION
```

> [!NOTE]
> This only deletes the K8s resources and ECR images you created.
> The EKS cluster itself is shared — your instructor manages that.
>

---

## 💡 What You Just Built

```
✅ Two containerized microservices published to ECR (or DockerHub)
✅ Running as Kubernetes Pods on EKS with liveness and readiness health checks
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
# Blast the backend with requests from inside the cluster
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

Ask your instructor to add a Fargate profile to the cluster, then move the backend
to run on Fargate (no EC2 nodes — fully serverless pods). Label the backend pods
`workload: fargate` and watch them schedule on Fargate nodes.

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
| **ECR** | AWS's managed container registry — no rate limits, native EKS auth |
| **LoadBalancer Service** | Tells EKS to provision an AWS ELB and route traffic to your pods |
| **ClusterIP Service** | Internal-only service — reachable by name inside the cluster, not from internet |
| **ELB** | AWS Elastic Load Balancer — the public entry point for your cluster traffic |
| **IAM Role** | AWS permission system — nodes need IAM roles to pull from ECR, manage ELBs |
| **VPC** | The private network your EKS cluster lives in |
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
