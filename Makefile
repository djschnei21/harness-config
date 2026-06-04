.PHONY: check build test typecheck clean release release-patch release-minor release-major try-simple try-complex try-clean

ROOT := $(CURDIR)

# Full pipeline: typecheck, test, build
check: typecheck test build

# Type-check without emitting
typecheck:
	npx tsc --noEmit

# Run tests
test:
	npx vitest run

# Build the CLI bundle
build:
	npx esbuild src/cli.ts \
		--bundle \
		--platform=node \
		--target=node18 \
		--outfile=dist/cli.js \
		--format=esm \
		--banner:js='#!/usr/bin/env node'
	chmod +x dist/cli.js

# Remove build artifacts
clean:
	rm -rf dist node_modules

# Remove fixture target directories
try-clean:
	rm -rf fixtures/simple/targetdir fixtures/complex/targetdir

# Run against the simple fixture (interactive)
try-simple:
	@mkdir -p fixtures/simple/targetdir
	cd fixtures/simple/targetdir && npx tsx $(ROOT)/src/cli.ts add ..

# Run against the complex fixture (interactive)
try-complex:
	@mkdir -p fixtures/complex/targetdir
	cd fixtures/complex/targetdir && npx tsx $(ROOT)/src/cli.ts add ..

# Run against simple fixture non-interactively
try-simple-ci:
	@mkdir -p fixtures/simple/targetdir
	cd fixtures/simple/targetdir && npx tsx $(ROOT)/src/cli.ts add .. --yes

# Run against complex fixture non-interactively
try-complex-ci:
	@mkdir -p fixtures/complex/targetdir
	cd fixtures/complex/targetdir && npx tsx $(ROOT)/src/cli.ts add .. --yes

# Release targets — run checks, bump version, tag, push, publish
release-patch: check
	npm version patch
	git push --follow-tags
	npm publish --access public

release-minor: check
	npm version minor
	git push --follow-tags
	npm publish --access public

release-major: check
	npm version major
	git push --follow-tags
	npm publish --access public

# Alias: release defaults to patch
release: release-patch
