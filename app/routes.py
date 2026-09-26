from flask import Blueprint, render_template

main = Blueprint('main', __name__)

SECTORS = {
    "centru": {
        "label": "Centru",
        "categories": [
            {"name": "Transport", "count": 16, "icon": "transport"},
            {"name": "Spații publice", "count": 12, "icon": "public"},
            {"name": "Administrație", "count": 18, "icon": "admin"},
            {"name": "Educație", "count": 11, "icon": "education"},
            {"name": "Sănătate", "count": 9, "icon": "health"},
            {"name": "Cultură și divertisment", "count": 14, "icon": "culture"},
            {"name": "Asistență socială", "count": 7, "icon": "social"},
            {"name": "Locuințe și utilități", "count": 6, "icon": "housing"},
        ],
    }
}


@main.route("/")
def home():
    return render_template("index.html", sector=SECTORS["centru"])

