"""Package local assets into a portable, offline HTML without altering source files."""
from pathlib import Path
base=Path(__file__).parent
s=(base/'index.html').read_text().replace('<link rel="stylesheet" href="style.css">','<style>'+(base/'style.css').read_text()+'</style>')
for name in ['data.js','model.js','app.js']:
 s=s.replace(f'<script src="{name}"></script>','<script>'+(base/name).read_text().replace('</script','<\\/script')+'</script>')
(base/'neihu-dashboard-v2.html').write_text(s)
print('Created neihu-dashboard-v2.html')
