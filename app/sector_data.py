"""Curated navigation topics, not live service counts or generated answers."""

CATEGORIES_RU = {
    'transport': {'name': 'Транспорт', 'description': 'Информация об общественном транспорте, маршрутах, остановках и движении в городе.', 'topics': ['Маршруты и остановки', 'Проездные', 'Движение и парковки']},
    'public': {'name': 'Общественные пространства', 'description': 'Куда обращаться по вопросам парков, уличного освещения, уборки и благоустройства района.', 'topics': ['Парки и зелёные зоны', 'Уличное освещение', 'Уборка']},
    'admin': {'name': 'Администрация', 'description': 'Сведения претуры о приёмах, петициях, документах и публичных объявлениях.', 'topics': ['Петиции и обращения', 'Приём граждан', 'Документы и формы']},
    'education': {'name': 'Образование', 'description': 'Муниципальные источники о детских садах, школах и образовательных мероприятиях.', 'topics': ['Детские сады', 'Школы', 'Занятия для детей']},
    'health': {'name': 'Здравоохранение', 'description': 'Публичная информация о медицинских учреждениях и муниципальных услугах здравоохранения.', 'topics': ['Медицинские учреждения', 'Муниципальные услуги', 'Контактная информация']},
    'culture': {'name': 'Культура и досуг', 'description': 'Объявления о местных событиях, библиотеках и культурных мероприятиях.', 'topics': ['События', 'Библиотеки', 'Культурные мероприятия']},
    'social': {'name': 'Социальная помощь', 'description': 'Официальные источники о социальных услугах, поддержке и ответственных учреждениях.', 'topics': ['Социальные услуги', 'Поддержка семей', 'Ответственные учреждения']},
    'housing': {'name': 'Жильё и коммунальные услуги', 'description': 'Отправная точка для вопросов о жилье, управлении домом и коммунальных услугах.', 'topics': ['Управление домом', 'Вода и канализация', 'Отопление и услуги']},
}

CATEGORIES = [
    {
        'name': 'Transport', 'icon': 'transport',
        'description': 'Găsiți informații despre transportul public, rute, stații și circulația în oraș.',
        'topics': ['Rute și stații', 'Abonamente', 'Circulație și parcări'],
        'keywords': 'autobuz troleibuz transport rute statii abonamente circulatie parcari parcare',
    },
    {
        'name': 'Spații publice', 'icon': 'public',
        'description': 'Aflați cui vă puteți adresa pentru parcuri, iluminat stradal, curățenie și amenajarea cartierului.',
        'topics': ['Parcuri și spații verzi', 'Iluminat stradal', 'Curățenie'],
        'keywords': 'parc copaci spatii verzi iluminat felinar strada curatenie deseuri gunoi groapa trotuar',
    },
    {
        'name': 'Administrație', 'icon': 'admin',
        'description': 'Consultați informațiile preturii despre audiențe, petiții, documente și anunțuri publice.',
        'topics': ['Petiții și sesizări', 'Audiențe', 'Acte și formulare'],
        'keywords': 'administratie primarie pretura petitie sesizare audienta acte documente formular cerere program contact',
    },
    {
        'name': 'Educație', 'icon': 'education',
        'description': 'Porniți de la sursele municipale pentru informații despre grădinițe, școli și activități educaționale.',
        'topics': ['Grădinițe', 'Școli', 'Activități pentru copii'],
        'keywords': 'educatie gradinita scoala scoli inscriere copil copii elev liceu',
    },
    {
        'name': 'Sănătate', 'icon': 'health',
        'description': 'Căutați informații publice despre instituțiile medicale și serviciile municipale de sănătate.',
        'topics': ['Instituții medicale', 'Servicii municipale', 'Informații de contact'],
        'keywords': 'sanatate medic policlinica spital medical clinica',
    },
    {
        'name': 'Cultură și divertisment', 'icon': 'culture',
        'description': 'Descoperiți anunțurile despre evenimente locale, biblioteci și activități culturale.',
        'topics': ['Evenimente', 'Biblioteci', 'Activități culturale'],
        'keywords': 'cultura divertisment eveniment biblioteca concert teatru festival muzeu',
    },
    {
        'name': 'Asistență socială', 'icon': 'social',
        'description': 'Consultați sursele oficiale pentru servicii sociale, sprijin comunitar și instituțiile responsabile.',
        'topics': ['Servicii sociale', 'Sprijin pentru familii', 'Instituții responsabile'],
        'keywords': 'asistenta social ajutor sprijin familie pensionar dizabilitate indemnizatie',
    },
    {
        'name': 'Locuințe și utilități', 'icon': 'housing',
        'description': 'Găsiți punctul de pornire pentru întrebări despre locuințe, administrarea blocului și utilități.',
        'topics': ['Administrarea blocului', 'Apă și canalizare', 'Încălzire și utilități'],
        'keywords': 'locuinta locuinte utilitati bloc apa canalizare incalzire termoficare asociatie locatari',
    },
]

for category in CATEGORIES:
    category['ru'] = CATEGORIES_RU[category['icon']]

# Links are public official websites. No invented local inventories or counts.
SECTOR_RU = {
    'centru': ('Центр', 'От центра города до Телецентра. Выберите раздел и изучите источники по вашему сектору.'),
    'buiucani': ('Буюкань', 'Услуги, повседневные вопросы и местная информация для жителей сектора Буюкань.'),
    'botanica': ('Ботаника', 'Отправная точка для публичных услуг и вопросов жителей сектора Ботаника.'),
    'ciocana': ('Чокана', 'Разделы и публичная информация для сектора Чокана.'),
    'rascani': ('Рышкань', 'Местная информация и источники для вопросов жителей сектора Рышкань.'),
}

SECTOR_INFO = {
    'centru': ('Centru', 'De la centrul orașului la Telecentru. Alegeți un domeniu și consultați sursele pentru sectorul dumneavoastră.', 'https://chisinaucentru.md/'),
    'buiucani': ('Buiucani', 'Servicii, întrebări de zi cu zi și informații locale pentru locuitorii sectorului Buiucani.', 'https://preturabuiucani.md/'),
    'botanica': ('Botanica', 'Un punct de pornire pentru serviciile publice și întrebările locuitorilor sectorului Botanica.', 'https://botanica.md/'),
    'ciocana': ('Ciocana', 'Explorați domeniile de interes și informațiile publice pentru sectorul Ciocana.', 'https://ciocana.md/'),
    'rascani': ('Râșcani', 'Informații și surse locale pentru întrebările locuitorilor sectorului Râșcani.', 'https://rascani.md/'),
}

SECTORS = {
    sector_id: {'id': sector_id, 'label': label, 'description': description,
                'website': website, 'categories': CATEGORIES,
                'ru': {'label': SECTOR_RU[sector_id][0], 'description': SECTOR_RU[sector_id][1]}}
    for sector_id, (label, description, website) in SECTOR_INFO.items()
}

CONTACTS = {
    'centru': ('str. Bulgară 43', '+37322271513', '022 27 15 13', 'pretura@chisinaucentru.md', 'https://chisinaucentru.md/petitii-online/'),
    'buiucani': ('str. Mihai Viteazul 2', '+37322295071', '022 29 50 71', 'buiucani@pmc.md', 'https://preturabuiucani.md/depune-o-petitie/'),
    'botanica': ('str. Teilor 10', '+37322767575', '022 76 75 75', 'pretura.botanica@pmc.md', 'https://botanica.md/'),
    'ciocana': ('bd. Mircea cel Bătrân 4/3', '+37322333434', '022 33 34 34', 'info@pretura.ciocana.md', 'https://ciocana.md/petitii-online'),
    'rascani': ('str. Kiev 3', '+37322441098', '022 44 10 98', 'pretura.riscani@gmail.com', 'https://www.chisinau.md/ro/petitions'),
}
for sector_id, (address, phone, phone_label, email, petitions) in CONTACTS.items():
    SECTORS[sector_id]['contact'] = {'address': address, 'phone': phone, 'phone_label': phone_label, 'email': email}
    SECTORS[sector_id]['petitions_url'] = petitions
    SECTORS[sector_id]['verified_on'] = '2026-09-26'
