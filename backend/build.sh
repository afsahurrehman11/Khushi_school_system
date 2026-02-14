#!/bin/bash
set -e

# Force Python 3.11
export PYENV_VERSION=3.11.9
export PATH="/home/render/.pyenv/versions/3.11.9/bin:$PATH"

# Upgrade pip
pip install --upgrade pip

# Install requirements
pip install -r requirements.txt

echo "✓ Build completed with Python 3.11.9"
