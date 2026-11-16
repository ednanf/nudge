"""Publish the latest successfully deployed main commit's Wiki in GitHub Actions.

Uses only the ephemeral GITHUB_TOKEN (contents:write, statuses:read). Never prints
status target URLs, credentials, deployment addresses or API response bodies.
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPOSITORY = 'ednanf/nudge'


def git(*arguments, cwd=ROOT, capture=False):
    return subprocess.run(['git', *arguments], cwd=cwd, check=True,
                          text=True, stdout=subprocess.PIPE if capture else None).stdout


def api(path):
    request = urllib.request.Request(
        'https://api.github.com/repos/' + REPOSITORY + '/' + path,
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                 'Accept': 'application/vnd.github+json',
                 'X-GitHub-Api-Version': '2022-11-28'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'GitHub API request failed with status {error.code}; response suppressed.') from None


def is_current_deployment(sha):
    if api('git/ref/heads/main')['object']['sha'] != sha:
        return False
    statuses = api('commits/' + sha + '/statuses?per_page=100')
    latest = next((status for status in statuses
                   if status['context'] == 'Vercel'
                   and (status.get('creator') or {}).get('login') == 'vercel[bot]'), None)
    return latest is not None and latest['state'] == 'success'


def main():
    if os.environ.get('GITHUB_REPOSITORY') != REPOSITORY:
        raise SystemExit('Wiki publication is restricted to the owning repository.')
    event_name = os.environ.get('GITHUB_EVENT_NAME')
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    sha = git('rev-parse', 'HEAD', capture=True).strip()
    if event_name == 'status':
        if (event.get('sha') != sha or event.get('state') != 'success'
                or event.get('context') != 'Vercel'
                or (event.get('sender') or {}).get('login') != 'vercel[bot]'):
            print('Skipped an unrelated or superseded deployment event.')
            return
    elif event_name != 'workflow_dispatch':
        raise SystemExit('Unsupported publication event.')
    if not is_current_deployment(sha):
        print('Skipped: the latest main commit does not have a successful Vercel deployment.')
        return

    subprocess.run(['gh', 'auth', 'setup-git', '--hostname', 'github.com'], check=True)
    with tempfile.TemporaryDirectory(prefix='nudge-wiki-') as directory:
        checkout = Path(directory) / 'wiki'
        git('clone', '--quiet', 'https://github.com/' + REPOSITORY + '.wiki.git', str(checkout))
        subprocess.run([sys.executable, str(ROOT / 'scripts/build-wiki.py'), str(checkout)],
                       env={**os.environ, 'WIKI_SOURCE_SHA': sha}, check=True)
        git('diff', '--check', cwd=checkout)
        if subprocess.run(['git', 'diff', '--quiet'], cwd=checkout).returncode == 0:
            # Also check untracked files when a new source page is introduced.
            if not git('ls-files', '--others', '--exclude-standard', capture=True, cwd=checkout).strip():
                print('Wiki already matches the deployed documentation.')
                return
        git('config', 'user.name', 'github-actions[bot]', cwd=checkout)
        git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com', cwd=checkout)
        git('add', '*.md', cwd=checkout)
        git('commit', '-m', 'Sync documentation for production ' + sha[:12], cwd=checkout)
        # Do not let a queued older run overwrite documentation for a newer main deployment.
        if not is_current_deployment(sha):
            print('Skipped publication because the production branch changed while building.')
            return
        git('push', '--quiet', 'origin', 'HEAD', cwd=checkout)
        print('Published Wiki for deployed commit ' + sha[:12] + '.')


if __name__ == '__main__':
    main()
