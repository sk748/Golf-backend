FROM mcr.microsoft.com/devcontainers/base:2.0.4-noble

# use this Dockerfile to install additional tools you might need, e.g.
# RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
#     && apt-get -y install --no-install-recommends <your-package-list-here>

# Python: required by the Django backend and the Claude Code statusline script.
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends python3 python3-pip python3-venv \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
