.PHONY: demo clean

FIXTURES := $(shell cd ../fixtures/simple && pwd)

demo: demo.gif ## Record the terminal demo GIF

demo.gif: demo/demo.tape ../fixtures/simple/harness-config.yaml
	@command -v vhs >/dev/null || { echo "Install VHS: brew install vhs"; exit 1; }
	@command -v harness-config >/dev/null || { echo "Run 'npm link' first to make harness-config available"; exit 1; }
	sed 's|DEMO_FIXTURES|$(FIXTURES)|g' demo.tape | vhs

clean: ## Remove generated demo artifacts
	rm -f demo.gif
