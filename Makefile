BUSYTEX_CORE_ASSETS = busytex.wasm busytex.js texlive-basic.js texlive-basic.data
BUSYTEX_UBUNTU_ASSETS = ubuntu-texlive-latex-base.data ubuntu-texlive-latex-base.js ubuntu-texlive-latex-extra.data ubuntu-texlive-latex-extra.js ubuntu-texlive-latex-recommended.data ubuntu-texlive-latex-recommended.js

URL_busybox ?= https://busybox.net/downloads/busybox-1.33.0.tar.bz2
URL_miniz ?= https://github.com/richgel999/miniz/releases/download/2.1.0/miniz-2.1.0.zip
URL_bsddiff3prog ?= https://raw.githubusercontent.com/openbsd/src/master/usr.bin/diff3/
URL_bsddiff ?= https://raw.githubusercontent.com/openbsd/src/master/usr.bin/diff/
URL_freebsddiff ?= https://raw.githubusercontent.com/freebsd/freebsd-src/master/usr.bin/diff/

URL_RELEASE_busytex_wasm ?= https://github.com/busytex/busytex/releases/tag/build_b16fdf28019d93ccfd8f09776e4191835acea5dc
URL_RELEASE_ubuntu_packages ?= https://github.com/busytex/busytex/releases/tag/release_88f12c721278c652c9fb69c6a097af9481a2ae7e

CFLAGS_wasm_busyide = -Oz -s ERROR_ON_UNDEFINED_SYMBOLS=0 -lidbfs.js -s INVOKE_RUN=0 -s MODULARIZE=1 -s EXPORT_NAME=busbox -s FORCE_FILESYSTEM=1 -s EXPORTED_FUNCTIONS='[\"_main\",\"_fflush\",\"_putchar\"]' -s EXPORTED_RUNTIME_METHODS=[\"FS\",\"TTY\",\"PATH\",\"callMain\",\"allocateUTF8OnStack\",\"stringToUTF8Array\"] -s EXTRA_EXPORTED_RUNTIME_METHODS=[\"lengthBytesUTF8\"]

BSDDIFF_SED = s/xmalloc(/bsddiff_xmalloc(/g; s/xcalloc(/bsddiff_xcalloc(/g; s/xreallocarray(/bsddiff_xreallocarray(/g; s/xstrdup(/bsddiff_xstrdup(/g; s/xasprintf(/bsddiff_xasprintf(/g; s/splice(/bsddiff_splice(/g

build/wasm/busybox_unstripped.js: source/busybox.tar.bz2 source/miniz.zip openbsd_diff3prog.c openbsd_diff.c
	mkdir -p build/wasm/arch/em build/wasm/bsd
	tar -xf source/busybox.tar.bz2 --strip-components=1 --directory=build/wasm
	cp busyz.c build/wasm/archival && unzip -d build/wasm/archival -o source/miniz.zip miniz.h miniz.c
	cp openbsd_diff3prog.c build/wasm/miscutils/bsddiff3prog.c
	cp openbsd_diff.c build/wasm/miscutils/bsddiff.c
	cp .config build/wasm 
	echo 'cmd_busybox__ = $$(CC) -o $$@.js -Wl,--start-group $(CFLAGS_wasm_busyide) $(CURDIR)/em-shell.c -include $(CURDIR)/em-shell.h --js-library $(CURDIR)/em-shell.js $$(CFLAGS) $$(CFLAGS_busybox) $$(LDFLAGS) $$(EM_LDFLAGS) $$(EXTRA_LDFLAGS) $$(core-y) $$(libs-y) $$(patsubst %,-l%,$$(subst :, ,$$(LDLIBS))) -Wl,--end-group && cp $$@.js $$@' > build/wasm/arch/em/Makefile
	ln -s $(shell which emcc.py) build/wasm/emgcc || true
	PATH=$(CURDIR)/build/wasm:$$PATH $(MAKE) -C build/wasm ARCH=em CROSS_COMPILE=em SKIP_STRIP=y

source/busybox.tar.bz2:
	mkdir -p source
	wget -nc "$(URL_busybox)" -O $@

source/miniz.zip:
	mkdir -p source
	wget -nc "$(URL_miniz)" -O $@

source/diff3prog.c:
	mkdir -p source
	wget -nc "$(URL_bsddiff3prog)/$(notdir $@)" -O $@

source/diff.c source/diff.h source/diffdir.c source/diffreg.c source/xmalloc.c source/xmalloc.h:
	mkdir -p source
	wget -nc "$(URL_bsddiff)/$(notdir $@)" -O $@

source/freebsd/diff.c source/freebsd/diff.h source/freebsd/diffdir.c source/freebsd/diffreg.c source/freebsd/xmalloc.c source/freebsd/xmalloc.h source/freebsd/pr.c source/freebsd/pr.h:
	mkdir -p source/freebsd
	wget -nc "$(URL_freebsddiff)/$(notdir $@)" -O $@
source/freebsd_diff.c:
	cat bsddiff.h source/freebsd/xmalloc.h source/freebsd/pr.h source/freebsd/diff.h > $@
	cat source/freebsd/pr.c source/freebsd/xmalloc.c source/freebsd/diffreg.c source/freebsd/diffdir.c source/freebsd/diff.c >> $@
	sed -i '$(BSDDIFF_SED)' $@

openbsd_diff.c: source/xmalloc.h source/diff.h source/diff.c source/diffreg.c source/diffdir.c source/xmalloc.c
	cat bsddiff.h source/xmalloc.h source/diff.h > $@
	cat source/diff.c source/diffreg.c source/diffdir.c source/xmalloc.c | grep -v '#include "' >> $@ 
	sed -i '$(BSDDIFF_SED)' $@

openbsd_diff3prog.c: source/diff3prog.c
	cat bsddiff3prog.h source/diff3prog.c > $@

.PHONY: dist
dist: build/wasm/busybox_unstripped.js
	mkdir -p dist
	cp build/wasm/busybox_unstripped.js build/wasm/busybox_unstripped.wasm dist

.PHONY: clean_dist
clean_dist:
	rm -rf dist || true

.PHONY: busytex
busytex:
	mkdir -p dist
	cp ../busytex/busytex_pipeline.js ../busytex/busytex_worker.js dist
	#if [ -z $(DIST) ]; then
	wget -P dist -nc $(addprefix $(subst tag,download,$(URL_RELEASE_busytex_wasm))/, $(BUSYTEX_CORE_ASSETS))
	wget -P dist -nc $(addprefix $(subst tag,download,$(URL_RELEASE_ubuntu_packages))/, $(BUSYTEX_UBUNTU_ASSETS))
	#else cp $(addprefix $(DIST)/, $(BUSYTEX_CORE_ASSETS) $(BUSYTEX_UBUNTU_ASSETS)) dist ; fi
