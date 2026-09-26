"""Curated navigation topics, not live service counts or generated answers."""

CATEGORIES = [
    {
        'name': 'Transport', 'icon': 'transport',
        'description': 'Găsește informații despre transportul public, rute, stații și circulația în oraș.',
        'topics': ['Rute și stații', 'Abonamente', 'Circulație și parcări'],
        'keywords': 'autobuz troleibuz transport rute statii abonamente circulatie parcari parcare',
    },
    {
        'name': 'Spații publice', 'icon': 'public',
        'description': 'Află cui te poți adresa pentru parcuri, iluminat stradal, curățenie și amenajarea cartierului.',
        'topics': ['Parcuri și spații verzi', 'Iluminat stradal', 'Curățenie'],
        'keywords': 'parc copaci spatii verzi iluminat felinar strada curatenie deseuri gunoi groapa trotuar',
    },
    {
        'name': 'Administrație', 'icon': 'admin',
        'description': 'Consultă informațiile preturii despre audiențe, petiții, documente și anunțuri publice.',
        'topics': ['Petiții și sesizări', 'Audiențe', 'Acte și formulare'],
        'keywords': 'administratie primarie pretura petitie sesizare audienta acte documente formular cerere program contact',
    },
    {
        'name': 'Educație', 'icon': 'education',
        'description': 'Pornește de la sursele municipale pentru informații despre grădinițe, școli și activități educaționale.',
        'topics': ['Grădinițe', 'Școli', 'Activități pentru copii'],
        'keywords': 'educatie gradinita scoala scoli inscriere copil copii elev liceu',
    },
    {
        'name': 'Sănătate', 'icon': 'health',
        'description': 'Caută informații publice despre instituțiile medicale și serviciile municipale de sănătate.',
        'topics': ['Instituții medicale', 'Servicii municipale', 'Informații de contact'],
        'keywords': 'sanatate medic policlinica spital medical clinica',
    },
    {
        'name': 'Cultură și divertisment', 'icon': 'culture',
        'description': 'Descoperă anunțurile despre evenimente locale, biblioteci și activități culturale.',
        'topics': ['Evenimente', 'Biblioteci', 'Activități culturale'],
        'keywords': 'cultura divertisment eveniment biblioteca concert teatru festival muzeu',
    },
    {
        'name': 'Asistență socială', 'icon': 'social',
        'description': 'Consultă sursele oficiale pentru servicii sociale, sprijin comunitar și instituțiile responsabile.',
        'topics': ['Servicii sociale', 'Sprijin pentru familii', 'Instituții responsabile'],
        'keywords': 'asistenta social ajutor sprijin familie pensionar dizabilitate indemnizatie',
    },
    {
        'name': 'Locuințe și utilități', 'icon': 'housing',
        'description': 'Găsește punctul de pornire pentru întrebări despre locuințe, administrarea blocului și utilități.',
        'topics': ['Administrarea blocului', 'Apă și canalizare', 'Încălzire și utilități'],
        'keywords': 'locuinta locuinte utilitati bloc apa canalizare incalzire termoficare asociatie locatari',
    },
]

# Links are public official websites. No invented local inventories or counts.
SECTOR_INFO = {
    'centru': ('Centru', 'De la centrul orașului la Telecentru. Alege un domeniu și consultă sursele pentru sectorul tău.', 'https://chisinaucentru.md/'),
    'buiucani': ('Buiucani', 'Servicii, întrebări de zi cu zi și informații locale pentru locuitorii sectorului Buiucani.', 'https://preturabuiucani.md/'),
    'botanica': ('Botanica', 'Un punct de pornire pentru serviciile publice și întrebările locuitorilor sectorului Botanica.', 'https://botanica.md/'),
    'ciocana': ('Ciocana', 'Explorează domeniile de interes și informațiile publice pentru sectorul Ciocana.', 'https://ciocana.md/'),
    'rascani': ('Râșcani', 'Informații și surse locale pentru întrebările locuitorilor sectorului Râșcani.', 'https://rascani.md/'),
}

SECTORS = {
    sector_id: {'id': sector_id, 'label': label, 'description': description,
                'website': website, 'categories': CATEGORIES}
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
