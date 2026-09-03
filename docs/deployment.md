# Deployment

## Local

Run the full local stack with:

```bash
docker compose up --build
```

Run migrations with:

```bash
npm run db:migrate -w apps/backend
```

## CI/CD

`.github/workflows/ci.yml` installs dependencies, generates the Prisma client, runs migrations against a CI PostgreSQL service, lints, typechecks, tests, builds, and builds Docker images.

`.github/workflows/aws-deploy.yml` is a manual deployment placeholder using AWS OIDC role assumption. It does not store credentials in the repository.

## AWS Direction

The practical first deployment target is:

- ECS Fargate or App Runner for containers
- RDS PostgreSQL
- ElastiCache Redis
- Amazon MSK or managed Kafka-compatible service
- ALB for HTTP routing
- CloudWatch for logs and metrics
- Secrets Manager or SSM Parameter Store for secrets
