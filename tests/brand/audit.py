"""Validate the brand package without executing SVG content. Python stdlib only."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'assets/brand'
MASTER = 'M8 8L27 18V49C27 66 53 66 53 49V34L72 24V49C72 94 8 94 8 49Z'
ACCENT = 'M43 12L72 0V17L43 31Z'
COLORS = {'#0F3D32', '#F7F4EC', '#C9AE78', '#1F2937', '#000000', '#FFFFFF'}
files = sorted(BRAND.glob('*.svg')) + sorted((ROOT / 'brand').glob('*.svg'))
for file in files:
    raw = file.read_text()
    assert not re.search(r'<!DOCTYPE|<!ENTITY|<\?', raw, re.I), file
    root = ET.fromstring(raw)
    assert root.tag == '{http://www.w3.org/2000/svg}svg', file
    vb = [float(n) for n in root.attrib['viewBox'].split()]
    assert len(vb) == 4 and vb[2] > 0 and vb[3] > 0, file
    paths = []
    for element in root.iter():
        assert element.tag.split('}')[-1] in {'svg', 'g', 'path', 'rect', 'title'}, file
        for key, value in element.attrib.items():
            assert not key.lower().startswith('on'), file
            assert key in {'xmlns', 'viewBox', 'role', 'aria-label', 'd', 'fill', 'fill-rule', 'transform', 'x', 'y', 'width', 'height', 'rx'}, (file, key)
            assert not re.search(r'url\(|https?://|javascript:|data:', value, re.I), file
            if key == 'fill':
                assert value in COLORS, (file, value)
        if 'd' in element.attrib:
            paths.append(element.attrib['d'])
    assert MASTER in paths and ACCENT in paths, file
    assert root.attrib.get('role') == 'img' and root.attrib.get('aria-label') == 'UniBOS', file
    assert root.find('{http://www.w3.org/2000/svg}title').text == 'UniBOS', file
for legacy, canonical in [('symbol-primary', 'app-icon'), ('app-icon', 'app-icon'), ('favicon', 'favicon')]:
    assert (ROOT / f'brand/{legacy}.svg').read_bytes() == (BRAND / f'{canonical}.svg').read_bytes()
print(f'PASS: {len(files)} SVGs; canonical geometry, allowed colors, safe elements/attributes, accessible names, legacy aliases')
