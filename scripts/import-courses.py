"""Import user-provided PDFs without modifying the original materials."""
import json
import shutil
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
downloads = Path('C:/Users/boss2/Downloads')
mapping = {'chat_operator': 'chat_operator', 'call_center_operator': 'callcenter_operator',
           'insurance_agent': 'insurance_agent', 'affiliate_manager': 'affiliate_manager'}
courses = {}
for key, prefix in mapping.items():
    lessons = []
    for day in range(1, 6):
        source = downloads / (f'{prefix}-day{day}.pdf')
        if key == 'chat_operator':
            source = downloads / 'Telegram Desktop' / ('urok-1.pdf' if day == 1 else f'{prefix}-day{day}.pdf')
        reader = PdfReader(source)
        target = root / 'materials' / key
        target.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target / f'day{day}.pdf')
        cover = reader.pages[0].extract_text().strip().splitlines()
        title = ' '.join(line.strip() for line in cover[1:] if 'HR-PRIME' not in line).strip()
        lessons.append({'day': day, 'title': title,
            'text': '\n\n'.join(page.extract_text() for page in reader.pages[1:]),
            'source': source.name})
    courses[key] = lessons
(root / 'src' / 'courses.json').write_text(json.dumps(courses, ensure_ascii=False, indent=2), encoding='utf8')
print('Imported', sum(map(len, courses.values())), 'lessons')
