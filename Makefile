# DOtunnel — local development
#
# Brings up the whole product locally: dashboard on https://dotunnel.localhost,
# tunnels on https://<subdomain>.dotunnel.localhost. Real port-less URLs, real
# TLS. See _dev/README.md for the details and the known gotchas.
#
#   make setup     once per machine
#   make up        dev server + TLS proxy
#   make tunnel    expose a local port
#
# Override the domain and ports with the DOTUNNEL_DEV_* environment variables
# read by _dev/config.mjs.

UNAME_S := $(shell uname -s)
CF      := yarn workspace dotunnel-cloudflare

# make tunnel PORT=3000 SUB=myapp
PORT ?= 8000
SUB  ?= test

HTTPS_PORT ?= 443

# macOS cannot bind ports below 1024 unprivileged and has no sysctl to change
# that, so the proxy needs sudo there. On Linux, `make unlock-port` lifts the
# restriction once and the proxy runs as your own user.
ifeq ($(UNAME_S),Darwin)
  PROXY := sudo -E yarn dev:proxy
else
  PROXY := yarn dev:proxy
endif

.DEFAULT_GOAL := help

.PHONY: help setup install cli migrate cert seed dev proxy up tunnel \
        unlock-port check check-types check-js check-rust test clean

help: ## Show this help
	@grep -hE '^[a-z][a-z-]*:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

setup: install cli migrate cert seed ## One-time setup for this machine
	@echo
	@echo "Ready. Run 'make up', then 'make tunnel PORT=$(PORT)'."
ifneq ($(UNAME_S),Darwin)
	@echo "First time on Linux? Run 'make unlock-port' so the proxy can bind :$(HTTPS_PORT)."
endif

install: ## Install JS dependencies
	yarn install

cli: ## Build the Rust CLI (debug)
	cargo build -p dotunnel-cli

migrate: ## Apply D1 migrations to the local database
	$(CF) wrangler d1 migrations apply DB --local

cert: ## Issue + trust the wildcard TLS cert (asks for your password)
	yarn dev:cert

seed: migrate ## Seed local D1 and the isolated CLI profile
	yarn dev:seed

dev: ## Run the worker dev server (:5173)
	$(CF) dev

proxy: ## Run the TLS front door (:443)
ifneq ($(UNAME_S),Darwin)
	@limit=$$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start 2>/dev/null || echo 1024); \
	if [ "$$limit" -gt $(HTTPS_PORT) ]; then \
	  echo "Unprivileged binding starts at $$limit, so :$(HTTPS_PORT) is blocked."; \
	  echo "Run 'make unlock-port' once, then retry."; \
	  exit 1; \
	fi
endif
	$(PROXY)

up: ## Run the dev server and the TLS proxy together
	@$(MAKE) -j2 --no-print-directory dev proxy

tunnel: ## Expose a local port  (make tunnel PORT=8000 SUB=test)
	./_dev/dotunnel tunnel --port $(PORT) --subdomain $(SUB)

unlock-port: ## Linux: allow unprivileged processes to bind :443
ifeq ($(UNAME_S),Darwin)
	@echo "Not applicable on macOS — 'make proxy' uses sudo instead."
else
	sudo sysctl -w net.ipv4.ip_unprivileged_port_start=$(HTTPS_PORT)
	@echo
	@echo "To persist across reboots:"
	@echo "  echo 'net.ipv4.ip_unprivileged_port_start=$(HTTPS_PORT)' | sudo tee /etc/sysctl.d/50-dotunnel.conf"
endif

check: check-types check-js check-rust ## All checks (use 'make -k check' to run past failures)

check-types: ## TypeScript
	$(CF) check:types

check-js: ## Biome lint + format
	yarn biome check .

check-rust: ## Clippy
	cargo clippy --all-targets

test: ## Run the Rust test suite
	cargo nextest run

clean: ## Remove generated local dev state (cert, CLI profile)
	rm -rf _dev/.certs _dev/.home
