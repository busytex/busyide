export class Busybox
{
    constructor(busybox_module_constructor, busybox_wasm_module_promise, printErr = null, print = null, verbose = false)
    {
        this.mem_header_size = 2 ** 25;
        this.wasm_module_promise = busybox_wasm_module_promise;
        this.busybox_module_constructor = busybox_module_constructor;
        this.print = print;
        this.printErr = printErr;
        this.Module = null;
        this.verbose = verbose;
    }
    
    async load() 
    {
        const wasm_module = await this.wasm_module_promise;
        const {print, printErr, verbose} = this;
        const Module =
        {
            thisProgram : '/bin/busybox',
            noInitialRun : true,
            totalDependencies: 0,
            output_stdout : '',
            output_stderr : '',
            output_stdout_binary : [],
            prefix : '',
            input_stdin : '',
            newline : '\n',

            instantiateWasm(imports, successCallback)
            {
                WebAssembly.instantiate(wasm_module, imports).then(successCallback);
            },
            
            stdin()
            {
                if(Module.input_stdin.length == 0)
                    return null;
                const ord = Module.input_stdin.charCodeAt(0);
                Module.input_stdin = Module.input_stdin.slice(1);
                return ord;
            },

            stdout(ord)
            {
                if(Module.newline != '' || ord != 0x0A)
                {
                    Module.output_stdout += String.fromCharCode(ord);
                    Module.output_stdout_binary.push(ord);
                }
                //if(verbose && print)
                //    print(Module.thisProgram + ': ' + Module.prefix + ' | stdout: ' + text);
            },
            
            /*print(text) 
            {
                text = (arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text) || '';
                Module.output_stdout += text + Module.newline;
                if(verbose && print)
                    print(Module.thisProgram + ': ' + Module.prefix + ' | stdout: ' + text);
            },*/

            printErr(text)
            {
                text = (arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text) || '';
                Module.output_stderr += text + Module.newline;
                Module.setStatus(' | stderr: ' + text);
            },
            
            setStatus(text)
            {
                if(printErr)
                    printErr(Module.thisProgram + ': ' + Module.prefix + ' ||| ' + text);
            },
            
            monitorRunDependencies(left)
            {
                this.totalDependencies = Math.max(this.totalDependencies, left);
                if(printErr)
                    Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
            },
        };
       
        this.Module = await this.busybox_module_constructor(Module);
        console.assert(this.mem_header_size % 4 == 0 && this.Module.HEAP32.slice(this.mem_header_size / 4).every(x => x == 0));
    }

    run(cmd, stdin = '')
    {
        const NOCLEANUP_callMain = (Module, args) =>
        {
            const main = Module._main, fflush = Module._fflush, putchar = Module._putchar, NULL = 0;
            const argc = args.length + 1;
            const argv = Module.stackAlloc((argc + 1) * 4);
            
            // allocating arugments in an address-increasing way to work around OpenBSD's diff bug:
            // https://marc.info/?l=openbsd-bugs&m=160898324728639&w=2
            // https://github.com/emscripten-core/emscripten/issues/13106
            args = [Module.thisProgram].concat(args);
            const lens = args.map(a => Module.lengthBytesUTF8(a));
            Module.HEAP32[argv >> 2] = Module.allocateUTF8OnStack(args.join('\0'));
            for(let i = 1; i < argc; i++)
                Module.HEAP32[(argv >> 2) + i] = Module.HEAP32[(argv >> 2) + i - 1] + lens[i - 1] + 1;
            Module.HEAP32[(argv >> 2) + argc] = NULL;

            try
            {
                main(argc, argv);
            }
            catch(e)
            {
                if(e.status === undefined)
                {
                    Module.printErr(`Unknown error: ${e}`);
                    return -1;
                }

                // workaround for https://github.com/emscripten-core/emscripten/issues/5290#issuecomment-753370693
                Module.newline = '';
                putchar('\n'.charCodeAt());
                fflush(NULL);
                Module.newline = '\n';
                if(this.verbose)
                    Module.setStatus(`Exit code: [${e.status}], message: [${e.message}]`);
                return e.status;
            }
            
            return 0;
        }

        this.Module.output_stdout = '';
        this.Module.output_stderr = '';
        this.Module.output_stdout_binary = [];
        this.Module.input_stdin = stdin;
        
        this.Module.prefix = cmd[0];
        const mem_header = Uint8Array.from(this.Module.HEAPU8.slice(0, this.mem_header_size));
        const OLDPWD = this.Module.FS.cwd();
        const exit_code = NOCLEANUP_callMain(this.Module, cmd, this.print);
        this.FS.chdir(OLDPWD);
        this.Module.HEAPU8.fill(0);
        this.Module.HEAPU8.set(mem_header);

        return {
            exit_code : exit_code, 
            stdout : (this.Module.output_stdout || ''), 
            stderr : (this.Module.output_stderr || ''), 
            stdout_binary : Uint8Array.from(this.Module.output_stdout_binary),
        };
    }
}
