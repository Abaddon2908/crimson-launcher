#!/usr/bin/env bash
# Установка сайта мониторинга на сервер с панелью Hestia.
# Запуск (под root, из папки site):  bash deploy/hestia-setup.sh nlauncher.ru
set -euo pipefail

DOMAIN="${1:-nlauncher.ru}"
SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HESTIA=/usr/local/hestia
export PATH="$PATH:$HESTIA/bin"

say()  { printf '\n\033[1;35m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mОшибка:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "запустите от root: sudo bash deploy/hestia-setup.sh $DOMAIN"
[ -f "$HESTIA/conf/hestia.conf" ] || fail "панель Hestia не найдена ($HESTIA)"
cd "$SITE_DIR"

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Устанавливаю Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || fail "нет docker compose — обновите Docker"

# 2. .env
if [ ! -f .env ]; then
  say "Создаю .env"
  read -rp "Email администратора сайта: " ADMIN_EMAIL
  while :; do
    read -rsp "Пароль администратора (минимум 8 символов): " ADMIN_PASSWORD; echo
    [ "${#ADMIN_PASSWORD}" -ge 8 ] && break
    echo "Слишком короткий, ещё раз."
  done
  cat > .env <<EOF
DOMAIN=$DOMAIN
SITE_URL=https://$DOMAIN
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
PING_INTERVAL_MIN=5
LAUNCHER_DOWNLOAD_URL=https://github.com/Abaddon2908/crimson-launcher/releases/latest
EOF
  chmod 600 .env
fi

# 3. Запуск контейнера
say "Собираю и запускаю сайт (Docker)"
docker compose -f docker-compose.hestia.yml up -d --build
for _ in $(seq 1 30); do
  curl -sf -o /dev/null http://127.0.0.1:3080/ && break
  sleep 1
done
curl -sf -o /dev/null http://127.0.0.1:3080/ || fail "сайт не отвечает на 127.0.0.1:3080 — смотрите: docker compose -f docker-compose.hestia.yml logs"
echo "Сайт работает на 127.0.0.1:3080"

# 4. Шаблон nginx в Hestia
# shellcheck disable=SC1091
source "$HESTIA/conf/hestia.conf"
if [ "${PROXY_SYSTEM:-}" = "nginx" ]; then
  TPL_DIR="$HESTIA/data/templates/web/nginx"; HTTP='%proxy_port%'; HTTPS='%proxy_ssl_port%'; MODE=proxy
elif [ "${WEB_SYSTEM:-}" = "nginx" ]; then
  TPL_DIR="$HESTIA/data/templates/web/nginx/php-fpm"; HTTP='%web_port%'; HTTPS='%web_ssl_port%'; MODE=web
else
  fail "неизвестная схема веб-сервера (WEB_SYSTEM=${WEB_SYSTEM:-?}, PROXY_SYSTEM=${PROXY_SYSTEM:-?})"
fi
say "Ставлю шаблон nginx «nlauncher» в $TPL_DIR"
for ext in tpl stpl; do
  sed -e "s/__HTTP_PORT__/$HTTP/" -e "s/__HTTPS_PORT__/$HTTPS/" "deploy/hestia/nlauncher.$ext" > "$TPL_DIR/nlauncher.$ext"
done

OWNER="$(v-search-domain-owner "$DOMAIN" web 2>/dev/null || true)"
[ -n "$OWNER" ] || fail "домен $DOMAIN не добавлен в Hestia. Добавьте его в панели (WEB → Добавить веб-домен) и запустите скрипт снова."
say "Применяю шаблон к $DOMAIN (пользователь $OWNER)"
if [ "$MODE" = proxy ]; then
  v-change-web-domain-proxy-tpl "$OWNER" "$DOMAIN" nlauncher "" yes
else
  v-change-web-domain-tpl "$OWNER" "$DOMAIN" nlauncher yes
fi

# 5. SSL от Let's Encrypt
say "Выпускаю SSL-сертификат Let's Encrypt"
ALIASES="www.$DOMAIN"
v-list-web-domain "$OWNER" "$DOMAIN" plain 2>/dev/null | grep -q "www.$DOMAIN" || ALIASES=""
if v-add-letsencrypt-domain "$OWNER" "$DOMAIN" "$ALIASES"; then
  echo "Сертификат выпущен."
else
  echo
  echo "Сертификат пока не выпустился. Почти всегда это значит, что DNS ещё не указывает на этот сервер."
  echo "Проверьте: A-запись $DOMAIN (и www) → IP этого сервера, подождите обновления DNS и выполните:"
  echo "  $HESTIA/bin/v-add-letsencrypt-domain $OWNER $DOMAIN $ALIASES"
fi

say "Готово: https://$DOMAIN  (админка: https://$DOMAIN/admin)"
