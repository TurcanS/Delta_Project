import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import create_app, db
from app.config import Config
from app import auth as auth_module
from app.models import Complaint, ComplaintStatus, Conversation, Feedback, Message, User, utcnow
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


class AssistantTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        uri = f'sqlite:///{self.directory.name}/test.db'
        with patch.object(Config, 'SQLALCHEMY_DATABASE_URI', uri):
            self.app = create_app()
        self.app.config.update(TESTING=True, RAG_API_KEY='test-key')
        self.app.instance_path = self.directory.name
        self.client = self.app.test_client()
        with self.app.app_context():
            db.create_all()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()
        self.directory.cleanup()

    def test_ask_forwards_question_and_hides_debug_data(self):
        upstream = {'status': 'answered', 'answer': 'Da.', 'citations': [{'chunk_id': 'c1', 'title': 'T', 'text': 'x', 'debug': {'semantic_score': 1}}],
                    'retrieved': [{'chunk_id': 'c1'}], 'conflict': None, 'next_steps': [], 'grounding': {'answer_highlights': []}, 'request_id': 'r'}
        with patch('app.assistant._rag_request', return_value=upstream) as rag:
            response = self.client.post('/api/ask', json={'question': ' Ce? ', 'language': 'ru'})
        rag.assert_called_once_with('/v1/ask', {'question': 'Ce?', 'answer_language': 'ru'})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('retrieved', response.json)
        self.assertNotIn('debug', response.json['citations'][0])
        self.assertEqual(response.json['answer'], 'Da.')

    def test_mixed_script_words_are_repaired_without_moving_offsets(self):
        from app.assistant import fix_mixed_script
        text = 'Градиниțа № 7, Grădinița nr. 7, Проиectul'
        fixed = fix_mixed_script(text)
        self.assertEqual(fixed, 'Градиница № 7, Grădinița nr. 7, Проиectul')  # unfixable words stay as written
        self.assertEqual(len(fixed), len(text))

    def test_ask_validates_input(self):
        self.assertEqual(self.client.post('/api/ask', json={'question': ''}).status_code, 400)
        self.assertEqual(self.client.post('/api/ask', json={'question': 'x', 'language': 'en'}).status_code, 400)
        self.assertEqual(self.client.post('/api/ask', json={'question': 'x' * 1001}).status_code, 400)

    def test_ask_reports_unavailable_upstream(self):
        import urllib.error
        with patch('app.assistant._rag_request', side_effect=urllib.error.URLError('down')):
            response = self.client.post('/api/ask', json={'question': 'Ce?'})
        self.assertEqual(response.status_code, 503)

    def test_feedback_is_stored(self):
        response = self.client.post('/api/feedback', json={'rating': 'down', 'question': 'Ce?', 'comment': 'lipsă', 'language': 'ro'})
        self.assertEqual(response.status_code, 201)
        stored = (Path(self.directory.name) / 'feedback.jsonl').read_text()
        self.assertIn('"rating": "down"', stored)
        self.assertEqual(self.client.post('/api/feedback', json={'rating': 'meh'}).status_code, 400)
        with self.app.app_context():
            row = db.session.execute(db.select(Feedback)).scalar_one()
            self.assertEqual((row.rating, row.comment), ('down', 'lipsă'))

    def test_feedback_details_complete_the_same_rating(self):
        sources = [{'document_id': 'd1', 'chunk_id': 'c1', 'url': 'https://proiecte.chisinau.md/ro/pv-1311'}]
        first = self.client.post('/api/feedback', json={'rating': 'down', 'question': 'Ce?', 'sources': sources})
        feedback_id = first.json['id']
        response = self.client.post('/api/feedback', json={'rating': 'down', 'feedback_id': feedback_id,
                                                           'reasons': ['outdated', 'translation', 'nonsense'], 'comment': 'Suma e veche'})
        self.assertEqual(response.json['id'], feedback_id)
        # Another browser cannot rewrite someone else's rating.
        other = self.app.test_client().post('/api/feedback', json={'rating': 'up', 'feedback_id': feedback_id})
        self.assertNotEqual(other.json['id'], feedback_id)
        with self.app.app_context():
            row = db.session.get(Feedback, feedback_id)
            self.assertEqual((row.reasons, row.comment, row.sources), (['outdated', 'translation'], 'Suma e veche', sources))
            self.assertEqual(db.session.execute(db.select(db.func.count()).select_from(Feedback)).scalar(), 2)

    def test_evaluation_set_is_valid(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('evaluate', Path(__file__).resolve().parent.parent / 'scripts' / 'evaluate.py')
        evaluate = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(evaluate)
        rows, problems = evaluate.load_questions()
        self.assertEqual(problems, [])
        self.assertGreaterEqual(len({row['pair'] for row in rows}), 12)
        right = {'status': 'answered', 'answer': 'Au fost alocați 9 300 000 MDL.',
                 'citations': [{'url': 'https://proiecte.chisinau.md/ro/pv-1311-extinderea', 'text': 'Investiția totală: 9,3 milioane lei'}]}
        self.assertTrue(evaluate.score(next(r for r in rows if r['id'] == 'p01-ro'), right)['passed'])
        self.assertFalse(evaluate.score(next(r for r in rows if r['id'] == 'p13-ro'), right)['passed'])


UPSTREAM = {'status': 'answered', 'answer': 'S-au alocat 9 300 000 MDL.', 'conflict': None, 'next_steps': [], 'request_id': 'r1', 'elapsed_ms': 900,
            'grounding': {'answer_highlights': [{'start': 10, 'end': 23}]},
            'citations': [{'document_id': 'd1', 'chunk_id': 'c1', 'title': 'Extinderea Grădiniței Nr. 125', 'url': 'https://proiecte.chisinau.md/ro/pv-1311',
                           'text': 'Investiția totală: 9 300 000 MDL.', 'debug': {'score': 1}}]}


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        uri = f'sqlite:///{self.directory.name}/test.db'
        with patch.object(Config, 'SQLALCHEMY_DATABASE_URI', uri):
            self.app = create_app()
        self.app.config.update(TESTING=True, SECRET_KEY='test', RAG_API_KEY='k')
        self.app.instance_path = self.directory.name
        auth_module._failures.clear()
        self.client = self.app.test_client()
        with self.app.app_context():
            db.create_all()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()
        self.directory.cleanup()

    def register(self, client=None, email='ion@example.md', password='parola-sigura'):
        return (client or self.client).post('/api/auth/register', json={'email': email, 'password': password, 'full_name': 'Ion Popescu'})

    def ask(self, client, question='Cât s-a investit?', **extra):
        with patch('app.assistant._rag_request', return_value=UPSTREAM):
            return client.post('/api/ask', json={'question': question, 'language': 'ro', **extra})

    def test_register_login_logout(self):
        self.assertEqual(self.client.get('/api/auth/me').json, {'user': None})
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json['user']['role'], 'citizen')
        self.assertNotIn('password_hash', response.json['user'])
        self.assertEqual(self.client.get('/api/auth/me').json['user']['email'], 'ion@example.md')
        self.assertEqual(self.register(self.app.test_client()).json['fields'], {'email': 'taken'})
        self.client.post('/api/auth/logout', json={})
        self.assertIsNone(self.client.get('/api/auth/me').json['user'])
        self.assertEqual(self.client.post('/api/auth/login', json={'email': 'ion@example.md', 'password': 'gresit'}).status_code, 401)
        self.assertEqual(self.client.post('/api/auth/login', json={'email': 'ION@example.md', 'password': 'parola-sigura'}).status_code, 200)

    def test_validation_and_json_only(self):
        response = self.client.post('/api/auth/register', json={'email': 'x', 'password': '123', 'full_name': ''})
        self.assertEqual(set(response.json['fields']), {'email', 'password', 'full_name'})
        self.assertEqual(self.client.post('/api/auth/login', data={'email': 'a', 'password': 'b'}).status_code, 415)

    def test_login_is_throttled(self):
        self.register()
        for _ in range(8):
            self.client.post('/api/auth/login', json={'email': 'ion@example.md', 'password': 'nu'})
        response = self.client.post('/api/auth/login', json={'email': 'ion@example.md', 'password': 'parola-sigura'})
        self.assertEqual(response.status_code, 429)

    def test_password_change_ends_other_sessions(self):
        self.register()
        other = self.app.test_client()
        other.post('/api/auth/login', json={'email': 'ion@example.md', 'password': 'parola-sigura'})
        bad = self.client.post('/api/account/password', json={'current_password': 'nu', 'new_password': 'parola-noua-1'})
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.client.post('/api/account/password', json={'current_password': 'parola-sigura', 'new_password': 'parola-noua-1'}).status_code, 200)
        self.assertIsNotNone(self.client.get('/api/auth/me').json['user'])
        self.assertIsNone(other.get('/api/auth/me').json['user'])

    def test_anonymous_questions_are_not_saved(self):
        response = self.ask(self.client)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('conversation_id', response.json)
        self.assertEqual(self.client.get('/api/conversations').status_code, 401)
        self.assertEqual(self.ask(self.client, conversation_id=1).status_code, 401)

    def test_signed_in_questions_build_a_conversation(self):
        self.register()
        first = self.ask(self.client, 'Cât s-a investit în extinderea Grădiniței nr. 125 din sectorul Centru al municipiului Chișinău?')
        conversation_id = first.json['conversation_id']
        self.assertTrue(first.json['conversation_title'].endswith('…'))
        second = self.ask(self.client, 'Și când s-a terminat?', conversation_id=conversation_id)
        self.assertEqual(second.json['conversation_id'], conversation_id)
        listed = self.client.get('/api/conversations').json['items']
        self.assertEqual((len(listed), listed[0]['turns'], listed[0]['last_status']), (1, 2, 'answered'))
        detail = self.client.get(f'/api/conversations/{conversation_id}').json['conversation']
        self.assertEqual([m['role'] for m in detail['messages']], ['user', 'assistant', 'user', 'assistant'])
        self.assertEqual(detail['messages'][1]['data']['citations'][0]['title'], 'Extinderea Grădiniței Nr. 125')
        self.assertNotIn('debug', detail['messages'][1]['data']['citations'][0])
        self.assertEqual(len(self.client.get('/api/conversations?q=terminat').json['items']), 1)
        self.assertEqual(len(self.client.get('/api/conversations?q=Paris').json['items']), 0)

    def test_conversations_are_private(self):
        self.register()
        conversation_id = self.ask(self.client).json['conversation_id']
        stranger = self.app.test_client()
        self.register(stranger, email='maria@example.md')
        self.assertEqual(stranger.get(f'/api/conversations/{conversation_id}').status_code, 404)
        self.assertEqual(stranger.delete(f'/api/conversations/{conversation_id}').status_code, 404)
        with patch('app.assistant._rag_request') as rag:
            self.assertEqual(stranger.post('/api/ask', json={'question': 'Ce?', 'conversation_id': conversation_id}).status_code, 404)
        rag.assert_not_called()

    def test_rename_pin_rate_export_delete(self):
        self.register()
        answer = self.ask(self.client).json
        conversation_id = answer['conversation_id']
        self.ask(self.client, 'Altă întrebare')
        renamed = self.client.patch(f'/api/conversations/{conversation_id}', json={'title': '  Grădinița  125 ', 'pinned': True}).json['conversation']
        self.assertEqual((renamed['title'], renamed['pinned']), ('Grădinița 125', True))
        self.assertEqual(self.client.get('/api/conversations').json['items'][0]['id'], conversation_id)
        self.assertEqual(self.client.patch(f'/api/conversations/{conversation_id}', json={'title': ' '}).status_code, 400)
        self.client.post('/api/feedback', json={'rating': 'up', 'message_id': answer['message_id'], 'question': 'q'})
        messages = self.client.get(f'/api/conversations/{conversation_id}').json['conversation']['messages']
        self.assertEqual(messages[1]['rating'], 'up')
        exported = self.client.get(f'/api/conversations/{conversation_id}/export')
        self.assertIn('attachment', exported.headers['Content-Disposition'])
        text = exported.get_data(as_text=True)
        self.assertIn('https://proiecte.chisinau.md/ro/pv-1311', text)
        self.assertIn('Verificat în documente', text)
        self.assertEqual(self.client.delete(f'/api/conversations/{conversation_id}').status_code, 200)
        self.assertEqual(len(self.client.get('/api/conversations').json['items']), 1)
        self.assertEqual(self.client.delete('/api/conversations', json={}).status_code, 400)
        self.assertEqual(self.client.delete('/api/conversations', json={'confirm': True}).json['deleted'], 1)

    def test_import_keeps_the_visitor_chat_and_sanitizes_it(self):
        self.register()
        turns = [{'question': 'Cât s-a investit?', 'language': 'ro', 'data': {**UPSTREAM, 'answer_highlights': [], 'retrieved': ['secret']}},
                 {'question': '', 'language': 'ro', 'data': {}}]
        created = self.client.post('/api/conversations/import', json={'turns': turns})
        self.assertEqual(created.status_code, 201)
        messages = created.json['conversation']['messages']
        self.assertEqual(len(messages), 2)
        self.assertNotIn('retrieved', messages[1]['data'])
        self.assertNotIn('debug', messages[1]['data']['citations'][0])
        self.assertEqual(self.client.post('/api/conversations/import', json={'turns': []}).status_code, 400)

    def test_delete_account_removes_history(self):
        self.register()
        self.ask(self.client)
        self.assertEqual(self.client.delete('/api/account', json={'password': 'gresit'}).status_code, 400)
        self.assertEqual(self.client.delete('/api/account', json={'password': 'parola-sigura'}).status_code, 200)
        self.assertIsNone(self.client.get('/api/auth/me').json['user'])
        with self.app.app_context():
            self.assertEqual(db.session.execute(db.select(db.func.count()).select_from(Conversation)).scalar(), 0)
            self.assertEqual(db.session.execute(db.select(db.func.count()).select_from(Message)).scalar(), 0)
        self.assertEqual(self.client.post('/api/auth/login', json={'email': 'ion@example.md', 'password': 'parola-sigura'}).status_code, 401)


def _jpeg(size=(40, 30)):
    from io import BytesIO
    from PIL import Image
    buffer = BytesIO()
    Image.new('RGB', size, (90, 90, 90)).save(buffer, 'JPEG')
    return buffer.getvalue()


JPEG = _jpeg()


class ReportBoardTests(unittest.TestCase):
    """Public problems board: photo reports, confirmations and employee updates."""

    tearDown = AccountTests.tearDown
    register = AccountTests.register

    def setUp(self):
        AccountTests.setUp(self)
        from app import reports as reports_module
        reports_module._posts.clear()

    def post_report(self, client=None, photo=JPEG, **fields):
        from io import BytesIO
        data = {'title': 'Groapă pe carosabil', 'description': 'Adâncă, lângă trecere.', 'sector': 'centru',
                'category': 'pothole', 'address': 'str. Test 1', **fields}
        if photo is not None:
            data['photo'] = (BytesIO(photo), 'groapa.jpg')
        return (client or self.client).post('/api/reports', data=data, content_type='multipart/form-data')

    def test_guest_report_is_public_with_its_photo(self):
        response = self.post_report()
        self.assertEqual(response.status_code, 201)
        report = response.json
        self.assertEqual((report['status'], report['confirmations'], report['confirmed']), ('reported', 1, True))
        photo = self.client.get(report['photo'])
        self.assertEqual(photo.status_code, 200)
        self.assertEqual(photo.headers['X-Content-Type-Options'], 'nosniff')
        photo.close()
        board = self.client.get('/api/reports').json
        self.assertEqual(board['counts'], {'reported': 1, 'in_progress': 0, 'solved': 0})
        self.assertEqual(board['items'][0]['title'], 'Groapă pe carosabil')

    def test_report_validation(self):
        response = self.post_report(photo=None, title='', sector='nowhere', category='x')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json['fields']), {'title', 'sector', 'category', 'photo'})
        # A file that is not an image is refused by its bytes, whatever its name says.
        response = self.post_report(photo=b'<svg onload=alert(1)>')
        self.assertEqual(response.json['fields'], {'photo': 'unsupported'})
        # Correct magic bytes are not enough: the photo must decode.
        for broken in (b'\xff\xd8\xff', JPEG[:len(JPEG) // 2]):
            self.assertEqual(self.post_report(photo=broken).json['fields'], {'photo': 'unsupported'})

    def test_reports_are_rate_limited(self):
        from app.reports import POSTS_PER_WINDOW
        for _ in range(POSTS_PER_WINDOW):
            self.assertEqual(self.post_report().status_code, 201)
        self.assertEqual(self.post_report().status_code, 429)

    def test_confirmation_counts_once_per_session(self):
        report_id = self.post_report().json['id']
        other = self.app.test_client()
        self.assertEqual(other.post(f'/api/reports/{report_id}/confirm', json={}).json['confirmations'], 2)
        self.assertEqual(other.post(f'/api/reports/{report_id}/confirm', json={}).json['confirmations'], 2)
        self.assertEqual(other.post(f'/api/reports/{report_id}/confirm', data={}).status_code, 415)
        self.assertTrue(other.get('/api/reports').json['items'][0]['confirmed'])

    def test_filters(self):
        self.post_report()
        self.post_report(sector='botanica', category='waste')
        self.assertEqual(len(self.client.get('/api/reports?sector=botanica').json['items']), 1)
        self.assertEqual(len(self.client.get('/api/reports?category=pothole').json['items']), 1)
        self.assertEqual(len(self.client.get('/api/reports?status=solved').json['items']), 0)
        self.assertEqual(len(self.client.get('/api/reports?status=open').json['items']), 2)

    def test_only_employees_update_status(self):
        from io import BytesIO
        report_id = self.post_report().json['id']
        self.register()
        form = lambda: {'status': 'solved', 'note': 'Reparat.', 'photo': (BytesIO(JPEG), 'dupa.jpg')}
        self.assertEqual(self.client.post(f'/api/reports/{report_id}/status', data=form(), content_type='multipart/form-data').status_code, 403)
        with self.app.app_context():
            user = db.session.execute(db.select(User)).scalar_one()
            user.role = 'employee'
            db.session.commit()
        response = self.client.post(f'/api/reports/{report_id}/status', data=form(), content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['status'], 'solved')
        self.assertIsNotNone(response.json['resolved_at'])
        self.assertTrue(response.json['after_photo'])
        self.assertEqual(response.json['resolution_note'], 'Reparat.')

    def test_deleting_account_keeps_reports_anonymised(self):
        self.register()
        self.post_report()
        self.assertEqual(self.client.delete('/api/account', json={'password': 'parola-sigura'}).status_code, 200)
        self.assertEqual(len(self.client.get('/api/reports').json['items']), 1)

    def test_board_pages_through_older_reports(self):
        from app.reports import PAGE_SIZE
        with self.app.app_context():
            for index in range(PAGE_SIZE + 1):
                db.session.add(Complaint(title=f'R{index}', body='x', sector='centru', category='other'))
            db.session.commit()
        first = self.client.get('/api/reports').json
        self.assertEqual((len(first['items']), first['has_more']), (PAGE_SIZE, True))
        rest = self.client.get(f'/api/reports?offset={PAGE_SIZE}').json
        self.assertEqual((len(rest['items']), rest['has_more']), (1, False))
        ids = {item['id'] for item in first['items'] + rest['items']}
        self.assertEqual(len(ids), PAGE_SIZE + 1)

    def test_editing_a_solved_report_keeps_its_fix_date(self):
        from datetime import timedelta
        report_id = self.post_report().json['id']
        self.register()
        with self.app.app_context():
            db.session.execute(db.select(User)).scalar_one().role = 'employee'
            report = db.session.get(Complaint, report_id)
            report.status, report.resolved_at = ComplaintStatus.solved, utcnow() - timedelta(days=5)
            db.session.commit()
            fixed_on = report.resolved_at
        response = self.client.post(f'/api/reports/{report_id}/status', data={'status': 'solved', 'note': 'Corectat.'}, content_type='multipart/form-data')
        self.assertEqual(response.json['resolved_at'], fixed_on.isoformat() + 'Z')
        reopened = self.client.post(f'/api/reports/{report_id}/status', data={'status': 'in_progress'}, content_type='multipart/form-data')
        self.assertIsNone(reopened.json['resolved_at'])

    def test_signing_in_keeps_confirmations(self):
        report_id = self.post_report(client=self.app.test_client()).json['id']
        self.client.post(f'/api/reports/{report_id}/confirm', json={})
        self.register()
        self.assertTrue(self.client.get('/api/reports').json['items'][0]['confirmed'])
        self.assertEqual(self.client.post(f'/api/reports/{report_id}/confirm', json={}).json['confirmations'], 2)
        self.client.post('/api/auth/logout', json={})
        self.assertEqual(self.client.post(f'/api/reports/{report_id}/confirm', json={}).json['confirmations'], 2)


class RobustnessTests(unittest.TestCase):
    setUp = AccountTests.setUp
    tearDown = AccountTests.tearDown
    register = AccountTests.register

    def test_json_that_is_not_an_object_is_refused(self):
        self.assertEqual(self.client.post('/api/auth/login', json=['bad']).status_code, 415)
        self.assertEqual(self.client.post('/api/auth/register', json='text').status_code, 415)
        self.assertEqual(self.client.post('/api/ask', json=['bad']).status_code, 400)
        self.assertEqual(self.client.post('/api/feedback', json=[1]).status_code, 400)

    def test_import_skips_malformed_turns(self):
        self.register()
        response = self.client.post('/api/conversations/import', json={'turns': [None, 'x', 3]})
        self.assertEqual(response.status_code, 400)

    def test_conversation_list_pages(self):
        from app.conversations import PAGE_SIZE
        self.register()
        with self.app.app_context():
            user = db.session.execute(db.select(User)).scalar_one()
            db.session.add_all(Conversation(user_id=user.id, title=f'C{i}') for i in range(PAGE_SIZE + 3))
            db.session.commit()
        first = self.client.get('/api/conversations').json
        self.assertEqual((len(first['items']), first['has_more']), (PAGE_SIZE, True))
        rest = self.client.get(f'/api/conversations?offset={PAGE_SIZE}').json
        self.assertEqual((len(rest['items']), rest['has_more']), (3, False))


class MigrationTests(unittest.TestCase):
    def test_upgrading_a_populated_initial_database(self):
        from flask_migrate import upgrade
        from sqlalchemy import text
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        with patch.object(Config, 'SQLALCHEMY_DATABASE_URI', f'sqlite:///{directory.name}/old.db'):
            app = create_app()
        migrations = str(Path(__file__).resolve().parent.parent / 'migrations')
        with app.app_context():
            upgrade(directory=migrations, revision='554849ae27de')
            db.session.execute(text("INSERT INTO user (id, username, email) VALUES (1, 'ion', 'ion@example.md')"))
            db.session.execute(text("INSERT INTO complaint (title, body, user_id) VALUES ('Groapă', 'Adâncă', 1)"))
            db.session.commit()
            upgrade(directory=migrations)
            report = db.session.execute(db.select(Complaint)).scalar_one()
            self.assertEqual((report.public_status, report.confirmations), ('reported', 0))
            db.session.remove()
            db.engine.dispose()


CLAIMS_RESPONSE = {
    'status': 'answered', 'language': 'romanian', 'conflict': False, 'conflict_description': '', 'conflict_citations': [],
    'answer': 'Extinderea Grădiniței nr. 125 a costat 9 300 000 MDL. [5feaa81d]\n1. Au fost deschise 3 grupe noi. [5feaa81d, 0bccd7ef]',
    'claims': [
        {'text': 'Extinderea Grădiniței nr. 125 a costat 9 300 000 MDL.', 'citations': [
            {'id': '5feaa81d6e15', 'document_id': 'doc1', 'title': 'primaria-municipiului-chisinau--00a3955fe248320574cb.txt',
             'filename': 'primaria-municipiului-chisinau--00a3955fe248320574cb.txt', 'source_url': 'unknown', 'page': 'unknown',
             'heading': 'unknown', 'passage': 'Investiții: 9 300 000 MDL'}]},
        {'text': 'Au fost deschise 3 grupe noi.', 'citations': [
            {'id': '0bccd7ef9a1b', 'document_id': 'doc2', 'title': 'x', 'filename': 'documents/dgaurf-md/memoriul-general--1ff9b37ec6bf03da5efe.txt',
             'source_url': 'unknown', 'page': '12', 'heading': 'Educație', 'passage': 'deschise suplimentar 3 grupe noi'}]}],
    'retrieval': [
        {'id': '5feaa81d6e15', 'document_id': 'doc1', 'text': 'https://proiecte.chisinau.md/ro/pv-1311-extinderea-gradinitei-nr-125\n\nCentru / Educație\nEXTINDEREA GRĂDINIȚEI NR. 125\nDescriere\nAu fost deschise suplimentar 3 grupe noi.\nInvestiții: 9 300 000 MDL'},
        {'id': '0bccd7ef9a1b', 'document_id': 'doc2', 'text': 'În grădinițe au fost deschise   suplimentar 3 grupe noi, spune memoriul.'}],
}


class RagAdapterTests(unittest.TestCase):
    def test_claims_become_grounded_numbered_sources(self):
        from app.rag_adapter import normalize
        result = normalize(CLAIMS_RESPONSE, elapsed_ms=5000)
        self.assertEqual(result['status'], 'answered')
        self.assertNotIn('[', result['answer'])
        self.assertEqual([c['chunk_id'] for c in result['citations']], ['5feaa81d6e15', '0bccd7ef9a1b'])
        first, second = result['citations']
        self.assertEqual((first['title'], first['url']), ('Extinderea grădiniței nr. 125', 'https://proiecte.chisinau.md/ro/pv-1311-extinderea-gradinitei-nr-125'))
        self.assertFalse(first['text'].startswith('http'))
        evidence = first['highlights'][0]
        self.assertEqual(first['text'][evidence['start']:evidence['end']], 'Investiții: 9 300 000 MDL')
        # Spacing differences in the stored chunk do not hide the quote; the crawl folder gives the site.
        self.assertEqual(second['text'][second['highlights'][0]['start']:second['highlights'][0]['end']], 'deschise   suplimentar 3 grupe noi')
        self.assertEqual((second['url'], second['page'], second['section']), ('https://dgaurf.md/', '12', 'Educație'))
        grounded = [(result['answer'][h['start']:h['end']], [s['chunk_id'] for s in h['sources']]) for h in result['answer_highlights']]
        self.assertEqual(grounded, [('Extinderea Grădiniței nr. 125 a costat 9 300 000 MDL.', ['5feaa81d6e15']),
                                    ('Au fost deschise 3 grupe noi.', ['5feaa81d6e15', '0bccd7ef9a1b'])])
        self.assertIn('start', result['answer_highlights'][0]['sources'][0])
        self.assertEqual(result['elapsed_ms'], 5000)

    def test_insufficient_evidence_and_conflict(self):
        from app.rag_adapter import normalize
        abstained = normalize({**CLAIMS_RESPONSE, 'status': 'insufficient_evidence', 'claims': [], 'answer': 'Corpusul nu conține suficiente informații.'})
        self.assertEqual((abstained['status'], abstained['citations'], abstained['answer_highlights']), ('abstained', [], []))
        conflict = normalize({**CLAIMS_RESPONSE, 'conflict': True, 'conflict_description': 'Pagina A spune 3 grupe, pagina B spune 2.'})
        self.assertEqual(conflict['status'], 'conflict')
        self.assertEqual(conflict['conflict'], {'message': 'Pagina A spune 3 grupe, pagina B spune 2.'})

    def test_service_titles_are_used_unless_they_are_file_names(self):
        from app.rag_adapter import normalize
        pdf = {'id': 'abc123def456', 'document_id': 'd9', 'title': 'Planul Urbanistic General al municipiului Chișinău',
               'filename': 'documents/dgaurf-md/memoriul-general--1ff9b37ec6bf03da5efe.pdf', 'source_url': 'unknown', 'page': '62',
               'heading': 'unknown', 'passage': 'grădiniţele din Chişinău sunt frecventate'}
        response = {**CLAIMS_RESPONSE, 'answer': 'Grădinițele sunt solicitate. [abc123de]', 'claims': [{'text': 'Grădinițele sunt solicitate.', 'citations': [pdf]}],
                    'retrieval': [{'id': 'abc123def456', 'text': 'Deşi numărul copiilor scade, grădiniţele din Chişinău sunt frecventate şi de copii din suburbii.'}]}
        source = normalize(response)['citations'][0]
        self.assertEqual((source['title'], source['url'], source['page']), ('Planul Urbanistic General al municipiului Chișinău', 'https://dgaurf.md/', '62'))
        self.assertTrue(source['highlights'])
        # A file name as title falls back to the name read from the passage.
        self.assertEqual(normalize(CLAIMS_RESPONSE)['citations'][0]['title'], 'Extinderea grădiniței nr. 125')

    def test_ask_route_uses_the_claims_format(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        with patch.object(Config, 'SQLALCHEMY_DATABASE_URI', f'sqlite:///{directory.name}/t.db'):
            app = create_app()
        app.config.update(TESTING=True, RAG_API_KEY='k')
        with patch('app.assistant._rag_request', return_value=CLAIMS_RESPONSE):
            response = app.test_client().post('/api/ask', json={'question': 'Cât a costat?', 'language': 'ro'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['status'], 'answered')
        self.assertEqual(len(response.json['citations']), 2)
        self.assertNotIn('retrieval', response.json)
        self.assertEqual(app.test_client().post('/api/ask', json={'question': 'a', 'language': 'ro'}).status_code, 400)
        with app.app_context():
            db.session.remove()
            db.engine.dispose()


PROJECT_PAGE = '''<div class="col-lg-7">
  <b>Centru / Educație / Grădinițe</b></div>
<h1>EXTINDEREA GRĂDINIȚEI NR. 125</h1>
<div class="progress"><div class="progress-bar" role="progressbar" aria-valuenow="100" aria-valuemin="0"></div></div>
<img class="animated" src="https://proiecte.chisinau.md/images/projects/1311/a.jpg" alt="x">
<div id="real_description"><div class="row"><div class="col-md-6"><p>Au fost deschise 3 grupe noi.<br>Investiția totală: 9,3 milioane lei.</p></div>
<div class="col-md-6"><blockquote class="blockquote"><h5 class="mb-2 ">Investiții: 9 300 000 MDL</h5></blockquote></div></div></div>'''


class LibraryTests(unittest.TestCase):
    setUp = AccountTests.setUp
    tearDown = AccountTests.tearDown
    register = AccountTests.register

    def test_parsing_helpers(self):
        from datetime import date
        from app.library import parse_date, parse_money, parse_project, title_case
        self.assertEqual(parse_money('9 300 000 MDL'), 9_300_000)
        self.assertEqual(parse_money('9,3 milioane lei'), 9_300_000)
        self.assertIsNone(parse_money('Parteneriat'))
        self.assertEqual(parse_date('Dispoziția nr. 251-d din 02.07.2026'), date(2026, 7, 2))
        self.assertEqual(parse_date('Dispoziția nr. 279-d din 10.07.26'), date(2026, 7, 10))
        self.assertEqual(parse_date('decizia_nr_79_din_27_iulie_2021.pdf'), date(2021, 7, 27))
        self.assertEqual(title_case('ACCES SPRE LT. „PETRU RAREȘ”'), 'Acces spre LT. „Petru Rareș”')
        self.assertEqual(title_case('CURȚI DE BLOC STR. N. GRĂDESCU'), 'Curți de bloc str. N. Grădescu')
        self.assertEqual(title_case('Sensul giratoriu Calea Orheiului'), 'Sensul giratoriu Calea Orheiului')
        project = parse_project(PROJECT_PAGE, 'https://proiecte.chisinau.md/ro/pv-1311-x', 'centru', 1311)
        self.assertEqual((project['title'], project['category'], project['progress']), ('Extinderea grădiniței nr. 125', 'Educație / Grădinițe', 100))
        self.assertEqual((project['investment'], project['investment_mdl']), ('9 300 000 MDL', 9_300_000))
        self.assertIn('3 grupe noi', project['text'])

    def test_docx_text(self):
        import io
        import zipfile
        from app.library import docx_text
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Regulament</w:t></w:r></w:p><w:p><w:r><w:t>Art. 1 &amp; 2</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(docx_text(buffer.getvalue()), 'Regulament\nArt. 1 & 2')

    def test_robots_disallow_is_respected(self):
        from app.library import Fetcher
        fetcher = Fetcher(log=lambda line: None)
        with patch.object(Fetcher, '_open', side_effect=AssertionError('no request may be sent')):
            import urllib.robotparser
            blocked = urllib.robotparser.RobotFileParser()
            blocked.parse(['User-agent: *', 'Disallow: /'])
            fetcher.robots['https://www.chisinau.md'] = blocked
            self.assertIsNone(fetcher.get('https://www.chisinau.md/ro/upload/a.pdf'))

    def test_search_ignores_diacritics_and_word_endings(self):
        from app.library import search, store
        with self.app.app_context():
            store({'url': 'https://proiecte.chisinau.md/ro/pv-1311', 'kind': 'project', 'source': 'proiecte.chisinau.md', 'title': 'Extinderea grădiniței nr. 125',
                   'summary': 'Au fost deschise 3 grupe noi.', 'text': 'Au fost deschise 3 grupe noi în grădinița din Centru.', 'sector': 'centru',
                   'progress': 100, 'investment_mdl': 9_300_000, 'project_number': 1311})
            store({'url': 'https://dgaurf.md/storage/pug.pdf', 'kind': 'pdf', 'source': 'dgaurf.md', 'title': 'Decizia CMC privind elaborarea PUG',
                   'text': 'Planul urbanistic general al municipiului Chișinău.'})
            found = search('gradinita')
            self.assertEqual([item['title'] for item in found['items']], ['Extinderea grădiniței nr. 125'])
            self.assertIn('\x02', found['items'][0]['snippet'])
            self.assertEqual(found['counts'], {'project': 1, 'pdf': 0, 'docx': 0})
            self.assertEqual(search('planul urbanistic', kind='pdf')['items'][0]['kind'], 'pdf')
            self.assertEqual(search('', sector='centru')['counts']['project'], 1)
            self.assertEqual(search('"); DROP TABLE city_document; --')['items'], [])
        stats = self.client.get('/api/library/stats').json
        self.assertEqual(stats['sectors']['centru'], {'projects': 1, 'completed': 1, 'investment_mdl': 9_300_000})
        item = self.client.get('/api/library?q=grădinițele').json['items'][0]
        self.assertIn('grupe noi', self.client.get(f"/api/library/{item['id']}").json['text'])

    def test_only_employees_start_a_crawl(self):
        self.assertEqual(self.client.post('/api/library/refresh', json={}).status_code, 401)
        self.register()
        self.assertEqual(self.client.post('/api/library/refresh', json={}).status_code, 403)


class LibrarySortTests(unittest.TestCase):
    setUp = AccountTests.setUp
    tearDown = AccountTests.tearDown

    def test_newest_first_with_project_photo_dates(self):
        from datetime import date
        from app.library import image_date, search, store
        self.assertEqual(image_date('https://proiecte.chisinau.md/images/projects/1311/1311_17541147051.jpg'), date(2025, 8, 2))
        self.assertIsNone(image_date('https://example.md/logo.png'))
        with self.app.app_context():
            store({'url': 'https://p/1', 'kind': 'project', 'source': 'p', 'title': 'Grădiniță veche', 'text': 'grădinița', 'published_on': date(2024, 5, 1), 'project_number': 10})
            store({'url': 'https://p/2', 'kind': 'pdf', 'source': 'd', 'title': 'Decizie despre grădinițe grădinițe grădinițe', 'text': 'grădinița grădinița', 'published_on': date(2026, 7, 2)})
            store({'url': 'https://p/3', 'kind': 'project', 'source': 'p', 'title': 'Fără dată', 'text': 'grădinița'})
            store({'url': 'https://p/4', 'kind': 'project', 'source': 'p', 'title': 'Grădiniță nouă', 'text': 'grădinița', 'published_on': date(2026, 9, 1), 'project_number': 20})
            newest = [item['published_on'] for item in search('')['items']]
            self.assertEqual(newest, ['2026-09-01', '2026-07-02', '2024-05-01', None])
            self.assertEqual([item['published_on'] for item in search('gradinita')['items']][0], '2026-09-01')
            self.assertEqual(search('gradinita', sort='relevance')['items'][0]['title'], 'Decizie despre grădinițe grădinițe grădinițe')
        self.assertEqual(self.client.get('/api/library?sort=relevance&q=gradinita').status_code, 200)
        self.assertEqual(self.client.get('/api/library/999/cover').status_code, 404)


class SwipeTests(unittest.TestCase):
    setUp = AccountTests.setUp
    tearDown = AccountTests.tearDown
    register = AccountTests.register

    def add_projects(self, count=3):
        from datetime import date
        from app.library import store
        with self.app.app_context():
            return [store({'url': f'https://proiecte.chisinau.md/ro/pv-{i}', 'kind': 'project', 'source': 'p', 'title': f'Proiect {i}',
                           'image_url': f'https://proiecte.chisinau.md/images/projects/{i}/{i}_1754114705.jpg', 'sector': 'centru',
                           'published_on': date(2026, 1, i + 1), 'project_number': i}).id for i in range(count)]

    def test_deck_vote_and_results(self):
        ids = self.add_projects()
        deck = self.client.get('/api/swipe/deck').json
        self.assertEqual((len(deck['cards']), deck['remaining']), (3, 3))
        first = deck['cards'][0]['id']
        self.assertEqual(self.client.post('/api/swipe/vote', json={'document_id': first, 'value': 'like'}).json, {'likes': 1, 'dislikes': 0, 'value': 'like'})
        # Changing one's mind replaces the vote instead of adding one.
        self.assertEqual(self.client.post('/api/swipe/vote', json={'document_id': first, 'value': 'dislike'}).json['dislikes'], 1)
        self.assertEqual(self.client.get('/api/swipe/deck').json['remaining'], 2)
        other = self.app.test_client()
        self.assertEqual(other.post('/api/swipe/vote', json={'document_id': first, 'value': 'like'}).json, {'likes': 1, 'dislikes': 1, 'value': 'like'})
        results = self.client.get('/api/swipe/results').json
        self.assertEqual((results['votes'], results['voters']), (2, 2))
        self.assertEqual(results['items'][0]['votes'], 2)
        self.assertEqual(results['mine'], {str(first): 'dislike'})
        self.assertEqual(self.client.post('/api/swipe/vote', json={'document_id': ids[1], 'value': 'meh'}).status_code, 400)
        self.assertEqual(self.client.post('/api/swipe/vote', data={'document_id': ids[1]}).status_code, 415)

    def test_signing_in_does_not_reset_votes(self):
        ids = self.add_projects(2)
        self.client.post('/api/swipe/vote', json={'document_id': ids[0], 'value': 'like'})
        self.register()
        self.assertEqual(self.client.get('/api/swipe/deck').json['remaining'], 1)

    def test_only_employees_export_csv(self):
        ids = self.add_projects(1)
        self.client.post('/api/swipe/vote', json={'document_id': ids[0], 'value': 'like'})
        self.assertEqual(self.client.get('/api/swipe/results.csv').status_code, 401)
        self.register()
        self.assertEqual(self.client.get('/api/swipe/results.csv').status_code, 403)
        with self.app.app_context():
            db.session.execute(db.select(User)).scalar_one().role = 'employee'
            db.session.commit()
        response = self.client.get('/api/swipe/results.csv')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Proiect 0,centru,,1,0,1,100', response.get_data(as_text=True))
