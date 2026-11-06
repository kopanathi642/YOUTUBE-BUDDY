"""Referrals

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('referred_by', postgresql.UUID(as_uuid=True)))
    op.add_column('users', sa.Column('referral_rewarded', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('users', 'referral_rewarded')
    op.drop_column('users', 'referred_by')
