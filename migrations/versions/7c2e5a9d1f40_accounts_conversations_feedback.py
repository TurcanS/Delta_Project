"""accounts, saved conversations and feedback

Revision ID: 7c2e5a9d1f40
Revises: 41f30fffa292
Create Date: 2026-09-26 21:00:00

"""
from alembic import op
import sqlalchemy as sa


revision = '7c2e5a9d1f40'
down_revision = '41f30fffa292'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('full_name', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('password_hash', sa.String(length=256), nullable=True))
        batch_op.add_column(sa.Column('role', sa.String(length=16), nullable=False, server_default='citizen'))
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'))
        batch_op.add_column(sa.Column('preferred_language', sa.String(length=2), nullable=False, server_default='ro'))
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('last_login_at', sa.DateTime(), nullable=True))

    op.create_table(
        'conversation',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('language', sa.String(length=2), nullable=False),
        sa.Column('pinned', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_conversation_user_id', 'conversation', ['user_id'])
    op.create_index('ix_conversation_updated_at', 'conversation', ['updated_at'])

    op.create_table(
        'message',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=10), nullable=False),
        sa.Column('language', sa.String(length=2), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=True),
        sa.Column('rating', sa.String(length=4), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversation.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_message_conversation_id', 'message', ['conversation_id'])

    op.create_table(
        'feedback',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rating', sa.String(length=4), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('question', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=True),
        sa.Column('language', sa.String(length=2), nullable=True),
        sa.Column('request_id', sa.String(length=64), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_feedback_created_at', 'feedback', ['created_at'])


def downgrade():
    op.drop_index('ix_feedback_created_at', table_name='feedback')
    op.drop_table('feedback')
    op.drop_index('ix_message_conversation_id', table_name='message')
    op.drop_table('message')
    op.drop_index('ix_conversation_updated_at', table_name='conversation')
    op.drop_index('ix_conversation_user_id', table_name='conversation')
    op.drop_table('conversation')
    with op.batch_alter_table('user', schema=None) as batch_op:
        for column in ('last_login_at', 'created_at', 'preferred_language', 'is_active', 'role', 'password_hash', 'full_name'):
            batch_op.drop_column(column)
