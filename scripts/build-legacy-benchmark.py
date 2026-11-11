"""Build the pre-buffer implementation without changing the working tree.
Usage: python3 scripts/build-legacy-benchmark.py BUN OUTPUT_BUNDLE
"""
import io
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile

revision = 'd15893bb98e016e86e7078a4fc57972ab7b50ddf'
bun, output = sys.argv[1:3]
root = pathlib.Path.cwd()
archive = subprocess.run(['git', 'archive', revision, 'src'], capture_output=True, check=True).stdout
with tempfile.TemporaryDirectory(prefix='cjloupe-baseline-') as temp:
    folder = pathlib.Path(temp)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(folder, filter='data')
    shutil.copytree(root / 'prototypes' / 'typed-buffers', folder / 'prototypes' / 'typed-buffers')
    (folder / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    subprocess.run([bun, 'build', str(folder / 'prototypes' / 'typed-buffers' / 'entry.ts'), '--target=node', '--outfile=' + str(pathlib.Path(output).resolve())], check=True)
