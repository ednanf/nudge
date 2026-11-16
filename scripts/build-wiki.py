"""Build GitHub Wiki Markdown from docs/wiki without changing source documents.

Usage: python3 scripts/build-wiki.py /path/to/nudge.wiki-checkout
Publish the resulting files by committing/pushing the separate Wiki repository.
"""
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs' / 'wiki'
REPO = 'https://github.com/ednanf/nudge'
PAGES = {
    'README.md': ('Home', 'Home'),
    'setup-and-deployment.md': ('Setup-and-deployment', 'Setup and deployment'),
    'architecture.md': ('Architecture', 'Architecture'),
    'data-and-api.md': ('Data-model-and-API', 'Data model and API'),
    'project-configuration.md': ('Project-configuration', 'Project configuration'),
    'execution-and-scheduling.md': ('Execution-and-scheduling', 'Execution and scheduling'),
    'security.md': ('Security', 'Security'),
    'operations-and-troubleshooting.md': ('Operations-and-troubleshooting', 'Operations and troubleshooting'),
    'decisions.md': ('Technical-decisions', 'Technical decisions'),
}


def rewrite_links(text, source):
    def rewrite(match):
        target = match.group(1)
        parts = urlsplit(target)
        if parts.scheme or parts.netloc or not parts.path:
            return match.group(0)
        path = (source.parent / parts.path).resolve()
        if not path.is_relative_to(ROOT) or not path.exists():
            raise ValueError(f'{source.name}: invalid relative link {target}')
        if path.parent == SOURCE and path.name in PAGES:
            url = f'{REPO}/wiki/{PAGES[path.name][0]}'
        else:
            kind = 'tree' if path.is_dir() else 'blob'
            url = f'{REPO}/{kind}/main/{quote(path.relative_to(ROOT).as_posix(), safe="/")}'
        if parts.fragment:
            url += '#' + parts.fragment
        return '](' + url + ')'
    return re.sub(r'\]\(([^)]+)\)', rewrite, text)


def build(destination):
    if destination.resolve() == SOURCE:
        raise ValueError('Output must not overwrite docs/wiki.')
    destination.mkdir(parents=True, exist_ok=True)
    expected = {slug + '.md' for slug, _ in PAGES.values()} | {'_Sidebar.md', '_Footer.md'}
    # Existing pages are preserved. The builder owns only this explicit set.
    for filename, (slug, _) in PAGES.items():
        source = SOURCE / filename
        (destination / (slug + '.md')).write_text(rewrite_links(source.read_text(), source))
    sidebar = '# Nudge\n\n' + '\n'.join(f'- [{title}]({REPO}/wiki/{slug})' for slug, title in PAGES.values())
    sidebar += f'\n\n[Repository]({REPO}) · [Documentation source]({REPO}/tree/main/docs/wiki)\n'
    (destination / '_Sidebar.md').write_text(sidebar)
    notice = (ROOT / 'LICENSE').read_text().splitlines()[0]
    (destination / '_Footer.md').write_text(notice + f'\n\n[Source documentation]({REPO}/tree/main/docs/wiki) · [License]({REPO}/blob/main/LICENSE)\n')
    for filename in expected:
        text = (destination / filename).read_text()
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if target.startswith(REPO + '/wiki/'):
                slug = target.split('/wiki/', 1)[1].split('#', 1)[0]
                if slug + '.md' not in expected:
                    raise ValueError(f'{filename}: missing Wiki page {slug}')
        if re.search(r'\]\((?:\.\.?/)', text):
            raise ValueError(f'{filename}: unresolved repository-relative link')
    print(f'Built {len(PAGES)} Wiki pages, sidebar and footer in {destination}.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 scripts/build-wiki.py OUTPUT_DIRECTORY')
    build(Path(sys.argv[1]).expanduser())
