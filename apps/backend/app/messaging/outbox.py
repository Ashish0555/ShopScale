from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import OutboxEvent


def unpublished(db: Session, limit: int = 100) -> list[OutboxEvent]:
    return db.scalars(select(OutboxEvent).where(OutboxEvent.published_at.is_(None)).order_by(OutboxEvent.created_at).limit(limit)).all()


def mark_published(db: Session, event_id) -> None:
    db.execute(update(OutboxEvent).where(OutboxEvent.id == event_id).values(published_at=datetime.now(UTC)))
    db.commit()
