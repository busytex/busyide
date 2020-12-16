//config:config DIFF3
//config:	bool "DIFF3"
//config:	default y
//config:	help
//config:	Returns an indeterminate value.
//kbuild:lib-$(CONFIG_DIFF3) += diff3.o
//applet:IF_DIFF3(APPLET(diff3, BB_DIR_USR_BIN, BB_SUID_DROP))
//usage:# define diff3_trivial_usage
//usage:				 "diff3 [-exEX3] /tmp/d3a.?????????? /tmp/d3b.?????????? file1 file2 file3"

#define __dead __attribute__((noreturn))
#define pledge(promises, execpromises) 0
#define reallocarray(optr,nmemb,size) (realloc(optr, size * nmemb))
