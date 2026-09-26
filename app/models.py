import enum
from app import db

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)

    posts = db.relationship('Complaint', backref='author', lazy=True)

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
