// Minimal browser stub for Node's builtin `node:module` module.
// just-bash's browser bundle probes `require('node:module')` at runtime (builtinModules
// discovery); in a webpack 4 browser build there is no node:module, so expose an empty
// list to keep the probe harmless.
module.exports = {
    builtinModules: []
};
