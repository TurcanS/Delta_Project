"""library of city projects and documents, with full-text search

Revision ID: c7a1d9e5f302
Revises: b3e8f2c41a07
Create Date: 2026-09-27 13:00:00

"""
from alembic import op
import sqlalchemy as sa


revision = 'c7a1d9e5f302'
down_revision = 'b3e8f2c41a07'
branch_labels = None
depends_on = None

# External-content FTS5 index kept in sync by triggers. unicode61 with remove_diacritics
# lets "gradinita" find "grădiniță" and "sisinau" nothing: people type without diacritics.
FTS = [
    "CREATE VIRTUAL TABLE city_document_fts USING fts5(title, summary, text, content='city_document', content_rowid='id', tokenize='unicode61 remove_diacritics 2')",
    "CREATE TRIGGER city_document_ai AFTER INSERT ON city_document BEGIN INSERT INTO city_document_fts(rowid, title, summary, text) VALUES (new.id, new.title, new.summary, new.text); END",
    "CREATE TRIGGER city_document_ad AFTER DELETE ON city_document BEGIN INSERT INTO city_document_fts(city_document_fts, rowid, title, summary, text) VALUES ('delete', old.id, old.title, old.summary, old.text); END",
    "CREATE TRIGGER city_document_au AFTER UPDATE ON city_document BEGIN INSERT INTO city_document_fts(city_document_fts, rowid, title, summary, text) VALUES ('delete', old.id, old.title, old.summary, old.text); INSERT INTO city_document_fts(rowid, title, summary, text) VALUES (new.id, new.title, new.summary, new.text); END",
]


def upgrade():
    op.create_table(
        'city_document',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('source', sa.String(length=80), nullable=False),
        sa.Column('source_page', sa.String(length=500), nullable=True),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('sector', sa.String(length=20), nullable=True),
        sa.Column('category', sa.String(length=160), nullable=True),
        sa.Column('investment', sa.String(length=120), nullable=True),
        sa.Column('investment_mdl', sa.BigInteger(), nullable=True),
        sa.Column('progress', sa.Integer(), nullable=True),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('published_on', sa.Date(), nullable=True),
        sa.Column('project_number', sa.Integer(), nullable=True),
        sa.Column('page_count', sa.Integer(), nullable=True),
        sa.Column('ocr', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('content_hash', sa.String(length=64), nullable=True),
        sa.Column('fetched_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('url'),
    )
    for column in ('kind', 'sector', 'published_on', 'project_number'):
        op.create_index(f'ix_city_document_{column}', 'city_document', [column])
    if op.get_bind().dialect.name == 'sqlite':
        for statement in FTS:
            op.execute(statement)


def downgrade():
    if op.get_bind().dialect.name == 'sqlite':
        for name in ('city_document_au', 'city_document_ad', 'city_document_ai'):
            op.execute(f'DROP TRIGGER IF EXISTS {name}')
        op.execute('DROP TABLE IF EXISTS city_document_fts')
    op.drop_table('city_document')
