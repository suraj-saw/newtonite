"""add blocked_reason to work_items

Revision ID: 004_add_blocked_reason
Revises: 3b0b0e37c8f7
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa

revision = '004_add_blocked_reason'
down_revision = '3b0b0e37c8f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('work_items', sa.Column('blocked_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('work_items', 'blocked_reason')
