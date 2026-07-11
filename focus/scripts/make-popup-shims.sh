#!/bin/sh
# Classic-script shims for Safari iOS popup (ES modules часто ломаются).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXT="$ROOT/focus/extension"
ST="$EXT/shared/storage.js"
UI="$EXT/popup/ui.js"

python3 - "$ST" "$EXT/popup/storage-shim.js" <<'PY'
import re, sys
src, out = sys.argv[1], sys.argv[2]
text = open(src).read()
text = re.sub(r'^export ', '', text, flags=re.M)
names = re.findall(r'^(?:async )?function (\w+)', text, flags=re.M)
names = [n for n in names if n not in ('readStore', 'writeStore', 'getPending', 'inScheduleWindow', 'applyPending', 'hashPin')]
body = '/* auto: Safari iOS popup shim */\n"use strict";\n' + text
body += '\nglobalThis.VFocusStorage = {\n' + ',\n'.join(f'  {n}' for n in names) + '\n};\n'
open(out, 'w').write(body)
print('storage-shim.js')
PY

python3 - "$UI" "$EXT/popup/ui-shim.js" <<'PY'
import re, sys
src, out = sys.argv[1], sys.argv[2]
text = open(src).read()
text = text.replace('export const GROUP_ORDER', 'const GROUP_ORDER')
text = re.sub(r'^export ', '', text, flags=re.M)
names = re.findall(r'^(?:async )?function (\w+)', text, flags=re.M)
names = ['GROUP_ORDER'] + names
body = '/* auto: Safari iOS popup shim */\n"use strict";\n' + text
body += '\nglobalThis.VFocusUi = {\n' + ',\n'.join(f'  {n}' for n in names) + '\n};\n'
open(out, 'w').write(body)
print('ui-shim.js')
PY
