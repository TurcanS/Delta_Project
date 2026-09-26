from pathlib import Path

from flask import Blueprint, jsonify, send_from_directory

FRONTEND_DIST = Path(__file__).resolve().parent.parent / 'frontend' / 'dist'

main = Blueprint('main', __name__)

from app.sector_data import SECTORS


@main.route("/")
def home():
    if not (FRONTEND_DIST / 'index.html').is_file():
        return 'Build the React frontend first: cd frontend && npm ci && npm run build', 503
    return send_from_directory(FRONTEND_DIST, 'index.html')


@main.route('/assets/<path:filename>')
def frontend_asset(filename):
    return send_from_directory(FRONTEND_DIST / 'assets', filename)


@main.route('/api/sectors/<sector_id>')
def sector_details(sector_id):
    sector = SECTORS.get(sector_id)
    if sector is None:
        return jsonify(error='Sector not found'), 404
    return jsonify(sector)


@main.route('/api/sectors')
def sector_list():
    return jsonify(list(SECTORS.values()))
