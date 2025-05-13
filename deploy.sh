#!/usr/bin/env bash
set -euo pipefail

# ─── Load .env ──────────────────────────────────────────────────────────
#   This will export every VAR=VALUE line in .env
if [ -f .env ]; then
  # -a: automatically export all variables
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "⚠️  Warning: .env file not found, relying on existing env vars"
fi

# ─── Configuration ——————————————————————————————————————————————
# You can override GOOGLE_CLOUD_PROJECT in your env, otherwise we'll pull from gcloud config
PROJECT=${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}
REGION="us-east4"

CLIENT_DIR="client"
SERVER_DIR="server"

CLIENT_SERVICE="ayulife-client"
SERVER_SERVICE="ayulife-server"

CLIENT_IMAGE="gcr.io/$PROJECT/$CLIENT_SERVICE:latest"
SERVER_IMAGE="gcr.io/$PROJECT/$SERVER_SERVICE:latest"

# ─── Parse flags ————————————————————————————————————————————————
DO_CLIENT=false
DO_SERVER=false

while (( "$#" )); do
  case "$1" in
    --only-client)
      DO_CLIENT=true
      shift
      ;;
    --only-server)
      DO_SERVER=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--only-client] [--only-server]"
      exit 1
      ;;
  esac
done

# If no flags passed, do both
if ! $DO_CLIENT && ! $DO_SERVER; then
  DO_CLIENT=true
  DO_SERVER=true
fi

# ─── Setup GCP —————————————————————————————————————————————
echo "▶ Using GCP project: $PROJECT"
gcloud config set project "$PROJECT" --quiet
echo "▶ Configuring Docker to use gcloud creds"
gcloud auth configure-docker --quiet

# ── Deploy Client ───────────────────────────────────────────────────────
if $DO_CLIENT; then
  echo "▶ Building client image"
  cd "$CLIENT_DIR"
  docker build --no-cache -t "$CLIENT_IMAGE" .
  echo "▶ Pushing client image"
  docker push "$CLIENT_IMAGE"
  echo "▶ Deploying client to Cloud Run ($CLIENT_SERVICE in $REGION)"
  gcloud run deploy "$CLIENT_SERVICE" \
    --image "$CLIENT_IMAGE" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --quiet
  cd ..
fi

# ── Deploy Server ───────────────────────────────────────────────────────
if $DO_SERVER; then
  echo "▶ $SERVER_DIR Building server image $SERVER_IMAGE"
  cd "$SERVER_DIR"
  docker build --no-cache -t "$SERVER_IMAGE" .
  echo "▶ Pushing server image $SERVER_IMAGE"
  docker push "$SERVER_IMAGE"
  echo "▶ Deploying server to Cloud Run ($SERVER_SERVICE in $REGION)"
  gcloud run deploy "$SERVER_SERVICE" \
    --image "$SERVER_IMAGE" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --set-env-vars OPENAI_API_KEY="$OPENAI_API_KEY",ASSISTANT_ID="$ASSISTANT_ID",LANGFUSE_SECRET_KEY="$LANGFUSE_SECRET_KEY",LANGFUSE_PUBLIC_KEY="$LANGFUSE_PUBLIC_KEY",LANGFUSE_HOST="$LANGFUSE_HOST" \
    --quiet
  cd ..
fi

echo "✅ Deployment complete."
