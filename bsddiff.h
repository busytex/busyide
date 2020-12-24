//config:config BSDDIFF
//config:	bool "BSDDIFF"
//config:	default y
//config:	help
//config:	Returns an indeterminate value.
//kbuild:lib-$(CONFIG_BSDDIFF) += bsddiff.o bsdxmalloc.o bsddiffreg.o bsddiffdir.o
//applet:IF_BSDDIFF(APPLET(bsddiff, BB_DIR_USR_BIN, BB_SUID_DROP))
//usage:# define bsddiff_trivial_usage
//usage:				 "bsddiff ..."

#include <stdio.h>
#include <string.h>
#include <time.h>

#define __dead __attribute__((noreturn))
#define pledge(promises, execpromises) (0)
#define warnc(code, fmt, ...) (0)
#define reallocarray(optr,nmemb,size) (realloc(optr, size * nmemb))

//size_t strlcat(char *dst, const char *src, size_t dsize);

//size_t strlcpy(char *dst, const char *src, size_t dsize);

//char *fgetln(FILE *stream, size_t *len);

#define main bsddiff_main
#define usage bsddiff_usage
