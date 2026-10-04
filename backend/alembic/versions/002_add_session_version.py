"""Add session_version

Revision ID: 002_add_session_version
Revises: 001_initial
Create Date: 2026-10-03
"""

from alembic import op
# pyrefly: ignore [missing-import]
import sqlalchemy as sa

revision = "002_add_session_version"
down_revision = "001_initial"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("users", sa.Column("session_version", sa.Integer(), nullable=False, server_default="1"))

def downgrade() -> None:
    op.drop_column("users", "session_version")
