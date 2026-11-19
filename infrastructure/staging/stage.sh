#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
settings=.env.staging

case "${1:-}" in
  init|init-demo)
    # Shell noclobber makes concurrent initialization safe and protects an existing stack's passwords.
    umask 077
    set -C
    signup=false
    [[ $1 != init-demo ]] || signup=true
    # Generate before opening the settings file. Its creation is exclusive.
    secrets=()
    for _ in {1..5}; do secrets+=("$(openssl rand -hex 32)"); done
    {
      printf 'STAGE_PG=%s\nSTAGE_APP=%s\nSTAGE_AUTH=%s\nSTAGE_REDIS=%s\nSTAGE_SESSION=%s\n' "${secrets[@]}"
      printf 'STAGE_SIGNUP=%s\n' "$signup"
    } > "$settings"
    exit 0 ;;
  start|stop|status|validate) ;;
  *) echo 'Usage: stage.sh init|init-demo|start|stop|status|validate' >&2; exit 2 ;;
esac

[[ -f "$settings" && ! -L "$settings" ]] || { echo 'Initialize .env.staging first.' >&2; exit 1; }
[[ $(stat -c '%a:%u' "$settings") == "600:$(id -u)" ]] || { echo 'Require owner-only staging credentials (mode 600).' >&2; exit 1; }
unset STAGE_PG STAGE_APP STAGE_AUTH STAGE_REDIS STAGE_SESSION STAGE_SIGNUP
STAGE_REVISION=$(git rev-parse --verify HEAD)
export STAGE_REVISION
compose=(docker compose --project-name unibos-private-staging --env-file "$settings" -f compose.yaml)
case "$1" in
  validate) "${compose[@]}" --profile maintenance config --quiet ;;
  status) "${compose[@]}" ps --all ;;
  stop) "${compose[@]}" down ;;
  start)
    repo=$(git rev-parse --show-toplevel)
    git diff --quiet HEAD -- . || { echo 'Use the reviewed staging scripts and Compose file from HEAD.' >&2; exit 1; }
    # Build only the committed application and migration files. The host checkout can contain local secrets and build outputs.
    git -C "$repo" archive "$STAGE_REVISION" -- package.json package-lock.json tsconfig.base.json apps packages infrastructure/migrate.mjs infrastructure/staging/Dockerfile infrastructure/staging/Dockerfile.dockerignore |
      docker build -f infrastructure/staging/Dockerfile --label "org.opencontainers.image.revision=$STAGE_REVISION" -t "unibos-private-staging-app:$STAGE_REVISION" -
    "${compose[@]}" up -d --wait postgres redis
    "${compose[@]}" stop website api
    "${compose[@]}" run --rm --no-deps migrate
    "${compose[@]}" up -d --wait --force-recreate --no-deps api website
    ;;
esac
