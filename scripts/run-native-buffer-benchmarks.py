"""Usage: python3 scripts/run-native-buffer-benchmarks.py NODE LEGACY_BUNDLE NATIVE_BUNDLE SAMPLE_DIR OUTPUT [REPEATS]"""
import json
import pathlib
import subprocess
import sys

node, legacy_bundle, native_bundle, sample_dir, output = sys.argv[1:6]
repeats = int(sys.argv[6]) if len(sys.argv) > 6 else 2
inputs = sorted(pathlib.Path(sample_dir).glob('*.city.json*'), key=lambda p: p.stat().st_size)
checksums = {}
with open(output, 'w') as sink:
    for repeat in range(repeats):
        for i, path in enumerate(inputs):
            modes = [('legacy', legacy_bundle), ('native', native_bundle)]
            if (i + repeat) % 2:
                modes.reverse()
            for mode, bundle in modes:
                result = subprocess.run([
                    node, '--expose-gc', '--max-old-space-size=8192',
                    'scripts/benchmark-native-buffers.mjs', bundle, str(path), mode,
                ], capture_output=True, text=True, check=True)
                record = json.loads(result.stdout)
                record['repeat'] = repeat
                check = (record['traversalChecksum'], record['meshChecksum'], record['modelHash'])
                if path.name in checksums:
                    assert check == checksums[path.name], f'Output differs: {path.name} {mode}'
                checksums[path.name] = check
                sink.write(json.dumps(record) + '\n')
                sink.flush()
                print(repeat + 1, path.name, mode,
                      f"{record['modelBytes'] / 1048576:.1f} MiB",
                      f"parse {record['parseMs']:.1f} ms", flush=True)
