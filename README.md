Ayu Life

Ayu Life is a modern chat application that connects users with an AI assistant specializing in Ayurveda knowledge. The application features a clean, user-friendly interface that allows for real-time conversations using OpenAI's Assistants API.

## Features

- Real-time chat with an AI assistant specializing in Ayurveda
- WebSocket-based streaming responses for immediate feedback
- Markdown rendering for rich text responses
- Suggestion chips for quick inquiries about prakriti and Ayurvedic concepts
- Mobile-responsive design for use on any device
- Telemetry and observability through Langfuse integration

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** for fast development and building
- **TailwindCSS 4** for styling
- **WebSocket** communication for real-time chat

### Backend
- **FastAPI** for the Python server
- **OpenAI Assistants API** for AI interactions
- **Langfuse** for tracking and observability
- **Uvicorn** as the ASGI server

### Deployment
- **Docker** containers for both client and server
- **Google Cloud Run** for serverless deployment

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python (v3.10+)
- OpenAI API key
- Assistant ID (created in OpenAI platform)
- Langfuse credentials (optional but recommended for production)

### Client Setup

```bash
cd ayu-life/client

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Server Setup

```bash
cd ayu-life/server

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export OPENAI_API_KEY=""
export ASSISTANT_ID=""
export LANGFUSE_SECRET_KEY=""  # Optional
export LANGFUSE_PUBLIC_KEY=""  # Optional
export LANGFUSE_HOST="https://us.cloud.langfuse.com"  # Optional

# Start the server
uvicorn main:app --reload
```

## Deployment

The project includes a deployment script (`deploy.sh`) that handles building and deploying to Google Cloud Run.

### Requirements for Deployment

- Google Cloud SDK installed and configured
- Docker installed
- Authenticated with Google Cloud (`gcloud auth login`)
- Environment variables set in a `.env` file or environment

### Deployment Commands

```bash
# Deploy both client and server
./deploy.sh

# Deploy only client
./deploy.sh --only-client

# Deploy only server
./deploy.sh --only-server
```

## Environment Variables

### Server Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key
- `ASSISTANT_ID`: ID of your OpenAI Assistant
- `LANGFUSE_SECRET_KEY`: Secret key for Langfuse (optional)
- `LANGFUSE_PUBLIC_KEY`: Public key for Langfuse (optional)
- `LANGFUSE_HOST`: Langfuse host URL (optional)

### Deployment Environment Variables

- `GOOGLE_CLOUD_PROJECT`: GCP project ID (optional, will use current gcloud config if not specified)

## License

[Specify your license here]

## Contributors

[Your name/team information]

You can copy this content and save it as README.md in your ayu-life directory, replacing the current placeholder content. I've left the environment variable values empty as requested and included placeholders for license and contributor information that you can fill in later.
