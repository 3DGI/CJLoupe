"""Run fresh processes sequentially to avoid CPU/memory contention.
Usage: python3 scripts/run-typed-buffer-benchmarks.py NODE BUNDLE SAMPLE_DIR OUTPUT [REPEATS]
"""
import json
import pathlib
import subprocess
import sys

node, bundle, sample_dir, output = sys.argv[1:5]
repeats = int(sys.argv[5]) if len(sys.argv) > 5 else 2
inputs = sorted(pathlib.Path(sample_dir).glob('*.city.json*'), key=lambda p: p.stat().st_size)
checksums = {}
with open(output, 'w') as sink:
    for repeat in range(repeats):
        for i, path in enumerate(inputs):
            modes = ['original', 'coordinates', 'packed']
            shift = (i + repeat) % len(modes)
            modes = modes[shift:] + modes[:shift]
            for mode in modes:
                result = subprocess.run([
                    node, '--expose-gc', '--max-old-space-size=8192',
                    'scripts/benchmark-typed-buffers.mjs', bundle, str(path), mode,
                ], capture_output=True, text=True, check=True)
                record = json.loads(result.stdout)
                record['repeat'] = repeat
                check = (record['traversalChecksum'], record['meshChecksum'])
                if path.name in checksums:
                    assert check == checksums[path.name], f'Output differs: {path.name} {mode}'
                checksums[path.name] = check
                sink.write(json.dumps(record) + '\n')
                sink.flush()
                print(repeat + 1, path.name, mode,
                      f"{record['modelBytes'] / 1048576:.1f} MiB",
                      f"conversion {record['conversionMs']:.1f} ms", flush=True)
