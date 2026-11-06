"""AI Creation Universe: generations (tool runs, versions, provenance)

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'generations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('tool_id', sa.String(3), nullable=False),
        sa.Column('engine', sa.String(20), nullable=False),
        sa.Column('model', sa.String(200)),
        sa.Column('params', postgresql.JSONB(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('jobs.id', ondelete='SET NULL')),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('generations.id', ondelete='SET NULL')),
        sa.Column('root_id', postgresql.UUID(as_uuid=True)),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('output_asset_ids', postgresql.JSONB(), nullable=False),
        sa.Column('result', postgresql.JSONB()),
        sa.Column('error', sa.Text()),
        sa.Column('est_cost_usd', sa.Float()),
        sa.Column('quality', postgresql.JSONB()),
        sa.Column('rating', sa.Integer()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_generations_workspace_id', 'generations', ['workspace_id'])
    op.create_index('ix_generations_project_id', 'generations', ['project_id'])
    op.create_index('ix_generations_tool_id', 'generations', ['tool_id'])
    op.create_index('ix_generations_root_id', 'generations', ['root_id'])


def downgrade() -> None:
    op.drop_table('generations')
