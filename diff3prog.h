//config:config DIFF3PROG
//config:	bool "DIFF3PROG"
//config:	default y
//config:	help
//config:	Returns an indeterminate value.
//kbuild:lib-$(CONFIG_DIFF3PROG) += diff3prog.o
//applet:IF_DIFF3PROG(APPLET(diff3prog, BB_DIR_USR_BIN, BB_SUID_DROP))
//usage:# define diff3prog_trivial_usage
//usage:				 "diff3prog [-exEX3] /tmp/d3a.?????????? /tmp/d3b.?????????? file1 file2 file3"

#define __dead __attribute__((noreturn))
#define pledge(promises, execpromises) 0
#define reallocarray(optr,nmemb,size) (realloc(optr, size * nmemb))
