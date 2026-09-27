"""public reports board: location, category, confirmations and after-photos

Revision ID: 9b4d1e7a3c52
Revises: 7c2e5a9d1f40
Create Date: 2026-09-27 12:00:00

"""
from alembic import op
import sqlalchemy as sa


revision = '9b4d1e7a3c52'
down_revision = '7c2e5a9d1f40'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('complaint', schema=None) as batch_op:
        batch_op.alter_column('user_id', existing_type=sa.Integer(), nullable=True)
        batch_op.add_column(sa.Column('sector', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('category', sa.String(length=24), nullable=True))
        batch_op.add_column(sa.Column('address', sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column('confirmations', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('after_image_filename', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('resolution_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('photo_credit', sa.String(length=300), nullable=True))
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('resolved_at', sa.DateTime(), nullable=True))
        batch_op.create_index('ix_complaint_sector', ['sector'])
        batch_op.create_index('ix_complaint_created_at', ['created_at'])


def downgrade():
    with op.batch_alter_table('complaint', schema=None) as batch_op:
        batch_op.drop_index('ix_complaint_created_at')
        batch_op.drop_index('ix_complaint_sector')
        for column in ('resolved_at', 'updated_at', 'created_at', 'photo_credit', 'resolution_note',
                       'after_image_filename', 'confirmations', 'address', 'category', 'sector'):
            batch_op.drop_column(column)
        batch_op.alter_column('user_id', existing_type=sa.Integer(), nullable=False)
