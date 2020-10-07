ROOT := $(CURDIR)

CFLAGS_wasm_OPT = -Oz

CFLAGS_wasm_diffutils = -s ERROR_ON_UNDEFINED_SYMBOLS=0 -lidbfs.js -s WASM=1 -s SINGLE_FILE=1 -s MODULARIZE=1 -s EXPORT_NAME=busy -s FORCE_FILESYSTEM=1 -s EXPORTED_RUNTIME_METHODS=[\"FS\"] -s INVOKE_RUN=0 $(CFLAGS_wasm_OPT)

CACHE_wasm_diffutils = $(ROOT)/build/wasm-diffutils.cache

URL_diffutils = https://ftp.gnu.org/gnu/diffutils/diffutils-3.7.tar.xz

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

dist:
	cp build/wasm/diffutils/src/diff3 dist/busy.js
	#cp build/wasm/diffutils/src/diff3.wasm dist/diff3.wasm
