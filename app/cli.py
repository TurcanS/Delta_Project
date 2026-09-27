import getpass
import json
import shutil
from datetime import timedelta
from pathlib import Path

import click

from app import db
from app.models import ROLES, Complaint, ComplaintStatus, User, utcnow

SEED = Path(__file__).resolve().parent / 'seed' / 'reports'
# photo, after-photo, sector, category, status, days open, days to fix, confirmations, title, address, description
DEMO_REPORTS = [
    ('pothole-villeray', 'asphalt-fresh', 'botanica', 'pothole', 'solved', 24, 9, 23, 'Groapă adâncă pe carosabil', 'str. Decebal 76', 'Groapă de aproape jumătate de metru, lângă trecerea de pietoni. Mașinile o ocolesc pe contrasens.'),
    ('bin-hamburg', 'street-sadoveanu', 'centru', 'waste', 'solved', 19, 3, 11, 'Coș de gunoi plin de o săptămână', 'bd. Ștefan cel Mare 134', 'Coșul de lângă stația de troleibuz nu a fost golit din weekend. Gunoiul se împrăștie pe trotuar.'),
    ('pothole-dilova', None, 'centru', 'pothole', 'reported', 2, 0, 14, 'Groapă cu margini rupte la intersecție', 'str. Mihai Eminescu colț cu str. Bulgară', 'Asfaltul s-a surpat după ploaie. Groapa e greu de văzut seara.'),
    ('bins-fibichova', None, 'rascani', 'waste', 'in_progress', 6, 0, 31, 'Deșeuri lângă containerele de reciclare', 'str. Alecu Russo 15', 'Cutii și saci lăsați lângă containere, care sunt pline. Vântul duce hârtia în curtea blocului.'),
    ('lamp-verhorechye', None, 'buiucani', 'lighting', 'reported', 4, 0, 7, 'Stâlp de iluminat înclinat, felinar stins', 'str. Ion Creangă 49', 'Stâlpul s-a înclinat spre carosabil și becul nu mai funcționează de două săptămâni.'),
    ('flypost', None, 'centru', 'ads', 'reported', 1, 0, 3, 'Afișe lipite pe vitrina unui spațiu gol', 'str. Armenească 27', 'Afișe de concerte lipite peste vitrină și pe ușă. Se adaugă altele în fiecare săptămână.'),
    ('flypost-belfast', None, 'botanica', 'ads', 'in_progress', 9, 0, 5, 'Panouri de afișaj neautorizate pe zid', 'bd. Dacia 22', 'Două panouri publicitare prinse direct pe fațada clădirii, fără autorizație vizibilă.'),
    ('sidewalk-montevideo', None, 'ciocana', 'sidewalk', 'reported', 3, 0, 18, 'Plăci de trotuar ridicate de rădăcini', 'bd. Mircea cel Bătrân 12', 'Plăcile s-au ridicat în jurul copacului. Cu căruciorul nu se poate trece.'),
    ('pothole-monaghan', None, 'ciocana', 'pothole', 'in_progress', 12, 0, 9, 'Asfalt fisurat pe drumul spre școală', 'str. Petru Zadnipru 6', 'Fisuri și o groapă largă pe banda din dreapta, chiar la intrarea spre școală.'),
    ('sidewalk-bytom', None, 'rascani', 'sidewalk', 'reported', 5, 0, 6, 'Trotuar spart la ieșirea din bloc', 'str. Kiev 7', 'Plăcile lipsesc pe o porțiune de doi metri, iar betonul de dedesubt s-a fărâmițat.'),
    ('graffiti-king', None, 'buiucani', 'vandalism', 'reported', 8, 0, 2, 'Desene pe fațada unei clădiri istorice', 'str. Vasile Lupu 3', 'Desen cu vopsea pe tencuiala nouă a clădirii, lângă intrare.'),
    ('patch-sheffield', None, 'buiucani', 'pothole', 'reported', 11, 0, 12, 'Petice de asfalt care se desfac', 'str. Alba Iulia 188', 'Reparațiile din primăvară s-au desprins; au rămas gropi mici pe toată lungimea străzii.'),
]


def register_cli(app):
    @app.cli.command('create-user')
    @click.argument('email')
    @click.option('--name', required=True, help='Full name shown in the portal.')
    @click.option('--role', type=click.Choice(ROLES), default='citizen', show_default=True)
    @click.option('--password', envvar='NEW_USER_PASSWORD', help='Prompted when omitted.')
    def create_user_command(email, name, role, password):
        """Create an account from the command line (e.g. demo or employee accounts)."""
        from app.auth import MIN_PASSWORD, create_user
        email = email.strip().lower()
        if db.session.execute(db.select(User).filter_by(email=email)).scalar():
            raise click.ClickException(f'{email} already exists')
        password = password or getpass.getpass('Password: ')
        if len(password) < MIN_PASSWORD:
            raise click.ClickException(f'Password must have at least {MIN_PASSWORD} characters')
        user = create_user(email, password, name, role=role)
        click.echo(f'Created {user.role} {user.email} (id {user.id})')

    @app.cli.command('seed-reports')
    def seed_reports_command():
        """Fill the public reports board with demo reports (photos from Wikimedia Commons)."""
        from app.reports import photo_dir
        if db.session.execute(db.select(Complaint).limit(1)).scalar():
            raise click.ClickException('The board already has reports; seed only an empty board.')
        credits = json.loads((SEED / 'credits.json').read_text())
        folder = photo_dir()
        now = utcnow()

        def copy(name):
            shutil.copyfile(SEED / f'{name}.jpg', folder / f'demo-{name}.jpg')
            return f'demo-{name}.jpg'

        def credit(*names):
            return '; '.join(', '.join(part for part in (credits[n]['author'] if credits[n]['author'] != 'Unknown' else '', credits[n]['license'], 'Wikimedia Commons') if part)
                             for n in names if n)[:300]

        for photo, after, sector, category, status, days, fix_days, confirmations, title, address, body in DEMO_REPORTS:
            created = now - timedelta(days=days, hours=len(title) % 9)
            solved = created + timedelta(days=fix_days) if status == 'solved' else None
            db.session.add(Complaint(
                title=title, body=body, sector=sector, category=category, address=address,
                status={'reported': ComplaintStatus.sent, 'in_progress': ComplaintStatus.approved, 'solved': ComplaintStatus.solved}[status],
                confirmations=confirmations, image_filename=copy(photo), after_image_filename=copy(after) if after else None,
                resolution_note='Lucrare finalizată de serviciul municipal responsabil.' if solved else None,
                photo_credit=credit(photo, after), created_at=created, updated_at=solved or created, resolved_at=solved))
        db.session.commit()
        click.echo(f'Added {len(DEMO_REPORTS)} demo reports')


    @app.cli.command('crawl-library')
    @click.option('--projects', default=150, show_default=True, help='Newest project pages to collect.')
    @click.option('--documents', default=60, show_default=True, help='PDF/DOCX files to collect.')
    @click.option('--refresh', is_flag=True, help='Fetch again what is already in the library.')
    def crawl_library_command(projects, documents, refresh):
        """Collect city projects and official documents for the library (polite, robots.txt aware)."""
        from app.library import crawl
        added = crawl(projects=projects, documents=documents, refresh=refresh, log=click.echo)
        click.echo(f"Added or updated: {added['project']} projects, {added['pdf']} PDF, {added['docx']} DOCX")
