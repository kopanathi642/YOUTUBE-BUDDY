"""YouTube Growth: tracked channels, view snapshots, content pipeline items, automation settings

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None
UUID = postgresql.UUID(as_uuid=True)
TS = lambda: [sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),  # noqa: E731
              sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade() -> None:
    op.create_table('growth_channels',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('workspace_id', UUID, sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('channel_id', sa.String(40), nullable=False), sa.Column('title', sa.String(200), nullable=False),
        sa.Column('role', sa.String(12), nullable=False), sa.Column('last_synced_at', sa.DateTime(timezone=True)),
        sa.Column('sync_error', sa.String(300)), *TS(),
        sa.UniqueConstraint('workspace_id', 'channel_id', name='uq_growth_channel'))
    op.create_table('video_snapshots',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('channel_row_id', UUID, sa.ForeignKey('growth_channels.id', ondelete='CASCADE'), nullable=False),
        sa.Column('video_id', sa.String(20), nullable=False), sa.Column('title', sa.String(300), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=False), sa.Column('views', sa.BigInteger(), nullable=False),
        sa.Column('likes', sa.BigInteger()), sa.Column('captured_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index('ix_video_snap', 'video_snapshots', ['channel_row_id', 'video_id', 'captured_at'])
    op.create_table('content_items',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('workspace_id', UUID, sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_by', UUID, sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('title', sa.String(200), nullable=False), sa.Column('fmt', sa.String(10), nullable=False),
        sa.Column('status', sa.String(12), nullable=False, index=True), sa.Column('series', sa.String(120)),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), index=True),
        sa.Column('recommendation', postgresql.JSONB(), nullable=False), sa.Column('blueprint', postgresql.JSONB(), nullable=False),
        sa.Column('project_id', UUID, sa.ForeignKey('projects.id', ondelete='SET NULL')),
        sa.Column('youtube_video_id', sa.String(20)), sa.Column('prediction', postgresql.JSONB(), nullable=False),
        sa.Column('outcome', postgresql.JSONB(), nullable=False), sa.Column('notes', sa.Text()), *TS())
    op.create_table('growth_settings',
        sa.Column('workspace_id', UUID, sa.ForeignKey('workspaces.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('mode', sa.String(12), nullable=False), sa.Column('modules', postgresql.JSONB(), nullable=False),
        sa.Column('publish_authorized', sa.Boolean(), nullable=False), sa.Column('weights', postgresql.JSONB(), nullable=False), *TS())


def downgrade() -> None:
    op.drop_table('growth_settings')
    op.drop_table('content_items')
    op.drop_index('ix_video_snap', 'video_snapshots')
    op.drop_table('video_snapshots')
    op.drop_table('growth_channels')
