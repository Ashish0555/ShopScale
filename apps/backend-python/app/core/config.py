from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    node_env: str = Field("development", validation_alias="NODE_ENV")
    port: int = Field(4000, validation_alias="PORT")
    api_prefix: str = Field("/api", validation_alias="API_PREFIX")
    cors_origin: str = Field("http://localhost:3000", validation_alias="CORS_ORIGIN")
    log_level: str = Field("INFO", validation_alias="LOG_LEVEL")
    database_url: str = Field(validation_alias="DATABASE_URL")
    redis_url: str = Field("redis://localhost:6379", validation_alias="REDIS_URL")
    kafka_brokers: str = Field("localhost:9092", validation_alias="KAFKA_BROKERS")
    kafka_client_id: str = Field("shopscale-backend-python", validation_alias="KAFKA_CLIENT_ID")
    kafka_group_id: str = Field("shopscale-backend-python", validation_alias="KAFKA_GROUP_ID")
    kafka_topic_domain_events: str = Field("shopscale.domain.events", validation_alias="KAFKA_TOPIC_DOMAIN_EVENTS")
    jwt_access_secret: str = Field(validation_alias="JWT_ACCESS_SECRET", min_length=32)
    jwt_refresh_secret: str = Field(validation_alias="JWT_REFRESH_SECRET", min_length=32)
    product_cache_ttl_seconds: int = Field(60, validation_alias="PRODUCT_CACHE_TTL_SECONDS")
    rate_limit_login_max: int = Field(10, validation_alias="RATE_LIMIT_LOGIN_MAX")
    rate_limit_order_max: int = Field(30, validation_alias="RATE_LIMIT_ORDER_MAX")
    rate_limit_payment_max: int = Field(30, validation_alias="RATE_LIMIT_PAYMENT_MAX")
    rate_limit_window_seconds: int = Field(60, validation_alias="RATE_LIMIT_WINDOW_SECONDS")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origin.split(",")]

    @property
    def kafka_broker_list(self) -> list[str]:
        return [broker.strip() for broker in self.kafka_brokers.split(",")]

    @field_validator("database_url", "redis_url")
    @classmethod
    def normalize_urls(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            value = value.replace("postgresql://", "postgresql+psycopg://", 1)
        value = value.replace("?schema=public", "").replace("&schema=public", "")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
