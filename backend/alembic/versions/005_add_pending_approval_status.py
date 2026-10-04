"""add PENDING_APPROVAL to work_items status check constraint

Revision ID: 005_add_pending_approval_status
Revises: 004_add_blocked_reason
Create Date: 2026-10-04
"""
from alembic import op

revision = '005_add_pending_approval_status'
down_revision = '004_add_blocked_reason'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('work_items') as batch_op:
        batch_op.drop_constraint('ck_work_item_status', type_='check')
        batch_op.create_check_constraint(
            'ck_work_item_status',
            "status IN ('OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'BLOCKED', 'RESOLVED', 'CLOSED')"
        )


def downgrade() -> None:
    with op.batch_alter_table('work_items') as batch_op:
        batch_op.drop_constraint('ck_work_item_status', type_='check')
        batch_op.create_check_constraint(
            'ck_work_item_status',
            "status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED')"
        )
