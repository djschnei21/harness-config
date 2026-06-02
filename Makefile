.PHONY: check build test typecheck clean release release-patch release-minor release-major

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

# Release targets — run checks, bump version, tag, push, publish
release-patch: check
	npm version patch
	git push --follow-tags
	npm publish

release-minor: check
	npm version minor
	git push --follow-tags
	npm publish

release-major: check
	npm version major
	git push --follow-tags
	npm publish

# Alias: release defaults to patch
release: release-patch
