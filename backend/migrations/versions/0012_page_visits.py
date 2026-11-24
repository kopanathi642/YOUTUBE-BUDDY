"""page_visits: website traffic for the founder's Stats page (no cookies, no personal data)

Revision ID: 0012
Revises: 0011
"""
from alembic import op
import sqlalchemy as sa

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('page_visits',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('ts', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('path', sa.String(200), nullable=False),
        sa.Column('source', sa.String(40), nullable=False, server_default='Direct'),
        sa.Column('referrer_host', sa.String(120)),
        sa.Column('country', sa.String(2)),
        sa.Column('device', sa.String(10), nullable=False, server_default='desktop'),
        sa.Column('browser', sa.String(20)),
        sa.Column('visitor', sa.String(16), nullable=False),
        sa.Column('signed_in', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index('ix_page_visits_ts', 'page_visits', ['ts'])


def downgrade() -> None:
    op.drop_index('ix_page_visits_ts', table_name='page_visits')
    op.drop_table('page_visits')
