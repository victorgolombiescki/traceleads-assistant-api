#!/usr/bin/env bash
#
# Build/push da imagem e deploy no Docker Swarm (mesmo fluxo geral do traceleads-api).
# Stack padrão: trace_leads_assistant (não sobrescreve trace_leads da API Nest).
#
# Variáveis úteis: NODE_ENV_TRACELEADS=production|homolog, GITHUB_TOKEN, STACK_NAME

set -a

echo "Carregando variáveis de ambiente..."

if [ -r /root/.bashrc ]; then
  source /root/.bashrc 2>/dev/null || true
fi
if [ -r "${HOME}/.bashrc" ] && [ "${HOME}/.bashrc" != "/root/.bashrc" ]; then
  source "${HOME}/.bashrc" 2>/dev/null || true
fi
if [ -r "${HOME}/.bash_profile" ]; then
  source "${HOME}/.bash_profile" 2>/dev/null || true
fi
if [ -r "${HOME}/.profile" ]; then
  source "${HOME}/.profile" 2>/dev/null || true
fi

load_env_file() {
  local file=$1
  if [ -r "$file" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$line" ]]; then
        continue
      fi
      if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
        local key="${BASH_REMATCH[1]}"
        local value="${BASH_REMATCH[2]}"
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        if [[ "$value" =~ ^\'.*\'$ ]]; then
          value="${value:1:-1}"
        elif [[ "$value" =~ ^\".*\"$ ]]; then
          value="${value:1:-1}"
          value=$(eval echo "$value")
        elif [[ "$value" =~ ^\$[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
          local var_name="${value#\$}"
          if [ -n "${!var_name:-}" ]; then
            value="${!var_name}"
          fi
        fi
        export "$key=$value"
      fi
    done < "$file"
  fi
}

if [ -r .env ]; then
  echo "Carregando .env"
  load_env_file .env
fi
if [ -r .env.local ]; then
  echo "Carregando .env.local"
  load_env_file .env.local
fi
if [ -r .deploy/env.stack ]; then
  echo "Carregando .deploy/env.stack"
  load_env_file .deploy/env.stack
fi

set +a

STACK_NAME="${STACK_NAME:-trace_leads_assistant}"
SERVICE_NAME="${STACK_NAME}_traceleads_assistant_api"
IMAGE_REPO="ghcr.io/victorgolombiescki/traceleads-assistant-api"

check_docker_permissions() {
  if ! docker info >/dev/null 2>&1; then
    echo "Erro: Docker não acessível (permissões ou daemon parado)."
    read -r -p "Tentar com sudo? (s/N): " usar_sudo
    if [[ "$usar_sudo" =~ ^[Ss]$ ]]; then
      sudo "$0" "$@"
      exit $?
    fi
    return 1
  fi
  return 0
}

imagem() {
  echo ""
  echo "Build da imagem traceleads-assistant-api"
  echo ""

  if ! check_docker_permissions; then
    return 1
  fi

  if [ -z "${NODE_ENV_TRACELEADS:-}" ]; then
    echo "NODE_ENV_TRACELEADS não definido. Escolha:"
    select env in production homolog; do
      export NODE_ENV_TRACELEADS=$env
      break
    done
  fi

  if [ "${NODE_ENV_TRACELEADS}" != "production" ] && [ "${NODE_ENV_TRACELEADS}" != "homolog" ]; then
    echo "Use NODE_ENV_TRACELEADS=production ou homolog"
    return 1
  fi

  if [ "${NODE_ENV_TRACELEADS}" == "production" ]; then
    TAG_NAME="latest"
  else
    TAG_NAME="homolog"
  fi

  IMAGE_TAG="${IMAGE_REPO}:${TAG_NAME}"
  echo "Ambiente: ${NODE_ENV_TRACELEADS}"
  echo "Tag: ${IMAGE_TAG}"

  select build_type in "Build limpo (sem cache)" "Build rápido (com cache)"; do
    USE_CACHE=$([ "$build_type" == "Build rápido (com cache)" ] && echo "" || echo "--no-cache")
    break
  done

  echo "Login ghcr.io (se necessário)..."
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "${GITHUB_TOKEN}" | docker login ghcr.io -u victorgolombiescki --password-stdin
  else
    docker login ghcr.io -u victorgolombiescki || true
  fi

  BUILD_CMD="docker build"
  if [ -n "${USE_CACHE}" ]; then
    BUILD_CMD="${BUILD_CMD} ${USE_CACHE}"
  fi
  BUILD_CMD="${BUILD_CMD} --build-arg NODE_ENV=${NODE_ENV_TRACELEADS} -t ${IMAGE_TAG} ."

  if ! eval "${BUILD_CMD}"; then
    echo "Erro no docker build"
    return 1
  fi

  docker push "${IMAGE_TAG}" || {
    echo "Erro no docker push"
    return 1
  }

  echo "Imagem enviada: ${IMAGE_TAG}"
}

deploy_stack() {
  echo ""
  echo "Deploy stack ${STACK_NAME}"
  echo ""

  if ! check_docker_permissions; then
    return 1
  fi

  if [ -z "${NODE_ENV_TRACELEADS:-}" ]; then
    select env in production homolog; do
      export NODE_ENV_TRACELEADS=$env
      break
    done
  fi

  if [ "${NODE_ENV_TRACELEADS}" == "production" ]; then
    export IMAGE_TAG=latest
  else
    export IMAGE_TAG=homolog
  fi

  IMAGE_FULL="${IMAGE_REPO}:${IMAGE_TAG}"

  REQUIRED_VARS=(
    "OPENAI_API_KEY"
    "ASSISTANT_API_KEY"
    "TRACELEADS_TRAEFIK_URL_ASSISTANT"
  )
  MISSING=()
  for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
      MISSING+=("$var")
    fi
  done

  if [ ${#MISSING[@]} -gt 0 ]; then
    echo "Variáveis em falta: ${MISSING[*]}"
    echo "Defina no servidor (.bashrc, .env ou .deploy/env.stack). Ver .deploy/env.stack.example"
    read -r -p "Continuar mesmo assim? (s/N): " continuar
    if [[ ! "$continuar" =~ ^[Ss]$ ]]; then
      return 1
    fi
  fi

  echo "Pull ${IMAGE_FULL}..."
  docker pull "${IMAGE_FULL}" || echo "(pull opcional falhou — continua com imagem local)"

  set -a
  docker stack deploy -d --with-registry-auth -c ./docker-compose.yml "${STACK_NAME}"
  set +a

  sleep 3

  if docker service ls 2>/dev/null | grep -q "${SERVICE_NAME}"; then
    echo "Atualizando serviço com a imagem desejada..."
    docker service update --force --image "${IMAGE_FULL}" --with-registry-auth "${SERVICE_NAME}" || true
  fi

  echo ""
  docker service ps "${SERVICE_NAME}" --no-trunc 2>/dev/null || true
  echo ""
  echo "Serviço Swarm: ${SERVICE_NAME}"
}

sair() {
  exit 0
}

main_menu() {
  echo ""
  echo "traceleads-assistant-api — deploy"
  echo "Stack: ${STACK_NAME} (altere com export STACK_NAME=...)"
  echo ""
  select OPT in imagem deploy sair; do
    case $OPT in
      imagem) imagem ;;
      deploy) deploy_stack ;;
      sair) sair ;;
      *) echo "Opção inválida" ;;
    esac
  done
}

cd "$(dirname "$0")" || exit 1

if [ "${1:-}" == "imagem" ]; then
  imagem
  exit $?
fi
if [ "${1:-}" == "deploy" ]; then
  deploy_stack
  exit $?
fi

main_menu
