"""Multilingual dubbing projects

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'dubs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('source_asset_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('media_assets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('status', sa.String(20), nullable=False, server_default='preparing'),
        sa.Column('error', sa.Text()),
        sa.Column('source_language', sa.String(8)),
        sa.Column('detected_language', sa.String(8)),
        sa.Column('detection', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('segments', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('speakers', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('targets', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('dubs')
