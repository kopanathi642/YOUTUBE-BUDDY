"""Shorts studio: custom composition templates saved per workspace

Revision ID: 0010
Revises: 0009
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None
UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table('composition_templates',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('workspace_id', UUID, sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_by', UUID, sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('name', sa.String(120), nullable=False), sa.Column('category', sa.String(60), nullable=False),
        sa.Column('data', postgresql.JSONB(), nullable=False), sa.Column('favorite', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))


def downgrade() -> None:
    op.drop_table('composition_templates')
