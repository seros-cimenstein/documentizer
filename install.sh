#!/usr/bin/env bash
# Link extension/ and the /strictly-docs command into omp so edits take effect on the next omp start.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}"

# link SOURCE DEST: symlink, refusing to replace a real file.
link() {
    mkdir -p "$(dirname "$2")"
    if [[ -e $2 && ! -L $2 ]]; then
        echo "refusing to replace $2 (a real file, not our link); move it away first" >&2
        exit 1
    fi
    ln -sfn "$1" "$2"
    echo "linked $2 -> $1"
}

link "$here/extension" "$agent_dir/extensions/documentizer"
link "$here/commands/strictly-docs.md" "$agent_dir/commands/strictly-docs.md"
