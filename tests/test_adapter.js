// Adapter for "promises-aplus-tests" test runner

var path = require("path");
var { Promyse } = require(path.join(__dirname, "../", "dist", "index.js"));

module.exports.deferred = function __deferred__() {
    var o = {};
    o.promise = new Promyse(function (resolve, reject) {
        o.resolve = resolve;
        o.reject = reject;
    });
    return o;
};

module.exports.resolved = function __resolved__(val) {
    return Promyse.resolve(val);
};

module.exports.rejected = function __rejected__(reason) {
    return Promyse.reject(reason);
};