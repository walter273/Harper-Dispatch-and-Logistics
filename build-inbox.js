const esbuild = require('esbuild');
Promise.all(['inbox-ui','inbox-bridge'].map(name=>esbuild.build({entryPoints:[name+'.js'],bundle:true,minify:true,platform:'browser',format:'iife',outfile:name+'.bundle.js'}))).catch(()=>process.exit(1));
