# AWS Deployment Notes

The first production deployment target should be cost-conscious and replaceable:

- ECS Fargate or App Runner for backend and frontend containers
- RDS PostgreSQL for relational data
- ElastiCache Redis for caching and rate limiting
- Amazon MSK or a managed Kafka-compatible service for event streaming
- Application Load Balancer for public HTTP traffic
- CloudWatch Logs and metrics for observability
- Secrets Manager or SSM Parameter Store for configuration secrets

No credentials belong in this repository. CI/CD should receive AWS access through GitHub Actions secrets or OIDC-based federation.
