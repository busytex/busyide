class Busybox
{
    constructor(busybox_module_constructor, busybox_wasm, print)
    {
        this.mem_header_size = 2 ** 25;
        this.wasm_module_promise = fetch(busybox_wasm).then(WebAssembly.compileStreaming);
        this.busybox_module_constructor = busybox_module_constructor;
        this.Module = this.reload_module(print)
    }
    
    async reload_module(print)
    {
        const wasm_module = await this.wasm_module_promise;
        const Module =
        {
            thisProgram : 'busybox',
            noInitialRun : true,
            totalDependencies: 0,
            output : '',
            
            instantiateWasm(imports, successCallback)
            {
                WebAssembly.instantiate(wasm_module, imports).then(successCallback);
            },
            
            print(text) 
            {
                text = arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text;
                Module.output += text + '\r\n';
                Module.setStatus('stdout: ' + (arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text));
            },

            printErr(text)
            {
                text = arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text;
                Module.setStatus('stderr: ' + (arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text));
            },
            
            setStatus(text)
            {
                print(text);
            },
            
            monitorRunDependencies(left)
            {
                this.totalDependencies = Math.max(this.totalDependencies, left);
                Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
            },
        };
       
        const initialized_module = await busybox_module_constructor(Module);
        console.assert(this.mem_header_size % 4 == 0 && initialized_module.HEAP32.slice(this.mem_header_size / 4).every(x => x == 0));
        return initialized_module;
    }

    run(cmd)
    {
        const NOCLEANUP_callMain = (Module, args) =>
        {
            Module.setPrefix(args[0]);
            const entryFunction = Module['_main'];
            const argc = args.length+1;
            const argv = Module.stackAlloc((argc + 1) * 4);
            Module.HEAP32[argv >> 2] = Module.allocateUTF8OnStack(Module.thisProgram);
            for (let i = 1; i < argc; i++) 
                Module.HEAP32[(argv >> 2) + i] = Module.allocateUTF8OnStack(args[i - 1]);
            Module.HEAP32[(argv >> 2) + argc] = 0;

            try
            {
                entryFunction(argc, argv);
            }
            catch(e)
            {
                this.print('callMain: ' + e.message);
                return e.status;
            }
            
            return 0;
        }

        let exit_code = 0;
        const mem_header = Uint8Array.from(Module.HEAPU8.slice(0, this.mem_header_size));
        exit_code = NOCLEANUP_callMain(Module, cmd, this.print);
        Module.HEAPU8.fill(0);
        Module.HEAPU8.set(mem_header);
        return exit_code;
    }
}
