"""GPU workers (HP laptop) for the gpu job queue

Revision ID: 0011
Revises: 0010
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None
UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table('gpu_workers',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('name', sa.String(60), nullable=False, unique=True),
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('capabilities', postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('last_seen_at', sa.DateTime(timezone=True)),
        sa.Column('paused', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('revoked_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))


def downgrade() -> None:
    op.drop_table('gpu_workers')
