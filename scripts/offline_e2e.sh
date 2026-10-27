#!/usr/bin/env bash
# Důkaz provozu bez sítě (Linux): spustí server a celý e2e test v síťovém jmenném prostoru, který má
# jen loopback (žádný internet, žádná proxy). Vyžaduje `unshare` (root nebo uživatelské jmenné prostory).
# Poctivé omezení: hlas v tomto testu podstrkuje testovací harness; ověřuje se aplikace, ne řeč.
# Pro důkaz se skutečným hlasem: python3 scripts/generate_audio.py --require-offline (na stroji s modelem).
set -euo pipefail
cd "$(dirname "$0")/.."
unshare --net bash -c '
  set -e
  if command -v ip >/dev/null; then ip link set lo up; else
    python3 -c "
import fcntl, socket, struct
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
flags = struct.unpack(\"16sH14x\", fcntl.ioctl(s, 0x8913, struct.pack(\"16sH14x\", b\"lo\", 0)))[1]
fcntl.ioctl(s, 0x8914, struct.pack(\"16sH14x\", b\"lo\", flags | 1))"
  fi
  for v in HTTPS_PROXY https_proxy HTTP_PROXY http_proxy ALL_PROXY all_proxy NO_PROXY no_proxy; do unset $v; done
  echo "== síť uvnitř jmenného prostoru =="
  echo "  rozhraní v tomto jmenném prostoru: $(awk "NR>2{gsub(\":\",\"\",\$1); printf \"%s \", \$1}" /proc/net/dev)"
  if python3 -c "import socket; socket.create_connection((\"1.1.1.1\", 53), timeout=2)" 2>/dev/null; then echo "CHYBA: síť je dostupná"; exit 3; else echo "  spojení ven: nedostupné (ověřeno)"; fi
  python3 scripts/generate_audio.py --require-offline 2>&1 | head -3 | sed "s/^/  /" || true
  echo "== e2e bez sítě =="
  node tests/e2e/e2e.mjs
'
