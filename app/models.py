import enum
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Workspace(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, default='My Workspace')
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True)

    # one-to-one: each user has exactly one workspace
    user = db.relationship('User', back_populates='workspace')
    files = db.relationship('UploadedFile', backref='workspace', lazy=True,
                             cascade='all, delete-orphan')


class UploadedFile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    filepath = db.Column(db.String(500), nullable=False)  # where it's stored on disk/S3
    mimetype = db.Column(db.String(100), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=True)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspace.id'), nullable=False)


ROLES = ('citizen', 'employee')


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    full_name = db.Column(db.String(120), nullable=True)
    password_hash = db.Column(db.String(256), nullable=True)
    role = db.Column(db.String(16), nullable=False, default='citizen', server_default='citizen')
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default='1')
    preferred_language = db.Column(db.String(2), nullable=False, default='ro', server_default='ro')
    created_at = db.Column(db.DateTime, nullable=True, default=utcnow)
    last_login_at = db.Column(db.DateTime, nullable=True)
    posts = db.relationship('Complaint', backref='author', lazy=True)
    conversations = db.relationship('Conversation', backref='user', lazy=True,
                                    cascade='all, delete-orphan')
    workspace = db.relationship('Workspace', back_populates='user',
                                    uselist=False, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return bool(self.password_hash) and check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id, 'email': self.email, 'full_name': self.full_name or self.username,
            'role': self.role, 'is_active': self.is_active, 'preferred_language': self.preferred_language,
            'created_at': _iso(self.created_at), 'last_login_at': _iso(self.last_login_at),
        }


class ComplaintStatus(enum.Enum):
    sent = 'sent'
    pending = 'pending'
    approved = 'approved'
    solved = 'solved'

class Complaint(db.Model):
    """A public report of a problem in the city, with the citizen's photo.

    Reports stay visible after they are fixed: the after-photo is the proof, and the
    board lets neighbours see whether a pothole or a poster was already reported.
    """
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(140), nullable=False)
    body = db.Column(db.Text, nullable=False)
    image_filename = db.Column(db.String(255), nullable=True)
    # Reports can be sent without an account; deleting an account keeps its reports, anonymised.
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    status = db.Column(
            db.Enum(ComplaintStatus),
            nullable=False,
            default=ComplaintStatus.sent
        )
    sector = db.Column(db.String(20), nullable=True, index=True)
    category = db.Column(db.String(24), nullable=True)
    address = db.Column(db.String(160), nullable=True)
    confirmations = db.Column(db.Integer, nullable=False, default=0, server_default='0')
    after_image_filename = db.Column(db.String(255), nullable=True)
    resolution_note = db.Column(db.Text, nullable=True)
    photo_credit = db.Column(db.String(300), nullable=True)
    created_at = db.Column(db.DateTime, nullable=True, default=utcnow, index=True)
    updated_at = db.Column(db.DateTime, nullable=True, default=utcnow)
    resolved_at = db.Column(db.DateTime, nullable=True)

    @property
    def public_status(self):
        # The board speaks in three states; "pending" (awaiting review) reads as reported.
        return {ComplaintStatus.approved: 'in_progress', ComplaintStatus.solved: 'solved'}.get(self.status, 'reported')

    def to_dict(self):
        photo = lambda name: f'/api/reports/photos/{name}' if name else None
        return {
            'id': self.id, 'title': self.title, 'description': self.body, 'status': self.public_status,
            'sector': self.sector, 'category': self.category, 'address': self.address,
            'confirmations': self.confirmations, 'photo': photo(self.image_filename),
            'after_photo': photo(self.after_image_filename), 'resolution_note': self.resolution_note,
            'photo_credit': self.photo_credit, 'created_at': _iso(self.created_at),
            'updated_at': _iso(self.updated_at), 'resolved_at': _iso(self.resolved_at),
        }


class Conversation(db.Model):
    """A saved assistant thread. Only signed-in users have server-side conversations."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False)
    language = db.Column(db.String(2), nullable=False, default='ro')
    pinned = db.Column(db.Boolean, nullable=False, default=False, server_default='0')
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    messages = db.relationship('Message', back_populates='conversation', order_by='Message.id',
                               cascade='all, delete-orphan')

    def summary(self):
        last = self.messages[-1] if self.messages else None
        return {
            'id': self.id, 'title': self.title, 'language': self.language, 'pinned': self.pinned,
            'created_at': _iso(self.created_at), 'updated_at': _iso(self.updated_at),
            'turns': sum(1 for message in self.messages if message.role == 'user'),
            'last_status': last.status if last and last.role == 'assistant' else None,
        }

    def to_dict(self):
        return {**self.summary(), 'messages': [message.to_dict() for message in self.messages]}


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id', ondelete='CASCADE'), nullable=False, index=True)
    role = db.Column(db.String(10), nullable=False)  # user | assistant
    language = db.Column(db.String(2), nullable=False)
    content = db.Column(db.Text, nullable=False)
    # Assistant turns keep the whole grounded answer (citations, highlights, next steps) so a
    # reopened conversation shows the same evidence the citizen saw.
    payload = db.Column(db.JSON, nullable=True)
    status = db.Column(db.String(16), nullable=True)
    rating = db.Column(db.String(4), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    conversation = db.relationship('Conversation', back_populates='messages')

    def to_dict(self):
        return {'id': self.id, 'role': self.role, 'language': self.language, 'content': self.content,
                'data': self.payload, 'status': self.status, 'rating': self.rating, 'created_at': _iso(self.created_at)}


class Feedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    rating = db.Column(db.String(4), nullable=False)  # up | down
    comment = db.Column(db.Text, nullable=True)
    question = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(32), nullable=True)
    language = db.Column(db.String(2), nullable=True)
    request_id = db.Column(db.String(64), nullable=True)
    # What was wrong (incorrect, incomplete, sources, outdated, translation) and which passages were shown.
    reasons = db.Column(db.JSON, nullable=True)
    sources = db.Column(db.JSON, nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)


def _iso(value):
    return value.isoformat() + 'Z' if value else None


class CityDocument(db.Model):
    """A project page or an official document (PDF/DOCX) collected from the city's websites.

    Searched through the `city_document_fts` index (SQLite FTS5, created by the migration).
    """
    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String(500), nullable=False, unique=True)
    kind = db.Column(db.String(10), nullable=False, index=True)  # project | pdf | docx
    source = db.Column(db.String(80), nullable=False)
    source_page = db.Column(db.String(500), nullable=True)
    title = db.Column(db.String(300), nullable=False)
    summary = db.Column(db.Text, nullable=True)
    text = db.Column(db.Text, nullable=True)
    sector = db.Column(db.String(20), nullable=True, index=True)
    category = db.Column(db.String(160), nullable=True)
    investment = db.Column(db.String(120), nullable=True)   # as written in the source
    investment_mdl = db.Column(db.BigInteger, nullable=True)
    progress = db.Column(db.Integer, nullable=True)          # completion bar on project pages, 0-100
    image_url = db.Column(db.String(500), nullable=True)
    published_on = db.Column(db.Date, nullable=True, index=True)
    project_number = db.Column(db.Integer, nullable=True, index=True)
    page_count = db.Column(db.Integer, nullable=True)
    ocr = db.Column(db.Boolean, nullable=False, default=False, server_default='0')
    content_hash = db.Column(db.String(64), nullable=True)
    fetched_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def _has_cover(self):
        from app.library import cover_path
        return cover_path(self.id).exists()

    def to_dict(self, snippet=None):
        return {
            'id': self.id, 'url': self.url, 'kind': self.kind, 'source': self.source, 'title': self.title,
            'summary': self.summary, 'sector': self.sector, 'category': self.category, 'investment': self.investment,
            'progress': self.progress, 'image_url': self.image_url,
            'published_on': self.published_on.isoformat() if self.published_on else None,
            'page_count': self.page_count, 'ocr': self.ocr, 'snippet': snippet,
            'cover_url': f'/api/library/{self.id}/cover' if self.kind == 'pdf' and self._has_cover() else None,
            'fetched_at': _iso(self.fetched_at),
        }


class ProjectVote(db.Model):
    """A resident's like or dislike of a city project, from the swipe game.

    One vote per project per browser (voter key kept in the session across sign-in), so the
    tally reflects people rather than clicks; signing in attaches the vote to the account too.
    """
    __table_args__ = (db.UniqueConstraint('document_id', 'voter', name='uq_project_vote_voter'),)
    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey('city_document.id', ondelete='CASCADE'), nullable=False, index=True)
    voter = db.Column(db.String(32), nullable=False)
    value = db.Column(db.SmallInteger, nullable=False)  # 1 like, -1 dislike
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
