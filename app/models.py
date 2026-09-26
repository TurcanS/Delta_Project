import enum
from datetime import datetime
from app import db

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

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    posts = db.relationship('Complaint', backref='author', lazy=True)
    workspace = db.relationship('Workspace', back_populates='user',
                                    uselist=False, cascade='all, delete-orphan')
class ComplaintStatus(enum.Enum):
    sent = 'sent'
    pending = 'pending'
    approved = 'approved'
    solved = 'solved'

class Complaint(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(140), nullable=False)
    body = db.Column(db.Text, nullable=False)
    image_filename = db.Column(db.String(255), nullable=True)  # <- new, optional
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(
            db.Enum(ComplaintStatus),
            nullable=False,
            default=ComplaintStatus.pending
        )
