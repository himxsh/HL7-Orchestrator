#!/bin/bash

if [ "$NODE_ENV" = "production" ]; then
    echo "Starting in PRODUCTION mode..."
    echo "Serving frontend from frontend/dist/ via FastAPI"
    uvicorn app:app --host 0.0.0.0 --port 8000
else
    echo "Starting in DEVELOPMENT mode..."

    echo "Starting Backend (Uvicorn)..."
    if [ -d "venv" ]; then
        ./venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000 --reload &
    else
        uvicorn app:app --host 0.0.0.0 --port 8000 --reload &
    fi
    BACKEND_PID=$!

    sleep 2

    if [ -n "$OPERATOR_TOKEN" ] && [ -z "$VITE_OPERATOR_TOKEN" ]; then
        export VITE_OPERATOR_TOKEN="$OPERATOR_TOKEN"
        echo "Propagated OPERATOR_TOKEN to VITE_OPERATOR_TOKEN for the frontend"
    fi

    echo "Starting Frontend (Vite)..."
    cd frontend && npm run dev &
    FRONTEND_PID=$!

    echo "Systems active:"
    echo "- Backend: http://localhost:8000"
    echo "- Frontend: http://localhost:3000"

    trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
    wait
fi
