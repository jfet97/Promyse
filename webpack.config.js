const path = require("path");

module.exports = {
    entry: "./src/index.js",
    target: "node",
    resolve: {
        extensions: [".js"]
    },
    output: {
        filename: "index.js",
        library: "promyse",
        libraryTarget: "commonjs2",
        path: path.resolve(__dirname, "dist")
    }
};