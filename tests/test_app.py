import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import create_app, db
from app.config import Config
from app.models import User
from app.routes import FRONTEND_DIST, SECTORS


class AppTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        uri = f'sqlite:///{self.directory.name}/test.db'
        with patch.object(Config, 'SQLALCHEMY_DATABASE_URI', uri):
            self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()
        self.directory.cleanup()

    def test_sector_contract(self):
        response = self.client.get('/api/sectors/centru')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, SECTORS['centru'])
        self.assertEqual(len(response.json['categories']), 8)
        response = self.client.get('/api/sectors/missing')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json, {'error': 'Sector not found'})

    def test_all_sectors_are_available_to_the_map(self):
        response = self.client.get('/api/sectors')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({sector['id'] for sector in response.json},
                         {'centru', 'buiucani', 'botanica', 'ciocana', 'rascani'})
        for sector in response.json:
            detail = self.client.get(f'/api/sectors/{sector["id"]}')
            self.assertEqual(detail.status_code, 200)
            self.assertEqual(detail.json, sector)
            self.assertTrue(sector['website'].startswith('https://'))
            self.assertTrue(sector['petitions_url'].startswith('https://'))
            self.assertTrue(sector['contact']['phone'].startswith('+373'))
            self.assertEqual(len({item['icon'] for item in sector['categories']}), 8)
            for category in sector['categories']:
                self.assertTrue(category['description'])
                self.assertTrue(category['topics'])
                self.assertNotIn('count', category)

    def test_built_frontend_and_assets(self):
        self.assertTrue((FRONTEND_DIST / 'index.html').exists(), 'Run npm run build first')
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        response.close()
        self.assertIn('<div id="root"></div>', html)
        assets = re.findall(r'(?:src|href)="(/assets/[^"]+)"', html)
        self.assertGreaterEqual(len(assets), 2)
        for asset in assets:
            with self.client.get(asset) as asset_response:
                self.assertEqual(asset_response.status_code, 200)
        self.assertEqual(self.client.get('/assets/missing.js').status_code, 404)
        self.assertEqual(self.client.get('/assets/../../app/config.py').status_code, 404)

    def test_missing_build_has_actionable_message(self):
        with patch('app.routes.FRONTEND_DIST', Path(self.directory.name)):
            response = self.client.get('/')
        self.assertEqual(response.status_code, 503)
        self.assertIn('npm run build', response.get_data(as_text=True))

    def test_existing_models_work_with_sqlite(self):
        with self.app.app_context():
            db.create_all()
            db.session.add(User(username='test', email='test@example.com'))
            db.session.commit()
            db.session.remove()
            user = db.session.execute(db.select(User)).scalar_one()
            self.assertEqual(user.username, 'test')
