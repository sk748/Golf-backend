# Sized for a 1-2 vCPU / 1-2GB VPS co-hosting Postgres and Redis: the app is
# DB-bound, so a couple of threaded sync workers beat the 2*cores+1 formula
# on RAM headroom.
bind = "0.0.0.0:8000"
workers = 2
threads = 2
timeout = 30
graceful_timeout = 30
max_requests = 1000
max_requests_jitter = 50
accesslog = "-"
errorlog = "-"
