"""project votes from the swipe game

Revision ID: d4f6b8a2c913
Revises: c7a1d9e5f302
Create Date: 2026-09-27 16:00:00

"""
from alembic import op
import sqlalchemy as sa


revision = 'd4f6b8a2c913'
down_revision = 'c7a1d9e5f302'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'project_vote',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('voter', sa.String(length=32), nullable=False),
        sa.Column('value', sa.SmallInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['city_document.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('document_id', 'voter', name='uq_project_vote_voter'),
    )
    op.create_index('ix_project_vote_document_id', 'project_vote', ['document_id'])


def downgrade():
    op.drop_index('ix_project_vote_document_id', table_name='project_vote')
    op.drop_table('project_vote')
