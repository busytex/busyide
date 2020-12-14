URL_diffutils ?= https://ftp.gnu.org/gnu/diffutils/diffutils-3.7.tar.xz
URL_RELEASE_busytex_wasm ?= https://github.com/busytex/busytex/releases/tag/build_b16fdf28019d93ccfd8f09776e4191835acea5dc
URL_RELEASE_ubuntu_packages ?= https://github.com/busytex/busytex/releases/tag/release_88f12c721278c652c9fb69c6a097af9481a2ae7e

ROOT := $(CURDIR)

CFLAGS_wasm_OPT = -Oz
CFLAGS_wasm_diffutils = -s ERROR_ON_UNDEFINED_SYMBOLS=0 -lidbfs.js -s WASM=1 -s SINGLE_FILE=1 -s MODULARIZE=1 -s EXPORT_NAME=busy -s FORCE_FILESYSTEM=1 -s EXPORTED_RUNTIME_METHODS=[\"FS\"] -s INVOKE_RUN=0 $(CFLAGS_wasm_OPT)

CACHE_wasm_diffutils = $(ROOT)/build/wasm-diffutils.cache

CONFIGURE_wasm = emconfigure
MAKE_wasm = emmake $(MAKE)

source/diffutils.downloaded:
	mkdir -p $(basename $@)
	wget --no-clobber $(URL_$(notdir $(basename $@))) -O "$(basename $@).tar.xz" || true
	tar -xf "$(basename $@).tar.xz" --strip-components=1 --directory="$(basename $@)"
	touch $@

build/wasm/diffutils/src/diff3: source/diffutils.downloaded
	mkdir -p build/wasm/diffutils
	cd build/wasm/diffutils && \
	CONFIG_SITE=$(ROOT)/diffutils.site $(CONFIGURE_wasm) $(ROOT)/source/diffutils/configure \
		--cache-file=$(CACHE_wasm_diffutils) \
		CFLAGS="$(CFLAGS_wasm_diffutils)"
	$(MAKE_wasm) -C build/wasm/diffutils

.PHONY: busytex
busytex:
	mkdir -p dist
	cp ../busytex/busytex_pipeline.js ../busytex/busytex_worker.js dist
	wget -P dist -nc $(addprefix $(subst tag,download,$(URL_RELEASE_busytex_wasm))/, busytex.wasm busytex.js texlive-basic.js texlive-basic.data)
	wget -P dist -nc $(addprefix $(subst tag,download,$(URL_RELEASE_ubuntu_packages))/, ubuntu-texlive-latex-base.data ubuntu-texlive-latex-base.js ubuntu-texlive-latex-extra.data ubuntu-texlive-latex-extra.js ubuntu-texlive-latex-recommended.data ubuntu-texlive-latex-recommended.js)

.PHONY: dist
dist: build/wasm/diffutils/src/diff3
	mkdir -p dist
	cp build/wasm/diffutils/src/diff3 dist/busy.js
	#cp build/wasm/diffutils/src/diff3.wasm dist/diff3.wasm
