#!/bin/bash
set -e

echo "YouTube Buddy Backend Setup Script"
echo "======================================"

if ! command -v python3 &> /dev/null
then
    echo "Python 3 is not installed. Please install Python 3.12+"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo "Found Python version: $PYTHON_VERSION"

echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo "Installing dependencies..."
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

echo "Installing FFmpeg (optional)..."
if command -v ffmpeg &> /dev/null
then
    echo "FFmpeg is already installed"
else
    echo "Please install FFmpeg from https://ffmpeg.org/download.html"
fi

echo "Setup complete!"
echo "To start the backend:"
echo "  source venv/bin/activate"
echo "  uvicorn app.main:app --reload"
