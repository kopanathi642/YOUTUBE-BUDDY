"""Plans + UPI payments (manual approval), platform settings, YouTube connections

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column('workspaces', sa.Column('plan', sa.String(20), nullable=False, server_default='free'))
    op.add_column('workspaces', sa.Column('plan_expires_at', sa.DateTime(timezone=True)))
    op.create_table(
        'platform_settings',
        sa.Column('key', sa.String(60), primary_key=True),
        sa.Column('value', postgresql.JSONB(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        'payments',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('workspace_id', UUID, sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('plan', sa.String(20), nullable=False),
        sa.Column('months', sa.Integer(), nullable=False),
        sa.Column('amount_inr', sa.Integer(), nullable=False),
        sa.Column('method', sa.String(10), nullable=False, server_default='upi'),
        sa.Column('utr', sa.String(22), nullable=False, unique=True),
        sa.Column('status', sa.String(12), nullable=False, index=True),
        sa.Column('note', sa.String(300)),
        sa.Column('reviewed_by', UUID, sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('reviewed_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        'youtube_connections',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('channel_id', sa.String(64)),
        sa.Column('channel_title', sa.String(200)),
        sa.Column('refresh_token_enc', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('youtube_connections')
    op.drop_table('payments')
    op.drop_table('platform_settings')
    op.drop_column('workspaces', 'plan_expires_at')
    op.drop_column('workspaces', 'plan')
