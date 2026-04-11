#!/usr/bin/env bash

set -euo pipefail

sudo apt-get update
sudo apt-get install -y \
  pkg-config \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libfuse2 \
  libssl-dev \
  libgtk-3-dev \
  libgtk-3-bin \
  librsvg2-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  libayatana-appindicator3-dev \
  patchelf
