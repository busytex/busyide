//config:config BSDDIFF3PROG
//config:	bool "BSDDIFF3PROG"
//config:	default y
//config:	help
//config:	Returns an indeterminate value.

//kbuild:lib-$(CONFIG_BSDDIFF3PROG) += bsddiff3prog.o
//applet:IF_BSDDIFF3PROG(APPLET(bsddiff3prog, BB_DIR_USR_BIN, BB_SUID_DROP))
//usage:# define bsddiff3prog_trivial_usage
//usage:				 "bsddiff3prog [-exEX3] /tmp/d3a.?????????? /tmp/d3b.?????????? file1 file2 file3"

//usage:#define bsddiff3prog_full_usage  "\n\n"
//usage:         "Only terse usage"

#define __dead __attribute__((noreturn))
#define pledge(promises, execpromises) 0
#define reallocarray(optr,nmemb,size) (realloc(optr, size * nmemb))

#define main bsddiff3prog_main
#define usage bsddiff3prog_usage
