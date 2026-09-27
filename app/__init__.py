from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()

def create_app():
    app = Flask(__name__)
    app.config.from_object('app.config.Config')

    db.init_app(app)
    migrate.init_app(app, db)

    from app import models  # ensure models are registered
    from app.routes import main 
    from app.chatbot import chatbot
    app.register_blueprint(main)
    from app.assistant import assistant
    app.register_blueprint(assistant)
    from app.auth import auth
    app.register_blueprint(auth)
    from app.conversations import conversations
    app.register_blueprint(conversations)
    from app.reports import reports
    app.register_blueprint(reports)
    from app.library_routes import library
    app.register_blueprint(library)
    from app.swipe import swipe
    app.register_blueprint(swipe)

    app.register_blueprint(chatbot)

    from app.cli import register_cli
    register_cli(app)

    return app
