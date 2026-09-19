"""Create the SQLAlchemy schema for a fresh Python deployment.

Revision ID: 0001_schema_compatible
Revises:
"""
from typing import Sequence, Union

from alembic import op

from app.db.base import Base
from app import models  # noqa: F401

revision: str = "0001_schema_compatible"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
