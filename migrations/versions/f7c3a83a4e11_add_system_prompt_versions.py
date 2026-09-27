"""Add versioned chatbot system prompts.

Revision ID: f7c3a83a4e11
Revises: 41f30fffa292
"""

from alembic import op
import sqlalchemy as sa


revision = 'f7c3a83a4e11'
down_revision = '41f30fffa292'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'system_prompt_version',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('instructions', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table('system_prompt_version')
