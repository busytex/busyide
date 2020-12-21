URL_busybox ?= https://busybox.net/downloads/busybox-1.32.0.tar.bz2
URL_miniz ?= https://github.com/richgel999/miniz/releases/download/2.1.0/miniz-2.1.0.zip
URL_diff3 ?= https://raw.githubusercontent.com/openbsd/src/master/usr.bin/diff3/diff3prog.c
URL_RELEASE_busytex_wasm ?= https://github.com/busytex/busytex/releases/tag/build_b16fdf28019d93ccfd8f09776e4191835acea5dc
URL_RELEASE_ubuntu_packages ?= https://github.com/busytex/busytex/releases/tag/release_88f12c721278c652c9fb69c6a097af9481a2ae7e

CFLAGS_wasm_busyide = -Oz -s ERROR_ON_UNDEFINED_SYMBOLS=0 -lidbfs.js -s INVOKE_RUN=0 -s MODULARIZE=1 -s EXPORT_NAME=busbox -s FORCE_FILESYSTEM=1 -s EXPORTED_RUNTIME_METHODS=[\"callMain\",\"FS\",\"PATH\"]

source/busybox.tar.bz2:
	mkdir -p source
	wget -nc "$(URL_busybox)" -O $@

source/miniz.zip:
	mkdir -p source
	wget -nc "$(URL_miniz)" -O $@

source/diff3prog.c:
	mkdir -p source
	wget "$(URL_diff3)" -O $@

build/wasm/busybox_unstripped.js: source/busybox.tar.bz2 source/miniz.zip source/diff3prog.c
	mkdir -p build/wasm/arch/em
	tar -xf source/busybox.tar.bz2 --strip-components=1 --directory=build/wasm
	cp nanozip.c build/wasm/archival && unzip -d build/wasm/archival -o source/miniz.zip miniz.h miniz.c
	cat diff3.h > build/wasm/editors/diff3.c && sed 's/main/diff3_main/g' source/diff3prog.c >> build/wasm/editors/diff3.c
	cp .config build/wasm
	echo 'cmd_busybox__ = $$(CC) -o $$@.js -Wl,--start-group $(CFLAGS_wasm_busyide) $(CURDIR)/em-shell.c -include $(CURDIR)/em-shell.h --js-library $(CURDIR)/em-shell.js $$(CFLAGS) $$(CFLAGS_busybox) $$(LDFLAGS) $$(EM_LDFLAGS) $$(EXTRA_LDFLAGS) $$(core-y) $$(libs-y) $$(patsubst %,-l%,$$(subst :, ,$$(LDLIBS))) -Wl,--end-group && cp $$@.js $$@' > build/wasm/arch/em/Makefile
	ln -s $(shell which emcc.py) build/wasm/emgcc || true
	PATH=$(CURDIR)/build/wasm:$$PATH $(MAKE) -C build/wasm ARCH=em CROSS_COMPILE=em SKIP_STRIP=y

.PHONY: dist
dist: build/wasm/busybox_unstripped.js
	mkdir -p dist
	cp build/wasm/busybox_unstripped.js dist/busyide.js

.PHONY: busytex
busytex:
	mkdir -p dist
	cp ../busytex/busytex_pipeline.js ../busytex/busytex_worker.js dist
	wget -P dist -nc $(addprefix $(subst tag,download,$(URL_RELEASE_busytex_wasm))/, busytex.wasm busytex.js texlive-basic.js texlive-basic.data)
	wget -P dist -nc $(addprefix $(subst tag,download,$(URL_RELEASE_ubuntu_packages))/, ubuntu-texlive-latex-base.data ubuntu-texlive-latex-base.js ubuntu-texlive-latex-extra.data ubuntu-texlive-latex-extra.js ubuntu-texlive-latex-recommended.data ubuntu-texlive-latex-recommended.js)

