const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors());
app.use(express.json());

const facts = [
  "EKS stands for Elastic Kubernetes Service — AWS manages the control plane (API server, etcd, scheduler) so you only manage worker nodes.",
  "eksctl is the official CLI for EKS. One command — 'eksctl create cluster' — provisions VPC, subnets, IAM roles, and a ready-to-use K8s cluster.",
  "When you create a Service of type LoadBalancer in EKS, AWS automatically provisions an Elastic Load Balancer (ELB) and wires it to your pods.",
  "ECR (Elastic Container Registry) is AWS's managed Docker registry. EKS nodes pull from ECR without Docker Hub rate limits or auth tokens.",
  "IAM Roles for Service Accounts (IRSA) lets each Pod assume its own fine-grained AWS IAM role — no credentials stored in env vars.",
  "EKS Fargate runs each Pod in its own isolated micro-VM on AWS infrastructure. No EC2 nodes to manage, no capacity planning.",
  "DuckDNS is a free dynamic DNS service. You can point a friendly subdomain like myapp.duckdns.org at your ELB's dynamic IP.",
  "Cluster Autoscaler watches for unschedulable pods and automatically adds EC2 nodes. Nodes scale back down when the cluster is idle.",
  "AWS Load Balancer Controller provisions ALBs from Ingress resources and NLBs from LoadBalancer Services — the modern way to expose EKS apps.",
  "EKS uses ENI (Elastic Network Interface) per pod. Each pod gets its own IP from your VPC subnet — no NAT, no overlay network needed.",
];

let factIdx = 0;

const vibes = [
  { level: 100, message: 'MAXIMUM CLOUD ENERGY',              emoji: '🚀' },
  { level: 97,  message: 'EKS CLUSTER FULLY OPERATIONAL',     emoji: '☁️' },
  { level: 94,  message: 'LOAD BALANCER ROUTING FLAWLESSLY',  emoji: '⚡' },
  { level: 91,  message: 'PODS RUNNING IN THE CLOUD',         emoji: '🌐' },
  { level: 88,  message: 'CONTAINERS ARE EXTREMELY HAPPY',    emoji: '🐳' },
];

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  res.json({
    status:    'CONNECTED',
    message:   'CloudPilot backend is live inside your EKS cluster!',
    pod:       process.env.POD_NAME      || 'local-dev',
    namespace: process.env.POD_NAMESPACE || 'default',
    node:      process.env.NODE_NAME     || 'local-machine',
    region:    process.env.AWS_REGION    || process.env.AWS_DEFAULT_REGION || 'unknown',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/facts', (req, res) => {
  const idx  = factIdx % facts.length;
  const fact = facts[idx];
  factIdx++;
  res.json({ fact, index: idx + 1, total: facts.length });
});

app.get('/api/vibe', (req, res) => {
  res.json(vibes[Math.floor(Math.random() * vibes.length)]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CloudPilot Backend API running on port ${PORT}`);
  console.log(`📦 Pod:       ${process.env.POD_NAME      || 'local'}`);
  console.log(`🌐 Namespace: ${process.env.POD_NAMESPACE || 'local'}`);
  console.log(`💻 Node:      ${process.env.NODE_NAME     || 'local'}`);
  console.log(`☁️  Region:    ${process.env.AWS_REGION    || process.env.AWS_DEFAULT_REGION || 'local'}`);
});
