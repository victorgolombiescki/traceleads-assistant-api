#!/usr/bin/env bash

set -euo pipefail

# Cloud Run deploy script for traceleads-assistant-api (Hono / Node).
# Alinhado ao fluxo de traceleads-api: APIs → Artifact Registry → Cloud Build (fallback Docker local) → Cloud Run.
#
# Após o primeiro deploy, configure no Cloud Run (Console ou gcloud) pelo menos:
#   OPENAI_API_KEY, ASSISTANT_API_KEY, TRACELEADS_API_URL
# e opcionalmente: OPENAI_MODEL, CORS_ORIGINS, AI_SDK_LOG_WARNINGS
#
# Auth: gcloud auth login se o token expirou. Opcional: DEPLOY_OPEN_GCLOUD_LOGIN=1 ./deploy-traceleads-assistant-api.sh
# Menu: ./deploy-traceleads-assistant-api.sh menu  ou  DEPLOY_MENU=1 ./deploy-traceleads-assistant-api.sh
#
# Cloud Run — escala: CR_MAX_INSTANCES=3 ./deploy-traceleads-assistant-api.sh (CR_CPU, CR_MEMORY,
# CR_MIN_INSTANCES, CR_CONCURRENCY). Compartilha Postgres com traceleads-api: max mais baixo que a API.

PROJECT_ID="${PROJECT_ID:-traceleads-491323}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-traceleads-assistant-api}"
AR_REPOSITORY="${AR_REPOSITORY:-traceleads}"
IMAGE_NAME="${IMAGE_NAME:-traceleads-assistant-api}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
NODE_ENV_TRACELEADS="${NODE_ENV_TRACELEADS:-production}"
CR_CPU="${CR_CPU:-1}"
CR_MEMORY="${CR_MEMORY:-1Gi}"
CR_MIN_INSTANCES="${CR_MIN_INSTANCES:-1}"
CR_MAX_INSTANCES="${CR_MAX_INSTANCES:-5}"
CR_CONCURRENCY="${CR_CONCURRENCY:-80}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$(basename "${BASH_SOURCE[0]}")"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

if [[ "${1:-}" == "menu" ]]; then
  DEPLOY_MENU=1
  shift
fi

echo "==> Deploy traceleads-assistant-api to Cloud Run"
echo "PROJECT_ID: ${PROJECT_ID}"
echo "REGION: ${REGION}"
echo "SERVICE_NAME: ${SERVICE_NAME}"
echo "AR_REPOSITORY: ${AR_REPOSITORY}"
echo "IMAGE_URI: ${IMAGE_URI}"
echo "NODE_ENV_TRACELEADS: ${NODE_ENV_TRACELEADS}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1"
    exit 1
  fi
}

ensure_gcloud_auth() {
  require_cmd gcloud
  if [[ "${DEPLOY_OPEN_GCLOUD_LOGIN:-}" == "1" ]]; then
    echo "==> DEPLOY_OPEN_GCLOUD_LOGIN=1: running interactive gcloud auth login..."
    gcloud auth login
  fi
  local acc
  acc="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
  if [[ -z "${acc}" ]]; then
    echo "ERROR: no active gcloud account."
    echo "Run: gcloud auth login"
    echo "Or: DEPLOY_OPEN_GCLOUD_LOGIN=1 ./${SELF}"
    exit 1
  fi
  echo "Active gcloud account: ${acc}"
  if ! gcloud auth print-access-token >/dev/null 2>&1; then
    echo "ERROR: gcloud session expired (reauthentication required)."
    echo "Run: gcloud auth login"
    echo "Then: gcloud config set project ${PROJECT_ID}"
    echo "Or: DEPLOY_OPEN_GCLOUD_LOGIN=1 ./${SELF}"
    exit 1
  fi
}

deploy_menu_loop() {
  require_cmd gcloud
  while true; do
    cat <<EOF

=== ${SELF} ===
1) Login no Google Cloud (gcloud auth login)
2) Definir projeto (${PROJECT_ID})
3) Continuar: executar deploy (build + Cloud Run)
4) Sair

EOF
    read -r -p "Opção [1-4]: " _menu_choice
    case "${_menu_choice}" in
      1) gcloud auth login ;;
      2) gcloud config set project "${PROJECT_ID}" ;;
      3) return 0 ;;
      4) exit 0 ;;
      *) echo "Opção inválida." ;;
    esac
  done
}

cleanup() {
  if [[ -n "${TMP_CLOUDBUILD:-}" && -f "${TMP_CLOUDBUILD}" ]]; then
    rm -f "${TMP_CLOUDBUILD}"
  fi
  if [[ -n "${TMP_BUILD_LOG:-}" && -f "${TMP_BUILD_LOG}" ]]; then
    rm -f "${TMP_BUILD_LOG}"
  fi
}

trap cleanup EXIT

build_with_cloud_build() {
  echo "==> Building and pushing image with Cloud Build..."
  TMP_CLOUDBUILD="$(mktemp)"
  cat > "${TMP_CLOUDBUILD}" <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - Dockerfile
      - --build-arg
      - NODE_ENV=${NODE_ENV_TRACELEADS}
      - -t
      - ${IMAGE_URI}
      - .
images:
  - ${IMAGE_URI}
EOF

  TMP_BUILD_LOG="$(mktemp)"
  if gcloud builds submit "${APP_ROOT}" --config "${TMP_CLOUDBUILD}" 2>&1 | tee "${TMP_BUILD_LOG}"; then
    return 0
  fi

  if grep -Eq "PERMISSION_DENIED|storage\\.objects\\.get access|Permission 'storage\\.objects\\.get' denied|INVALID_ARGUMENT: could not resolve source" "${TMP_BUILD_LOG}"; then
    echo "WARN: Cloud Build blocked by permissions/source access. Falling back to local Docker build/push..."
    return 1
  fi

  echo "ERROR: Cloud Build failed for a reason other than permission/source access."
  exit 1
}

build_with_local_docker() {
  require_cmd docker
  echo "==> Configuring Docker auth for Artifact Registry..."
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

  echo "==> Building image locally with Docker..."
  docker build \
    -f "${APP_ROOT}/Dockerfile" \
    --build-arg "NODE_ENV=${NODE_ENV_TRACELEADS}" \
    -t "${IMAGE_URI}" \
    "${APP_ROOT}"

  echo "==> Pushing image to Artifact Registry..."
  docker push "${IMAGE_URI}"
}

if [[ "${DEPLOY_MENU:-}" == "1" ]]; then
  deploy_menu_loop
fi

ensure_gcloud_auth

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "==> Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

echo "==> Ensuring Artifact Registry repository exists..."
if ! gcloud artifacts repositories describe "${AR_REPOSITORY}" \
  --location "${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPOSITORY}" \
    --repository-format=docker \
    --location "${REGION}" \
    --description="TraceLeads Docker images"
fi

if ! build_with_cloud_build; then
  build_with_local_docker
fi

echo "==> Deploying service to Cloud Run..."
DEPLOY_ARGS=(
  run deploy "${SERVICE_NAME}"
  --image "${IMAGE_URI}"
  --region "${REGION}"
  --platform managed
  --allow-unauthenticated
  --port 7071
  --cpu "${CR_CPU}"
  --memory "${CR_MEMORY}"
  --min-instances "${CR_MIN_INSTANCES}"
  --max-instances "${CR_MAX_INSTANCES}"
  --concurrency "${CR_CONCURRENCY}"
  --update-env-vars "NODE_ENV=${NODE_ENV_TRACELEADS}"
)

gcloud "${DEPLOY_ARGS[@]}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format='value(status.url)')"

echo ""
echo "SUCCESS: deploy completed."
echo "Service URL: ${SERVICE_URL}"
echo "Image: ${IMAGE_URI}"
echo ""
echo "Configure env vars / secrets for this service (OPENAI_API_KEY, ASSISTANT_API_KEY, TRACELEADS_API_URL, CORS_ORIGINS, …) if not already set."
