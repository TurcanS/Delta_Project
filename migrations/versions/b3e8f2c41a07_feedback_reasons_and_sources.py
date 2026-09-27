"""feedback: what was wrong and which sources were shown

Revision ID: b3e8f2c41a07
Revises: 9b4d1e7a3c52
Create Date: 2026-09-27 18:00:00

"""
from alembic import op
import sqlalchemy as sa


revision = 'b3e8f2c41a07'
down_revision = '9b4d1e7a3c52'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('feedback', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reasons', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('sources', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('feedback', schema=None) as batch_op:
        batch_op.drop_column('sources')
        batch_op.drop_column('reasons')
